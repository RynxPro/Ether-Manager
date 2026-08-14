const SECONDS_PER_DAY = 86400;

/** GameBanana sends every timestamp as unix seconds. An exact date is noise on a card or a
 * stat cell — how recently something moved is the only part anyone reads off one — so this is
 * the app's single relative-age label, shared by the featured strip and the mod detail panel. */
export function updatedLabel(dateModified: number): string {
  const days = Math.floor((Date.now() / 1000 - dateModified) / SECONDS_PER_DAY);
  if (days <= 0) return "Today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
