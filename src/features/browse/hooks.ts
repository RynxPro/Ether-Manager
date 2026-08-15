import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addBookmark,
  getFeaturedMods,
  getGamebananaModDetail,
  installFromGamebanana,
  listBookmarks,
  removeBookmark,
  searchGamebananaMods,
  type InstallFromGamebananaInput,
  type ModSort,
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

export function useAddBookmark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      gamebananaModId,
      name,
      thumbnailUrl,
    }: {
      gamebananaModId: number;
      name: string;
      thumbnailUrl: string | null;
    }) => addBookmark(gamebananaModId, name, thumbnailUrl),
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

export function useInstallFromGamebanana(characterId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: InstallFromGamebananaInput) => installFromGamebanana(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mods", characterId] });
      queryClient.invalidateQueries({ queryKey: ["modCounts"] });
    },
  });
}
