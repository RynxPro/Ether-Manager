import { useEffect, useRef } from "react";

/** Focuses the page's search field on Ctrl+F (and Cmd+F), and clears it on Escape.
 *
 * Search deliberately lives inside each page rather than in one global bar — Library filters
 * mods you own, Browse queries GameBanana, and a single field pretending to be both would hide
 * two very different behaviors behind one control. This hotkey gives back the only thing a
 * fixed bar was better at: never having to look for where the box is. Ctrl+F is what a desktop
 * user already presses to find something, and WebView2 has no native find bar to conflict with.
 *
 * Attach the returned ref to the page's input; pages without one simply don't call this. */
export function useSearchHotkey(onEscape?: () => void) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key === "f") {
        event.preventDefault();
        ref.current?.focus();
        ref.current?.select();
        return;
      }
      if (event.key === "Escape" && document.activeElement === ref.current) {
        onEscape?.();
        ref.current?.blur();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onEscape]);

  return ref;
}
