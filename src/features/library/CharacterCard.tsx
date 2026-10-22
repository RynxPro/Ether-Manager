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
  /** Whether two of this character's enabled mods are claiming the same asset — read out of
   * their ini files rather than inferred from how many are on. Passed in for the same reason
   * as the preference: one scan answers for the whole roster. */
  hasConflict: boolean;
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
 * The portraits are 480×640 transparent cutouts, exactly the 3:4 of the frame, so each one fits
 * its well precisely — no crop, no letterbox, the whole character on every card. Faces come out
 * small at this size, and that was twice treated as a fault worth cropping to fix: a 2.05× zoom
 * at a fixed focal point, which cut the top off three characters and stranded a fourth, then a
 * 1.4× zoom anchored to the top, which clipped nobody but filled the grid with half-figures.
 * Seeing all three side by side settled it — a wall of whole characters is what this screen is
 * for, and a small face is a cheaper loss than a cropped one.
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
  hasConflict,
  onSelect,
}: CharacterCardProps) {
  const hasMods = counts.total > 0;
  const hasEnabled = counts.enabled > 0;
  // The same condition the character's own page warns about: ZZMI loads every enabled mod, and
  // two that touch the same model fight over it. Surfaced on the roster so the character worth
  // opening is visible without opening all sixty — otherwise the warning only exists somewhere
  // you have to already suspect.
  //
  // This used to be `counts.enabled > 1`, which marked anyone with two mods on whether or not
  // they fought, and the note here said as much: stacking mods that touch different parts of a
  // character is a real thing to do, and the mark landed on half the roster. It is now the
  // answer from the ini files, so a mark means there is something to fix.
  const hasConflictRisk = showConflictWarning && hasConflict;

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
        hasMods ? "bg-card" : "bg-card-idle"
      }`}
    >
      <span className="relative block aspect-[3/4] w-full overflow-hidden bg-art">
        {character.portrait ? (
          <img
            src={character.portrait}
            alt=""
            // The whole figure, uncropped. 480×640 against a 3:4 well means the art lands in
            // the frame exactly: nothing cut, nothing letterboxed.
            //
            // Two crops were tried and both lost to this. A 2.05× zoom at a 55%/14% focal point
            // cut the top off Von Lycaon, Wise and Belle and stranded the smaller-drawn Remielle
            // Dan in the middle of her frame. A 1.4× zoom anchored to the top fixed the clipping
            // — anchoring cannot decapitate anyone, it can only take feet — but a wall of
            // half-figures reads worse than a wall of whole ones, which is the thing this screen
            // is for. The small face is the price, and it is the right one to pay.
            className="absolute inset-0 h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.04]"
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
