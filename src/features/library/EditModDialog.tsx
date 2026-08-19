import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { FolderOpen, XIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type Mod } from "@/lib/tauri-commands";
import { CharacterPicker } from "./CharacterPicker";
import { useMoveMod, useRenameMod } from "./hooks";

/** Eridu's signature corner. Inline because a clip path cannot come from a border radius. */
const CUT_CORNER = {
  clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%)",
} as const;

interface EditModDialogProps {
  mod: Mod;
  onOpenChange: (open: boolean) => void;
}

/** The three things about an installed mod that are worth changing after the fact, in one place.
 *
 * They arrived one at a time — rename, then where it is filed, then reaching the files — and each
 * could have been its own control on an already busy card. They belong together because they are
 * the same act: correcting what the installer decided for you. The card keeps one button.
 *
 * Name and location are applied separately rather than through a single Save, because they are
 * not the same kind of change. A rename edits a label; a move relocates a folder on disk and can
 * genuinely fail, with a reason worth reading. One button reporting "saved" for both would have
 * to explain a half-success eventually. */
export function EditModDialog({ mod, onOpenChange }: EditModDialogProps) {
  const [displayName, setDisplayName] = useState(mod.display_name);
  // Where the mod *would* go. Staged rather than applied, so picking a character is a decision
  // you can still take back — a move relocates a folder on disk, and the only honest way to
  // offer Cancel is to not have moved anything yet.
  const [characterId, setCharacterId] = useState(mod.character_id);
  const rename = useRenameMod();
  const move = useMoveMod();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);

  const trimmedName = displayName.trim();
  const isNameValid = trimmedName.length > 0;
  const isNameChanged = isNameValid && trimmedName !== mod.display_name;
  const isLocationChanged = characterId !== mod.character_id;
  const hasChanges = isNameChanged || isLocationChanged;

  /** Applies whichever fields actually moved, then closes.
   *
   * Sequential and not parallel, so a failure has one cause. If the rename lands and the move
   * does not, the dialog stays open on the error with the name already saved — re-pressing Save
   * then retries only the part that failed, because the mod prop has caught up and the name no
   * longer counts as changed. Reporting a half-success is better than pretending the whole
   * thing failed and inviting a rename that is already done. */
  async function handleSave() {
    setSaveError(null);
    setIsSaving(true);
    try {
      if (isNameChanged) {
        await rename.mutateAsync({ modId: mod.id, displayName: trimmedName });
      }
      if (isLocationChanged) {
        await move.mutateAsync({ modId: mod.id, characterId });
      }
      onOpenChange(false);
    } catch (error) {
      setSaveError(String(error));
    } finally {
      setIsSaving(false);
    }
  }

  /** Opens the folder in the system file manager with the mod selected. Reveals rather than
   * opens: what someone wants from here is nearly always to look at, copy or drag the folder
   * itself, and landing inside it puts them one level past that. */
  async function handleReveal() {
    setRevealError(null);
    try {
      await revealItemInDir(mod.folder_path);
    } catch (error) {
      setRevealError(String(error));
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onOpenChange(false)}>
      <DialogContent
        showCloseButton={false}
        style={CUT_CORNER}
        className="gap-0 border-2 border-border bg-card p-0 sm:max-w-[440px]"
      >
        <DialogHeader className="flex-row items-center justify-between bg-primary px-4 py-2.5 text-primary-foreground">
          <DialogTitle className="font-heading text-[11px] font-semibold uppercase tracking-[0.16em]">
            Edit mod
          </DialogTitle>
          <DialogClose
            className="-my-1 -mr-1 p-1 transition-opacity hover:opacity-60"
            aria-label="Close"
          >
            <XIcon className="h-3.5 w-3.5" />
          </DialogClose>
        </DialogHeader>

        <div className="grid gap-4 px-4 py-4">
          <div className="grid gap-1.5">
            <Label
              htmlFor="edit-mod-name"
              className="font-heading text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70"
            >
              Name
            </Label>
            <Input
              id="edit-mod-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && hasChanges && isNameValid) {
                  event.preventDefault();
                  void handleSave();
                }
              }}
              disabled={isSaving}
            />
            {!isNameValid && <p className="text-[11px] text-destructive">A mod needs a name.</p>}
            {/* The variant is the installer's record of which file this came from, and renaming
                does not change which file is on disk — so it stays put, as a reminder of what
                the mod actually is while its name is being rewritten. */}
            {mod.variant_label && (
              <p className="text-[11px] text-muted-foreground">
                From <span className="text-foreground">{mod.variant_label}</span>
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label
              htmlFor="edit-mod-location"
              className="font-heading text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70"
            >
              Filed under
            </Label>
            <CharacterPicker
              id="edit-mod-location"
              value={characterId}
              onChange={setCharacterId}
              disabled={isSaving}
              currentId={mod.character_id}
            />
            <p className="text-[11px] text-muted-foreground">
              Saving moves the mod&apos;s folder to match.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label className="font-heading text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
              Files
            </Label>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start font-normal"
              onClick={handleReveal}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Open folder
            </Button>
            <p className="truncate text-[11px] text-muted-foreground" title={mod.folder_path}>
              {mod.folder_path}
            </p>
            {revealError && <p className="text-[11px] text-destructive">{revealError}</p>}
          </div>
        </div>

        {saveError && <p className="px-4 pb-2 text-[11px] text-destructive">{saveError}</p>}

        <DialogFooter className="mx-0 mb-0 gap-2 border-t border-border bg-background px-4 py-3">
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isSaving}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            disabled={!hasChanges || !isNameValid || isSaving}
            onClick={() => void handleSave()}
          >
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
