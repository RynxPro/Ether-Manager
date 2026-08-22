import { Check, ImageOff, ImagePlus, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import type { BegunImport, ImportSelection } from "@/lib/tauri-commands";
import { CharacterPicker } from "./CharacterPicker";
import {
  useCancelImport,
  useCommitImport,
  useImportPreview,
  usePickModThumbnail,
  useSetModThumbnail,
} from "./hooks";

/** Eridu's signature corner. Inline because a clip path cannot come from a border radius. */
const CUT_CORNER = {
  clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%)",
} as const;

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
  const { candidates, suggested_character_id } = begun.plan;

  // Everything ticked to start: someone who dropped a file wants what is in it, and unticking
  // the one variant you do not want is less work than ticking the four you do.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(candidates.map((candidate) => candidate.rel_path)),
  );
  const [names, setNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(candidates.map((c) => [c.rel_path, c.suggested_name])),
  );
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

  async function handlePickPicture(relPath: string) {
    try {
      const bytes = await pickPicture.mutateAsync();
      // `null` is the picker being dismissed, which is not an error and not a change.
      if (bytes) stagePicture(relPath, new Uint8Array(bytes));
    } catch (caught) {
      setError(String(caught));
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
        style={CUT_CORNER}
        className="gap-0 border-2 border-border bg-card p-0 sm:max-w-[520px]"
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
                        className="flex items-center gap-2.5 border-b border-border p-2 last:border-b-0"
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

                        <CandidatePreview
                          sessionId={begun.session_id}
                          relPath={candidate.preview_rel_path}
                          name={names[candidate.rel_path] ?? candidate.suggested_name}
                          stagedUrl={pictures[candidate.rel_path]?.url ?? null}
                          onPick={() => void handlePickPicture(candidate.rel_path)}
                          onPasteImage={(bytes) => stagePicture(candidate.rel_path, bytes)}
                          disabled={isBusy}
                        />

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
                          className="h-8 flex-1"
                        />
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

/** The picture a candidate will be installed with — and the control for changing it.
 *
 * The frame that shows the picture is the thing you click to set one, because that is what
 * anybody would try first. Edit's control cannot be reused here: it is a large paste target with
 * its own buttons, and this dialog can be listing ten mods at once.
 *
 * Shows the archive's own picture until overridden, so the common case — a pack that shipped art
 * — needs no interaction at all. There is deliberately no "revert to the archive's picture":
 * choosing again replaces, and Edit can undo it properly after installing. A clear button does
 * not fit in 56x36 and would crowd the one thing this control is for.
 *
 * A fixed frame either way, so rows line up whether or not there is art — a list that jogs left
 * and right down its own length is harder to read than one with a few empty squares in it. */
function CandidatePreview({
  sessionId,
  relPath,
  name,
  stagedUrl,
  onPick,
  onPasteImage,
  disabled,
}: {
  sessionId: number;
  relPath: string | null;
  name: string;
  /** An object URL for bytes staged in this dialog, or null to show the archive's own picture. */
  stagedUrl: string | null;
  onPick: () => void;
  onPasteImage: (bytes: Uint8Array) => void;
  disabled: boolean;
}) {
  const { data } = useImportPreview(sessionId, relPath);
  const shown = stagedUrl ?? data;

  /** Takes the first image on the clipboard. Same shape as the Edit dialog's paste handler: the
   * webview normalises a screenshot, a Discord attachment and a copied file into an image item,
   * and what it really is gets decided in Rust from the bytes' own header. */
  function handlePaste(event: React.ClipboardEvent<HTMLButtonElement>) {
    const image = [...event.clipboardData.items].find(
      (item) => item.kind === "file" && item.type.startsWith("image/"),
    );
    const file = image?.getAsFile();
    if (!file) return;
    event.preventDefault();
    void file.arrayBuffer().then((buffer) => onPasteImage(new Uint8Array(buffer)));
  }

  return (
    <button
      type="button"
      onClick={onPick}
      onPaste={handlePaste}
      disabled={disabled}
      title={`Set a picture for ${name} — click to choose a file, or press Ctrl+V to paste one`}
      aria-label={`Set a picture for ${name}`}
      className={`group/pic relative flex h-9 w-14 shrink-0 items-center justify-center overflow-hidden border bg-secondary transition-colors hover:border-primary focus-visible:border-primary disabled:opacity-60 ${
        stagedUrl ? "border-primary" : "border-border"
      }`}
    >
      {shown ? (
        <img src={shown} alt="" className="h-full w-full object-cover" />
      ) : (
        <ImageOff className="h-3.5 w-3.5 text-muted-foreground/50" />
      )}
      {/* Only on hover, and only over art — an icon sitting permanently on every row would read
          as part of the picture rather than as something to press. */}
      {shown && (
        <span className="absolute inset-0 hidden items-center justify-center bg-background/70 group-hover/pic:flex">
          <ImagePlus className="h-3.5 w-3.5 text-primary" />
        </span>
      )}
    </button>
  );
}
