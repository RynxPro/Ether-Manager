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
  onSelect: () => void;
}

/** Shows the enabled mod's name rather than "is anything on?", because in a real library almost
 * every character has something enabled — so the yes/no answer is identical on nearly every card
 * and tells you nothing. The counts stay, right-aligned beside the look so the name can use the
 * full width and the numbers still form a scannable column. */
export function CharacterCard({
  character,
  counts,
  enabledModName,
  hasUpdate,
  onSelect,
}: CharacterCardProps) {
  const hasMods = counts.total > 0;
  const hasEnabled = counts.enabled > 0;

  let secondLine: string;
  if (!hasMods) {
    secondLine = "No mods";
  } else if (enabledModName) {
    secondLine = enabledModName;
  } else {
    secondLine = "Nothing enabled";
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      // The cut corner is Eridu's signature and cannot come from a border-radius, so it is a
      // clip-path rather than a utility class. Yellow marks the hovered card and anything with
      // an update — nothing else, which is what keeps it findable.
      style={{
        clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%)",
      }}
      className={`group relative flex w-full flex-col overflow-hidden border-2 bg-card text-left transition-all hover:-translate-y-0.5 hover:border-primary ${
        hasUpdate ? "border-primary" : "border-border"
      }`}
    >
      <span className="relative block aspect-[3/4] w-full overflow-hidden">
        {character.portrait ? (
          <img
            src={character.portrait}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-top"
          />
        ) : (
          // 7 of the 60 characters ship without a portrait — a permanent state, not a load
          // failure, so this initial is the designed representation rather than a placeholder.
          // It sits on the secondary surface, not the muted one, so a character that owns mods
          // still reads as present rather than blending into the dimmed empty cards.
          <span className="absolute inset-0 flex items-center justify-center bg-secondary font-heading text-3xl font-semibold text-muted-foreground/50">
            {character.name.charAt(0)}
          </span>
        )}

        {/* No scanlines or foot gradient, and no dimming for characters without mods. Both were
            costing more than they bought: sixty pieces of character art are the whole point of
            this grid, and a texture over them plus 40% opacity on nearly every card left it
            looking washed out. "No mods" is already stated in words on the card. */}

        {hasUpdate && (
          <span className="absolute right-1.5 top-1.5 bg-primary px-1.5 py-px font-heading text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
            Update
          </span>
        )}
      </span>

      <span
        className={`relative block border-t-2 bg-background px-2.5 pb-3 pt-1.5 ${
          hasUpdate ? "border-t-primary" : "border-t-border"
        } group-hover:border-t-primary`}
      >
        <span className="block truncate font-heading text-sm font-semibold uppercase tracking-wide text-foreground">
          {character.name}
        </span>
        <span className="flex items-baseline justify-between gap-2">
          <span
            className={`min-w-0 flex-1 truncate text-[11px] ${
              hasEnabled ? "text-muted-foreground" : "italic text-muted-foreground/60"
            }`}
          >
            {secondLine}
          </span>
          {hasMods && (
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/60">
              {counts.total}·{counts.enabled}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
