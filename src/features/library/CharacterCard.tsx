import { Badge } from "@/components/ui/badge";
import type { Character } from "@/lib/tauri-commands";

interface CharacterCardProps {
  character: Character;
  modCount: number;
  onSelect: () => void;
}

export function CharacterCard({ character, modCount, onSelect }: CharacterCardProps) {
  const hasMods = modCount > 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative flex aspect-[3/4] flex-col justify-end overflow-hidden rounded-xl border border-border text-left transition-all hover:border-primary/60 hover:shadow-lg ${
        hasMods ? "" : "opacity-60 grayscale hover:opacity-90 hover:grayscale-0"
      }`}
    >
      {character.portrait ? (
        <img
          src={character.portrait}
          alt={character.name}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-muted text-2xl font-semibold text-muted-foreground">
          {character.name.charAt(0)}
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />

      <div className="relative z-10 space-y-1 p-3">
        <p className="truncate text-sm font-semibold text-white drop-shadow">{character.name}</p>
        {hasMods ? (
          <Badge variant="secondary" className="text-xs">
            {modCount} {modCount === 1 ? "mod" : "mods"}
          </Badge>
        ) : (
          <p className="text-xs text-white/60">No mods installed</p>
        )}
      </div>
    </button>
  );
}
