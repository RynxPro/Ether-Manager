import { SLOT_LABELS, type Mod, type Slot, type UpdateCheck } from "@/lib/tauri-commands";
import { AddModDialog } from "./AddModDialog";
import { ModCard } from "./ModCard";
import { useDeleteMod, useToggleMod } from "./hooks";

interface SlotSectionProps {
  characterId: string;
  slot: Slot;
  mods: Mod[];
  updateChecksByModId: Map<number, UpdateCheck>;
}

export function SlotSection({ characterId, slot, mods, updateChecksByModId }: SlotSectionProps) {
  const toggleMod = useToggleMod(characterId);
  const deleteMod = useDeleteMod(characterId);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {SLOT_LABELS[slot]}
        </h3>
        <AddModDialog characterId={characterId} slot={slot} />
      </div>

      {mods.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          No mods installed for this slot yet.
        </p>
      ) : (
        <div className="space-y-2">
          {mods.map((mod) => (
            <ModCard
              key={mod.id}
              mod={mod}
              updateCheck={updateChecksByModId.get(mod.id)}
              isToggling={toggleMod.isPending}
              isDeleting={deleteMod.isPending}
              onToggle={(enabled) => toggleMod.mutate({ modId: mod.id, enabled })}
              onDelete={() => deleteMod.mutate(mod.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
