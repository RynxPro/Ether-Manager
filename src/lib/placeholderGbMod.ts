import type { GbMod } from "@/lib/tauri-commands";

interface PlaceholderSeed {
  gamebananaModId: number;
  name: string;
  thumbnailUrl: string | null;
  /** Whatever local timestamp stands in for "when did this last change" — the bookmark's added
   * date, or the mod row's. Overwritten by the live fetch the moment it lands. */
  dateModified: number;
}

/** Builds the minimum `GbMod` the detail page needs to start rendering and fetch the rest.
 *
 * `ModDetailPage` takes a list-record `GbMod`, but the places that open it from *local* data —
 * a bookmark row, an installed mod — only ever hold an id, a name and a thumbnail. GameBanana's
 * single-mod endpoint cannot supply the difference by id alone either (confirmed live: `_aTags`
 * and `_aSubCategory` come back as `UNKNOWN_PROPERTY` on `Mod/:id`), so the gap is not something
 * a better request would close.
 *
 * Everything empty here is replaced by the live `GbModDetail` a moment later, and the install
 * flow reads from that rather than from this, so nothing downstream depends on these blanks.
 *
 * `is_mature` is `false` on purpose. Both callers describe something the user already chose —
 * saved, or installed — so re-covering it would be asking a question they have answered. */
export function placeholderGbMod(seed: PlaceholderSeed): GbMod {
  return {
    id: seed.gamebananaModId,
    name: seed.name,
    profile_url: "",
    date_modified: seed.dateModified,
    has_files: true,
    tags: [],
    // The stored thumbnail is already a whole URL, so it goes in `file` with an empty
    // `base_url` — `thumbnailUrlFor` joins the two with a slash and a leading one would break it.
    preview_media: seed.thumbnailUrl
      ? { images: [{ base_url: "", file: seed.thumbnailUrl, file_220: null, file_530: null }] }
      : { images: [] },
    submitter: { id: 0, name: "", profile_url: "", avatar_url: null },
    game: { id: 0, name: "" },
    root_category: { name: "", profile_url: "" },
    sub_category: null,
    like_count: 0,
    view_count: 0,
    post_count: 0,
    // Genuinely unknown from a local row, and `null` says so — see `GbMod.download_count`.
    download_count: null,
    has_content_ratings: false,
    initial_visibility: "show",
    is_mature: false,
  };
}
