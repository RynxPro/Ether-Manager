import { AlertTriangle, Check, Layers, Pencil, Play, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EMPTY_SLAB, EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { SectionLabel } from "@/components/SectionLabel";
import {
  DOCKET_ERROR,
  DOCKET_HINT,
  DOCKET_LABEL,
  DOCKET_ON_PAPER,
  DOCKET_SLAB,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDocketHeader,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAllMods } from "@/features/library/hooks";
import { modArtSrc } from "@/lib/modArt";
import type { Mod, Preset, PresetApplyReport } from "@/lib/tauri-commands";
import {
  useApplyPreset,
  useCreatePreset,
  useDeletePreset,
  usePresetModIds,
  usePresets,
  useRenamePreset,
  useSavePresetFromCurrent,
  useSetPresetMods,
} from "./hooks";

/** How many pieces of art a card's face shows. Six because the face is three across and two
 * down, and a face with holes in it reads as a loading state rather than as a small preset. */
const FACE_TILES = 6;

const PAGE_SLAB =
  "inline-flex h-[38px] shrink-0 items-center gap-1.5 px-4 font-sign text-[17px] uppercase tracking-[0.1em] shadow-slap outline-none transition-[translate,box-shadow] duration-200 hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none";

/** What applying said, once.
 *
 * On the page rather than in a toast, because the failure case names mods and asks you to do
 * something about them, and a message that takes itself away is the wrong shape for that. */
function ApplyReport({ report }: { report: PresetApplyReport }) {
  if (report.failures.length > 0) {
    return (
      <div className="relative border-2 border-destructive px-3.5 py-3">
        <span className="absolute -top-3 right-2 -rotate-[2deg] bg-destructive px-2 py-0.5 font-sign text-[13px] uppercase tracking-[0.1em] text-white shadow-slap">
          {report.failures.length} refused
        </span>
        <p className="font-mono text-[10.5px] font-bold uppercase leading-relaxed tracking-[0.05em] text-card-foreground">
          {report.enabled} on, {report.disabled} off. These would not move — the game holding a
          folder open is the usual reason:
        </p>
        <ul className="mt-2 space-y-1">
          {report.failures.map((failure) => (
            <li key={failure.mod_id} className={DOCKET_ERROR}>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="text-card-foreground">{failure.display_name}</span> —{" "}
                {failure.error}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <p
      role="status"
      className="inline-flex items-center gap-2 bg-card px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-success shadow-slap"
    >
      <Check className="h-3.5 w-3.5 shrink-0" />
      {report.enabled} switched on, {report.disabled} switched off
    </p>
  );
}

/** Six pieces of the art inside a preset, as the card's face.
 *
 * The art rather than a list of names, because the question you ask of a wall of presets is
 * which one is which, and you recognise these by what they look like. A mod with no picture
 * leaves a plain tile rather than being skipped, so the face stays a grid. */
function PresetFace({ mods }: { mods: Mod[] }) {
  const tiles = Array.from({ length: FACE_TILES }, (_, index) => mods[index] ?? null);

  return (
    <div className="grid h-[124px] grid-cols-3 gap-0.5 overflow-hidden bg-art">
      {tiles.map((mod, index) => {
        const art = mod ? modArtSrc(mod) : null;
        return (
          <span key={mod?.id ?? `empty-${index}`} className="block overflow-hidden bg-secondary">
            {art && <img src={art} alt="" loading="lazy" className="h-full w-full object-cover" />}
          </span>
        );
      })}
    </div>
  );
}

interface NameDialogProps {
  title: string;
  label: string;
  hint: string;
  initial: string;
  confirmLabel: string;
  isPending: boolean;
  onSubmit: (name: string) => void;
  onOpenChange: (open: boolean) => void;
}

/** Asking for a name, which is the one thing creating and renaming both need. */
function NameDialog({
  title,
  label,
  hint,
  initial,
  confirmLabel,
  isPending,
  onSubmit,
  onOpenChange,
}: NameDialogProps) {
  const [name, setName] = useState(initial);
  const field = useRef<HTMLInputElement>(null);
  const trimmed = name.trim();

  return (
    <Dialog open onOpenChange={(next) => !next && onOpenChange(false)}>
      <DialogContent
        showCloseButton={false}
        // Focus the field, not the close button that comes first in the markup. A dialog whose
        // only job is to take a name should be ready to take it.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          field.current?.focus();
        }}
        className="gap-0 p-0 sm:max-w-[400px]"
      >
        <DialogDocketHeader title={title} />
        <form
          className="grid min-w-0 gap-1.5 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmed) onSubmit(trimmed);
          }}
        >
          <label htmlFor="preset-name" className={DOCKET_LABEL}>
            {label}
          </label>
          <input
            id="preset-name"
            ref={field}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={isPending}
            className={`w-full px-2.5 py-2 font-sign text-[17px] uppercase tracking-[0.1em] hover:translate-y-0 ${DOCKET_ON_PAPER}`}
          />
          <p className={DOCKET_HINT}>{hint}</p>
        </form>
        <DialogFooter className="mx-0 mb-0 gap-2 px-4 py-3">
          <DialogClose className={`${DOCKET_SLAB} bg-card text-card-foreground`}>
            Cancel
          </DialogClose>
          <button
            type="button"
            disabled={!trimmed || isPending}
            onClick={() => trimmed && onSubmit(trimmed)}
            className={`${DOCKET_SLAB} bg-primary text-primary-foreground`}
          >
            {isPending ? "Saving…" : confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Choosing by hand what a preset holds — the path for a set you curate rather than wear.
 *
 * Starts from what the preset already asks for and lists the whole library, because a preset
 * is allowed to name anything in it. */
function EditDialog({
  preset,
  mods,
  onOpenChange,
}: {
  preset: Preset;
  mods: Mod[];
  onOpenChange: (open: boolean) => void;
}) {
  const members = usePresetModIds(preset.id);
  const save = useSetPresetMods();
  const [picked, setPicked] = useState<Set<number> | null>(null);

  // Seeded once the membership arrives, then owned here. Re-seeding on every render would undo
  // a tick the moment react-query refetched underneath.
  useEffect(() => {
    if (members.data && picked === null) setPicked(new Set(members.data));
  }, [members.data, picked]);

  const chosen = picked ?? new Set<number>();

  return (
    <Dialog open onOpenChange={(next) => !next && onOpenChange(false)}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[min(560px,calc(100vh-5rem))] gap-0 overflow-y-auto p-0 sm:max-w-[520px]"
      >
        <DialogDocketHeader title="Edit · preset" isLocked={save.isPending} />
        <div className="grid min-w-0 gap-3 p-4 [&>*]:min-w-0">
          <p className="truncate font-heading text-[20px] uppercase leading-none tracking-[0.02em] text-card-foreground">
            {preset.name}
          </p>
          <p className={DOCKET_HINT}>Applying this turns these on and everything else off.</p>

          <div className="max-h-[300px] min-w-0 overflow-y-auto bg-background shadow-slap">
            {mods.map((mod) => {
              const isChosen = chosen.has(mod.id);
              return (
                <button
                  key={mod.id}
                  type="button"
                  role="checkbox"
                  aria-checked={isChosen}
                  disabled={save.isPending}
                  onClick={() =>
                    setPicked((current) => {
                      const next = new Set(current ?? []);
                      if (next.has(mod.id)) next.delete(mod.id);
                      else next.add(mod.id);
                      return next;
                    })
                  }
                  className="flex w-full items-center gap-2.5 border-b border-border p-2 text-left outline-none last:border-b-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                >
                  <span
                    className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center border-2 transition-colors duration-200 ${
                      isChosen
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card"
                    }`}
                  >
                    {isChosen && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-sign text-[16px] uppercase tracking-[0.06em] text-foreground">
                    {mod.display_name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <DialogFooter className="mx-0 mb-0 gap-2 px-4 py-3">
          <DialogClose
            disabled={save.isPending}
            className={`${DOCKET_SLAB} bg-card text-card-foreground`}
          >
            Cancel
          </DialogClose>
          <button
            type="button"
            disabled={save.isPending || picked === null}
            onClick={() =>
              save.mutate(
                { presetId: preset.id, modIds: [...chosen] },
                { onSuccess: () => onOpenChange(false) },
              )
            }
            className={`${DOCKET_SLAB} bg-primary text-primary-foreground`}
          >
            {save.isPending ? "Saving…" : `Save ${chosen.size}`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Loadouts: a named set of mods the library can be switched to in one press. */
export function PresetsPage() {
  const presets = usePresets();
  const allMods = useAllMods();
  const saveCurrent = useSavePresetFromCurrent();
  const createEmpty = useCreatePreset();
  const rename = useRenamePreset();
  const remove = useDeletePreset();
  const apply = useApplyPreset();
  const setMods = useSetPresetMods();

  const [isNaming, setIsNaming] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [renaming, setRenaming] = useState<Preset | null>(null);
  const [editing, setEditing] = useState<Preset | null>(null);
  const [deleting, setDeleting] = useState<Preset | null>(null);
  /** Which preset the last report belongs to, so it sits under the card you pressed. */
  const [reportFor, setReportFor] = useState<number | null>(null);

  const mods = allMods.data ?? [];
  const items = presets.data ?? [];
  const enabledCount = mods.filter((mod) => mod.enabled).length;
  const byId = new Map(mods.map((mod) => [mod.id, mod]));
  const enabledIds = new Set(mods.filter((mod) => mod.enabled).map((mod) => mod.id));

  /** What pressing Apply would change, worked out here rather than asked of the backend.
   *
   * This is why there is no confirmation dialog in front of Apply. Applying a two-mod preset
   * can switch off thirty others, and finding that out afterwards would be a nasty surprise —
   * but a dialog in front of the one button this whole feature exists for is a worse answer.
   * Saying it on the card before the press costs no click at all.
   *
   * It also answers the question the page opens with: a preset that would change nothing is
   * the one you are already wearing. */
  function pending(preset: Preset) {
    const wanted = new Set(preset.mod_ids);
    const on = preset.mod_ids.filter((id) => !enabledIds.has(id)).length;
    const off = [...enabledIds].filter((id) => !wanted.has(id)).length;
    return { on, off, isCurrent: on === 0 && off === 0 };
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Presets"
        subtitle="Loadouts you can switch to"
        tag="Loadouts"
        pinned={false}
      >
        {/* An empty one to curate, for a themed set you never wear all at once. The accent
            stays on saving the current state, which is the fast path. */}
        <button
          type="button"
          disabled={createEmpty.isPending}
          onClick={() => setIsCreating(true)}
          className={`${PAGE_SLAB} bg-card text-card-foreground`}
        >
          <Plus className="h-3.5 w-3.5" />
          New preset
        </button>
        <button
          type="button"
          disabled={saveCurrent.isPending || mods.length === 0}
          onClick={() => setIsNaming(true)}
          className={`${PAGE_SLAB} bg-primary text-primary-foreground`}
        >
          <Layers className="h-3.5 w-3.5" />
          Save what is on
        </button>
      </PageHeader>

      {items.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No presets yet"
          say="Set your mods the way you like them, then save that as a preset you can come back to."
          action={
            <button
              type="button"
              disabled={mods.length === 0}
              onClick={() => setIsNaming(true)}
              className={`${EMPTY_SLAB} bg-primary text-primary-foreground`}
            >
              Save what is on
            </button>
          }
        />
      ) : (
        <>
          <SectionLabel
            left="Your presets"
            right={`${items.length} saved · ${enabledCount} on now`}
          />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
            {items.map((preset) => (
              <div key={preset.id} className="space-y-2">
                <div className="relative border-2 border-border bg-card p-2 shadow-slap-lift">
                  {pending(preset).isCurrent && preset.mod_count > 0 && (
                    <span className="absolute -right-1.5 -top-2.5 z-10 rotate-[2.5deg] bg-success px-2 py-0.5 font-sign text-[13px] uppercase tracking-[0.1em] text-card shadow-slap">
                      On now
                    </span>
                  )}
                  {/* Its own mods, not the first six in the library. `list_presets` carries
                      the membership so this costs no extra query. */}
                  <PresetFace
                    mods={preset.mod_ids
                      .map((id) => byId.get(id))
                      .filter((mod): mod is Mod => mod !== undefined)
                      .slice(0, FACE_TILES)}
                  />
                  <p className="mt-2.5 truncate font-heading text-[21px] uppercase leading-none tracking-[0.01em] text-card-foreground">
                    {preset.name}
                  </p>
                  <p className="mt-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    {preset.mod_count} {preset.mod_count === 1 ? "mod" : "mods"}
                    {!pending(preset).isCurrent && (
                      <span className="text-card-foreground">
                        {" · "}
                        {pending(preset).on} on, {pending(preset).off} off
                      </span>
                    )}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={apply.isPending}
                      onClick={() => {
                        setReportFor(preset.id);
                        apply.mutate(preset.id);
                      }}
                      className={`${PAGE_SLAB} bg-primary text-primary-foreground`}
                    >
                      <Play className="h-3.5 w-3.5" />
                      {apply.isPending && reportFor === preset.id ? "Applying…" : "Apply"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(preset)}
                      className={`${PAGE_SLAB} bg-background text-foreground`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    {/* The commonest follow-up: you tweaked the loadout and want this preset
                        to mean the new one. Doing it through the editor would be re-ticking by
                        hand what the library already knows. */}
                    <button
                      type="button"
                      disabled={setMods.isPending}
                      onClick={() =>
                        setMods.mutate({ presetId: preset.id, modIds: [...enabledIds] })
                      }
                      className={`${PAGE_SLAB} bg-background text-foreground`}
                    >
                      Use current
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenaming(preset)}
                      className={`${PAGE_SLAB} bg-background text-foreground`}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(preset)}
                      className={`${PAGE_SLAB} bg-background text-foreground hover:text-destructive`}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {reportFor === preset.id && apply.data && <ApplyReport report={apply.data} />}
                {reportFor === preset.id && apply.isError && (
                  <p className={DOCKET_ERROR}>
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {String(apply.error)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {isNaming && (
        <NameDialog
          title="Save · preset"
          label="Call it"
          hint={`Saves the ${enabledCount} ${enabledCount === 1 ? "mod" : "mods"} that are on right now.`}
          initial=""
          confirmLabel="Save"
          isPending={saveCurrent.isPending}
          onSubmit={(name) => saveCurrent.mutate(name, { onSuccess: () => setIsNaming(false) })}
          onOpenChange={() => setIsNaming(false)}
        />
      )}

      {isCreating && (
        <NameDialog
          title="New · preset"
          label="Call it"
          hint="Starts empty. Pick what goes in it next."
          initial=""
          confirmLabel="Create"
          isPending={createEmpty.isPending}
          onSubmit={(name) =>
            createEmpty.mutate(name, {
              onSuccess: (list) => {
                setIsCreating(false);
                // Newest first, so the one just made is at the top. Opened straight into the
                // editor, because an empty preset is not finished being created.
                if (list[0]) setEditing(list[0]);
              },
            })
          }
          onOpenChange={() => setIsCreating(false)}
        />
      )}

      {renaming && (
        <NameDialog
          title="Rename · preset"
          label="Call it"
          hint="Only the name changes. What it holds stays as it is."
          initial={renaming.name}
          confirmLabel="Rename"
          isPending={rename.isPending}
          onSubmit={(name) =>
            rename.mutate({ presetId: renaming.id, name }, { onSuccess: () => setRenaming(null) })
          }
          onOpenChange={() => setRenaming(null)}
        />
      )}

      {editing && (
        <EditDialog preset={editing} mods={mods} onOpenChange={() => setEditing(null)} />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete · preset"
          description={
            <>
              <span className="text-foreground">{deleting.name}</span> goes. The mods in it are
              not touched — a preset is only a list of what to switch on.
            </>
          }
          confirmLabel="Delete"
          isDestructive
          consequence="Only the list"
          isPending={remove.isPending}
          onConfirm={() => remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
          onOpenChange={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
