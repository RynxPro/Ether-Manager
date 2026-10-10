import { Bell, BellOff } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { useEffect, useRef, useState } from "react";
import { MatureContentShield } from "@/components/MatureContentShield";
import { PaperTilt } from "@/components/PaperTilt";
import { useMatureContentVisibility } from "@/features/settings/hooks";
import { shouldBlur } from "@/lib/mature";
import { updatedLabel } from "@/lib/time";
import type { CreatorFeedItem } from "@/lib/tauri-commands";
import {
  useClearCreatorFeed,
  useCreatorFeed,
  useMarkCreatorFeedSeen,
} from "./hooks";

/** How far off true each slip sits. A short repeating pair rather than anything random: three
 * rows want to look hand-placed, not scattered, and half a nav sign's tilt because the panel is
 * only 336px wide — the same angle that reads as casual across a card grid reads as broken in a
 * narrow column. */
const ROW_TILT = [-0.8, 0.6, -0.5];

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
  const clearFeed = useClearCreatorFeed();

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
          <div className="flex shrink-0 items-center gap-2.5 px-0.5 pb-2.5">
            <h2 className="font-heading text-[20px] uppercase leading-none text-foreground">
              What&apos;s new
            </h2>
            {/* The count belongs up here rather than on each row: it answers "is this worth
                opening" from the bell, and repeating it per row would say the same thing three
                times. Accent because unread is a state, and state is what the accent marks. */}
            {wasUnread.size > 0 && (
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
                {wasUnread.size} new
              </span>
            )}
            {/* In the head, because that is where you look once you have read the list — and
                because a verb at the foot of a scrolling column is a verb you have to go and
                find. Paper on the panel, which is card, so it inverts to the wall colour.

                Clearing is not the same as the marking-read that opening does: read means you
                looked, cleared means you are done with these and do not want them listed
                again. */}
            {items.length > 0 && (
              <button
                type="button"
                onClick={() => clearFeed.mutate()}
                disabled={clearFeed.isPending}
                className="ml-auto inline-flex h-7 shrink-0 items-center bg-background px-3 font-sign text-[15px] uppercase tracking-[0.1em] text-foreground shadow-slap outline-none transition-[translate,box-shadow] duration-200 hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
              >
                {clearFeed.isPending ? "Clearing…" : "Clear"}
              </button>
            )}
          </div>
          <div className="mb-2.5 h-0.5 shrink-0 bg-border" />

          {items.length === 0 ? (
            <EmptyState
              density="section"
              icon={BellOff}
              title="Nothing new"
              say="Follow someone from their page and their next upload turns up here."
            />
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

                    // Each row is its own slip on the panel's ground — the same object as a nav
                    // sign or a character card, so the panel stops being the one surface in the
                    // app that could belong to any other program. Hover straightens and lifts it,
                    // which is the gesture every other pressable thing here uses.
                    //
                    // The tilt is on the paper underneath rather than on the row itself — see
                    // `PaperTilt`, which this was the first instance of and which now carries
                    // the reasoning. Borderless, because a slip on a panel is stock and a
                    // shadow and nothing else.
                    className="group relative isolate flex w-full items-center gap-3 p-1.5 text-left outline-none transition-[translate] duration-200 hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <PaperTilt
                      tilt={ROW_TILT[index % ROW_TILT.length]}
                      className="bg-background shadow-slap"
                      coversParentBorder={false}
                      straightensOnHover
                    />
                    {/* 76 across, not 56. The feed sends the 220px rendering now, and at the
                        old size it was a nine-and-a-half-times reduction in a single step,
                        which aliases the same way the bookmark cards did. Bordered, because at
                        this size it is a print rather than a swatch. */}
                    <span className="relative shrink-0">
                      {/* Stamped on the artwork rather than inline in the byline. A chip
                          wedged between the creator name and the date pushed both into
                          truncation on the only two rows that needed reading. */}
                      {wasUnread.has(item.gamebanana_mod_id) && (
                        <span className="absolute -left-1.5 -top-2 z-10 -rotate-3 bg-primary px-1.5 font-sign text-[12px] uppercase tracking-[0.1em] text-primary-foreground shadow-slap">
                          New
                        </span>
                      )}
                      <MatureContentShield
                        isBlurred={shouldBlur(visibility, item.is_mature)}
                        className="h-[57px] w-[76px] overflow-hidden border-2 border-border bg-art"
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
                          <span className="flex h-full w-full items-center justify-center font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60">
                            No art
                          </span>
                        )}
                      </MatureContentShield>
                    </span>

                    <span className="min-w-0 flex-1 pr-1">
                      {/* Two lines rather than one truncated. These are mod names, which run
                          long and carry their variant in brackets at the end — one line cut
                          most of them mid-word, which is the half that says which one it is. */}
                      <span className="line-clamp-2 block font-sign text-[19px] leading-[1.05] tracking-[0.03em] text-foreground">
                        {item.mod_name}
                      </span>
                      {/* The creator is the reason this row exists, so it is named here rather
                          than left to the mod page — "who posted it" is the notification. The
                          sign face, because it is a name; the date stays in the machine face
                          and goes right, so there is one column of dates to scan rather than
                          four dates at four different offsets. */}
                      <span className="mt-1 flex items-baseline gap-2">
                        <span className="min-w-0 truncate font-sign text-[15px] uppercase tracking-[0.08em] text-card-foreground">
                          {item.creator_name}
                        </span>
                        <span className="ml-auto shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                          {updatedLabel(item.date_added)}
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
