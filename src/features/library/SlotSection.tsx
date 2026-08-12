import { SLOT_LABELS, type Mod, type Slot, type UpdateCheck } from "@/lib/tauri-commands";
import { AddModDialog } from "./AddModDialog";
import { ModCard } from "./ModCard";
import { useCheckModUpdate, useDeleteMod, useToggleMod } from "./hooks";

interface SlotSectionProps {
  characterId: string;
  slot: Slot;
  mods: Mod[];
  updateChecksByModId: Map<number, UpdateCheck>;
}

export function SlotSection({ characterId, slot, mods, updateChecksByModId }: SlotSectionProps) {
  const toggleMod = useToggleMod();
  const deleteMod = useDeleteMod();
  const checkUpdate = useCheckModUpdate();

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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {mods.map((mod) => {
            // toggleMod/deleteMod are shared across every card in this section — a single
            // useMutation's pending/error/variables state reflects only the most recent call,
            // so match it against this card's own mod id before treating it as "this card's".
            const isThisModToggling = toggleMod.isPending && toggleMod.variables?.modId === mod.id;
            const isThisModDeleting = deleteMod.isPending && deleteMod.variables === mod.id;
            const isThisModChecking = checkUpdate.isPending && checkUpdate.variables === mod.id;
            const error =
              toggleMod.isError && toggleMod.variables?.modId === mod.id
                ? String(toggleMod.error)
                : deleteMod.isError && deleteMod.variables === mod.id
                  ? String(deleteMod.error)
                  : undefined;

            return (
              <ModCard
                key={mod.id}
                mod={mod}
                updateCheck={updateChecksByModId.get(mod.id)}
                isToggling={isThisModToggling}
                isDeleting={isThisModDeleting}
                isCheckingUpdate={isThisModChecking}
                error={error}
                onToggle={(enabled) => toggleMod.mutate({ modId: mod.id, enabled })}
                onDelete={() => deleteMod.mutate(mod.id)}
                onCheckUpdate={() => checkUpdate.mutate(mod.id)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
