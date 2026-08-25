import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { checkCreatorFeed, markCreatorFeedSeen, type CreatorFeed } from "@/lib/tauri-commands";

const FEED_KEY = ["creatorFeed"] as const;

/** Long enough that alt-tabbing back from the game does not fire a GameBanana request every
 * time, short enough that a session left open all evening still notices an upload. */
const FEED_STALE_MS = 15 * 60 * 1000;

/** The bell's contents.
 *
 * The query function is the *check*, not a plain read: it asks GameBanana what followed creators
 * have posted, files anything new, and answers with the stored list either way. That folds the
 * launch check and the periodic one into react-query's ordinary machinery instead of a bespoke
 * timer — mounting fetches it, the interval keeps it current while the window sits open, and
 * refocusing after a run of the game re-checks once it has gone stale.
 *
 * A GameBanana failure does not error this query: `check_creator_feed` swallows a failed page
 * and falls through to what is already stored, so a dropped connection shows yesterday's news
 * rather than an error where a count should be. */
export function useCreatorFeed() {
  return useQuery({
    queryKey: FEED_KEY,
    queryFn: checkCreatorFeed,
    staleTime: FEED_STALE_MS,
    refetchInterval: FEED_STALE_MS,
    // Only while the window is in front. Polling GameBanana on a schedule behind the game, for
    // a badge nobody can see, would be buying traffic with nothing.
    refetchIntervalInBackground: false,
  });
}

/** Clears the badge. The rows stay; only their unread state changes.
 *
 * The command answers with the whole feed, so its result is written straight into the cache
 * rather than invalidated — invalidating would re-run `checkCreatorFeed` and put a GameBanana
 * request behind the act of opening a dropdown. */
export function useMarkCreatorFeedSeen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markCreatorFeedSeen,
    onSuccess: (feed: CreatorFeed) => {
      queryClient.setQueryData(FEED_KEY, feed);
    },
  });
}
