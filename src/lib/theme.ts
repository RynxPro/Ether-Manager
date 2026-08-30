import type { Theme } from "./tauri-commands";

/** Where the boot script in `index.html` and this module meet.
 *
 * The preference lives in SQLite like every other setting, but the database is only reachable
 * over async IPC — and a theme you only learn after a round trip is a theme the window has
 * already painted wrong. So the stored value is mirrored here, where it can be read
 * synchronously before React mounts.
 *
 * The mirror is a cache, never the truth: clearing it costs one frame of the wrong theme at the
 * next launch, not the setting. */
export const THEME_CACHE_KEY = "ether-manager.theme";

/** The class both themes key off — `:root` is Daylight, `.dark` is Night. Also drives every
 * `dark:` utility, through `@custom-variant dark` in `styles/global.css`. */
const NIGHT_CLASS = "dark";

function systemPrefersNight(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** The look a preference actually resolves to right now. Only `"System"` depends on the
 * environment; the other two are already answers. */
export function resolveTheme(theme: Theme): "Daylight" | "Night" {
  if (theme !== "System") return theme;
  return systemPrefersNight() ? "Night" : "Daylight";
}

/** Paints the preference and refreshes the mirror.
 *
 * Safe to call repeatedly with the same value — `classList.toggle` with an explicit second
 * argument is idempotent, so this can be driven straight from a react-query result without
 * guarding against re-renders. */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle(NIGHT_CLASS, resolveTheme(theme) === "Night");
  try {
    localStorage.setItem(THEME_CACHE_KEY, theme);
  } catch {
    // Storage can be unavailable or full. Swallowed deliberately: the preference is safe in the
    // database, and the only thing lost is the head start at the next launch.
  }
}

/** The mirrored preference, or `"System"` when nothing readable is there yet.
 *
 * Validates rather than trusting the string: `localStorage` is writable by anything running in
 * this webview, and an unrecognised value would otherwise reach `resolveTheme` and paint neither
 * theme. Falling back to the same default the database uses keeps the two ends agreeing. */
export function readCachedTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_CACHE_KEY);
    if (stored === "Daylight" || stored === "Night" || stored === "System") {
      return stored;
    }
  } catch {
    // As above — an unreadable cache is a miss, not an error.
  }
  return "System";
}

/** Calls back whenever Windows switches its app theme, and returns an unsubscribe.
 *
 * Only matters while the preference is `"System"`, but the subscription is unconditional: the
 * caller already re-runs when the preference changes, and a listener that exists but does
 * nothing is cheaper to reason about than one torn down and rebuilt on every change. */
export function subscribeToSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
