import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { InstallProgressBar } from "@/components/InstallProgressBar";
import {
  DOCKET_ERROR,
  DOCKET_HINT,
  DOCKET_LABEL,
  DOCKET_NOTICE,
  DOCKET_NOTICE_COPY,
  DOCKET_SLAB,
  DOCKET_STAMP,
  Dialog,
  DialogContent,
  DialogDocketHeader,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGamebananaModDetail } from "@/features/browse/hooks";
import { formatBytes } from "@/lib/format";
import { useInstallProgress } from "@/lib/useInstallProgress";
import { cancelGamebananaInstall, type Mod, type UpdateCheck } from "@/lib/tauri-commands";
import { useUpdateInstalledMod } from "./hooks";

interface UpdateModDialogProps {
  mod: Mod;
  updateCheck: UpdateCheck;
}

export function UpdateModDialog({ mod, updateCheck }: UpdateModDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState(updateCheck.suggested_file_id);
  const updateMod = useUpdateInstalledMod(mod.character_id);
  const { progress, speedBytesPerSec, percent } = useInstallProgress(updateMod.isPending);

  // Only the ambiguous case (a mod with several files, none of them clearly the successor)
  // needs the full remote file list — the common case already has a suggested file name from
  // the cached check and doesn't need another network round trip just to open this dialog.
  const {
    data: detail,
    isLoading: isDetailLoading,
    isError: isDetailError,
  } = useGamebananaModDetail(open && updateCheck.is_ambiguous ? mod.gamebanana_mod_id : null);

  function handleCancel() {
    cancelGamebananaInstall();
  }

  function handleConfirm() {
    if (selectedFileId === null) return;
    updateMod.mutate(
      { modId: mod.id, gamebananaFileId: selectedFileId },
      { onSuccess: () => setOpen(false) },
    );
  }

  function handleOpenChange(next: boolean) {
    // Don't let Escape/overlay-click silently abandon an in-flight update — the download
    // keeps running in the backend either way, so closing without feedback would leave the
    // user unsure whether it succeeded. Cancel button remains the deliberate way out.
    if (!next && updateMod.isPending) return;
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {/* A slap, like the tools it now sits beside on the card's art — not the shadcn outline
            it used to be. It is the only control in that group carrying a word rather than a
            glyph, and an outlined pill among three squares of paper read as a foreign object.
            Filled in the accent because it is the one thing on the card actually asking to be
            pressed. */}
        <button
          type="button"
          className="flex h-8 rotate-1 items-center bg-primary px-3 font-sign text-[15px] uppercase tracking-[0.08em] text-primary-foreground shadow-slap"
        >
          Update
        </button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="gap-0 p-0 sm:max-w-[440px]"
      >
        <DialogDocketHeader
          title="Update · mod"
          isLocked={updateMod.isPending}
        />

        <div className="grid min-w-0 gap-4 p-4 [&>*]:min-w-0">
          {/* The caption names the operation, so the panel still has to name the thing. The
              display face, because this is a mod's own name. */}
          <p className="font-heading text-[22px] uppercase leading-none tracking-[0.02em] text-card-foreground">
            {mod.display_name}
          </p>

          <p className={DOCKET_HINT}>
            {updateCheck.reason === "FileChanged"
              ? "GameBanana replaced this mod's file contents."
              : "The file you originally installed is no longer available on GameBanana — pick its replacement."}
          </p>

          {updateCheck.is_ambiguous ? (
            <div className="grid min-w-0 gap-1.5">
              <label htmlFor="update-file" className={DOCKET_LABEL}>
                File
              </label>
              <Select
                value={selectedFileId !== null ? String(selectedFileId) : undefined}
                onValueChange={(value) => setSelectedFileId(Number(value))}
                disabled={updateMod.isPending || isDetailLoading}
              >
                <SelectTrigger id="update-file" className="w-full">
                  <SelectValue
                    placeholder={isDetailLoading ? "Loading files…" : "Select a file"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(detail?.files ?? []).map((file) => (
                    <SelectItem key={file.id} value={String(file.id)}>
                      {file.file_name} ({formatBytes(file.file_size)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isDetailError && (
                <p className={DOCKET_ERROR}>
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Could not load this mod's file list from GameBanana. Try closing and
                  reopening this dialog.
                </p>
              )}
            </div>
          ) : (
            /* A file name is a figure the machine holds, so it goes on a plate in the
               machine's face rather than loose on the card. */
            <p className="truncate bg-background px-2.5 py-2 font-mono text-[12px] font-bold text-foreground shadow-slap">
              {updateCheck.suggested_file_name ?? "New file"}
            </p>
          )}

          {/* A condition, not a control: bordered rather than filled, with the consequence
              stamped on the corner. The same object the install dialog hangs off its
              flagged-file notice. */}
          <div className={`${DOCKET_NOTICE} mt-1`}>
            <span className={DOCKET_STAMP}>Replaces the folder</span>
            <p className={DOCKET_NOTICE_COPY}>
              Updating replaces everything in this mod's folder. Any manual edits you made
              there will be lost.
            </p>
          </div>

          {updateMod.isPending && (
            <InstallProgressBar
              progress={progress}
              speedBytesPerSec={speedBytesPerSec}
              percent={percent}
            />
          )}

          {updateMod.isError && (
            <p className={DOCKET_ERROR}>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {String(updateMod.error)}
            </p>
          )}
        </div>

        <DialogFooter className="mx-0 mb-0 gap-2 px-4 py-3">
          {updateMod.isPending && (
            <button
              type="button"
              onClick={handleCancel}
              className={`${DOCKET_SLAB} bg-card text-card-foreground`}
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            disabled={selectedFileId === null || updateMod.isPending}
            onClick={handleConfirm}
            className={`${DOCKET_SLAB} bg-primary text-primary-foreground`}
          >
            {updateMod.isPending ? "Updating…" : "Update"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
