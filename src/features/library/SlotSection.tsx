import { PackagePlus, TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { useConflictWarnings } from "@/features/settings/hooks";
import { CARD_GRID } from "@/lib/layout";
import { type Mod, type UpdateCheck } from "@/lib/tauri-commands";
import { ModCard } from "./ModCard";
import { useCheckModUpdateWithConfirmation, useDeleteMod, useToggleMod } from "./hooks";

interface SlotSectionProps {
  mods: Mod[];
  updateChecksByModId: Map<number, UpdateCheck>;
  /** Opens an installed mod's GameBanana page. Threaded from App, which owns the detail
   * route — the same page Browse uses, so there is one mod page rather than two. */
  onOpenModDetail: (mod: Mod) => void;
  /** What turning a mod on and off is called here. Forwarded untouched to every card; the
   * character page says "Wear this" because a character wears one look at a time, and the
   * Library's UI and Misc tabs leave it alone because a HUD skin is not worn. */
  verbs?: { enable: string; disable: string };
  /** Forwarded to every card. True only where exactly one mod can sensibly be on — a character
   * wears one look — so the accent ring stays rare enough to mean something. */
  emphasiseEnabled?: boolean;
  /** What to call this slot when it holds nothing. "No mods for Belle yet" rather than "no
   * mods installed for this slot", which is the app describing its own data model. */
  emptyTitle?: string;
  /** The way out, built by whoever knows how to navigate — a character page can offer Browse
   * and Import, the Library tabs only Import. */
  emptyAction?: React.ReactNode;
}

/** The cards for one slot's mods.
 *
 * No heading and no Import button of its own, deliberately. It used to carry both, from when UI
 * and Misc sat side by side under one page title and needed telling apart. They are tabs now —
 * the tab is the heading, and Library's page header already has the only Import button the page
 * needs. A character page never showed either. */
export function SlotSection({
  mods,
  updateChecksByModId,
  onOpenModDetail,
  verbs,
  emphasiseEnabled,
  emptyTitle,
  emptyAction,
}: SlotSectionProps) {
  const toggleMod = useToggleMod();
  const deleteMod = useDeleteMod();
  const { checkUpdate, confirmedModId, runCheck } = useCheckModUpdateWithConfirmation();
  // Undefined while the preference is still being read, and that counts as on — a notice that
  // appeared a moment after the page did would be worse than one that was simply there.
  const { data: showConflictWarning } = useConflictWarnings();
  const enabledCount = mods.filter((mod) => mod.enabled).length;

  return (
    <section className="space-y-3">
      {/* Stacking is allowed but rarely a good idea, so this states the risk once and gets out
          of the way — no dialog on the toggle, which would nag on every deliberate change. It
          shows only while more than one is actually on, so it reports a live condition rather
          than warning about something hypothetical. */}
      {showConflictWarning !== false && enabledCount > 1 && (
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
        // The section size of the same object the empty pages use. This was a dashed line
        // stretched the full width of the window holding one short sentence — the only place
        // in the app wearing that shape, and the shape an empty page is told not to wear.
        <EmptyState
          density="section"
          icon={PackagePlus}
          title={emptyTitle ?? "Nothing here yet"}
          say="Install one from Browse, or drop an archive anywhere on this window."
          action={emptyAction}
        />
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
                verbs={verbs}
                emphasiseEnabled={emphasiseEnabled}
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
