import { Bell } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { MatureContentShield } from "@/components/MatureContentShield";
import { useMatureContentVisibility } from "@/features/settings/hooks";
import { shouldBlur } from "@/lib/mature";
import { updatedLabel } from "@/lib/time";
import type { CreatorFeedItem } from "@/lib/tauri-commands";
import { useCreatorFeed, useMarkCreatorFeedSeen } from "./hooks";

/** How far off true each slip sits. A short repeating pair rather than anything random: three
 * rows want to look hand-placed, not scattered, and half a nav sign's tilt because the panel is
 * only 336px wide — the same angle that reads as casual across a card grid reads as broken in a
 * narrow column. */
const ROW_TILT = ["-0.8deg", "0.6deg", "-0.5deg"];

interface NotificationBellProps {
  /** Opens the mod the row names. Owned by App, which owns the detail route — a bell row goes
   * to the same mod page as everything else rather than to a second one of its own. */
  onOpenMod: (item: CreatorFeedItem) => void;
}

/** The bell in the title bar's status row: how many mods the creators you follow have posted
 * since you last looked, and what they are.
 *
 * It sits with the other ambient readouts rather than in the page, because what it reports is a
 * fact about the app rather than about wherever you have navigated to. It spent a while at the
 * foot of the sidebar for the same reason, and moved up with them.
 *
 * The panel hangs down and to the left. That direction is not cosmetic: anchored to the top-right
 * of the window, a panel growing up and to the right — which is what it did in the sidebar — goes
 * straight off the screen. Anchoring right also means it cannot overflow the window edge however
 * wide it gets.
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
        className={`relative flex h-7 w-7 items-center justify-center transition-colors ${
          unseen > 0 ? "text-primary" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Bell className="h-[18px] w-[18px]" />
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
          // Hangs down and to the left of the bell, because the bell is in the title bar now.
          //
          // It was `bottom-0 left-full`, which grows *up and to the right* — correct while this
          // lived at the bottom-left of the sidebar, and completely wrong once it moved: from the
          // top-right of the window the panel flew off the screen entirely. Anchoring right means
          // it cannot run past the window edge however wide it gets.
          className="absolute right-0 top-full z-50 mt-2 flex max-h-[70vh] w-[380px] flex-col border-2 border-border bg-card p-2.5 shadow-slap-lift"
        >
          <div className="flex shrink-0 items-baseline gap-2 px-0.5 pb-2.5">
            <h2 className="font-heading text-[19px] uppercase leading-none text-foreground">
              What&apos;s new
            </h2>
            {/* The count belongs up here rather than on each row: it answers "is this worth
                opening" from the bell, and repeating it per row would say the same thing three
                times. Accent because unread is a state, and state is what the accent marks. */}
            {wasUnread.size > 0 && (
              <span className="ml-auto font-mono text-[11px] font-bold text-primary">
                {wasUnread.size} NEW
              </span>
            )}
          </div>

          {items.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              Nothing new from the creators you follow. Follow someone from their page and their
              next upload turns up here.
            </p>
          ) : (
            // `-mx-0.5 px-0.5` so a slip's hard shadow and its hover lift are not clipped by the
            // scroll container an instant before you see them.
            <ul className="-mx-0.5 min-h-0 flex-1 space-y-2 overflow-y-auto px-0.5 pb-0.5">
              {items.map((item, index) => (
                <li key={item.gamebanana_mod_id}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onOpenMod(item);
                    }}
                    style={{ "--tilt": ROW_TILT[index % ROW_TILT.length] } as CSSProperties}
                    // Each row is its own slip on the panel's ground — the same object as a nav
                    // sign or a character card, so the panel stops being the one surface in the
                    // app that could belong to any other program. Hover straightens and lifts it,
                    // which is the gesture every other pressable thing here uses.
                    className="flex w-full rotate-[var(--tilt)] items-center gap-3 bg-background p-1.5 text-left shadow-slap outline-none transition-[rotate,translate] duration-200 hover:-translate-y-px hover:rotate-0 focus-visible:ring-2 focus-visible:ring-primary"
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
                        <span className="flex h-full w-full items-center justify-center font-mono text-[9px] uppercase text-muted-foreground">
                          No art
                        </span>
                      )}
                    </MatureContentShield>

                    <span className="min-w-0 flex-1 pr-1">
                      <span className="block truncate font-sign text-[16px] leading-tight tracking-[0.04em] text-foreground">
                        {item.mod_name}
                      </span>
                      {/* The creator is the reason this row exists, so it is named here rather
                          than left to the mod page — "who posted it" is the notification. */}
                      <span className="mt-0.5 flex items-center gap-1.5 truncate font-mono text-[10px] font-bold uppercase text-muted-foreground">
                        {/* Stamped rather than an edge marker. A 2px rule down the left of a row
                            is invisible sitting beside a thumbnail — this has to survive being
                            next to artwork. */}
                        {wasUnread.has(item.gamebanana_mod_id) && (
                          <span className="shrink-0 bg-primary px-1 text-primary-foreground">
                            New
                          </span>
                        )}
                        <span className="truncate">
                          {item.creator_name} / {updatedLabel(item.date_added)}
                        </span>
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
