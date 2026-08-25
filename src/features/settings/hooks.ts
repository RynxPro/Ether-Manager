import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getConflictWarnings,
  getMagnifierSettings,
  getMatureContentVisibility,
  setConflictWarnings,
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

/** Whether to flag characters with more than one mod enabled.
 *
 * Read by every card on a sixty-card roster as well as by each character page, so it is held
 * indefinitely rather than refetched — react-query dedupes the key, and nothing changes it
 * except the settings page, which invalidates it itself. Same arrangement as the magnifier.
 *
 * Undefined while the first read is in flight. Callers treat that as *on*, so the notice never
 * flickers away and back on a page that is still loading. */
export function useConflictWarnings() {
  return useQuery({
    queryKey: ["conflictWarnings"],
    queryFn: getConflictWarnings,
    staleTime: Infinity,
  });
}

export function useSetConflictWarnings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: boolean) => setConflictWarnings(value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conflictWarnings"] });
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
