import { Check, Image as ImageIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BegunImport, ImportCandidate, ImportSelection } from "@/lib/tauri-commands";
import { CharacterPicker } from "./CharacterPicker";
import {
  useCancelImport,
  useCommitImport,
  useImportPreview,
  usePickModThumbnail,
  useSetModThumbnail,
} from "./hooks";

/** The deepest folder that contains every one of `paths`, as a `/`-separated relative path.
 *
 * `["robot", "human"]` share nothing above them, so the answer is `""` — the tree's own root,
 * which is exactly what an archive with no wrapper folder already reports. `["Aria/robot",
 * "Aria/human"]` answers `"Aria"`. Compared segment by segment rather than by string prefix, or
 * `"Aria"` and `"Arial"` would look like they shared a folder. */
function commonAncestor(paths: string[]): string {
  if (paths.length === 0) return "";
  const split = paths.map((p) => p.split("/").filter(Boolean));
  const shared: string[] = [];
  for (let i = 0; i < split[0].length; i++) {
    const segment = split[0][i];
    if (!split.every((parts) => parts[i] === segment)) break;
    shared.push(segment);
  }
  // Never the whole of a path: if one folder contains the others, the mod is still the folder
  // above them, not one of the parts.
  if (split.some((parts) => parts.length === shared.length)) shared.pop();
  return shared.join("/");
}

/** A title from the name of the file or folder that was dragged in.
 *
 * Only ever a starting point — the field is editable — so this stays deliberately dumb:
 * separators become spaces and an archive extension is dropped. The backend's own
 * `prettify_folder_name` is cleverer, but it is not reachable from here and a wrong-looking
 * default someone retypes is a smaller cost than a second implementation of it drifting. */
function prettifySourceLabel(label: string): string {
  return (
    label
      .replace(/\.(zip|rar|7z)$/i, "")
      .replace(/[_\-.]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || label
  );
}

interface ImportModSheetProps {
  begun: BegunImport;
  /** The character whose page this import was started from, or null when it was started from
   * somewhere with no character to it — the Library roster, All mods, a drop onto either. */
  seededCharacterId?: string | null;
  onOpenChange: (open: boolean) => void;
}

/** What was found inside something you brought in from outside the app, and what to do with it.
 *
 * The archive is already unpacked by the time this opens, but only into a staging directory —
 * nothing is in the library until Install, and Cancel throws the whole thing away. That is what
 * makes it safe to show a pack's variants and let you take two: the alternative is installing
 * all five and making you delete three.
 *
 * Every way of dismissing this — Cancel, the close button, Escape, clicking outside — has to end
 * the session, or the unpacked tree sits in the temp folder until the OS sweeps it. They all run
 * through `handleClose` for that reason. */
export function ImportModSheet({
  begun,
  seededCharacterId = null,
  onOpenChange,
}: ImportModSheetProps) {
  const { suggested_character_id } = begun.plan;

  /** Whether the folders found inside are parts of one mod rather than alternatives.
   *
   * Off by default, because most multi-folder downloads really are packs of alternatives and
   * that is the reading the scan already assumes. But the two are indistinguishable from the
   * directory layout alone — `Pack/Red` + `Pack/Blue` (pick one) and `Aria/robot` + `Aria/human`
   * (a character with two forms, use both) are the same shape — so the only thing that can tell
   * them apart is the person who downloaded it. */
  const [asOneMod, setAsOneMod] = useState(false);

  /** The folders, collapsed into the single folder that holds them all.
   *
   * `place_mods` copies whatever `rel_path` points at, and an empty path already means "the
   * tree's own root is the mod", so installing the shared parent needs nothing new underneath —
   * one entry with the common ancestor as its path is a whole mod as far as the backend is
   * concerned. Named after the thing that was actually picked, since the folder holding both
   * parts is what the user thinks of as the mod; the parts are called things like "human". */
  const combined: ImportCandidate = useMemo(
    () => ({
      rel_path: commonAncestor(begun.plan.candidates.map((c) => c.rel_path)),
      suggested_name: prettifySourceLabel(begun.source_label),
      // Whichever part shipped art. They are the same mod, so either picture stands for it.
      preview_rel_path:
        begun.plan.candidates.find((c) => c.preview_rel_path !== null)?.preview_rel_path ?? null,
    }),
    [begun.plan.candidates, begun.source_label],
  );

  const candidates = asOneMod ? [combined] : begun.plan.candidates;

  // Everything ticked to start: someone who dropped a file wants what is in it, and unticking
  // the one variant you do not want is less work than ticking the four you do.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(candidates.map((candidate) => candidate.rel_path)),
  );
  const [names, setNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(candidates.map((c) => [c.rel_path, c.suggested_name])),
  );

  /** Switches between the two readings, re-seeding the rows for whichever is now showing.
   *
   * Names already edited are kept — flipping the switch to see what it does should not throw
   * away typing — and each list keeps its own, since "Human" and "Aria de la Fontaine" are
   * answers to different questions. */
  function setOneMod(next: boolean) {
    const rows = next ? [combined] : begun.plan.candidates;
    setAsOneMod(next);
    setSelected(new Set(rows.map((c) => c.rel_path)));
    setNames((current) =>
      Object.fromEntries(rows.map((c) => [c.rel_path, current[c.rel_path] ?? c.suggested_name])),
    );
  }
  // Where the import was started from wins over what the names looked like. The guess exists for
  // the cases with no context — the Library roster, All mods, a drop onto either — not to
  // second-guess a character page you were already standing on. Still editable either way, since
  // a pack can turn out to be for someone else entirely.
  const [characterId, setCharacterId] = useState<string | null>(
    seededCharacterId ?? suggested_character_id,
  );
  const [error, setError] = useState<string | null>(null);

  /** Pictures chosen in this dialog, keyed by candidate, staged rather than written.
   *
   * Nothing can be written yet — the mods do not exist until Install creates them — so the bytes
   * wait here and are applied to the rows `commitImport` hands back. The object URL is only for
   * showing the choice in its frame. */
  const [pictures, setPictures] = useState<
    Record<string, { bytes: Uint8Array; url: string }>
  >({});

  // Object URLs outlive the state that made them, so they are revoked when replaced and when the
  // dialog goes. Without this, importing a few packs in a row leaks every image ever previewed.
  const picturesRef = useRef(pictures);
  useEffect(() => {
    picturesRef.current = pictures;
  }, [pictures]);
  useEffect(
    () => () => {
      Object.values(picturesRef.current).forEach((p) => URL.revokeObjectURL(p.url));
    },
    [],
  );

  function stagePicture(relPath: string, bytes: Uint8Array) {
    setPictures((current) => {
      const previous = current[relPath];
      if (previous) URL.revokeObjectURL(previous.url);
      return {
        ...current,
        [relPath]: { bytes, url: URL.createObjectURL(new Blob([bytes])) },
      };
    });
  }

  const commit = useCommitImport();
  const cancel = useCancelImport();
  const pickPicture = usePickModThumbnail();
  const setPicture = useSetModThumbnail();
  const isBusy = commit.isPending || cancel.isPending;

  // Which row has the file picker open, so only that row says "Choosing…" — the mutation's own
  // pending flag is shared by every row and would light all of them at once.
  const [pickingFor, setPickingFor] = useState<string | null>(null);

  async function handlePickPicture(relPath: string) {
    setPickingFor(relPath);
    try {
      const bytes = await pickPicture.mutateAsync();
      // `null` is the picker being dismissed, which is not an error and not a change.
      if (bytes) stagePicture(relPath, new Uint8Array(bytes));
    } catch (caught) {
      setError(String(caught));
    } finally {
      setPickingFor(null);
    }
  }

  const chosen = candidates.filter((candidate) => selected.has(candidate.rel_path));
  const isEveryNameFilled = chosen.every((c) => (names[c.rel_path] ?? "").trim().length > 0);
  const canInstall = chosen.length > 0 && isEveryNameFilled && characterId !== null;

  function toggle(relPath: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(relPath)) next.delete(relPath);
      else next.add(relPath);
      return next;
    });
  }

  /** Ends the session before closing. Failing to clean up is not worth blocking the close over —
   * the tree is in the temp folder either way — so the dialog goes regardless. */
  async function handleClose() {
    try {
      await cancel.mutateAsync(begun.session_id);
    } catch {
      // Nothing the user can do about it, and nothing of theirs is at risk.
    }
    onOpenChange(false);
  }

  async function handleInstall() {
    if (!canInstall || characterId === null) return;
    setError(null);
    const selections: ImportSelection[] = chosen.map((candidate) => ({
      rel_path: candidate.rel_path,
      display_name: (names[candidate.rel_path] ?? "").trim(),
      character_id: characterId,
      preview_rel_path: candidate.preview_rel_path,
    }));

    try {
      const installed = await commit.mutateAsync({
        sessionId: begun.session_id,
        selections,
      });

      // Pictures can only be written once the mods exist. Matched by display name rather than by
      // position: `place_mods` decides the order it returns, and putting a picture on the wrong
      // mod would be worse than not setting one at all.
      const stagedByName = new Map<string, Uint8Array>();
      for (const candidate of chosen) {
        const staged = pictures[candidate.rel_path];
        if (staged) stagedByName.set((names[candidate.rel_path] ?? "").trim(), staged.bytes);
      }
      if (stagedByName.size > 0) {
        for (const installedMod of installed) {
          const bytes = stagedByName.get(installedMod.display_name);
          if (bytes) await setPicture.mutateAsync({ modId: installedMod.id, bytes });
        }
      }

      // Committing already ended the session, so this closes without cancelling.
      onOpenChange(false);
    } catch (caught) {
      // Reached from two very different places. A failure before the mods were created means
      // nothing was installed; one after means they were, and only a picture did not stick — so
      // the message has to say which, and the dialog stays open rather than closing on a lie.
      const installedAlready = commit.isSuccess;
      setError(
        installedAlready
          ? `Installed, but the picture could not be saved: ${caught}. You can set it from Edit.`
          : String(caught),
      );
    }
  }

  const found = candidates.length;
  const summary =
    found === 0 ? "Nothing to install" : found === 1 ? "1 mod" : `${found} mods in this pack`;

  return (
    <Dialog open onOpenChange={(next) => !next && void handleClose()}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 border-2 border-border bg-card p-0 shadow-slap-lift sm:max-w-[520px]"
      >
        <DialogHeader className="flex-row items-center justify-between bg-primary px-4 py-2.5 text-primary-foreground">
          <DialogTitle className="font-heading text-[11px] font-semibold uppercase tracking-[0.16em]">
            Import mod
          </DialogTitle>
          <button
            type="button"
            onClick={() => void handleClose()}
            disabled={isBusy}
            aria-label="Close"
            className="-my-1 -mr-1 p-1 transition-opacity hover:opacity-60 disabled:opacity-40"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </DialogHeader>

        <div className="grid gap-4 px-4 py-4">
          <div className="grid gap-0.5">
            <p className="truncate font-heading text-[13px] uppercase tracking-[0.04em]">
              {begun.source_label}
            </p>
            <p className="font-heading text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
              {summary}
            </p>
          </div>

          {found === 0 ? (
            // Not an error — the file is fine, it just is not a mod. Say what one looks like
            // rather than leaving someone to guess what the app wanted.
            <p className="border border-border bg-background px-3 py-2.5 text-[13px] text-muted-foreground">
              There is no mod in this file. An XXMI mod is a folder containing a{" "}
              <code className="text-foreground">.ini</code>, on its own or inside an archive.
            </p>
          ) : (
            <>
              {/* Only when there is actually something to decide. One folder is one mod and
                  there is nothing to combine it with; the question would be noise. */}
              {begun.plan.candidates.length > 1 && (
                <div className="grid gap-1.5">
                  <Label className="font-heading text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
                    {begun.plan.candidates.length} folders inside
                  </Label>
                  <div className="flex border border-border bg-background p-1">
                    <ModeButton
                      isActive={!asOneMod}
                      disabled={isBusy}
                      onClick={() => setOneMod(false)}
                      label="Separate mods"
                      hint="Alternatives — install some, skip the rest"
                    />
                    <ModeButton
                      isActive={asOneMod}
                      disabled={isBusy}
                      onClick={() => setOneMod(true)}
                      label="One mod"
                      hint="Parts that belong together, on and off as one"
                    />
                  </div>
                </div>
              )}

              <div className="grid gap-1.5">
                <Label className="font-heading text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
                  {found === 1 ? "Name" : "What to install"}
                </Label>
                <div className="max-h-[240px] overflow-y-auto border border-border bg-background">
                  {candidates.map((candidate) => {
                    const isChosen = selected.has(candidate.rel_path);
                    return (
                      <div
                        key={candidate.rel_path}
                        className="flex items-start gap-2.5 border-b border-border p-2 last:border-b-0"
                      >
                        {/* A square that fills, rather than a checkbox primitive: this design
                            language has no rounded controls, and one control does not justify
                            another dependency. Disabled when there is only one mod — unticking
                            the only thing you can install is not a choice worth offering. */}
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={isChosen}
                          aria-label={`Install ${candidate.suggested_name}`}
                          disabled={isBusy || found === 1}
                          onClick={() => toggle(candidate.rel_path)}
                          className={`flex h-4 w-4 shrink-0 items-center justify-center border transition-colors disabled:opacity-60 ${
                            isChosen
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background hover:border-muted-foreground"
                          }`}
                        >
                          {isChosen && <Check className="h-3 w-3" />}
                        </button>

                        <div className="grid min-w-0 flex-1 gap-1.5">
                          <Input
                            value={names[candidate.rel_path] ?? ""}
                            onChange={(event) =>
                              setNames((current) => ({
                                ...current,
                                [candidate.rel_path]: event.target.value,
                              }))
                            }
                            disabled={isBusy || !isChosen}
                            aria-label={`Name for ${candidate.suggested_name}`}
                            className="h-8"
                          />

                          <CandidatePicture
                            sessionId={begun.session_id}
                            relPath={candidate.preview_rel_path}
                            name={candidate.suggested_name}
                            stagedUrl={pictures[candidate.rel_path]?.url ?? null}
                            onPasteImage={(bytes) =>
                              stagePicture(candidate.rel_path, bytes)
                            }
                            onChooseFile={() =>
                              void handlePickPicture(candidate.rel_path)
                            }
                            isPicking={pickingFor === candidate.rel_path}
                            disabled={isBusy || !isChosen}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label
                  htmlFor="import-character"
                  className="font-heading text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70"
                >
                  Filed under
                </Label>
                <CharacterPicker
                  id="import-character"
                  value={characterId}
                  onChange={setCharacterId}
                  disabled={isBusy}
                />
                {seededCharacterId === null && suggested_character_id === null && (
                  // Silence here would read as the app having no opinion when it in fact could
                  // not form one, which are different things. Not shown when the import came
                  // from a character's page: nothing was guessed, so nothing failed to be.
                  <p className="text-[11px] text-muted-foreground">
                    The name did not say which character this is for — pick one.
                  </p>
                )}
              </div>
            </>
          )}

          {error && <p className="text-[13px] text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2 border-t border-border px-4 py-3">
          <Button
            type="button"
            variant="outline"
            disabled={isBusy}
            onClick={() => void handleClose()}
          >
            Cancel
          </Button>
          {found > 0 && (
            <Button
              type="button"
              disabled={!canInstall || isBusy}
              onClick={() => void handleInstall()}
            >
              {commit.isPending
                ? "Installing…"
                : chosen.length > 1
                  ? `Install ${chosen.length}`
                  : "Install"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The picture a candidate will be installed with, and how to change it.
 *
 * Deliberately the same control as the Edit dialog's, down to the dashed frame and the wording:
 * a focusable paste target that does *not* open anything when clicked, with the file picker as a
 * separate button beside it. An earlier attempt here folded both into the small preview square,
 * and that cannot work — if clicking opens the picker, there is no click left over for focusing
 * the thing you then paste into. Two jobs need two controls.
 *
 * Shows the archive's own picture until overridden, so a pack that shipped art needs no
 * interaction at all. No Remove button: Edit has one because a mod can already carry a picture
 * worth dropping, whereas here "remove" would mean reverting to the archive's own — which
 * choosing again already does, and which Edit can do properly once the mod exists. */
/** One half of the separate-mods / one-mod switch.
 *
 * Two buttons rather than a checkbox, because neither reading is the "off" state of the other —
 * a pack of alternatives and a mod in parts are both ordinary things to be handed, and a
 * checkbox would make one of them the exception. The hint under each label is what actually
 * decides it: the folder names rarely say which kind you have. */
function ModeButton({
  isActive,
  disabled,
  onClick,
  label,
  hint,
}: {
  isActive: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isActive}
      disabled={disabled}
      onClick={onClick}
      className={`flex-1 px-2.5 py-1.5 text-left transition-colors disabled:opacity-60 ${
        isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
      }`}
    >
      <span className="block font-heading text-[11px] uppercase tracking-[0.08em]">{label}</span>
      <span
        className={`block text-[10px] leading-tight ${
          isActive ? "text-primary-foreground/70" : "text-muted-foreground/70"
        }`}
      >
        {hint}
      </span>
    </button>
  );
}

function CandidatePicture({
  sessionId,
  relPath,
  name,
  stagedUrl,
  onPasteImage,
  onChooseFile,
  isPicking,
  disabled,
}: {
  sessionId: number;
  relPath: string | null;
  name: string;
  /** An object URL for bytes staged in this dialog, or null to show the archive's own picture. */
  stagedUrl: string | null;
  onPasteImage: (bytes: Uint8Array) => void;
  onChooseFile: () => void;
  isPicking: boolean;
  disabled: boolean;
}) {
  const { data } = useImportPreview(sessionId, relPath);
  const shown = stagedUrl ?? data;

  /** The first image on the clipboard. The webview normalises a screenshot, a Discord attachment
   * and a copied file into one image item; what it really is gets decided in Rust on save, from
   * the bytes' own header. */
  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const image = [...event.clipboardData.items].find(
      (item) => item.kind === "file" && item.type.startsWith("image/"),
    );
    const file = image?.getAsFile();
    if (!file) return;
    event.preventDefault();
    void file.arrayBuffer().then((buffer) => onPasteImage(new Uint8Array(buffer)));
  }

  return (
    <div className="grid gap-1.5">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onPaste={handlePaste}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onChooseFile();
          }
        }}
        aria-label={`Picture for ${name}`}
        className={`flex items-center gap-3 border border-dashed p-2 text-left focus:outline-none focus:ring-1 focus:ring-primary ${
          disabled ? "opacity-60" : ""
        } ${stagedUrl ? "border-primary" : "border-border"}`}
      >
        <div className="h-[42px] w-[56px] shrink-0 overflow-hidden border border-border bg-secondary">
          {shown ? (
            <img src={shown} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground/50">
              None
            </span>
          )}
        </div>
        <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
          {isPicking
            ? "Choosing…"
            : stagedUrl
              ? "Staged — press Install to apply."
              : "Click here and press Ctrl+V to paste an image, or choose a file."}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="font-normal"
        disabled={disabled || isPicking}
        onClick={onChooseFile}
      >
        <ImageIcon className="h-3.5 w-3.5" />
        Choose file
      </Button>
    </div>
  );
}
