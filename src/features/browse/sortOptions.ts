import type { ModSort } from "@/lib/tauri-commands";

/** The sort orders Browse offers, in the order they are listed.
 *
 * Its own module rather than a constant exported from `SearchBar`: the control that sets the
 * sort and the results band that names the sort in force both need it, and a file that exports
 * both a component and a value opts out of fast refresh. */
export const SORT_OPTIONS: { value: ModSort; label: string }[] = [
  { value: "LatestUpdated", label: "Latest Updated" },
  { value: "Newest", label: "Newest" },
  { value: "MostLiked", label: "Most Liked" },
  { value: "MostViewed", label: "Most Viewed" },
  { value: "MostDownloaded", label: "Most Downloaded" },
];
