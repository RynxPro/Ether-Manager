import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  getConflictWarnings,
  getMagnifierSettings,
  getMatureContentVisibility,
  getTheme,
  setConflictWarnings,
  setMagnifierSettings,
  setMatureContentVisibility,
  setTheme,
  type MagnifierSettings,
  type MatureVisibility,
  type Theme,
} from "@/lib/tauri-commands";
import { applyTheme, readCachedTheme, subscribeToSystemTheme } from "@/lib/theme";

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

/** The stored theme preference. Held indefinitely: nothing changes it but the settings page,
 * which invalidates it itself, and it is read on every render of the app shell. */
export function useTheme() {
  return useQuery({
    queryKey: ["theme"],
    queryFn: getTheme,
    staleTime: Infinity,
  });
}

export function useSetTheme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: Theme) => setTheme(value),
    // Painted on the way in rather than on success. This is a preference about how the app
    // looks, so the one thing it must do is look different the instant you choose it — waiting
    // for a database round trip to repaint makes the control feel broken even when it worked.
    onMutate: (value: Theme) => {
      applyTheme(value);
    },
    // Covers both outcomes. On success this is a no-op refetch of what we already painted; on
    // failure it pulls back the value that is really stored, and `useThemeSync` repaints from
    // it — so a write that did not land cannot leave the window showing a theme nothing agrees
    // was chosen.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["theme"] });
    },
  });
}

/** Keeps the window painted in whatever is currently preferred. Call once, high in the tree.
 *
 * Falls back to the `localStorage` mirror while the first read is in flight, so the theme the
 * boot script already painted is the one that stays up rather than flickering through a default
 * on the way to the stored answer.
 *
 * The system listener is what makes `"System"` mean "follow Windows" continuously rather than
 * only at launch — switching the desktop at sunset moves the app with it. */
export function useThemeSync(): void {
  const { data } = useTheme();
  const theme = data ?? readCachedTheme();

  useEffect(() => {
    applyTheme(theme);
    return subscribeToSystemTheme(() => applyTheme(theme));
  }, [theme]);
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
