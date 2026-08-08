import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SLOTS, type Character, type UpdateCheck } from "@/lib/tauri-commands";
import { SlotSection } from "./SlotSection";
import { useModsForCharacter, useUpdateChecks } from "./hooks";

interface CharacterDetailProps {
  character: Character;
  onBack: () => void;
}

export function CharacterDetail({ character, onBack }: CharacterDetailProps) {
  const { data: mods, isLoading } = useModsForCharacter(character.id);
  const { data: updateChecks } = useUpdateChecks();
  const updateChecksByModId = new Map<number, UpdateCheck>(
    (updateChecks ?? []).map((check) => [check.mod_id, check]),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button type="button" variant="ghost" size="icon" onClick={onBack} aria-label="Back to library">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          {character.portrait && (
            <img
              src={character.portrait}
              alt={character.name}
              className="h-12 w-12 rounded-full object-cover"
            />
          )}
          <h2 className="text-2xl font-semibold text-foreground">{character.name}</h2>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="space-y-8">
          {SLOTS.map((slot) => (
            <SlotSection
              key={slot}
              characterId={character.id}
              slot={slot}
              mods={(mods ?? []).filter((mod) => mod.slot === slot)}
              updateChecksByModId={updateChecksByModId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
