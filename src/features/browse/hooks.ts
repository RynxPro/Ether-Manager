import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addBookmark,
  backfillBookmarkCharacters,
  enqueueDownload,
  type EnqueueDownloadInput,
  getCreatorMods,
  getCreatorProfile,
  getFeaturedMods,
  getGamebananaModDetail,
  listBookmarks,
  type ModSort,
  removeBookmark,
  searchGamebananaMods,
} from "@/lib/tauri-commands";

/** The banner's six ranking windows. Costs two GameBanana requests, and the answer only moves
 * once a day at the fastest, so it is held far longer than a search page — otherwise flipping
 * between Browse and a mod refetches the same six mods every time. */
export function useFeaturedMods() {
  return useQuery({
    queryKey: ["gbFeatured"],
    queryFn: getFeaturedMods,
    staleTime: 30 * 60 * 1000,
  });
}

export function useSearchGamebananaMods(
  query: string | null,
  categoryId: number | null,
  sort: ModSort,
  page: number,
) {
  return useQuery({
    queryKey: ["gbSearch", query, categoryId, sort, page],
    queryFn: () => searchGamebananaMods(query, categoryId, sort, page),
  });
}

/** Browse's own feed: page after page appended into one list rather than replaced.
 *
 * `is_complete` is GameBanana's only end-of-results signal — there is no page total — so it is
 * what stops the feed. Returning `undefined` from `getNextPageParam` is how react-query is told
 * there is nothing further, which is also what flips `hasNextPage` off.
 *
 * The cache holds every page fetched under one key, so opening a mod and coming back re-renders
 * everything already loaded instead of dropping the reader at the top of page one. */
export function useInfiniteGamebananaMods(
  query: string | null,
  categoryId: number | null,
  sort: ModSort,
) {
  return useInfiniteQuery({
    queryKey: ["gbSearchInfinite", query, categoryId, sort],
    queryFn: ({ pageParam }) => searchGamebananaMods(query, categoryId, sort, pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.is_complete ? undefined : allPages.length + 1,
  });
}

/** One creator’s public profile.
 *
 * Cached by member id and left to react-query’s defaults: a profile changes on the scale of
 * weeks, and the page is reached repeatedly while following one creator’s mods around. */
export function useCreatorProfile(memberId: number | null) {
  return useQuery({
    queryKey: ["gbCreatorProfile", memberId],
    queryFn: () => getCreatorProfile(memberId as number),
    enabled: memberId !== null,
  });
}

/** One creator’s ZZZ mods, paged the same way the browse feed is — `is_complete` is
 * GameBanana’s only end-of-results signal, so it is what stops the list. */
export function useInfiniteCreatorMods(memberId: number | null) {
  return useInfiniteQuery({
    queryKey: ["gbCreatorMods", memberId],
    queryFn: ({ pageParam }) => getCreatorMods(memberId as number, pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.is_complete ? undefined : allPages.length + 1,
    enabled: memberId !== null,
  });
}

export function useGamebananaModDetail(modId: number | null) {
  return useQuery({
    queryKey: ["gbModDetail", modId],
    queryFn: () => getGamebananaModDetail(modId as number),
    enabled: modId !== null,
  });
}

export function useBookmarks() {
  return useQuery({
    queryKey: ["bookmarks"],
    queryFn: listBookmarks,
  });
}

/** Fills in the character for bookmarks saved before it was recorded. Invalidates the list so
 * the page regroups itself once they land, and stays quiet when it placed nothing — a refetch
 * that changes nothing is churn. */
export function useBackfillBookmarkCharacters() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: backfillBookmarkCharacters,
    onSuccess: (placed) => {
      if (placed > 0) queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
    },
  });
}

export function useAddBookmark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      gamebananaModId,
      name,
      thumbnailUrl,
      categoryName,
    }: {
      gamebananaModId: number;
      name: string;
      thumbnailUrl: string | null;
      categoryName: string | null;
    }) => addBookmark(gamebananaModId, name, thumbnailUrl, categoryName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
    },
  });
}

export function useRemoveBookmark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (gamebananaModId: number) => removeBookmark(gamebananaModId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
    },
  });
}

/** Hands an install to the download queue.
 *
 * Resolving means "recorded and started", not "installed" — so the caller can close immediately
 * and the work carries on. Nothing is invalidated here: the queue emits `downloads-changed` when
 * it actually finishes, and `useDownloads` refreshes the library off that. Invalidating now
 * would just refetch a library that has not changed yet. */
export function useEnqueueDownload() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: EnqueueDownloadInput) => enqueueDownload(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["downloads"] });
    },
  });
}
