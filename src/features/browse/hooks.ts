import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addBookmark,
  getGamebananaModDetail,
  installFromGamebanana,
  listBookmarks,
  removeBookmark,
  searchGamebananaMods,
  type InstallFromGamebananaInput,
  type ModSort,
} from "@/lib/tauri-commands";

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
