import { TriangleAlert } from "lucide-react";
import { CARD_GRID } from "@/lib/layout";
import { SLOT_LABELS, type Mod, type Slot, type UpdateCheck } from "@/lib/tauri-commands";
import { AddModDialog } from "./AddModDialog";
import { ModCard } from "./ModCard";
import { useCheckModUpdateWithConfirmation, useDeleteMod, useToggleMod } from "./hooks";

interface SlotSectionProps {
  characterId: string;
  slot: Slot;
  mods: Mod[];
  updateChecksByModId: Map<number, UpdateCheck>;
  /** Opens an installed mod's GameBanana page. Threaded from App, which owns the detail
   * route — the same page Browse uses, so there is one mod page rather than two. */
  onOpenModDetail: (mod: Mod) => void;
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
  onOpenModDetail,
  showHeader = true,
}: SlotSectionProps) {
  const toggleMod = useToggleMod();
  const deleteMod = useDeleteMod();
  const { checkUpdate, confirmedModId, runCheck } = useCheckModUpdateWithConfirmation();
  const enabledCount = mods.filter((mod) => mod.enabled).length;

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

      {/* Stacking is allowed but rarely a good idea, so this states the risk once and gets out
          of the way — no dialog on the toggle, which would nag on every deliberate change. It
          shows only while more than one is actually on, so it reports a live condition rather
          than warning about something hypothetical. */}
      {enabledCount > 1 && (
        <p className="flex items-start gap-2 border border-primary/40 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-primary" />
          <span>
            <span className="text-foreground">{enabledCount} mods enabled at once.</span> ZZMI
            will load them all, but mods that alter the same model usually conflict — expect
            flickering, wrong textures, or a crash. Turn all but one off if the game misbehaves.
          </span>
        </p>
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
                  : // A check that fails was silent before: the icon simply stopped spinning,
                    // which is exactly what success looks like too.
                    checkUpdate.isError && checkUpdate.variables === mod.id
                    ? String(checkUpdate.error)
                    : undefined;

            return (
              <ModCard
                key={mod.id}
                mod={mod}
                updateCheck={updateChecksByModId.get(mod.id)}
                isToggling={isThisModToggling}
                isDeleting={isThisModDeleting}
                isCheckingUpdate={isThisModChecking}
                isConfirmedUpToDate={confirmedModId === mod.id}
                error={error}
                onToggle={(enabled) => toggleMod.mutate({ modId: mod.id, enabled })}
                isEditable
                onDelete={() => deleteMod.mutate(mod.id)}
                onOpenDetail={
                  mod.gamebanana_mod_id === null ? undefined : () => onOpenModDetail(mod)
                }
                onCheckUpdate={() => runCheck(mod.id)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
