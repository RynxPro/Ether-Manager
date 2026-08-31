import { useState } from "react";
import { InstallProgressBar } from "@/components/InstallProgressBar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update {mod.display_name}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <p className="text-xs text-muted-foreground">
            {updateCheck.reason === "FileChanged"
              ? "GameBanana replaced this mod's file contents."
              : "The file you originally installed is no longer available on GameBanana — pick its replacement."}
          </p>

          {updateCheck.is_ambiguous ? (
            <div className="grid gap-2">
              <Label htmlFor="update-file">File</Label>
              <Select
                value={selectedFileId !== null ? String(selectedFileId) : undefined}
                onValueChange={(value) => setSelectedFileId(Number(value))}
                disabled={updateMod.isPending || isDetailLoading}
              >
                <SelectTrigger id="update-file">
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
                <p className="text-xs text-destructive">
                  Couldn't load this mod's file list from GameBanana. Try closing and reopening
                  this dialog.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-foreground">
              {updateCheck.suggested_file_name ?? "New file"}
            </p>
          )}

          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
            Updating replaces everything in this mod's folder. Any manual edits you made there
            will be lost.
          </p>

          {updateMod.isPending && (
            <InstallProgressBar
              progress={progress}
              speedBytesPerSec={speedBytesPerSec}
              percent={percent}
            />
          )}

          {updateMod.isError && (
            <p className="text-sm text-destructive">{String(updateMod.error)}</p>
          )}
        </div>

        <DialogFooter>
          {updateMod.isPending && (
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
          )}
          <Button
            type="button"
            disabled={selectedFileId === null || updateMod.isPending}
            onClick={handleConfirm}
          >
            {updateMod.isPending ? "Updating…" : "Update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
