import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getMagnifierSettings,
  getMatureContentVisibility,
  setMagnifierSettings,
  setMatureContentVisibility,
  type MagnifierSettings,
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
      // The preference is applied server-side and is deliberately not part of these query
      // keys, so every cache filtered by it has to be invalidated by hand or it keeps serving
      // results filtered under the old preference. Both commands that apply it need listing:
      // `gbFeatured` was missed, and because it is held for thirty minutes the banner went on
      // showing mature mods long after Hide was chosen — unblurred, since blurring used to be
      // applied only under Blur. Anything added later that filters server-side belongs here.
      queryClient.invalidateQueries({ queryKey: ["gbSearch"] });
      queryClient.invalidateQueries({ queryKey: ["gbFeatured"] });
    },
  });
}

/** Read by the mod detail page on every visit, so it is worth keeping rather than refetching:
 * nothing changes it except the settings page, which invalidates it itself. */
export function useMagnifierSettings() {
  return useQuery({
    queryKey: ["magnifierSettings"],
    queryFn: getMagnifierSettings,
    staleTime: Infinity,
  });
}

export function useSetMagnifierSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: MagnifierSettings) => setMagnifierSettings(value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["magnifierSettings"] });
    },
  });
}
