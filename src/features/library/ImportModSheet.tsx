import { Check, ImageOff, XIcon } from "lucide-react";
import { useState } from "react";
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
import { useCancelImport, useCommitImport, useImportPreview } from "./hooks";

/** Eridu's signature corner. Inline because a clip path cannot come from a border radius. */
const CUT_CORNER = {
  clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%)",
} as const;

interface ImportModSheetProps {
  begun: BegunImport;
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
export function ImportModSheet({ begun, onOpenChange }: ImportModSheetProps) {
  const { candidates, suggested_character_id } = begun.plan;

  // Everything ticked to start: someone who dropped a file wants what is in it, and unticking
  // the one variant you do not want is less work than ticking the four you do.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(candidates.map((candidate) => candidate.rel_path)),
  );
  const [names, setNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(candidates.map((c) => [c.rel_path, c.suggested_name])),
  );
  const [characterId, setCharacterId] = useState<string | null>(suggested_character_id);
  const [error, setError] = useState<string | null>(null);

  const commit = useCommitImport();
  const cancel = useCancelImport();
  const isBusy = commit.isPending || cancel.isPending;

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
      await commit.mutateAsync({ sessionId: begun.session_id, selections });
      // Committing already ended the session, so this closes without cancelling.
      onOpenChange(false);
    } catch (caught) {
      setError(String(caught));
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
                {suggested_character_id === null && (
                  // Silence here would read as the app having no opinion when it in fact could
                  // not form one, which are different things.
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

/** The picture the archive shipped for one candidate, if it shipped one.
 *
 * A fixed frame either way, so rows line up whether or not there is art — a list that jogs left
 * and right down its own length is harder to read than one with a few empty squares in it. */
function CandidatePreview({
  sessionId,
  relPath,
}: {
  sessionId: number;
  relPath: string | null;
}) {
  const { data } = useImportPreview(sessionId, relPath);

  return (
    <div className="flex h-9 w-14 shrink-0 items-center justify-center overflow-hidden border border-border bg-secondary">
      {data ? (
        <img src={data} alt="" className="h-full w-full object-cover" />
      ) : (
        <ImageOff className="h-3.5 w-3.5 text-muted-foreground/50" />
      )}
    </div>
  );
}
