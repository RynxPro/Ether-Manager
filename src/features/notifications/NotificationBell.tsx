import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MatureContentShield } from "@/components/MatureContentShield";
import { useMatureContentVisibility } from "@/features/settings/hooks";
import { shouldBlur } from "@/lib/mature";
import { updatedLabel } from "@/lib/time";
import type { CreatorFeedItem } from "@/lib/tauri-commands";
import { useCreatorFeed, useMarkCreatorFeedSeen } from "./hooks";

interface NotificationBellProps {
  /** Opens the mod the row names. Owned by App, which owns the detail route — a bell row goes
   * to the same mod page as everything else rather than to a second one of its own. */
  onOpenMod: (item: CreatorFeedItem) => void;
}

/** The bell in the sidebar's status row: how many mods the creators you follow have posted
 * since you last looked, and what they are.
 *
 * It lives in the sidebar because the sidebar is this app's chrome — there is no top bar, and
 * the Downloads count already sets the precedent that ambient numbers belong on this rail. Down
 * with the other readouts rather than beside the wordmark, which cannot spare the width: a 32px
 * control there left the title 135px of the 161px it needs and split it across two lines.
 *
 * The panel opens across the main content rather than down the 224px sidebar, since a mod name
 * and a thumbnail need more width than the rail has, and it grows *upward* from the button —
 * anchored at the bottom of the window, a panel hung downwards would fall out of the view.
 *
 * Opening it marks everything read, which is what opening a bell means. The rows that *were*
 * unread stay marked while the panel is open, from a snapshot taken on the way in — clearing
 * the highlight the instant you look at it would answer "what's new" by erasing the answer. */
export function NotificationBell({ onOpenMod }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  /** Which rows were unread when the panel was opened. Frozen on purpose; see above. */
  const [wasUnread, setWasUnread] = useState<Set<number>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const { data: feed } = useCreatorFeed();
  const { data: visibility } = useMatureContentVisibility();
  const markSeen = useMarkCreatorFeedSeen();

  const items = feed?.items ?? [];
  const unseen = feed?.unseen ?? 0;

  function open() {
    setWasUnread(
      new Set(items.filter((item) => item.seen_at === null).map((item) => item.gamebanana_mod_id)),
    );
    setIsOpen(true);
    if (unseen > 0) markSeen.mutate();
  }

  // Dismissing has to work the two ways a dropdown is ever dismissed. `mousedown` rather than
  // `click`, so a press that starts outside closes it without also activating whatever was
  // underneath on the way past.
  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      // Focus goes back to what opened it, or it lands on `document.body` and the next Tab
      // starts again from the top of the app.
      buttonRef.current?.focus();
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={
          unseen > 0
            ? `What's new — ${unseen} unread from creators you follow`
            : "What's new from creators you follow"
        }
        onClick={() => (isOpen ? setIsOpen(false) : open())}
        className={`relative flex h-6 w-6 items-center justify-center transition-colors ${
          unseen > 0 ? "text-primary" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Bell className="h-3.5 w-3.5" />
        {/* The same chip as the Downloads badge, and only while there is something to report —
            a number that is always there stops being a signal. Capped so a fortnight away
            cannot widen the sidebar. */}
        {unseen > 0 && (
          <span className="absolute -right-1 -top-0.5 min-w-[15px] bg-primary px-1 py-px text-center font-heading text-[10px] leading-tight tabular-nums text-primary-foreground">
            {unseen > 99 ? "99+" : unseen}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="What's new"
          className="absolute bottom-0 left-full z-50 ml-3 flex max-h-[70vh] w-[360px] flex-col border-2 border-border bg-popover shadow-xl"
        >
          <p className="shrink-0 border-b border-border px-3 py-2 font-heading text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            What&apos;s new
          </p>

          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Nothing new from the creators you follow. Follow someone from their page and their
              next upload turns up here.
            </p>
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {items.map((item) => (
                <li key={item.gamebanana_mod_id}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onOpenMod(item);
                    }}
                    className={`flex w-full items-center gap-3 border-l-2 px-3 py-2 text-left transition-colors hover:bg-accent ${
                      wasUnread.has(item.gamebanana_mod_id)
                        ? "border-l-primary"
                        : "border-l-transparent"
                    }`}
                  >
                    <MatureContentShield
                      isBlurred={shouldBlur(visibility, item.is_mature)}
                      className="h-[42px] w-[56px] shrink-0 overflow-hidden bg-muted"
                    >
                      {item.thumbnail_url ? (
                        <img
                          src={item.thumbnail_url}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[9px] uppercase text-muted-foreground">
                          No art
                        </span>
                      )}
                    </MatureContentShield>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-foreground">
                        {item.mod_name}
                      </span>
                      {/* The creator is the reason this row exists, so it is named here rather
                          than left to the mod page — "who posted it" is the notification. */}
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {item.creator_name} · {updatedLabel(item.date_added)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
