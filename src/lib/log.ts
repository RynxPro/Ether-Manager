import { error as logError, info as logInfo } from "@tauri-apps/plugin-log";
import { appLogDir } from "@tauri-apps/api/path";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

/** Sends a line to the app's log file, which is written by Rust.
 *
 * The frontend has to be in that file rather than only in a devtools console, because a shipped
 * build has no console anyone can open. Both faults reported in the first week of release were
 * on this side of the app — a stale cache and a request that gave up — and neither left a trace
 * anywhere a user could send on.
 *
 * Failure to log is swallowed on purpose. Logging is the thing that watches for trouble; it must
 * never become trouble of its own, and an app that fell over because it could not write a log
 * line would be the worst possible trade. */
export function logLine(message: string): void {
  void logInfo(message).catch(() => {});
}

function report(label: string, detail: unknown): void {
  const text = detail instanceof Error ? `${detail.message}\n${detail.stack ?? ""}` : String(detail);
  void logError(`${label}: ${text}`).catch(() => {});
}

/** What a query or mutation failing writes down.
 *
 * The key matters more than the message. "gbModDetail,599967 failed" says which screen was open
 * and which mod it was on; the message alone ("fetch failed") would be true of half the app. */
export function reportQueryFailure(kind: "query" | "mutation", key: unknown, cause: unknown): void {
  report(`${kind} ${JSON.stringify(key)} failed`, cause);
}

/** Catches what nothing else does: an exception that escaped a render or a handler, and a promise
 * nobody awaited. These are the faults that leave a blank panel and no error state, so they are
 * exactly the ones a user cannot describe and a maintainer cannot reproduce. */
export function installErrorLogging(): void {
  window.addEventListener("error", (event) => {
    report("uncaught error", event.error ?? event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    report("unhandled rejection", event.reason);
  });
}

/** Opens the folder holding the log and selects the file, for "send me your log".
 *
 * Revealing beats opening: the file is plain text that Windows may hand to anything or nothing,
 * and what is wanted is the file itself, ready to drag into a message. */
export async function revealLogFolder(): Promise<void> {
  const dir = await appLogDir();
  await revealItemInDir(dir);
}
