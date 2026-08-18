const SECONDS_PER_DAY = 86400;
const MONTHS_PER_YEAR = 12;

/** Whole calendar months between two dates, counting a month only once its day-of-month has
 * come round again — Jan 24 to Feb 23 is 0 months, Jan 24 to Feb 24 is 1.
 *
 * Calendar months rather than 30-day blocks because months are not 30 days. Dividing by 30
 * drifts about five days a year, always in the direction of making things look newer than they
 * are, and it lets 360-364 days render as "12mo ago" when it should have become a year. */
function wholeMonthsBetween(then: Date, now: Date): number {
  const months =
    (now.getFullYear() - then.getFullYear()) * MONTHS_PER_YEAR +
    (now.getMonth() - then.getMonth());
  return now.getDate() < then.getDate() ? months - 1 : months;
}

/** GameBanana sends every timestamp as unix seconds. This is the app's relative-age label, for
 * the places where "how long ago" is the whole question: cards, the featured strip, the
 * downloads history.
 *
 * It answers freshness, not "what date was this", and deliberately rounds *down* to a coarse
 * bucket — "1y ago" means at least a year, not about a year. Anywhere the exact day is the
 * point, and especially anywhere the number sits next to the same fact on GameBanana's own
 * page, use `exactDate` instead: a mod published in November 2024 and one published in
 * February 2025 both read "1y ago" here, which is fine on a card and wrong in a details panel. */
export function updatedLabel(unixSeconds: number): string {
  const days = Math.floor((Date.now() / 1000 - unixSeconds) / SECONDS_PER_DAY);
  if (days <= 0) return "Today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;

  const months = wholeMonthsBetween(new Date(unixSeconds * 1000), new Date());
  if (months < MONTHS_PER_YEAR) return `${Math.max(months, 1)}mo ago`;
  return `${Math.floor(months / MONTHS_PER_YEAR)}y ago`;
}

/** The same instant spelled out — the form to use wherever the date is a fact being read rather
 * than a sense of freshness being taken.
 *
 * Deliberately the viewer's own locale and the medium month form: this is a date to read, not
 * to sort by. */
export function exactDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
