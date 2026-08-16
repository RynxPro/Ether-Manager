import type { MatureVisibility } from "@/lib/tauri-commands";

/** Whether a mature preview should be covered, given the user's preference.
 *
 * Only `Show` uncovers. That is deliberately not the same as "blur when the setting is Blur":
 * under `Hide` these records are supposed to have been dropped server-side and never reach a
 * component at all, so one arriving anyway means something upstream failed — a stale cache, a
 * new code path that forgot to filter, an endpoint that stopped sending the flag. Rendering it
 * in the clear at that moment makes the strictest setting the most revealing one, which is
 * exactly backwards. Blurring is the safe answer to a state that should be impossible.
 *
 * `undefined` covers too: the preference is still loading, or its query errored. Neither is a
 * reason to assume `Show` when the default everywhere else in this app is `Blur`. */
export function shouldBlur(visibility: MatureVisibility | undefined, isMature: boolean): boolean {
  return isMature && visibility !== "Show";
}
