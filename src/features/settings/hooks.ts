import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getMatureContentVisibility,
  setMatureContentVisibility,
  type MatureVisibility,
} from "@/lib/tauri-commands";

export function useMatureContentVisibility() {
  return useQuery({
    queryKey: ["matureContentVisibility"],
    queryFn: getMatureContentVisibility,
  });
}

export function useSetMatureContentVisibility() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: MatureVisibility) => setMatureContentVisibility(value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matureContentVisibility"] });
      // The preference is applied server-side (search_gamebanana_mods), and is deliberately
      // not part of the ["gbSearch"] query key, so cached Browse pages must be invalidated
      // explicitly or they'd keep showing results filtered under the old preference.
      queryClient.invalidateQueries({ queryKey: ["gbSearch"] });
    },
  });
}
