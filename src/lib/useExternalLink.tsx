import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ConfirmDialog } from "@/components/ConfirmDialog";

/** Where a link came from, which is the whole reason this asks before opening anything.
 *
 * `app` is a URL this app built itself and knows the shape of — a GameBanana profile or mod
 * page. `author` is a string somebody typed into a form on GameBanana: a mod's requirement
 * link, for instance. They look identical once rendered as a button, and only one of them has
 * been anywhere near a check. */
export type LinkSource = "app" | "author";

/** GameBanana's numeric id for Zenless Zone Zero. Mirrors `gamebanana::ZZZ_GAME_ID`; the two
 * are the same fact and would be a bug apart, but a constant in each half is cheaper than a
 * command that exists only to hand over a number that has never changed. */
export const ZZZ_GAME_ID = 19567;

/** The mod id, if `url` is a GameBanana mod page. `null` for everything else.
 *
 * Exact host equality, and that is the entire security question here. The tempting version —
 * `url.includes("gamebanana.com")` — also matches `gamebanana.com.example.invalid` and
 * `notgamebanana.com`, and the string being tested was typed by a mod author. A substring check
 * would turn "GameBanana links open in the app" into "any address an author likes opens in the
 * app", which is the one outcome worth ruling out by construction.
 *
 * The id is matched as digits only, since it goes on to be a number handed to this app's own
 * `get_gamebanana_mod_detail`. Anything else — a tool page, a forum thread, a member profile —
 * is not a mod page and is left to the browser. */
export function gameBananaModId(url: string): number | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    if (parsed.host !== "gamebanana.com" && parsed.host !== "www.gamebanana.com") return null;

    const match = /^\/mods\/(\d+)$/.exec(parsed.pathname);
    if (!match) return null;

    const id = Number(match[1]);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

/** Schemes worth handing to the operating system.
 *
 * An allow-list, not a block-list. `openUrl` passes the string to the shell, so a scheme nobody
 * vetted is a scheme the shell decides what to do with — and mod authors can type anything into
 * a requirements field. Everything outside this list is refused rather than shown to the user as
 * a question they have no way to answer. */
const OPENABLE_SCHEMES = ["http:", "https:"];

/** The host, for showing someone where they are actually about to go.
 *
 * Returns `null` for anything unparseable or on a scheme not worth opening — callers treat that
 * as "not a link", which is safer than rendering a button that leads somewhere nobody could
 * describe. */
export function linkHost(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!OPENABLE_SCHEMES.includes(parsed.protocol)) return null;
    return parsed.host || null;
  } catch {
    return null;
  }
}

/** Asks before sending anyone out to a browser.
 *
 * Leaving the app is the one thing it does that it cannot take back, and until now it happened
 * on a single click with no indication of the destination. Every external link goes through
 * here, so there is one place deciding what is openable and one wording for the question.
 *
 * The dialog names the host in full rather than saying "an external site". The point is not to
 * add a speed bump — a confirmation that says nothing new is just a second click, and teaches
 * people to hit Enter through it — it is to show *where*, which is the fact a button label
 * cannot carry.
 *
 * Returns the trigger and the dialog. The caller renders `dialog` somewhere in its tree; it is
 * `null` while nothing is pending, so it costs nothing at rest. */
export function useExternalLink() {
  const [pending, setPending] = useState<{ url: string; source: LinkSource } | null>(null);

  /** Opens `url` after confirmation. Refuses outright — no dialog, no shell call — for anything
   * that is not plain http(s), since there is no version of that question worth asking. */
  function requestOpen(url: string, source: LinkSource = "app") {
    if (linkHost(url) === null) return;
    setPending({ url, source });
  }

  const dialog = pending ? (
    <ConfirmDialog
      title="Leave for your browser?"
      confirmLabel="Open"
      // Red rather than the accent yellow. Yellow is the colour of the thing you came here to
      // do — install, enable, follow — and wearing it here would make leaving the app look like
      // one more of those. This is the only dialog in the app whose outcome the app cannot see,
      // undo, or take any responsibility for.
      isDestructive
      onConfirm={() => {
        void openUrl(pending.url);
        setPending(null);
      }}
      onOpenChange={() => setPending(null)}
      description={
        <span className="block space-y-2">
          <span className="block">This opens in your web browser, outside Ether Manager.</span>
          {/* Host first and emphasised, full URL underneath: the host is the part that answers
              "where am I going", and the rest of a GameBanana URL is noise. `break-all` because
              a long path with no spaces would otherwise push the dialog wider than the window. */}
          <span className="block border border-border bg-background px-2.5 py-2">
            <span className="block font-heading text-sm tracking-[0.04em] text-foreground">
              {linkHost(pending.url)}
            </span>
            <span className="mt-0.5 block break-all text-[11px] text-muted-foreground">
              {pending.url}
            </span>
          </span>
          {/* Said only when true. A note attached to every link would read as boilerplate by the
              second time, and the app's own GameBanana links genuinely are different: it built
              those itself. */}
          {pending.source === "author" && (
            <span className="block text-[11px] text-muted-foreground">
              A mod author typed this address on their mod page. Ether Manager has not checked
              where it leads.
            </span>
          )}
        </span>
      }
    />
  ) : null;

  return { requestOpen, dialog };
}
