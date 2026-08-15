use std::fmt;
use std::path::Path;
use std::time::Duration;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncSeekExt, AsyncWriteExt};

const BASE_URL: &str = "https://gamebanana.com/apiv11";

/// Zenless Zone Zero's GameBanana game ID, confirmed live (see project memory
/// `gamebanana-api-v11`). ZZZ is currently the only supported game.
pub const ZZZ_GAME_ID: i64 = 19567;

/// GameBanana's `Mod/Index` defaults to 5 records per page (confirmed live) — too few for a
/// browse grid.
///
/// 30 rather than a rounder number because the browse grid is `auto-fill`: its column count
/// follows the window, and a page that does not divide by it leaves the last row part-empty.
/// 20 gave three rows and a stub of two at the width this window is usually dragged to. 30
/// divides exactly at both five and six columns, which covers roughly 1400px to 2000px, and
/// it halves the paging.
const MOD_INDEX_PAGE_SIZE: u32 = 30;

/// API calls (search/detail) are small JSON responses and should always be fast — bounded
/// tightly so a stalled connection surfaces as a real error instead of hanging the UI.
const API_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
/// Mod archive downloads can be tens of megabytes; bounded generously, but bounded — a
/// user-reported install got stuck on "Installing…" forever because the default
/// `reqwest::Client` has NO timeout at all, so a stalled connection never errors out.
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Debug)]
pub enum GameBananaError {
    Http(reqwest::Error),
    Io(std::io::Error),
    /// GameBanana returned a `{"_sErrorCode": ..., "_aErrorData": ...}` error body.
    Api {
        code: String,
        body: String,
    },
    /// The response body didn't match either the expected shape or the API error shape.
    UnexpectedResponse(String),
    /// The caller's progress callback signaled cancellation.
    Cancelled,
}

impl fmt::Display for GameBananaError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            GameBananaError::Http(e) => {
                write!(f, "GameBanana request failed: {e}")?;
                // reqwest::Error's own Display is often just a generic top-level summary
                // ("error sending request for url (...)") — the actually useful cause
                // (timeout, connection reset, TLS failure, DNS failure, ...) lives in the
                // source chain, which this walks so real errors are diagnosable instead of
                // all looking identical.
                let mut source = std::error::Error::source(e);
                while let Some(cause) = source {
                    write!(f, ": {cause}")?;
                    source = cause.source();
                }
                Ok(())
            }
            GameBananaError::Io(e) => write!(f, "filesystem error: {e}"),
            GameBananaError::Api { code, body } => {
                write!(f, "GameBanana API error {code}: {body}")
            }
            GameBananaError::UnexpectedResponse(body) => {
                write!(f, "unexpected GameBanana response: {body}")
            }
            GameBananaError::Cancelled => write!(f, "install cancelled"),
        }
    }
}

impl std::error::Error for GameBananaError {}

impl From<reqwest::Error> for GameBananaError {
    fn from(e: reqwest::Error) -> Self {
        GameBananaError::Http(e)
    }
}

impl From<std::io::Error> for GameBananaError {
    fn from(e: std::io::Error) -> Self {
        GameBananaError::Io(e)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GbPreviewImage {
    #[serde(rename(deserialize = "_sBaseUrl"))]
    pub base_url: String,
    #[serde(rename(deserialize = "_sFile"))]
    pub file: String,
    #[serde(rename(deserialize = "_sFile220"))]
    pub file_220: Option<String>,
    #[serde(rename(deserialize = "_sFile530"))]
    pub file_530: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GbPreviewMedia {
    #[serde(rename(deserialize = "_aImages"), default)]
    pub images: Vec<GbPreviewImage>,
}

impl GbPreviewMedia {
    /// Absolute URL of the first preview image, for storing against an installed mod.
    /// `file_530` is the largest pre-rendered size GameBanana offers and comfortably covers a
    /// mod card a few hundred pixels wide; the smaller thumb and then the full-size original
    /// are fallbacks, since not every submission has every size rendered.
    pub fn thumbnail_url(&self) -> Option<String> {
        let image = self.images.first()?;
        let file = image
            .file_530
            .as_deref()
            .or(image.file_220.as_deref())
            .unwrap_or(&image.file);
        Some(format!("{}/{}", image.base_url, file))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GbSubmitter {
    #[serde(rename(deserialize = "_idRow"))]
    pub id: i64,
    #[serde(rename(deserialize = "_sName"))]
    pub name: String,
    #[serde(rename(deserialize = "_sProfileUrl"))]
    pub profile_url: String,
    #[serde(rename(deserialize = "_sAvatarUrl"))]
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GbGameRef {
    #[serde(rename(deserialize = "_idRow"))]
    pub id: i64,
    #[serde(rename(deserialize = "_sName"))]
    pub name: String,
}

/// Category reference as it appears on mod list/search records — no numeric ID here,
/// only on `Mod/:id`'s `_aCategory` (see `GbCategoryDetail`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GbCategoryRef {
    #[serde(rename(deserialize = "_sName"))]
    pub name: String,
    #[serde(rename(deserialize = "_sProfileUrl"))]
    pub profile_url: String,
}

/// GameBanana omits `_sInitialVisibility` entirely on endpoints that have no opinion on
/// content rating (confirmed live: `Mod/:id?_csvProperties=@gbprofile` never sends it). An
/// absent field must fail *open* (treated as `"show"`) rather than blanket-flagging every
/// record mature — an unrecognized non-`"show"` *value*, by contrast, fails closed. See
/// `content_rating::is_mature`.
fn default_initial_visibility() -> String {
    "show".to_string()
}

/// `#[serde(default)]` alone only covers a *missing* key — GameBanana sends
/// `"_aEmbeddedMedia": null` explicitly on mods with no showcase video (confirmed live), which
/// still fails to deserialize into a bare `Vec<String>` (`null` isn't a sequence). This treats
/// both "missing" and "present but null" as empty.
fn deserialize_null_default<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Default + Deserialize<'de>,
{
    Ok(Option::deserialize(deserializer)?.unwrap_or_default())
}

/// Sort order for the browse (`Mod/Index`) path only — confirmed live against the real API;
/// arbitrary/other alias strings (e.g. `Generic_Popular`, `Generic_Featured`) return an
/// `UNKNOWN_SORT` API error, so this enum is deliberately closed to only the values checked.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum ModSort {
    #[default]
    LatestUpdated,
    Newest,
    MostLiked,
    MostViewed,
    MostDownloaded,
}

impl ModSort {
    fn as_query_value(self) -> &'static str {
        match self {
            ModSort::LatestUpdated => "Generic_LatestModified",
            ModSort::Newest => "Generic_Newest",
            ModSort::MostLiked => "Generic_MostLiked",
            ModSort::MostViewed => "Generic_MostViewed",
            ModSort::MostDownloaded => "Generic_MostDownloaded",
        }
    }
}

/// A mod as it appears in search/browse list results (`Mod/Index`, `Util/Search/Results`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GbMod {
    #[serde(rename(deserialize = "_idRow"))]
    pub id: i64,
    #[serde(rename(deserialize = "_sName"))]
    pub name: String,
    #[serde(rename(deserialize = "_sProfileUrl"))]
    pub profile_url: String,
    #[serde(rename(deserialize = "_tsDateModified"))]
    pub date_modified: i64,
    #[serde(rename(deserialize = "_bHasFiles"))]
    pub has_files: bool,
    #[serde(rename(deserialize = "_aTags"), default)]
    pub tags: Vec<String>,
    #[serde(rename(deserialize = "_aPreviewMedia"), default)]
    pub preview_media: GbPreviewMedia,
    #[serde(rename(deserialize = "_aSubmitter"))]
    pub submitter: GbSubmitter,
    #[serde(rename(deserialize = "_aGame"))]
    pub game: GbGameRef,
    #[serde(rename(deserialize = "_aRootCategory"))]
    pub root_category: GbCategoryRef,
    #[serde(rename(deserialize = "_aSubCategory"))]
    pub sub_category: Option<GbCategoryRef>,
    // GameBanana omits a count field entirely rather than sending zero — confirmed live on
    // `Mod/Index` page 2, where three of thirty records carry no `_nPostCount` at all. Without
    // a default that is a hard deserialize failure, and `parse_mod_records` then drops the
    // whole mod, which is why a page of thirty was arriving as twenty-seven. A missing count
    // means none, so it must default rather than fail.
    #[serde(rename(deserialize = "_nLikeCount"), default)]
    pub like_count: i64,
    #[serde(rename(deserialize = "_nViewCount"), default)]
    pub view_count: i64,
    #[serde(rename(deserialize = "_nPostCount"), default)]
    pub post_count: i64,
    /// Never present on a list record — confirmed live (2026-08-15): none of thirty
    /// `Mod/Index` records carries `_nDownloadCount`, and that endpoint silently ignores
    /// `_csvProperties`, so it cannot be asked for inline either. `search_mods` fills this in
    /// afterwards from one batched `Mod/Multi` call; see `fill_download_counts`.
    ///
    /// `None` means *not known*, not *zero*. A mod nobody has downloaded is `Some(0)`; a mod
    /// whose count could not be fetched stays `None` and the card omits the stat rather than
    /// printing a number nobody measured.
    #[serde(default, skip_deserializing)]
    pub download_count: Option<i64>,
    #[serde(rename(deserialize = "_bHasContentRatings"), default)]
    pub has_content_ratings: bool,
    #[serde(
        rename(deserialize = "_sInitialVisibility"),
        default = "default_initial_visibility"
    )]
    pub initial_visibility: String,
    /// Computed at parse time by `content_rating::is_mature`, never deserialized directly —
    /// see `parse_mod_records`, the single place every `GbMod` is annotated.
    #[serde(default, skip_deserializing)]
    pub is_mature: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GbFile {
    #[serde(rename(deserialize = "_idRow"))]
    pub id: i64,
    #[serde(rename(deserialize = "_sFile"))]
    pub file_name: String,
    #[serde(rename(deserialize = "_nFilesize"))]
    pub file_size: i64,
    /// Unix timestamp this specific file was added — used by update detection to pick the
    /// newest file when a mod has several (see `updates::compare_installed_file`).
    #[serde(rename(deserialize = "_tsDateAdded"))]
    pub date_added: i64,
    #[serde(rename(deserialize = "_nDownloadCount"))]
    pub download_count: i64,
    #[serde(rename(deserialize = "_sDownloadUrl"))]
    pub download_url: String,
    #[serde(rename(deserialize = "_sMd5Checksum"))]
    pub md5_checksum: String,
    #[serde(rename(deserialize = "_sAnalysisResult"))]
    pub analysis_result: Option<String>,
    #[serde(rename(deserialize = "_sAvResult"))]
    pub av_result: Option<String>,
    #[serde(rename(deserialize = "_sDescription"))]
    pub description: Option<String>,
    /// The uploader's own version label for this file (`"7.7"`). Absent on files that never
    /// carried one — confirmed live, where five of one mod's fourteen files have no
    /// `_sVersion` key at all — so it must default rather than fail the whole detail fetch.
    /// Worth surfacing because a mod's files are often named `v72.zip`, `v73.zip`, and the
    /// label is the only thing distinguishing one row from the next.
    #[serde(rename(deserialize = "_sVersion"), default)]
    pub version: Option<String>,
}

/// Category reference as it appears on `Mod/:id`'s `_aCategory` — unlike `GbCategoryRef`,
/// this one carries a numeric ID.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GbCategoryDetail {
    #[serde(rename(deserialize = "_idRow"))]
    pub id: i64,
    #[serde(rename(deserialize = "_sName"))]
    pub name: String,
}

/// Full mod detail (`Mod/:id?_csvProperties=@gbprofile,_sText,_sDescription`), used for the
/// mod detail dialog and the install flow.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GbModDetail {
    #[serde(rename(deserialize = "_idRow"))]
    pub id: i64,
    #[serde(rename(deserialize = "_sName"))]
    pub name: String,
    #[serde(rename(deserialize = "_sProfileUrl"))]
    pub profile_url: String,
    #[serde(rename(deserialize = "_tsDateModified"))]
    pub date_modified: i64,
    #[serde(rename(deserialize = "_bIsNsfw"))]
    pub is_nsfw: bool,
    #[serde(rename(deserialize = "_aPreviewMedia"), default)]
    pub preview_media: GbPreviewMedia,
    /// Showcase video URLs (YouTube, confirmed live) — separate from `preview_media`'s static
    /// screenshots. GameBanana sends `null` (not an absent key) when a mod has none.
    #[serde(
        rename(deserialize = "_aEmbeddedMedia"),
        default,
        deserialize_with = "deserialize_null_default"
    )]
    pub embedded_media: Vec<String>,
    // Same omitted-when-zero behaviour as the list records above. Here the consequence is
    // worse: an absent count fails the whole detail fetch, so a brand-new mod with no
    // downloads would refuse to open at all.
    #[serde(rename(deserialize = "_nDownloadCount"), default)]
    pub download_count: i64,
    #[serde(rename(deserialize = "_nViewCount"), default)]
    pub view_count: i64,
    #[serde(rename(deserialize = "_nLikeCount"), default)]
    pub like_count: i64,
    #[serde(rename(deserialize = "_aCategory"))]
    pub category: GbCategoryDetail,
    #[serde(rename(deserialize = "_aSubmitter"))]
    pub submitter: GbSubmitter,
    /// Short one-line summary. Often present even when `description_html` is empty.
    #[serde(rename(deserialize = "_sDescription"), default)]
    pub description: String,
    /// Full HTML description body — separate `_csvProperties` entry, not part of `@gbprofile`.
    #[serde(rename(deserialize = "_sText"), default)]
    pub description_html: String,
    #[serde(rename(deserialize = "_aFiles"), default)]
    pub files: Vec<GbFile>,
    /// Confirmed live: `Mod/:id` rejects `_bHasContentRatings`/`_sInitialVisibility` outright
    /// (`UNKNOWN_PROPERTY`) — those two fields only exist on list/search records (`GbMod`).
    /// Kept here for schema symmetry only; always `false`. `is_mature` below is the real,
    /// accurate signal for this type — it comes from `_bIsNsfw` (`is_nsfw`), which the
    /// single-mod endpoint does support.
    #[serde(default)]
    pub has_content_ratings: bool,
    /// See `has_content_ratings` — kept for schema symmetry only, always `"show"`.
    #[serde(default = "default_initial_visibility")]
    pub initial_visibility: String,
    #[serde(default, skip_deserializing)]
    pub is_mature: bool,
}

#[derive(Debug, Deserialize)]
struct RawMetadata {
    #[serde(rename(deserialize = "_nRecordCount"))]
    record_count: i64,
    #[serde(rename(deserialize = "_bIsComplete"))]
    is_complete: bool,
}

#[derive(Debug, Deserialize)]
struct RawListResponse {
    #[serde(rename(deserialize = "_aMetadata"))]
    metadata: RawMetadata,
    #[serde(rename(deserialize = "_aRecords"))]
    records: Vec<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct GbDescriptionFields {
    #[serde(rename(deserialize = "_sDescription"), default)]
    description: String,
    #[serde(rename(deserialize = "_sText"), default)]
    description_html: String,
}

#[derive(Debug, Deserialize)]
struct RawApiError {
    #[serde(rename(deserialize = "_sErrorCode"))]
    code: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct GbSearchResult {
    pub records: Vec<GbMod>,
    pub record_count: i64,
    /// `true` once every matching record has been returned across all pages fetched so far.
    pub is_complete: bool,
    /// How many records this page's `records` omits due to the mature-content preference
    /// being `Hide`. Always `0` under `Show`/`Blur`. Filtering happens after GameBanana's own
    /// server-side pagination, so this does *not* mean `record_count`/`is_complete` account
    /// for it — see `content_rating::apply_visibility`.
    pub hidden_count: i64,
}

/// Parses a list-endpoint response body, distinguishing a GameBanana API error from a
/// genuine schema mismatch so callers get an actionable message either way.
fn parse_list_response(body: &str) -> Result<RawListResponse, GameBananaError> {
    serde_json::from_str::<RawListResponse>(body).map_err(|_| {
        if let Ok(err) = serde_json::from_str::<RawApiError>(body) {
            GameBananaError::Api {
                code: err.code,
                body: body.to_string(),
            }
        } else {
            GameBananaError::UnexpectedResponse(body.chars().take(500).collect())
        }
    })
}

/// The single place a raw `serde_json::Value` becomes a `GbMod` — used by both
/// `search_by_text` and `browse_by_category` so `is_mature` can never be forgotten on one
/// path but not the other. Records that fail to deserialize are silently dropped, matching
/// the pre-existing behavior of both call sites.
fn parse_mod_records(values: Vec<serde_json::Value>) -> Vec<GbMod> {
    values
        .into_iter()
        .filter_map(|v| {
            // Skipping a record the caller cannot parse is the right behaviour — one odd mod
            // should not empty a whole page — but it used to happen silently, so a page of
            // thirty quietly became twenty-seven and the only symptom was a short grid. Say
            // which record went and why, so the next new-or-renamed field is a log line rather
            // than an investigation.
            let name = v.get("_sName").and_then(|n| n.as_str()).unwrap_or("?").to_owned();
            match serde_json::from_value::<GbMod>(v) {
                Ok(m) => Some(m),
                Err(e) => {
                    eprintln!("skipped GameBanana mod record {name:?}: {e}");
                    None
                }
            }
        })
        .map(|mut m| {
            m.is_mature = crate::content_rating::is_mature(&m.initial_visibility);
            m
        })
        .collect()
}

/// The "top of period" windows the featured banner cycles through, in the order it shows them.
///
/// These are GameBanana's own bucket names from `Game/:id/TopSubs`, not something this app
/// computes — it also returns a `3month` bucket, deliberately skipped: six slides fill the rail,
/// and three months sits close enough to six that the two would usually name the same mod.
pub const FEATURED_PERIODS: [&str; 6] = ["today", "week", "month", "6month", "year", "alltime"];

/// One `Game/:id/TopSubs` record.
///
/// This endpoint ranks submissions per period and is the only one that does — `Mod/Index`
/// carries no time window at all (`_sPeriod` there is silently ignored, and invented sorts like
/// `Generic_MostLiked_Week` return `INPUT_ERRORS`; both confirmed live 2026-08-15).
///
/// Only what the batch call cannot supply is read here. `_sInitialVisibility` is the important
/// one: it is the mature signal the rest of the app keys on, and `Mod/Multi` rejects it
/// outright, so this record is the only place it can come from.
#[derive(Debug, Deserialize)]
struct RawTopSub {
    #[serde(rename(deserialize = "_idRow"))]
    id: i64,
    #[serde(rename(deserialize = "_sPeriod"))]
    period: String,
    /// `TopSubs` is a submission feed, so it can in principle carry Tools or Sounds alongside
    /// Mods. Anything that is not a `Mod` is dropped rather than fetched as one.
    #[serde(rename(deserialize = "_sModelName"), default)]
    model_name: String,
    #[serde(
        rename(deserialize = "_sInitialVisibility"),
        default = "default_initial_visibility"
    )]
    initial_visibility: String,
}

/// A `Mod/Multi` row carrying everything `TopSubs` leaves out — preview media, live counts and
/// the modified date the banner shows.
///
/// Confirmed live 2026-08-15: `Mod/Multi` accepts each of these properties and rejects
/// `_bHasFiles`, `_aTags`, `_aSubCategory`, `_sInitialVisibility` and `_bHasContentRatings` as
/// `UNKNOWN_PROPERTY`. The first two are why `GbMod::has_files`/`tags` are filled in below
/// rather than fetched.
#[derive(Debug, Deserialize)]
struct RawFeaturedFields {
    #[serde(rename(deserialize = "_idRow"))]
    id: i64,
    #[serde(rename(deserialize = "_sName"))]
    name: String,
    #[serde(rename(deserialize = "_sProfileUrl"))]
    profile_url: String,
    #[serde(rename(deserialize = "_tsDateModified"))]
    date_modified: i64,
    #[serde(rename(deserialize = "_aPreviewMedia"), default)]
    preview_media: GbPreviewMedia,
    #[serde(rename(deserialize = "_aSubmitter"))]
    submitter: GbSubmitter,
    #[serde(rename(deserialize = "_aGame"))]
    game: GbGameRef,
    #[serde(rename(deserialize = "_aRootCategory"))]
    root_category: GbCategoryRef,
    /// The mod's own leaf category — the character, on a character skin. `Mod/Multi` has no
    /// `_aSubCategory`, but this is that same value under another key: for a mod with no
    /// character beneath it, `_aCategory` is simply the root category repeated, which is how
    /// `sub_category` is reconstructed as `None` below.
    #[serde(rename(deserialize = "_aCategory"))]
    category: GbCategoryRef,
    #[serde(rename(deserialize = "_nLikeCount"), default)]
    like_count: i64,
    #[serde(rename(deserialize = "_nViewCount"), default)]
    view_count: i64,
    #[serde(rename(deserialize = "_nPostCount"), default)]
    post_count: i64,
    #[serde(rename(deserialize = "_nDownloadCount"), default)]
    download_count: Option<i64>,
}

/// A mod that topped one of GameBanana's ranking windows, with the window it won.
#[derive(Debug, Clone, Serialize)]
pub struct GbFeaturedMod {
    /// GameBanana's own bucket name — one of [`FEATURED_PERIODS`]. The frontend maps it to a
    /// label; it is passed through rather than pre-formatted so the wording stays a UI decision.
    pub period: String,
    pub record: GbMod,
}

/// Builds the `GbMod` the rest of the app speaks in from the two halves GameBanana splits it
/// across: the ranking record and the batched detail row.
///
/// `has_files` and `tags` cannot be sourced from either endpoint (`Mod/Multi` rejects both).
/// They are filled with the neutral empty values rather than guessed, and nothing on this
/// surface reads them — the banner shows art, counts and a category, and opening a mod refetches
/// the real detail by id.
fn featured_mod_from(top: &RawTopSub, fields: RawFeaturedFields) -> GbMod {
    // A leaf category identical to the root means the mod sits directly under it with no
    // character below, which is exactly what an absent `_aSubCategory` means on a list record.
    let sub_category = if fields.category.profile_url == fields.root_category.profile_url {
        None
    } else {
        Some(fields.category)
    };

    GbMod {
        id: fields.id,
        name: fields.name,
        profile_url: fields.profile_url,
        date_modified: fields.date_modified,
        has_files: true,
        tags: Vec::new(),
        preview_media: fields.preview_media,
        submitter: fields.submitter,
        game: fields.game,
        root_category: fields.root_category,
        sub_category,
        like_count: fields.like_count,
        view_count: fields.view_count,
        post_count: fields.post_count,
        download_count: fields.download_count,
        has_content_ratings: false,
        initial_visibility: top.initial_visibility.clone(),
        is_mature: crate::content_rating::is_mature(&top.initial_visibility),
    }
}

/// Picks the top-ranked mod for each wanted period, in [`FEATURED_PERIODS`] order.
///
/// `TopSubs` returns several mods per period already ranked, so the first match wins. A period
/// GameBanana has no entry for is skipped rather than padded from another window — a young game
/// genuinely has no "top of the year", and repeating a neighbouring period's mod would make the
/// banner claim something untrue.
fn pick_featured(subs: &[RawTopSub]) -> Vec<&RawTopSub> {
    FEATURED_PERIODS
        .iter()
        .filter_map(|period| {
            subs.iter()
                .find(|s| s.period == *period && s.model_name == "Mod")
        })
        .collect()
}

/// One `Mod/Multi` row.
///
/// The count is `Option` because GameBanana sends an explicit `"_nDownloadCount": null` for
/// some mods — confirmed live 2026-08-15, where a search page's batch came back with two nulls
/// among ten. `#[serde(default)]` does not cover an explicit null, so without this the single
/// null failed the whole array and a page lost every count it had just fetched.
#[derive(Debug, Deserialize)]
struct RawDownloadCount {
    #[serde(rename(deserialize = "_idRow"))]
    id: i64,
    #[serde(rename(deserialize = "_nDownloadCount"), default)]
    download_count: Option<i64>,
}

/// Copies fetched counts onto the matching records, leaving anything the batch did not answer
/// for as `None`.
///
/// Deliberately never substitutes `0`. A mod absent from the response was not measured
/// (withdrawn, id rejected), and a mod answered with `null` is GameBanana declining to say —
/// neither is the claim "nobody has downloaded this". The card omits the stat instead.
fn apply_download_counts(records: &mut [GbMod], counts: &[RawDownloadCount]) {
    for record in records.iter_mut() {
        if let Some(row) = counts.iter().find(|c| c.id == record.id) {
            record.download_count = row.download_count;
        }
    }
}

/// How long a transfer will sit waiting for the next chunk before checking in with its caller
/// anyway.
///
/// This is what keeps pause and cancel responsive on a download that has stalled — the caller only
/// gets to say stop from inside the progress callback, and without a poll that callback is only
/// reached when bytes actually arrive. Short enough to feel immediate, long enough that a healthy
/// transfer never hits it.
const STOP_POLL_INTERVAL: Duration = Duration::from_millis(250);

/// Where a transfer is picking up from.
///
/// `have` of 0 is a clean start: the staging file is truncated and no `Range` goes out at all,
/// so there is no way to end up appending to bytes nobody vouched for. Anything higher asks for
/// `Range: bytes=have-`, and `etag` — the validator those bytes arrived with — goes out as
/// `If-Range`, so a file that changed on the server answers with a full `200` and the transfer
/// starts over instead of splicing the tail of a new archive onto the head of an old one.
///
/// GameBanana's file hosts do support this: confirmed live (2026-08-15), a ranged request to
/// `files.gamebanana.com` redirects to a `filecacheNN` node and answers `206 Partial Content`
/// with a `Content-Range` and a stable `ETag`.
#[derive(Debug, Default, Clone)]
pub struct ResumePoint<'a> {
    pub have: u64,
    pub etag: Option<&'a str>,
}

impl ResumePoint<'_> {
    /// Start from nothing — for every caller with no partial transfer to continue.
    pub fn fresh() -> Self {
        Self {
            have: 0,
            etag: None,
        }
    }
}

pub struct GameBananaClient {
    http: reqwest::Client,
}

impl Default for GameBananaClient {
    fn default() -> Self {
        Self::new()
    }
}

impl GameBananaClient {
    pub fn new() -> Self {
        Self {
            // Connect timeout only at the client level — request-level `.timeout()` calls
            // below set the actual ceiling per call, since downloads legitimately need a
            // much longer allowance than small JSON API calls do.
            http: reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(10))
                .build()
                .expect("reqwest client with a connect timeout must build"),
        }
    }

    /// Searches for ZZZ mods. With `query`, hits GameBanana's free-text search endpoint
    /// (`Util/Search/Results`) and filters client-side to `Mod`-type records, since that
    /// endpoint mixes submission types and doesn't support a category filter (or `sort` —
    /// `_sSort` is silently ignored there, confirmed live, so `sort` only affects the no-query
    /// path below). Without a query, browses `Mod/Index` filtered to ZZZ (and `category_id`, if
    /// given) — this is the endpoint that actually respects `_aFilters[Generic_Category]`; the
    /// more obvious `Game/:id/Subfeed` browse endpoint was confirmed live to silently ignore
    /// that filter.
    pub async fn search_mods(
        &self,
        query: Option<&str>,
        category_id: Option<i64>,
        sort: ModSort,
        page: u32,
    ) -> Result<GbSearchResult, GameBananaError> {
        let mut result = match query.map(str::trim).filter(|q| !q.is_empty()) {
            Some(q) => self.search_by_text(q, page).await?,
            None => self.browse_by_category(category_id, sort, page).await?,
        };
        // Both list paths land here, so neither can ship a page of cards missing the stat.
        self.fill_download_counts(&mut result.records).await;
        Ok(result)
    }

    /// Fills in `GbMod::download_count` for a whole page in one extra request.
    ///
    /// The list endpoints do not carry `_nDownloadCount` and ignore `_csvProperties`, but
    /// `Mod/Multi` honours it and answers with a plain array, so thirty mods cost one small
    /// call rather than thirty. Confirmed live 2026-08-15.
    ///
    /// Failure is swallowed on purpose. This is a secondary stat on a card; a browse page that
    /// loaded fine must not be turned into an error screen because a supplementary call
    /// timed out. The records simply keep `download_count: None` and the cards omit the line.
    async fn fill_download_counts(&self, records: &mut [GbMod]) {
        if records.is_empty() {
            return;
        }

        let ids = records
            .iter()
            .map(|m| m.id.to_string())
            .collect::<Vec<_>>()
            .join(",");
        let url =
            format!("{BASE_URL}/Mod/Multi?_csvRowIds={ids}&_csvProperties=_idRow,_nDownloadCount");

        let fetched = async {
            let body = self
                .http
                .get(&url)
                .timeout(API_REQUEST_TIMEOUT)
                .send()
                .await?
                .error_for_status()?
                .text()
                .await?;
            serde_json::from_str::<Vec<RawDownloadCount>>(&body)
                .map_err(|_| GameBananaError::UnexpectedResponse(body.chars().take(500).collect()))
        }
        .await;

        match fetched {
            Ok(counts) => apply_download_counts(records, &counts),
            Err(e) => eprintln!("download counts unavailable for this page: {e}"),
        }
    }

    async fn search_by_text(
        &self,
        query: &str,
        page: u32,
    ) -> Result<GbSearchResult, GameBananaError> {
        let url = format!(
            "{BASE_URL}/Util/Search/Results?_sSearchString={}&_idGameRow={ZZZ_GAME_ID}&_nPage={page}",
            urlencoding_encode(query)
        );
        let body = self
            .http
            .get(&url)
            .timeout(API_REQUEST_TIMEOUT)
            .send()
            .await?
            .error_for_status()?
            .text()
            .await?;
        let raw = parse_list_response(&body)?;

        let mod_values: Vec<serde_json::Value> = raw
            .records
            .into_iter()
            .filter(|v| v.get("_sModelName").and_then(|m| m.as_str()) == Some("Mod"))
            .collect();
        let records = parse_mod_records(mod_values);

        Ok(GbSearchResult {
            record_count: records.len() as i64,
            is_complete: raw.metadata.is_complete,
            hidden_count: 0,
            records,
        })
    }

    async fn browse_by_category(
        &self,
        category_id: Option<i64>,
        sort: ModSort,
        page: u32,
    ) -> Result<GbSearchResult, GameBananaError> {
        // GameBanana defaults Mod/Index to 5 records per page (confirmed live); request a
        // larger, browse-friendly page size explicitly instead.
        let mut url = format!(
            "{BASE_URL}/Mod/Index?_nPage={page}&_nPerpage={MOD_INDEX_PAGE_SIZE}&_sSort={}&_aFilters%5BGeneric_Game%5D={ZZZ_GAME_ID}",
            sort.as_query_value()
        );
        if let Some(id) = category_id {
            url.push_str(&format!("&_aFilters%5BGeneric_Category%5D={id}"));
        }

        let body = self
            .http
            .get(&url)
            .timeout(API_REQUEST_TIMEOUT)
            .send()
            .await?
            .error_for_status()?
            .text()
            .await?;
        let raw = parse_list_response(&body)?;
        let records = parse_mod_records(raw.records);

        Ok(GbSearchResult {
            records,
            record_count: raw.metadata.record_count,
            is_complete: raw.metadata.is_complete,
            hidden_count: 0,
        })
    }

    /// The six mods that top GameBanana's own ranking windows — best today, this week, this
    /// month, this half-year, this year, and of all time — in that order.
    ///
    /// Two requests, not seven. `Game/:id/TopSubs` ranks every period in one response but
    /// returns a thin record (no preview media, no view count, no modified date), so the six
    /// winners are then filled out by a single batched `Mod/Multi` call.
    ///
    /// A period GameBanana cannot fill, or a mod the batch does not answer for, is dropped —
    /// the banner shows five slides rather than inventing a sixth.
    pub async fn get_featured_mods(&self) -> Result<Vec<GbFeaturedMod>, GameBananaError> {
        let url = format!("{BASE_URL}/Game/{ZZZ_GAME_ID}/TopSubs");
        let body = self
            .http
            .get(&url)
            .timeout(API_REQUEST_TIMEOUT)
            .send()
            .await?
            .error_for_status()?
            .text()
            .await?;

        // `TopSubs` answers with a bare array, not the `_aMetadata`/`_aRecords` envelope the
        // list endpoints use, so `parse_list_response` does not apply here.
        let subs: Vec<RawTopSub> = serde_json::from_str(&body).map_err(|_| {
            if let Ok(err) = serde_json::from_str::<RawApiError>(&body) {
                GameBananaError::Api {
                    code: err.code,
                    body: body.clone(),
                }
            } else {
                GameBananaError::UnexpectedResponse(body.chars().take(500).collect())
            }
        })?;

        let winners = pick_featured(&subs);
        if winners.is_empty() {
            return Ok(Vec::new());
        }

        let ids = winners
            .iter()
            .map(|s| s.id.to_string())
            .collect::<Vec<_>>()
            .join(",");
        let fields_url = format!(
            "{BASE_URL}/Mod/Multi?_csvRowIds={ids}&_csvProperties=_idRow,_sName,_sProfileUrl,\
             _tsDateModified,_aPreviewMedia,_aSubmitter,_aGame,_aRootCategory,_aCategory,\
             _nLikeCount,_nViewCount,_nPostCount,_nDownloadCount"
        );
        let fields_body = self
            .http
            .get(&fields_url)
            .timeout(API_REQUEST_TIMEOUT)
            .send()
            .await?
            .error_for_status()?
            .text()
            .await?;
        let mut fields: Vec<RawFeaturedFields> = serde_json::from_str(&fields_body)
            .map_err(|_| {
                GameBananaError::UnexpectedResponse(fields_body.chars().take(500).collect())
            })?;

        Ok(winners
            .into_iter()
            .filter_map(|top| {
                let position = fields.iter().position(|f| f.id == top.id)?;
                Some(GbFeaturedMod {
                    period: top.period.clone(),
                    record: featured_mod_from(top, fields.remove(position)),
                })
            })
            .collect())
    }

    /// `@gbprofile` cannot be combined with extra `_csvProperties` in one request (confirmed
    /// live — GameBanana returns `UNKNOWN_PROPERTY_SET`), so the description body (`_sText`,
    /// `_sDescription`) is fetched as a second call and merged in.
    pub async fn get_mod_detail(&self, mod_id: i64) -> Result<GbModDetail, GameBananaError> {
        let profile_url = format!("{BASE_URL}/Mod/{mod_id}?_csvProperties=@gbprofile");
        let profile_body = self
            .http
            .get(&profile_url)
            .timeout(API_REQUEST_TIMEOUT)
            .send()
            .await?
            .error_for_status()?
            .text()
            .await?;

        let mut detail: GbModDetail = serde_json::from_str(&profile_body).map_err(|_| {
            if let Ok(err) = serde_json::from_str::<RawApiError>(&profile_body) {
                GameBananaError::Api {
                    code: err.code,
                    body: profile_body.clone(),
                }
            } else {
                GameBananaError::UnexpectedResponse(profile_body.chars().take(500).collect())
            }
        })?;

        let text_url = format!("{BASE_URL}/Mod/{mod_id}?_csvProperties=_sText,_sDescription");
        let text_body = self
            .http
            .get(&text_url)
            .timeout(API_REQUEST_TIMEOUT)
            .send()
            .await?
            .error_for_status()?
            .text()
            .await?;
        if let Ok(text_fields) = serde_json::from_str::<GbDescriptionFields>(&text_body) {
            detail.description_html = text_fields.description_html;
            detail.description = text_fields.description;
        }

        // Unlike list/search records, `Mod/:id` has no `_bHasContentRatings`/
        // `_sInitialVisibility` to run through `content_rating::is_mature` — but it does send
        // `_bIsNsfw` (`is_nsfw`, deserialized above), which is the accurate signal here.
        detail.is_mature = detail.is_nsfw;
        Ok(detail)
    }

    /// Fetches just a mod's file list — one lightweight request, unlike `get_mod_detail`
    /// (which costs two: `@gbprofile` plus a separate text-fields call). Used by update
    /// detection, which needs to check many mods and has no use for the description body.
    /// Confirmed live: `Mod/:id?_csvProperties=_aFiles` returns `{"_aFiles": [...]}` directly,
    /// not the `_aMetadata`/`_aRecords` envelope `parse_list_response` handles.
    pub async fn get_mod_files(&self, mod_id: i64) -> Result<Vec<GbFile>, GameBananaError> {
        #[derive(Debug, Deserialize)]
        struct FilesOnly {
            #[serde(rename(deserialize = "_aFiles"), default)]
            files: Vec<GbFile>,
        }

        let url = format!("{BASE_URL}/Mod/{mod_id}?_csvProperties=_aFiles");
        let body = self
            .http
            .get(&url)
            .timeout(API_REQUEST_TIMEOUT)
            .send()
            .await?
            .error_for_status()?
            .text()
            .await?;

        // Checked first, deliberately: `FilesOnly::files` is `default`-annotated so a mod with
        // genuinely zero files parses cleanly, but that same leniency means an API error body
        // (`{"_sErrorCode": ..., ...}`, e.g. a deleted/nonexistent mod id) would otherwise
        // silently deserialize as an empty file list instead of surfacing as an error.
        if let Ok(err) = serde_json::from_str::<RawApiError>(&body) {
            return Err(GameBananaError::Api {
                code: err.code,
                body,
            });
        }

        let parsed: FilesOnly = serde_json::from_str(&body)
            .map_err(|_| GameBananaError::UnexpectedResponse(body.chars().take(500).collect()))?;

        Ok(parsed.files)
    }

    /// Streams `url` into `dest_path` rather than buffering it — mod archives run to tens of
    /// megabytes — continuing from `resume` when it points at bytes already on disk. Returns the
    /// file's full length once it is complete.
    ///
    /// `on_progress` receives `(bytes_so_far, total)`, where `total` is `None` if the server sent
    /// no `Content-Length`. It is called after each chunk *and* periodically while waiting for
    /// one, so that returning `true` — which abandons the transfer with
    /// `GameBananaError::Cancelled` — works even on a connection that has gone quiet.
    ///
    /// `on_validator` fires once, the moment the response headers land, carrying the server's
    /// `ETag`. It is a callback rather than part of the return value because the caller needs the
    /// validator *before* the transfer ends — the whole point of being able to pause is that the
    /// transfer might not end, and a paused partial with no validator recorded cannot be safely
    /// resumed later.
    pub async fn download_file(
        &self,
        url: &str,
        dest_path: &Path,
        resume: ResumePoint<'_>,
        on_validator: impl FnOnce(Option<&str>),
        mut on_progress: impl FnMut(u64, Option<u64>) -> bool,
        should_stop: impl Fn() -> bool,
    ) -> Result<u64, GameBananaError> {
        let mut response = self
            .open_range(url, resume.have, resume.etag, &should_stop)
            .await?;
        let mut start = resume.have;

        // 416 says the partial is already at least as long as the file now is, so it is not a
        // prefix of anything the server is willing to send. Ask for the whole thing instead of
        // keeping bytes that can no longer be checked against it.
        if response.status() == reqwest::StatusCode::RANGE_NOT_SATISFIABLE && start > 0 {
            response = self.open_range(url, 0, None, &should_stop).await?;
            start = 0;
        }
        let response = response.error_for_status()?;

        // A plain 200 in reply to a ranged request means the server declined the range — either
        // it does not do them, or `If-Range` did not match and the file has changed. The body is
        // the whole file either way, so whatever is on disk is worthless and the offset resets.
        if response.status() != reqwest::StatusCode::PARTIAL_CONTENT {
            start = 0;
        }

        on_validator(
            response
                .headers()
                .get(reqwest::header::ETAG)
                .and_then(|value| value.to_str().ok()),
        );

        // On a 206 the Content-Length describes what is left to send, not the file. The total the
        // caller wants to show is that plus what it already had.
        let total = response.content_length().map(|len| start + len);
        let mut stream = response.bytes_stream();

        if let Some(parent) = dest_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        // One open covering both cases. `set_len` is the part that matters: it trims a staging
        // file holding *more* than `start`, which is exactly what a hard kill leaves behind when
        // bytes reached the disk but the count never reached the caller. Without it a resumed
        // body would be appended on top of bytes it is about to send again.
        let mut file = tokio::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(false)
            .open(dest_path)
            .await?;
        file.set_len(start).await?;
        file.seek(std::io::SeekFrom::Start(start)).await?;

        let mut downloaded = start;
        loop {
            // Not a plain `while let`: `on_progress` is where the caller gets to say stop, and
            // hanging that on a chunk arriving means a transfer that has stalled cannot be stopped
            // at all — which is exactly the moment someone reaches for pause.
            //
            // The read future is created once here and then polled repeatedly by the inner loop.
            // It must never be dropped between polls: timing out `stream.next()` directly throws
            // away the read that is in flight, and with it the response body. That reads as a
            // clean zero-byte download rather than an error, and it only bites when a chunk takes
            // longer to arrive than the poll interval — so a fast connection looks perfect while a
            // slow one silently gets nothing. `timeout` here wraps a mutable borrow, so only the
            // wrapper is discarded and the read carries on where it left off.
            let mut next = std::pin::pin!(stream.next());
            let item = loop {
                match tokio::time::timeout(STOP_POLL_INTERVAL, next.as_mut()).await {
                    Ok(item) => break item,
                    Err(_) => {
                        if on_progress(downloaded, total) {
                            file.flush().await?;
                            return Err(GameBananaError::Cancelled);
                        }
                    }
                }
            };
            let Some(chunk) = item else { break };
            let chunk = chunk?;
            downloaded += chunk.len() as u64;
            file.write_all(&chunk).await?;
            if on_progress(downloaded, total) {
                // Flushed even though this is the abandoning path: a paused transfer is only
                // worth pausing if what it fetched is actually on disk for the next attempt.
                file.flush().await?;
                return Err(GameBananaError::Cancelled);
            }
        }
        file.flush().await?;
        Ok(downloaded)
    }

    /// One GET, ranged when `have` is non-zero. Split out so the 416 path can reissue the request
    /// without a range rather than recursing into an async fn.
    ///
    /// The send is raced against `should_stop` because this is the slowest part of starting a
    /// download and the part with nothing to show for it: reaching a GameBanana file means three
    /// TLS handshakes across three hosts (`gamebanana.com` → `files.gamebanana.com` →
    /// `filecacheNN`), measured at a second locally and reported far worse elsewhere. Without the
    /// race there is no way to abandon a download during that stretch, which is exactly when
    /// someone gives up on it. Nothing has been written to disk yet, so dropping the request here
    /// costs nothing.
    async fn open_range(
        &self,
        url: &str,
        have: u64,
        etag: Option<&str>,
        should_stop: &impl Fn() -> bool,
    ) -> Result<reqwest::Response, GameBananaError> {
        if should_stop() {
            return Err(GameBananaError::Cancelled);
        }
        let mut request = self.http.get(url).timeout(DOWNLOAD_TIMEOUT);
        if have > 0 {
            request = request.header(reqwest::header::RANGE, format!("bytes={have}-"));
            if let Some(tag) = etag {
                request = request.header(reqwest::header::IF_RANGE, tag);
            }
        }
        tokio::select! {
            sent = request.send() => Ok(sent?),
            _ = wait_for_stop(should_stop) => Err(GameBananaError::Cancelled),
        }
    }
}

/// Resolves once `should_stop` says so, and otherwise never — meant only as the losing half of a
/// `select!` against real work.
pub(crate) async fn wait_for_stop(should_stop: &impl Fn() -> bool) {
    loop {
        if should_stop() {
            return;
        }
        tokio::time::sleep(STOP_POLL_INTERVAL).await;
    }
}

/// Minimal percent-encoding for a search query string — avoids pulling in a whole crate
/// for the handful of characters (spaces, punctuation) GameBanana's search box can receive.
fn urlencoding_encode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Belle's confirmed GameBanana subcategory ID (see project memory `gamebanana-api-v11`).
    const BELLE_CATEGORY_ID: i64 = 30334;
    /// A real, small ZZZ mod used as a stable fixture for live API tests.
    const SAMPLE_MOD_ID: i64 = 608561;

    #[test]
    fn urlencoding_encode_escapes_spaces_and_punctuation() {
        assert_eq!(urlencoding_encode("hello world"), "hello%20world");
        assert_eq!(urlencoding_encode("belle!"), "belle%21");
        assert_eq!(urlencoding_encode("a-b_c.d~e"), "a-b_c.d~e");
    }

    #[tokio::test]
    async fn browse_by_category_returns_only_matching_zzz_mods() {
        let client = GameBananaClient::new();
        let result = client
            .search_mods(None, Some(BELLE_CATEGORY_ID), ModSort::default(), 1)
            .await
            .unwrap();

        assert!(!result.records.is_empty());
        assert!(result.records.iter().all(|m| m.game.id == ZZZ_GAME_ID));
    }

    /// GameBanana's `Mod/Index` defaults to 5 records per page — this must request more
    /// explicitly, or the Browse grid only ever shows a handful of mods per page.
    #[tokio::test]
    async fn browse_by_category_returns_more_than_gamebananas_default_page_size() {
        let client = GameBananaClient::new();
        let result = client.search_mods(None, None, ModSort::default(), 1).await.unwrap();

        assert!(
            result.records.len() > 5,
            "expected more than GameBanana's default 5-per-page, got {}",
            result.records.len()
        );
    }

    /// `Mod/Index` carries no `_nDownloadCount` at all and ignores `_csvProperties` (both
    /// confirmed live 2026-08-15), so the batched `Mod/Multi` call is the only thing putting
    /// this number on a card. If that call is dropped or its shape changes, every card
    /// silently loses the stat with nothing else failing — hence a live assertion.
    ///
    /// Deliberately a majority rather than "all": a mod withdrawn between the two requests
    /// would legitimately come back unanswered, and that is not a regression.
    #[tokio::test]
    async fn browse_records_arrive_with_download_counts_attached() {
        let client = GameBananaClient::new();
        let result = client.search_mods(None, None, ModSort::default(), 1).await.unwrap();

        let known = result.records.iter().filter(|m| m.download_count.is_some()).count();
        assert!(
            known * 2 > result.records.len(),
            "only {known} of {} browse records carried a download count",
            result.records.len()
        );
    }

    fn fixture_top_sub(id: i64, period: &str, model_name: &str) -> RawTopSub {
        RawTopSub {
            id,
            period: period.to_string(),
            model_name: model_name.to_string(),
            initial_visibility: "show".to_string(),
        }
    }

    /// The banner's order is the app's decision, not the API's — `TopSubs` returns the buckets
    /// interleaved and includes a `3month` window this app skips. Pins both, plus the rule that
    /// only `Mod` records qualify, since the feed can carry Tools and Sounds too.
    #[test]
    fn featured_picks_one_mod_per_wanted_period_in_display_order() {
        let subs = vec![
            fixture_top_sub(10, "alltime", "Mod"),
            fixture_top_sub(20, "3month", "Mod"),
            fixture_top_sub(30, "today", "Tool"),
            fixture_top_sub(31, "today", "Mod"),
            fixture_top_sub(32, "today", "Mod"),
            fixture_top_sub(40, "week", "Mod"),
            fixture_top_sub(50, "month", "Mod"),
            fixture_top_sub(60, "6month", "Mod"),
            fixture_top_sub(70, "year", "Mod"),
        ];

        let picked = pick_featured(&subs);

        assert_eq!(
            picked.iter().map(|s| s.id).collect::<Vec<_>>(),
            vec![31, 40, 50, 60, 70, 10],
            "expected day/week/month/6month/year/alltime, taking the Tool's place with id 31"
        );
    }

    /// A period with no entry is skipped, never padded from a neighbouring window — a banner
    /// that repeated last month's winner as "top today" would be claiming something untrue.
    #[test]
    fn featured_skips_a_period_gamebanana_has_no_entry_for() {
        let subs = vec![
            fixture_top_sub(10, "today", "Mod"),
            fixture_top_sub(20, "alltime", "Mod"),
        ];

        let picked = pick_featured(&subs);

        assert_eq!(picked.iter().map(|s| s.id).collect::<Vec<_>>(), vec![10, 20]);
    }

    /// The whole point of the change: six different ranking windows, not six slots off one
    /// popularity list. Live, because the join between `TopSubs` and `Mod/Multi` is the part
    /// that can silently break — a failed join would render every slide as a letter on grey.
    #[tokio::test]
    async fn featured_mods_come_back_as_distinct_periods_with_artwork() {
        let client = GameBananaClient::new();
        let featured = client.get_featured_mods().await.unwrap();

        let periods: Vec<&str> = featured.iter().map(|f| f.period.as_str()).collect();
        assert!(
            periods.len() >= 5,
            "expected most ranking windows to be filled, got {periods:?}"
        );
        assert!(
            periods.iter().all(|p| FEATURED_PERIODS.contains(p)),
            "unexpected period in {periods:?}"
        );
        // Same relative order as the display list, with any empty window simply missing.
        let expected: Vec<&str> = FEATURED_PERIODS
            .iter()
            .copied()
            .filter(|p| periods.contains(p))
            .collect();
        assert_eq!(periods, expected);

        assert!(
            featured
                .iter()
                .all(|f| !f.record.preview_media.images.is_empty()),
            "a slide came back with no artwork, so the Mod/Multi join is broken"
        );
        let unique: std::collections::HashSet<i64> = featured.iter().map(|f| f.record.id).collect();
        assert!(
            unique.len() > 1,
            "every period named the same mod, which is the behaviour this replaced"
        );
    }

    fn fixture_mod(id: i64) -> GbMod {
        GbMod {
            id,
            name: "Test Mod".to_string(),
            profile_url: "https://gamebanana.com/mods/1".to_string(),
            date_modified: 0,
            has_files: true,
            tags: vec![],
            preview_media: GbPreviewMedia::default(),
            submitter: GbSubmitter {
                id: 1,
                name: "someone".to_string(),
                profile_url: "https://gamebanana.com/members/1".to_string(),
                avatar_url: None,
            },
            game: GbGameRef {
                id: ZZZ_GAME_ID,
                name: "Zenless Zone Zero".to_string(),
            },
            root_category: GbCategoryRef {
                name: "Character Skins".to_string(),
                profile_url: "https://gamebanana.com/mods/cats/30305".to_string(),
            },
            sub_category: None,
            like_count: 0,
            view_count: 0,
            post_count: 0,
            download_count: None,
            has_content_ratings: false,
            initial_visibility: "show".to_string(),
            is_mature: false,
        }
    }

    /// `#[serde(rename = "_sName")]` renames both directions by default, which would leak
    /// GameBanana's raw wire format (`_sName`, `_idRow`, ...) into the JSON sent to the
    /// frontend. These structs use `rename(deserialize = ...)` specifically so serialization
    /// (Tauri command responses) uses clean Rust field names instead, matching how `Mod`/
    /// `Character` already look on the frontend.
    #[test]
    fn serializing_a_mod_uses_clean_field_names_not_gamebanana_wire_format() {
        let json = serde_json::to_string(&fixture_mod(1)).unwrap();
        assert!(json.contains("\"id\":1"));
        assert!(json.contains("\"name\":\"Test Mod\""));
        assert!(!json.contains("_idRow"));
        assert!(!json.contains("_sName"));
    }

    /// The distinction the card depends on: only a mod the batch actually put a number against
    /// gets one. A mod the batch skipped, and a mod it answered with `null`, both stay `None`
    /// so the card leaves the stat off rather than claiming nobody downloaded it.
    #[test]
    fn download_counts_apply_only_to_mods_the_batch_gave_a_number_for() {
        let mut records = vec![fixture_mod(1), fixture_mod(2), fixture_mod(3)];
        let counts = vec![
            RawDownloadCount {
                id: 1,
                download_count: Some(1126),
            },
            RawDownloadCount {
                id: 3,
                download_count: None,
            },
        ];

        apply_download_counts(&mut records, &counts);

        assert_eq!(records[0].download_count, Some(1126));
        assert_eq!(records[1].download_count, None, "id 2 was never answered for");
        assert_eq!(records[2].download_count, None, "id 3 was answered with null");
    }

    /// A single explicit `null` used to fail the whole array, so one unmeasured mod cost a
    /// page every count it had just fetched. Pins that the rest survive it.
    #[test]
    fn a_null_download_count_does_not_discard_the_rest_of_the_batch() {
        let body = r#"[
            {"_idRow": 1, "_nDownloadCount": 17553},
            {"_idRow": 2, "_nDownloadCount": null},
            {"_idRow": 3, "_nDownloadCount": 9945}
        ]"#;

        let counts: Vec<RawDownloadCount> = serde_json::from_str(body).unwrap();
        let mut records = vec![fixture_mod(1), fixture_mod(2), fixture_mod(3)];
        apply_download_counts(&mut records, &counts);

        assert_eq!(records[0].download_count, Some(17553));
        assert_eq!(records[1].download_count, None);
        assert_eq!(records[2].download_count, Some(9945));
    }

    #[tokio::test]
    async fn text_search_filters_to_mod_type_records_only() {
        let client = GameBananaClient::new();
        let result = client.search_mods(Some("Belle"), None, ModSort::default(), 1).await.unwrap();

        assert!(!result.records.is_empty());
        // Every returned record must be a real, installable Mod — the raw search endpoint
        // also matches Concepts/Questions/etc., which must be filtered out client-side.
        assert!(result.records.iter().all(|m| m.game.id == ZZZ_GAME_ID));
    }

    #[tokio::test]
    async fn browse_by_category_records_include_preview_images() {
        let client = GameBananaClient::new();
        let result = client
            .search_mods(None, Some(BELLE_CATEGORY_ID), ModSort::default(), 1)
            .await
            .unwrap();

        assert!(!result.records.is_empty());
        let with_images = result
            .records
            .iter()
            .filter(|m| !m.preview_media.images.is_empty())
            .count();
        assert!(
            with_images > 0,
            "expected at least one record with a non-empty preview_media.images, got 0 of {}",
            result.records.len()
        );
    }

    /// Every record from both search paths must have a non-empty `initial_visibility` and an
    /// `is_mature` that agrees with `content_rating::is_mature` — this is the invariant
    /// `parse_mod_records` exists to guarantee (see its doc comment).
    #[tokio::test]
    async fn search_records_have_is_mature_agreeing_with_initial_visibility() {
        let client = GameBananaClient::new();

        let browse = client.search_mods(None, None, ModSort::default(), 1).await.unwrap();
        assert!(!browse.records.is_empty());
        for m in &browse.records {
            assert!(!m.initial_visibility.is_empty());
            assert_eq!(
                m.is_mature,
                crate::content_rating::is_mature(&m.initial_visibility)
            );
        }

        let search = client.search_mods(Some("Belle"), None, ModSort::default(), 1).await.unwrap();
        assert!(!search.records.is_empty());
        for m in &search.records {
            assert!(!m.initial_visibility.is_empty());
            assert_eq!(
                m.is_mature,
                crate::content_rating::is_mature(&m.initial_visibility)
            );
        }
    }

    /// `Mod/:id?_csvProperties=@gbprofile` was confirmed live (2026-08-08) to reject
    /// `_bHasContentRatings`/`_sInitialVisibility` outright (`UNKNOWN_PROPERTY`) — those two
    /// fields only exist on list/search records. This pins that they still fail open to safe
    /// defaults on `GbModDetail` (`initial_visibility` = `"show"`, `has_content_ratings` =
    /// `false`) even though nothing populates them anymore.
    #[tokio::test]
    async fn get_mod_detail_defaults_unavailable_content_rating_fields() {
        let client = GameBananaClient::new();
        let detail = client.get_mod_detail(SAMPLE_MOD_ID).await.unwrap();

        assert_eq!(detail.initial_visibility, "show");
        assert!(!detail.has_content_ratings);
    }

    /// `is_mature` on `GbModDetail` comes from `_bIsNsfw`, which (unlike the content-rating
    /// fields above) the single-mod endpoint does support — confirmed live 2026-08-09. Finds a
    /// mod the live browse feed already flags mature and checks `get_mod_detail` agrees, rather
    /// than hardcoding a specific mod id that could stop being mature later.
    #[tokio::test]
    async fn get_mod_detail_is_mature_agrees_with_is_nsfw() {
        let client = GameBananaClient::new();

        let browse = client.search_mods(None, None, ModSort::default(), 1).await.unwrap();
        let mature_record = browse
            .records
            .iter()
            .find(|m| m.is_mature)
            .expect("expected at least one mature record on the live ZZZ browse feed");

        let detail = client.get_mod_detail(mature_record.id).await.unwrap();
        assert!(detail.is_nsfw);
        assert!(detail.is_mature);
        assert_eq!(detail.is_mature, detail.is_nsfw);
    }

    #[tokio::test]
    async fn get_mod_detail_returns_files_and_description() {
        let client = GameBananaClient::new();
        let detail = client.get_mod_detail(SAMPLE_MOD_ID).await.unwrap();

        assert_eq!(detail.id, SAMPLE_MOD_ID);
        assert!(!detail.files.is_empty());
        assert!(detail.files.iter().all(|f| !f.md5_checksum.is_empty()));
    }

    /// GameBanana sends `"_aEmbeddedMedia": null` (not an absent key) on mods with no showcase
    /// video — confirmed live on `SAMPLE_MOD_ID`. Pins that the null case deserializes to an
    /// empty vec rather than erroring, and that a mod confirmed live to have a real YouTube
    /// showcase embed (2026-08-09) actually parses one.
    #[tokio::test]
    async fn get_mod_detail_embedded_media_handles_null_and_a_real_video() {
        const MOD_WITH_VIDEO_ID: i64 = 611207; // "Yixuan - Summer's Tale"

        let client = GameBananaClient::new();

        let without_video = client.get_mod_detail(SAMPLE_MOD_ID).await.unwrap();
        assert!(without_video.embedded_media.is_empty());

        let with_video = client.get_mod_detail(MOD_WITH_VIDEO_ID).await.unwrap();
        assert!(!with_video.embedded_media.is_empty());
        assert!(with_video.embedded_media[0].contains("youtube.com"));
    }

    /// `get_mod_files` must return the same files (by id/md5) as `get_mod_detail`'s `files`
    /// field, since update detection uses it as a lighter-weight substitute for the same data.
    #[tokio::test]
    async fn get_mod_files_matches_get_mod_detail_files() {
        let client = GameBananaClient::new();

        let files = client.get_mod_files(SAMPLE_MOD_ID).await.unwrap();
        assert!(!files.is_empty());
        assert!(files.iter().all(|f| !f.md5_checksum.is_empty()));
        assert!(files.iter().all(|f| f.date_added > 0));

        let detail = client.get_mod_detail(SAMPLE_MOD_ID).await.unwrap();
        let mut files_ids: Vec<i64> = files.iter().map(|f| f.id).collect();
        let mut detail_ids: Vec<i64> = detail.files.iter().map(|f| f.id).collect();
        files_ids.sort_unstable();
        detail_ids.sort_unstable();
        assert_eq!(files_ids, detail_ids);
    }

    /// Regression test: `FilesOnly::files` is `default`-annotated (so a mod with genuinely
    /// zero files parses cleanly), which initially let a GameBanana API error body
    /// (`{"_sErrorCode": "NO_SUCH_RECORD", ...}`) silently deserialize as an empty file list
    /// instead of erroring — caught live via `commands::updates` tests against a nonexistent
    /// mod id, not by inspection.
    #[tokio::test]
    async fn get_mod_files_errors_instead_of_returning_empty_for_a_nonexistent_mod() {
        let client = GameBananaClient::new();
        let result = client.get_mod_files(999_999_999).await;
        // GameBanana has been observed returning this as either a 200 with an error body
        // (`Api`, the steady-state behavior as of this writing) or a real HTTP error status
        // (`Http`, via `error_for_status()`) — both are legitimate "this mod doesn't exist"
        // signals, and either is an acceptable fix for the empty-list-swallows-errors bug this
        // test guards against. Only a silent `Ok(vec![])` would be a regression.
        assert!(
            matches!(
                result,
                Err(GameBananaError::Api { .. }) | Err(GameBananaError::Http(_))
            ),
            "expected an Api or Http error, got {result:?}"
        );
    }

    #[tokio::test]
    async fn download_file_streams_content_to_disk() {
        let client = GameBananaClient::new();
        let dest = std::env::temp_dir().join(format!(
            "ether-manager-gb-download-test-{}.zip",
            std::process::id()
        ));

        // A confirmed tiny (552-byte) real file, kept fast and deterministic for CI.
        client
            .download_file(
                "https://gamebanana.com/dl/610939",
                &dest,
                ResumePoint::fresh(),
                |_| {},
                |_, _| false,
                || false,
            )
            .await
            .unwrap();

        let bytes = std::fs::read(&dest).unwrap();
        assert_eq!(bytes.len(), 552);

        std::fs::remove_file(&dest).unwrap();
    }

    #[tokio::test]
    async fn download_file_reports_progress_up_to_the_full_size() {
        let client = GameBananaClient::new();
        let dest = std::env::temp_dir().join(format!(
            "ether-manager-gb-progress-test-{}",
            std::process::id()
        ));

        let mut calls: Vec<(u64, Option<u64>)> = Vec::new();
        client
            .download_file(
                "https://gamebanana.com/dl/610939",
                &dest,
                ResumePoint::fresh(),
                |_| {},
                |downloaded, total| {
                    calls.push((downloaded, total));
                    false
                },
                || false,
            )
            .await
            .unwrap();

        assert!(
            !calls.is_empty(),
            "on_progress must be called at least once"
        );
        let (final_downloaded, final_total) = *calls.last().unwrap();
        assert_eq!(final_downloaded, 552);
        assert_eq!(final_total, Some(552));

        std::fs::remove_file(&dest).unwrap();
    }

    #[tokio::test]
    async fn download_file_stops_when_progress_callback_requests_cancellation() {
        let client = GameBananaClient::new();
        let dest = std::env::temp_dir().join(format!(
            "ether-manager-gb-cancel-test-{}",
            std::process::id()
        ));

        let result = client
            .download_file(
                "https://gamebanana.com/dl/610939",
                &dest,
                ResumePoint::fresh(),
                |_| {},
                |_, _| true,
                || false,
            )
            .await;

        assert!(matches!(result, Err(GameBananaError::Cancelled)));

        let _ = std::fs::remove_file(&dest);
    }

    /// The claim the whole pause feature rests on: a transfer stopped part-way can be picked up
    /// and finish with exactly the bytes an uninterrupted one would have produced.
    ///
    /// Deliberately live. Whether a `Range` header survives GameBanana's two redirects — through
    /// `files.gamebanana.com` and on to a numbered `filecacheNN` node — is precisely the thing a
    /// mocked server would assume rather than prove, and it is the thing that would silently turn
    /// every resume into a corrupt archive if it were not true.
    #[tokio::test]
    async fn a_stopped_download_resumes_to_the_same_bytes_as_an_uninterrupted_one() {
        let client = GameBananaClient::new();
        // "Compact Damage Numbers", 182101 bytes — big enough to arrive in several chunks, so
        // stopping after the first leaves a genuine partial, and small enough to stay CI-friendly.
        let url = "https://gamebanana.com/dl/1776071";
        let temp = std::env::temp_dir();
        let whole = temp.join(format!("ether-manager-gb-whole-{}", std::process::id()));
        let resumed = temp.join(format!("ether-manager-gb-resumed-{}", std::process::id()));

        client
            .download_file(
                url,
                &whole,
                ResumePoint::fresh(),
                |_| {},
                |_, _| false,
                || false,
            )
            .await
            .unwrap();
        let expected = std::fs::read(&whole).unwrap();

        let mut etag: Option<String> = None;
        let stopped = client
            .download_file(
                url,
                &resumed,
                ResumePoint::fresh(),
                |tag| etag = tag.map(str::to_owned),
                |_, _| true,
                || false,
            )
            .await;
        assert!(matches!(stopped, Err(GameBananaError::Cancelled)));

        let have = std::fs::metadata(&resumed).unwrap().len();
        assert!(
            have > 0 && have < expected.len() as u64,
            "the stopped transfer must leave a real partial on disk, got {have} of {}",
            expected.len()
        );

        let total = client
            .download_file(
                url,
                &resumed,
                ResumePoint {
                    have,
                    etag: etag.as_deref(),
                },
                |_| {},
                |_, _| false,
                || false,
            )
            .await
            .unwrap();

        assert_eq!(total, expected.len() as u64);
        assert_eq!(
            std::fs::read(&resumed).unwrap(),
            expected,
            "a resumed download must be byte-identical to one that ran straight through — a \
             mismatch here means the range was dropped and the tail was appended to the head"
        );

        std::fs::remove_file(&whole).unwrap();
        std::fs::remove_file(&resumed).unwrap();
    }

    /// Regression test for a download that could not be stopped.
    ///
    /// The caller only gets to say stop from inside the progress callback, and that callback used
    /// to be reached only when a chunk arrived. A transfer that had gone quiet without dropping
    /// its connection therefore ignored pause and cancel entirely — which is precisely the state
    /// someone reaches for pause in. Reported from the app: a 32 MB mod crawled to 7,816 bytes and
    /// then sat there, unpausable.
    ///
    /// The server here answers with headers promising a megabyte and then sends nothing at all.
    #[tokio::test]
    async fn a_stalled_transfer_can_still_be_stopped() {
        use tokio::io::AsyncReadExt;

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = [0u8; 1024];
            let _ = socket.read(&mut request).await;
            let _ = socket
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 1048576\r\n\r\n")
                .await;
            // Hold the connection open and stay silent.
            tokio::time::sleep(Duration::from_secs(30)).await;
        });

        let client = GameBananaClient::new();
        let dest = std::env::temp_dir().join(format!(
            "ether-manager-gb-stalled-{}",
            std::process::id()
        ));

        let outcome = tokio::time::timeout(
            Duration::from_secs(5),
            client.download_file(
                &format!("http://{addr}/stalled"),
                &dest,
                ResumePoint::fresh(),
                |_| {},
                |_, _| true,
                || false,
            ),
        )
        .await;

        match outcome {
            Err(_) => panic!(
                "a stalled transfer never reached its progress callback, so nothing could stop it"
            ),
            Ok(result) => assert!(matches!(result, Err(GameBananaError::Cancelled))),
        }

        let _ = std::fs::remove_file(&dest);
    }

    /// Regression test for a download that silently produced nothing at all.
    ///
    /// Interrupting the wait for a chunk must not discard the read that is in flight. When it did,
    /// every connection slower than the poll interval lost its response body and reported a clean
    /// zero-byte success — invisible on a fast link, total failure on a slow one, which is the
    /// worst possible way for it to fail.
    ///
    /// This server answers, then delivers each chunk slower than the poll, so every chunk is
    /// preceded by at least one timed-out poll.
    #[tokio::test]
    async fn a_connection_slower_than_the_stop_poll_still_delivers_every_byte() {
        use tokio::io::AsyncReadExt;

        const CHUNK: &[u8] = b"0123456789";
        const CHUNKS: usize = 4;

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = [0u8; 1024];
            let _ = socket.read(&mut request).await;
            let _ = socket
                .write_all(
                    format!(
                        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\n\r\n",
                        CHUNK.len() * CHUNKS
                    )
                    .as_bytes(),
                )
                .await;
            for _ in 0..CHUNKS {
                tokio::time::sleep(STOP_POLL_INTERVAL * 2).await;
                let _ = socket.write_all(CHUNK).await;
                let _ = socket.flush().await;
            }
            tokio::time::sleep(Duration::from_secs(2)).await;
        });

        let client = GameBananaClient::new();
        let dest = std::env::temp_dir().join(format!(
            "ether-manager-gb-slow-chunks-{}",
            std::process::id()
        ));

        let total = client
            .download_file(
                &format!("http://{addr}/slow"),
                &dest,
                ResumePoint::fresh(),
                |_| {},
                |_, _| false,
                || false,
            )
            .await
            .unwrap();

        assert_eq!(total, (CHUNK.len() * CHUNKS) as u64);
        assert_eq!(
            std::fs::read(&dest).unwrap(),
            CHUNK.repeat(CHUNKS),
            "a slow connection must deliver the same bytes as a fast one, not an empty file"
        );

        std::fs::remove_file(&dest).unwrap();
    }

    /// Reported from the app: a download could not be cancelled while it was still starting.
    ///
    /// Reaching a GameBanana file takes three TLS handshakes across three hosts before a single
    /// byte arrives, and on a slow link that is most of the wait. The progress callback — the only
    /// way a caller could say stop — is not reached until bytes are flowing, so for that whole
    /// stretch the download ignored both pause and cancel.
    ///
    /// This server accepts the connection and then never answers at all, which is that stretch
    /// with the clock stopped.
    #[tokio::test]
    async fn a_download_can_be_cancelled_before_the_first_byte_arrives() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let (socket, _) = listener.accept().await.unwrap();
            tokio::time::sleep(Duration::from_secs(30)).await;
            drop(socket);
        });

        let client = GameBananaClient::new();
        let dest = std::env::temp_dir().join(format!(
            "ether-manager-gb-early-cancel-{}",
            std::process::id()
        ));

        let outcome = tokio::time::timeout(
            Duration::from_secs(5),
            client.download_file(
                &format!("http://{addr}/never-answers"),
                &dest,
                ResumePoint::fresh(),
                |_| {},
                // Never reached: no byte ever arrives. The stop has to come from elsewhere.
                |_, _| false,
                || true,
            ),
        )
        .await;

        match outcome {
            Err(_) => panic!(
                "a download that has not received its first byte must still be cancellable — \
                 waiting on the connection is exactly when someone gives up on it"
            ),
            Ok(result) => assert!(matches!(result, Err(GameBananaError::Cancelled))),
        }

        assert!(
            !dest.exists(),
            "nothing was ever received, so cancelling must not leave a file behind"
        );
    }

    /// A resume point past the end of the file cannot be satisfied, and the server says so with a
    /// 416. Restarting is the only safe reading of that, since bytes that long cannot be a prefix
    /// of the file the server is offering.
    #[tokio::test]
    async fn a_resume_point_past_the_end_of_the_file_starts_over_instead_of_failing() {
        let client = GameBananaClient::new();
        let dest = std::env::temp_dir().join(format!(
            "ether-manager-gb-over-resume-{}",
            std::process::id()
        ));
        std::fs::write(&dest, vec![0u8; 999_999]).unwrap();

        let total = client
            .download_file(
                "https://gamebanana.com/dl/610939",
                &dest,
                ResumePoint {
                    have: 999_999,
                    etag: None,
                },
                |_| {},
                |_, _| false,
                || false,
            )
            .await
            .unwrap();

        assert_eq!(total, 552);
        assert_eq!(std::fs::metadata(&dest).unwrap().len(), 552);

        std::fs::remove_file(&dest).unwrap();
    }

    /// Regression test for a user-reported hang: the default `reqwest::Client` has no
    /// timeout at all, so a stalled/unroutable connection during a download would hang the
    /// install command (and the UI) forever with no error and no way to cancel. `10.255.255.1`
    /// is a private, non-routable address that never responds — this must fail via the
    /// configured connect timeout well before the outer 20s test-level bound, not hang.
    #[tokio::test]
    async fn download_file_times_out_instead_of_hanging_on_an_unreachable_host() {
        let client = GameBananaClient::new();
        let dest = std::env::temp_dir().join(format!(
            "ether-manager-gb-timeout-test-{}",
            std::process::id()
        ));

        let result = tokio::time::timeout(
            std::time::Duration::from_secs(20),
            client.download_file(
                "http://10.255.255.1/unreachable",
                &dest,
                ResumePoint::fresh(),
                |_| {},
                |_, _| false,
                || false,
            ),
        )
        .await;

        match result {
            Err(_) => panic!("download_file hung past the connect timeout instead of erroring"),
            Ok(inner) => {
                let err = inner.expect_err("expected a connect-timeout error");
                let message = err.to_string();
                println!("timeout error message: {message}");
                assert!(
                    message.len() > "GameBanana request failed: error sending request for url (http://10.255.255.1/unreachable)".len(),
                    "expected the source chain to add detail beyond the generic top-level message, got: {message}"
                );
            }
        }
    }
}
