import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { AlertTriangle, FolderOpen, Image as ImageIcon } from "lucide-react";
import { useState } from "react";
import {
  DOCKET_BUTTON,
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
import { modArtSrc } from "@/lib/modArt";
import { type Mod } from "@/lib/tauri-commands";
import { CharacterPicker } from "./CharacterPicker";
import {
  useMoveMod,
  useRenameMod,
  useSetModThumbnail,
  usePickModThumbnail,
  useClearModThumbnail,
} from "./hooks";

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
  const setPicture = useSetModThumbnail();
  const pickPicture = usePickModThumbnail();
  const clearPicture = useClearModThumbnail();
  const [pictureError, setPictureError] = useState<string | null>(null);

  /** The picture Save would apply: bytes to write, `"remove"` to drop the current one, or null
   * for "leave it alone" — staged like the name and the location, for the same reason. Writing a
   * file into the mod's folder the moment one is chosen would make Cancel a lie. */
  const [stagedPicture, setStagedPicture] = useState<
    Uint8Array | "remove" | null
  >(null);
  // A local preview of what has been staged. Revoked when it is replaced or the dialog closes,
  // since an object URL lives until it is let go of rather than until nothing points at it.
  const [stagedPreview, setStagedPreview] = useState<string | null>(null);

  const isPictureChanged = stagedPicture !== null;
  const isPickingFile = pickPicture.isPending;
  const artSrc =
    stagedPicture === "remove" ? null : (stagedPreview ?? modArtSrc(mod));

  function stagePicture(bytes: Uint8Array | "remove") {
    setStagedPreview((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return bytes === "remove"
        ? null
        : URL.createObjectURL(new Blob([bytes as BlobPart]));
    });
    setStagedPicture(bytes);
    setPictureError(null);
  }

  /** Stages the first image on the clipboard.
   *
   * The webview normalises whatever was copied — a screenshot, a Discord attachment, an image
   * from a browser — into a single format before it reaches here, so this only has to find the
   * image among the clipboard's items. What it actually is gets decided in Rust on save, from the
   * bytes' own header, because a clipboard type is still only something a source claims. */
  async function handlePaste(event: React.ClipboardEvent) {
    const image = [...event.clipboardData.items].find(
      (item) => item.kind === "file" && item.type.startsWith("image/"),
    );
    if (!image) {
      setPictureError("There is no image on the clipboard — copy one first.");
      return;
    }
    event.preventDefault();
    const file = image.getAsFile();
    if (!file) return;
    stagePicture(new Uint8Array(await file.arrayBuffer()));
  }

  /** Opens the picker and stages whatever comes back. Dismissing it changes nothing. */
  async function handleChooseFile() {
    setPictureError(null);
    try {
      const bytes = await pickPicture.mutateAsync();
      if (bytes) stagePicture(new Uint8Array(bytes));
    } catch (caught) {
      setPictureError(String(caught));
    }
  }

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);

  const trimmedName = displayName.trim();
  const isNameValid = trimmedName.length > 0;
  const isNameChanged = isNameValid && trimmedName !== mod.display_name;
  const isLocationChanged = characterId !== mod.character_id;
  const hasChanges = isNameChanged || isLocationChanged || isPictureChanged;

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
      // Last, because it writes into the mod's folder — and a move relocates that folder, so
      // doing this first would put the picture where the mod no longer is.
      if (stagedPicture === "remove") {
        await clearPicture.mutateAsync(mod.id);
      } else if (stagedPicture) {
        await setPicture.mutateAsync({ modId: mod.id, bytes: stagedPicture });
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
        className="gap-0 p-0 sm:max-w-[440px]"
      >
        <DialogDocketHeader title="Edit · mod" />

        <div className="grid min-w-0 gap-5 p-4 [&>*]:min-w-0">
          <div className="grid gap-1.5">
            <label htmlFor="edit-mod-name" className={DOCKET_LABEL}>
              Name
            </label>
            {/* The machine’s face for a value you are typing in, matching the install
                dialog’s name field exactly — the two places that set a mod’s name should not
                look like two different kinds of question. No lift: a text field is not
                pressed, and one that flinches when the pointer crosses it reads as a button
                you failed to hit. */}
            <input
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
              className={`w-full px-2.5 py-2 font-mono text-[13px] hover:translate-y-0 ${DOCKET_ON_PAPER}`}
            />
            {!isNameValid && (
              <p className={DOCKET_ERROR}>
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />A mod needs a name.
              </p>
            )}
            {/* The variant is the installer’s record of which file this came from, and
                renaming does not change which file is on disk — so it stays put, as a
                reminder of what the mod actually is while its name is being rewritten. */}
            {mod.variant_label && (
              <p className={DOCKET_HINT}>
                From <span className="text-foreground">{mod.variant_label}</span>
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="edit-mod-location" className={DOCKET_LABEL}>
              Filed under
            </label>
            <CharacterPicker
              id="edit-mod-location"
              value={characterId}
              onChange={setCharacterId}
              disabled={isSaving}
              currentId={mod.character_id}
            />
            <p className={DOCKET_HINT}>Saving moves the mod’s folder to match.</p>
          </div>

          <div className="grid gap-1.5">
            <span className={DOCKET_LABEL}>Picture</span>
            {/* A paste target rather than only a button, because the picture is nearly always
                already on the clipboard: copied out of the Discord message or Patreon post the
                mod came from, or snipped from the game. Focusable and key-handled so it works
                without a mouse; the file picker sits beside it for an image already on disk.

                The one dashed edge in the app. It is the only thing here asking to be filled
                rather than pressed, and it has to read as empty when it is. */}
            <div
              role="button"
              tabIndex={0}
              onPaste={handlePaste}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  void handleChooseFile();
                }
              }}
              className="flex items-center gap-3 border-2 border-dashed border-border bg-background p-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            >
              <div className="h-[42px] w-[56px] shrink-0 overflow-hidden border-2 border-border bg-art">
                {artSrc ? (
                  <img src={artSrc} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50">
                    None
                  </span>
                )}
              </div>
              <p className={`min-w-0 flex-1 ${DOCKET_HINT}`}>
                {isPickingFile
                  ? "Choosing…"
                  : isPictureChanged
                    ? "Staged — press Save to apply."
                    : "Click here and press Ctrl+V to paste an image, or choose a file."}
              </p>
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                className={`${DOCKET_BUTTON} flex-1`}
                disabled={isPickingFile || isSaving}
                onClick={() => void handleChooseFile()}
              >
                <ImageIcon className="h-3.5 w-3.5" />
                Choose file
              </button>
              {(mod.bundled_thumbnail || stagedPreview) && stagedPicture !== "remove" && (
                <button
                  type="button"
                  className={DOCKET_BUTTON}
                  disabled={isPickingFile || isSaving}
                  onClick={() => stagePicture("remove")}
                >
                  Remove
                </button>
              )}
            </div>
            {pictureError && (
              <p className={DOCKET_ERROR}>
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {pictureError}
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <span className={DOCKET_LABEL}>Files</span>
            <div className="flex min-w-0 items-center gap-2">
              {/* The path is a figure the machine holds, so it is set in the machine’s face
                  and on a plate rather than loose on the card — a value, not a sentence. */}
              <p
                className="min-w-0 flex-1 truncate bg-background px-2.5 py-2 font-mono text-[11.5px] font-bold text-foreground shadow-slap"
                title={mod.folder_path}
              >
                {mod.folder_path}
              </p>
              <button type="button" className={DOCKET_BUTTON} onClick={handleReveal}>
                <FolderOpen className="h-3.5 w-3.5" />
                Open
              </button>
            </div>
            {revealError && (
              <p className={DOCKET_ERROR}>
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {revealError}
              </p>
            )}
          </div>
        </div>

        {saveError && (
          <p className={`${DOCKET_ERROR} px-4 pb-3`}>
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {saveError}
          </p>
        )}

        <DialogFooter className="mx-0 mb-0 gap-2 px-4 py-3">
          <DialogClose
            disabled={isSaving}
            className={`${DOCKET_SLAB} bg-card text-card-foreground`}
          >
            Cancel
          </DialogClose>
          <button
            type="button"
            disabled={!hasChanges || !isNameValid || isSaving}
            onClick={() => void handleSave()}
            className={`${DOCKET_SLAB} bg-primary text-primary-foreground`}
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
