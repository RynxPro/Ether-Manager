import { CARD_GRID } from "@/lib/layout";
import { SLOT_LABELS, type Mod, type Slot, type UpdateCheck } from "@/lib/tauri-commands";
import { AddModDialog } from "./AddModDialog";
import { ModCard } from "./ModCard";
import { useCheckModUpdate, useDeleteMod, useToggleMod } from "./hooks";

interface SlotSectionProps {
  characterId: string;
  slot: Slot;
  mods: Mod[];
  updateChecksByModId: Map<number, UpdateCheck>;
  /** The UI and Misc tabs need the slot named and their own Add mod button, because they sit
   * side by side under one page title. A character page has exactly one slot, so naming it
   * labels nothing — its banner carries the name and the button instead. */
  showHeader?: boolean;
}

export function SlotSection({
  characterId,
  slot,
  mods,
  updateChecksByModId,
  showHeader = true,
}: SlotSectionProps) {
  const toggleMod = useToggleMod();
  const deleteMod = useDeleteMod();
  const checkUpdate = useCheckModUpdate();

  return (
    <section className="space-y-3">
      {showHeader && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {SLOT_LABELS[slot]}
          </h3>
          <AddModDialog characterId={characterId} slot={slot} />
        </div>
      )}

      {mods.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          No mods installed for this slot yet.
        </p>
      ) : (
        <div className={CARD_GRID}>
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
