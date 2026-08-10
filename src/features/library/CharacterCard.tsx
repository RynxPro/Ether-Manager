import type { Character, ModCounts } from "@/lib/tauri-commands";

interface CharacterCardProps {
  character: Character;
  counts: ModCounts;
  onSelect: () => void;
}

/** Deliberately shows counts, not the enabled mod's name: at 60 cards, variable-length
 * GameBanana titles would wreck the grid's scannability, and you click into the character to
 * change anything anyway. The count answers the only glanceable question — is this character
 * running something right now? */
export function CharacterCard({ character, counts, onSelect }: CharacterCardProps) {
  const hasMods = counts.total > 0;

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

      <div className="relative z-10 space-y-0.5 p-3">
        <p className="truncate text-sm font-semibold text-white drop-shadow">{character.name}</p>
        {hasMods ? (
          <p className="text-xs text-white/70">
            {counts.total} {counts.total === 1 ? "mod" : "mods"}
            {" · "}
            {counts.enabled > 0 ? (
              <span className="font-medium text-white">{counts.enabled} on</span>
            ) : (
              <span>none on</span>
            )}
          </p>
        ) : (
          <p className="text-xs text-white/60">No mods</p>
        )}
      </div>
    </button>
  );
}
