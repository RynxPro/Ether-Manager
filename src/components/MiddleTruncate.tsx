import { cn } from "@/lib/utils";

interface MiddleTruncateProps {
  text: string;
  /** How many characters to protect at the end. */
  tailLength?: number;
  className?: string;
}

/** Twelve characters holds the kind of tail that distinguishes one mod from another here:
 * " - Main file", " Exposed Dress", " Nsfw". */
const DEFAULT_TAIL = 12;

/** How far the split may drift backwards to land between words. Past this the tail starts
 * crowding out the head, and the head is what names the mod at all. */
const MAX_TAIL = 18;

/** Below this there is nothing to gain — the name either fits or is short enough that cutting a
 * hole in the middle of it costs more than it saves. */
const MIN_LENGTH_TO_SPLIT = 20;

/** Moves a split off the middle of a word.
 *
 * Cutting at a fixed offset produces "… NSOR REMOVER", which is legible but reads as damage
 * rather than as an abbreviation. Preference is to back up to the space before, since that
 * keeps the whole last phrase; if that would make the tail too greedy, go forward to the next
 * space instead and settle for a shorter one. */
function splitAtWord(text: string, preferred: number): number {
  const back = text.lastIndexOf(" ", preferred);
  if (back > 0 && text.length - back <= MAX_TAIL) return back;

  const forward = text.indexOf(" ", preferred);
  if (forward > 0 && forward < text.length - 1) return forward + 1;

  return preferred;
}

/** Ellipsis in the middle rather than at the end, so the last words survive.
 *
 * Ordinary truncation assumes the front of a string identifies it. Mod names run the other way:
 * they share a long prefix and differ at the tail — "ZZMI RabbitFX - Glow FX + Censor Remover"
 * and the same name plus " - Main file" both clipped to "ZZMI RABBITFX - GLOW FX + CENS…", which
 * is two rows in a library that cannot be told apart. Anything naming a variant does this, and
 * so does anything the user renames by hand, so it is fixed here rather than by policing names.
 *
 * No JavaScript measuring: the head is an ordinary truncating box that shrinks to whatever is
 * left, and the tail simply refuses to shrink. A name that fits shows whole, with no ellipsis,
 * because `truncate` only bites when it has to. */
export function MiddleTruncate({
  text,
  tailLength = DEFAULT_TAIL,
  className,
}: MiddleTruncateProps) {
  if (text.length < MIN_LENGTH_TO_SPLIT) {
    return (
      <span className={cn("block truncate", className)} title={text}>
        {text}
      </span>
    );
  }

  const cut = splitAtWord(text, text.length - tailLength);
  const head = text.slice(0, cut);
  const tail = text.slice(cut);

  return (
    <span className={cn("flex min-w-0", className)} title={text}>
      <span className="truncate">{head}</span>
      {/* `whitespace-pre` so a tail that begins with a space keeps it — without it "…Remover"
          and " - Main file" would collide into "…Remover- Main file". */}
      <span className="flex-none whitespace-pre">{tail}</span>
    </span>
  );
}
