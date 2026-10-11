import { AlertTriangle } from "lucide-react";
import type { CSSProperties } from "react";
import { tiltFor } from "@/lib/tilt";
import type { Character, ModCounts } from "@/lib/tauri-commands";

interface CharacterCardProps {
  character: Character;
  counts: ModCounts;
  /** Display name of the mod currently enabled for this character, or null when none is.
   * This is the only per-character value that actually varies once a library is built out,
   * which is why it gets the card's second line. */
  enabledModName: string | null;
  /** True when any mod filed under this character has an update waiting — including one that
   * is currently disabled, since enabling it later would still bring the stale version. */
  hasUpdate: boolean;
  /** Whether to mark a character with more than one mod on. Passed in rather than read here:
   * this renders sixty times, and the preference is one answer for the whole roster. */
  showConflictWarning: boolean;
  onSelect: () => void;
}

/** A character as a slap: a die-cut sticker of printed board with the art on it, stuck to the
 * wall slightly off true and casting a hard offset shadow.
 *
 * Shows the enabled mod's name rather than "is anything on?", because in a real library almost
 * every character has something enabled — so the yes/no answer is identical on nearly every card
 * and tells you nothing. The counts stay, right-aligned beside the name so it can use the full
 * width while the numbers still form a scannable column.
 *
 * Two deliberate departures from the card this replaces:
 *
 * The portraits are 480×640 transparent cutouts, exactly the 3:4 of the frame, so they fit the
 * well with no crop and no letterbox — and at that size every face was about twelve pixels, which
 * is why sixty characters read as one texture. The art is zoomed to fix that, but anchored to the
 * top rather than aimed at a focal point: a 2.05× crop at 55%/14% assumed the whole roster places
 * its heads alike, and on the live art it cut the top off Von Lycaon, Wise and Belle while
 * stranding the smaller-composed Remielle Dan in the middle of her frame. Anchoring cannot
 * decapitate anyone; it can only take feet.
 *
 * And characters with nothing installed are no longer greyed out. Desaturating the empty majority
 * made the grid look switched off rather than idle — the art is the reason this screen exists.
 * "Not in play" is carried by the recessed surface and the absent accent ring, both of which read
 * at a glance without spending the artwork to say it. */
export function CharacterCard({
  character,
  counts,
  enabledModName,
  hasUpdate,
  showConflictWarning,
  onSelect,
}: CharacterCardProps) {
  const hasMods = counts.total > 0;
  const hasEnabled = counts.enabled > 0;
  // The same condition the character's own page warns about: ZZMI loads every enabled mod, and
  // two that touch the same model fight over it. Surfaced on the roster so the character worth
  // opening is visible without opening all sixty — otherwise the warning only exists somewhere
  // you have to already suspect. Suppressible, because stacking mods that touch different parts
  // of a character is a real thing to do on purpose, and then this marks half the roster.
  const hasConflictRisk = showConflictWarning && counts.enabled > 1;

  let secondLine: string;
  if (!hasMods) {
    secondLine = "No mods";
  } else if (enabledModName) {
    secondLine = enabledModName;
  } else {
    secondLine = "Nothing enabled";
  }

  // The accent ring marks the card under the cursor, not the ones that are switched on.
  //
  // It was state at first, which repeated the mistake the second line already avoids: in a library
  // anyone actually uses, nearly every character has something enabled — so a ring on "enabled"
  // lands on nearly every card, and a mark that is almost everywhere marks nothing. It also spent
  // the app's one loud colour on the resting state of a sixty-card grid.
  //
  // Enabled stays perfectly legible without it: the mod's name below is *stamped* in the accent
  // rather than merely coloured by it, which reads across a full grid without ringing the artwork.
  const style = {
    "--tilt": `${tiltFor(character.id)}deg`,
  } as CSSProperties;

  return (
    <button
      type="button"
      onClick={onSelect}
      style={style}
      // Hover straightens the card and lifts it — the gesture of peeling a sticker off a wall
      // rather than a generic UI highlight. `rotate` and `translate` are separate properties in
      // Tailwind v4, so the two compose instead of overwriting one another.
      // The border is what gives the card an edge, and it is also the consistency fix: `ModCard`,
      // `BookmarkCard` and `GameBananaModCard` all carry `border-2 border-border`, and this was
      // the one card in the app without it.
      //
      // It earns its place rather than just matching. The portraits are transparent cutouts, so
      // the art well is most of what a card shows — and in Daylight that well sat within a step
      // or two of the wall behind it, which made a card read as a hole punched in the wall rather
      // than an object placed on it. A drawn edge settles that at any wall value, which is the
      // point: the fix belongs on the card, not in the theme's brightness.
      className={`group relative flex w-full rotate-[var(--tilt)] flex-col border-2 border-border p-[5px] pb-0 text-left shadow-slap-lift outline-none transition-[rotate,translate,box-shadow] duration-200 hover:-translate-y-0.5 hover:rotate-0 hover:border-primary hover:ring-2 hover:ring-primary focus-visible:ring-2 focus-visible:ring-primary ${
        hasMods ? "bg-card" : "bg-muted"
      }`}
    >
      <span className="relative block aspect-[3/4] w-full overflow-hidden bg-art">
        {character.portrait ? (
          <img
            src={character.portrait}
            alt=""
            // 1.4× anchored to the top of the frame, which is the whole trick: a head can
            // never be clipped however the character is composed, because the crop can only
            // eat downward. The worst case is losing feet, which nobody looks for.
            //
            // This replaced a 2.05× crop anchored at 55%/14% — a focal point that assumed every
            // portrait puts its head in the same place. Measured on the live roster it does not:
            // that setting cut the top off Von Lycaon, Wise and Belle, while Remielle Dan, drawn
            // smaller inside her canvas, came out a speck adrift in the middle. Anchoring beats
            // aiming, because it fails safe instead of failing on whichever art disagrees.
            className="absolute inset-0 h-full w-full origin-top scale-[1.4] object-contain transition-transform duration-300 group-hover:scale-[1.46]"
          />
        ) : (
          // 7 of the 60 characters ship without a portrait — a permanent state, not a load
          // failure, so this initial is the designed representation rather than a placeholder.
          <span className="absolute inset-0 flex items-center justify-center font-heading text-5xl text-card-foreground/15">
            {character.name.charAt(0)}
          </span>
        )}

        {hasUpdate && (
          <span className="absolute right-0 top-0 bg-primary px-1.5 py-px font-sign text-[15px] uppercase tracking-wider text-primary-foreground">
            Update
          </span>
        )}
      </span>

      <span className="relative block px-0.5 pb-1.5 pt-1">
        <span className="flex items-center justify-between gap-1.5">
          <span className="min-w-0 flex-1 truncate font-heading text-[18px] uppercase leading-none text-card-foreground">
            {character.name}
          </span>
          {/* At the end of the name line and so directly above the counts — the mark and the
              number it is about form one right-hand column. A mark rather than a sentence: the
              card has no room for one, and the page it leads to explains the conflict properly. */}
          {hasConflictRisk && (
            <span
              title={`${counts.enabled} mods enabled at once — they may conflict`}
              className="shrink-0 text-primary"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
            </span>
          )}
        </span>
        <span className="mt-1 flex items-baseline justify-between gap-1.5">
          {/* Not stamped in the accent, and for the same reason the ring is not: in a library
              anyone actually uses most characters have something enabled, so an accent fill here
              lands on most of the grid. Eight of twelve cards carried a solid red block — loud on
              a dark card, overwhelming on a light one, and meaningless either way once it is
              everywhere.

              The name alone is the signal. This line shows the enabled mod's name, or says nothing
              is enabled — so reading it *as a name* already tells you the state, and the idle
              cases stay dimmed. No colour has to carry it. */}
          <span
            className={`min-w-0 truncate font-mono text-[11px] font-bold uppercase tracking-wide ${
              hasEnabled ? "text-card-foreground/80" : "text-card-foreground/40"
            }`}
          >
            {secondLine}
          </span>
          {hasMods && (
            <span className="shrink-0 font-mono text-[11px] font-bold tabular-nums text-card-foreground/40">
              {counts.total}·{counts.enabled}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
