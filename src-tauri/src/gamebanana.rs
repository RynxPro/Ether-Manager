use std::fmt;
use std::path::Path;
use std::time::Duration;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tokio::io::AsyncWriteExt;

const BASE_URL: &str = "https://gamebanana.com/apiv11";

/// Zenless Zone Zero's GameBanana game ID, confirmed live (see project memory
/// `gamebanana-api-v11`). ZZZ is currently the only supported game.
pub const ZZZ_GAME_ID: i64 = 19567;

/// GameBanana's `Mod/Index` defaults to 5 records per page (confirmed live) — too few for a
/// browse grid. 20 keeps requests light while filling several rows at typical window sizes.
const MOD_INDEX_PAGE_SIZE: u32 = 20;

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
    #[serde(rename(deserialize = "_nLikeCount"))]
    pub like_count: i64,
    #[serde(rename(deserialize = "_nViewCount"))]
    pub view_count: i64,
    #[serde(rename(deserialize = "_nPostCount"))]
    pub post_count: i64,
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
    #[serde(rename(deserialize = "_nDownloadCount"))]
    pub download_count: i64,
    #[serde(rename(deserialize = "_nViewCount"))]
    pub view_count: i64,
    #[serde(rename(deserialize = "_nLikeCount"))]
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
    /// Confirmed live: `@gbprofile` never sends this — always defaults to `false`. Kept for
    /// schema symmetry with `GbMod`, but the frontend must not treat it as authoritative; the
    /// `GbMod` list record the detail dialog already receives as a prop is the real source.
    #[serde(rename(deserialize = "_bHasContentRatings"), default)]
    pub has_content_ratings: bool,
    /// Confirmed live: `@gbprofile` never sends this — always defaults to `"show"`. Same
    /// caveat as `has_content_ratings` above.
    #[serde(
        rename(deserialize = "_sInitialVisibility"),
        default = "default_initial_visibility"
    )]
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
        .filter_map(|v| serde_json::from_value::<GbMod>(v).ok())
        .map(|mut m| {
            m.is_mature = crate::content_rating::is_mature(&m.initial_visibility);
            m
        })
        .collect()
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
    /// endpoint mixes submission types and doesn't support a category filter. Without a
    /// query, browses `Mod/Index` filtered to ZZZ (and `category_id`, if given) — this is
    /// the endpoint that actually respects `_aFilters[Generic_Category]`; the more obvious
    /// `Game/:id/Subfeed` browse endpoint was confirmed live to silently ignore that filter.
    pub async fn search_mods(
        &self,
        query: Option<&str>,
        category_id: Option<i64>,
        page: u32,
    ) -> Result<GbSearchResult, GameBananaError> {
        match query.map(str::trim).filter(|q| !q.is_empty()) {
            Some(q) => self.search_by_text(q, page).await,
            None => self.browse_by_category(category_id, page).await,
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
        page: u32,
    ) -> Result<GbSearchResult, GameBananaError> {
        // GameBanana defaults Mod/Index to 5 records per page (confirmed live); request a
        // larger, browse-friendly page size explicitly instead.
        let mut url = format!(
            "{BASE_URL}/Mod/Index?_nPage={page}&_nPerpage={MOD_INDEX_PAGE_SIZE}&_sSort=Generic_LatestModified&_aFilters%5BGeneric_Game%5D={ZZZ_GAME_ID}"
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

        detail.is_mature = crate::content_rating::is_mature(&detail.initial_visibility);
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

    /// Downloads `url` to `dest_path`, streaming to disk rather than buffering the whole
    /// file in memory — mod archives can be tens of megabytes.
    /// `on_progress` is called after every chunk with `(bytes_downloaded_so_far, total_size)`
    /// (`total_size` is `None` when the server doesn't send `Content-Length`); returning
    /// `true` aborts the download with `GameBananaError::Cancelled`.
    pub async fn download_file(
        &self,
        url: &str,
        dest_path: &Path,
        mut on_progress: impl FnMut(u64, Option<u64>) -> bool,
    ) -> Result<(), GameBananaError> {
        let response = self
            .http
            .get(url)
            .timeout(DOWNLOAD_TIMEOUT)
            .send()
            .await?
            .error_for_status()?;
        let total = response.content_length();
        let mut stream = response.bytes_stream();

        if let Some(parent) = dest_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        let mut file = tokio::fs::File::create(dest_path).await?;
        let mut downloaded: u64 = 0;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            downloaded += chunk.len() as u64;
            file.write_all(&chunk).await?;
            if on_progress(downloaded, total) {
                return Err(GameBananaError::Cancelled);
            }
        }
        file.flush().await?;
        Ok(())
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
            .search_mods(None, Some(BELLE_CATEGORY_ID), 1)
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
        let result = client.search_mods(None, None, 1).await.unwrap();

        assert!(
            result.records.len() > 5,
            "expected more than GameBanana's default 5-per-page, got {}",
            result.records.len()
        );
    }

    /// `#[serde(rename = "_sName")]` renames both directions by default, which would leak
    /// GameBanana's raw wire format (`_sName`, `_idRow`, ...) into the JSON sent to the
    /// frontend. These structs use `rename(deserialize = ...)` specifically so serialization
    /// (Tauri command responses) uses clean Rust field names instead, matching how `Mod`/
    /// `Character` already look on the frontend.
    #[test]
    fn serializing_a_mod_uses_clean_field_names_not_gamebanana_wire_format() {
        let m = GbMod {
            id: 1,
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
            has_content_ratings: false,
            initial_visibility: "show".to_string(),
            is_mature: false,
        };

        let json = serde_json::to_string(&m).unwrap();
        assert!(json.contains("\"id\":1"));
        assert!(json.contains("\"name\":\"Test Mod\""));
        assert!(!json.contains("_idRow"));
        assert!(!json.contains("_sName"));
    }

    #[tokio::test]
    async fn text_search_filters_to_mod_type_records_only() {
        let client = GameBananaClient::new();
        let result = client.search_mods(Some("Belle"), None, 1).await.unwrap();

        assert!(!result.records.is_empty());
        // Every returned record must be a real, installable Mod — the raw search endpoint
        // also matches Concepts/Questions/etc., which must be filtered out client-side.
        assert!(result.records.iter().all(|m| m.game.id == ZZZ_GAME_ID));
    }

    #[tokio::test]
    async fn browse_by_category_records_include_preview_images() {
        let client = GameBananaClient::new();
        let result = client
            .search_mods(None, Some(BELLE_CATEGORY_ID), 1)
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

        let browse = client.search_mods(None, None, 1).await.unwrap();
        assert!(!browse.records.is_empty());
        for m in &browse.records {
            assert!(!m.initial_visibility.is_empty());
            assert_eq!(
                m.is_mature,
                crate::content_rating::is_mature(&m.initial_visibility)
            );
        }

        let search = client.search_mods(Some("Belle"), None, 1).await.unwrap();
        assert!(!search.records.is_empty());
        for m in &search.records {
            assert!(!m.initial_visibility.is_empty());
            assert_eq!(
                m.is_mature,
                crate::content_rating::is_mature(&m.initial_visibility)
            );
        }
    }

    /// `Mod/:id?_csvProperties=@gbprofile` was confirmed live (2026-08-08) to never send
    /// `_bHasContentRatings`/`_sInitialVisibility` at all — this pins that absence fails open
    /// (`initial_visibility` defaults to `"show"`, `is_mature` defaults to `false`) rather than
    /// blanket-flagging every mod detail page as mature.
    #[tokio::test]
    async fn get_mod_detail_defaults_content_rating_fields_when_the_endpoint_omits_them() {
        let client = GameBananaClient::new();
        let detail = client.get_mod_detail(SAMPLE_MOD_ID).await.unwrap();

        assert_eq!(detail.initial_visibility, "show");
        assert!(!detail.is_mature);
    }

    #[tokio::test]
    async fn get_mod_detail_returns_files_and_description() {
        let client = GameBananaClient::new();
        let detail = client.get_mod_detail(SAMPLE_MOD_ID).await.unwrap();

        assert_eq!(detail.id, SAMPLE_MOD_ID);
        assert!(!detail.files.is_empty());
        assert!(detail.files.iter().all(|f| !f.md5_checksum.is_empty()));
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
            .download_file("https://gamebanana.com/dl/610939", &dest, |_, _| false)
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
                |downloaded, total| {
                    calls.push((downloaded, total));
                    false
                },
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
            .download_file("https://gamebanana.com/dl/610939", &dest, |_, _| true)
            .await;

        assert!(matches!(result, Err(GameBananaError::Cancelled)));

        let _ = std::fs::remove_file(&dest);
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
            client.download_file("http://10.255.255.1/unreachable", &dest, |_, _| false),
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
