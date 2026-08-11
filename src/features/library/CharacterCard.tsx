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
      className={`group relative flex aspect-[3/4] w-full flex-col justify-end overflow-hidden rounded-xl border border-border text-left transition-all hover:border-primary/60 hover:shadow-lg ${
        hasMods ? "" : "opacity-60 grayscale hover:opacity-90 hover:grayscale-0"
      }`}
    >
      {character.portrait ? (
        <img
          src={character.portrait}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        // 7 of the 60 characters ship without a portrait — a permanent state, not a load
        // failure, so this initial is the designed representation rather than a placeholder.
        <div className="absolute inset-0 flex items-center justify-center bg-muted text-2xl font-semibold text-muted-foreground">
          {character.name.charAt(0)}
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />

      {hasUpdate && (
        <span className="absolute right-2 top-2 z-10 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
          Update
        </span>
      )}

      <div className="relative z-10 space-y-0.5 p-3">
        <p className="truncate text-sm font-semibold text-white drop-shadow">{character.name}</p>
        <div className="flex items-baseline justify-between gap-2">
          <p
            className={`min-w-0 flex-1 truncate text-xs ${
              hasEnabled ? "text-white/70" : "italic text-white/50"
            }`}
          >
            {secondLine}
          </p>
          {hasMods && (
            <p className="shrink-0 text-xs tabular-nums text-white/50">
              {counts.total}·{counts.enabled}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
