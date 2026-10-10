export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A count at a glance: `1,284` stays whole, `18,402` becomes `18.4K`, `1,284,000` becomes
 * `1.3M`.
 *
 * Shortened because these sit three-across in a 430px column in the display face, where a
 * seven-digit view count either truncates or forces the type down until it stops being a
 * heading. The exact figure goes on the element’s `title`, the same bargain the published
 * and updated dates already make in that panel. */
export function formatCount(count: number): string {
  if (count < 10_000) return count.toLocaleString();
  if (count < 1_000_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}
