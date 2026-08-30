import { AlertTriangle } from "lucide-react";
import type { CSSProperties } from "react";
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

/** How far off true a slap can sit, in degrees either way. Small on purpose: sixty cards at
 * the ±1.7° the mockups used is charming for one screen and tiring in a grid you scroll every
 * day. The tilt is seasoning, not the dish — the paper surface and the hard shadow carry the
 * look, and this could go to zero without the style collapsing. */
const MAX_TILT_DEG = 1.4;
const TILT_STEPS = 15;

/** A stable tilt for a given character.
 *
 * Derived from the id rather than the grid index for two reasons: a card keeps its own angle
 * when the roster is filtered or reordered, so nothing swivels as you type in a search box; and
 * the component never needs to know where it sits, which keeps `CharacterGrid` from passing a
 * position it otherwise has no reason to care about.
 *
 * Deterministic, so it survives a remount — `Math.random()` here would make every card twitch
 * on each render. */
function tiltFor(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const step = Math.abs(hash) % TILT_STEPS;
  const half = (TILT_STEPS - 1) / 2;
  // Rounded because this lands in a CSS custom property that shows up in devtools: the raw
  // division produces values like `-0.19999999999999998deg`, which is correct, renders
  // identically, and looks like a bug to anyone who inspects a card.
  return Math.round(((step - half) / half) * MAX_TILT_DEG * 100) / 100;
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
 * The portraits are 480×640 transparent cutouts, which is exactly the 3:4 of the frame — so
 * `object-cover` and `object-contain` did the identical thing and no crop happened at all. Every
 * card rendered a whole standing figure about 150px wide, putting each face at roughly twelve
 * pixels, which is why sixty different characters read as one texture. The scale below crops into
 * the art so each card shows a face: one blind rule for the whole roster, since the official art
 * places heads within a few percent of each other.
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
      className={`group relative flex w-full rotate-[var(--tilt)] flex-col p-[5px] pb-0 text-left shadow-slap-lift outline-none transition-[rotate,translate,box-shadow] duration-200 hover:-translate-y-0.5 hover:rotate-0 hover:ring-[3px] hover:ring-primary focus-visible:ring-[3px] focus-visible:ring-primary ${
        hasMods ? "bg-card" : "bg-muted"
      }`}
    >
      <span className="relative block aspect-[3/4] w-full overflow-hidden bg-art">
        {character.portrait ? (
          <img
            src={character.portrait}
            alt=""
            // 2.05× anchored just above and right of centre lands on the head for essentially the
            // whole roster; the official art is composed consistently enough that a single focal
            // point beats per-character tuning, which would be sixty hand-checked numbers and two
            // new fields on `Character` for a gain you have to hunt for.
            className="absolute inset-0 h-full w-full origin-[55%_14%] scale-[2.05] object-cover transition-transform duration-300 group-hover:scale-[2.14]"
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
