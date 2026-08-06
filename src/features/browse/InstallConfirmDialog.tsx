import { listen } from "@tauri-apps/api/event";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCharacters } from "@/features/library/hooks";
import {
  cancelGamebananaInstall,
  SLOTS,
  type GbFile,
  type GbMod,
  type InstallProgress,
  type Slot,
} from "@/lib/tauri-commands";
import { useInstallFromGamebanana } from "./hooks";

interface InstallConfirmDialogProps {
  mod: GbMod;
  file: GbFile;
  onOpenChange: (open: boolean) => void;
  onInstalled: () => void;
}

/** Best-effort keyword guess only — GameBanana's category tree has no slot-level structure
 * and tags are inconsistently populated, so this is always shown to the user for confirmation,
 * never applied silently (see Milestone 2 plan Assumption 2). */
function guessSlot(tags: string[]): Slot {
  const lower = tags.map((tag) => tag.toLowerCase());
  if (lower.some((tag) => tag.includes("weapon"))) return "Weapon";
  if (lower.some((tag) => tag.includes("hair"))) return "Hair";
  if (lower.some((tag) => tag.includes("outfit") || tag.includes("skin"))) return "Outfit";
  return "Other";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function InstallConfirmDialog({
  mod,
  file,
  onOpenChange,
  onInstalled,
}: InstallConfirmDialogProps) {
  const { data: characters } = useCharacters();
  const guessedCharacterId =
    (characters ?? []).find((character) => character.name === mod.sub_category?.name)?.id ?? "";

  const [characterId, setCharacterId] = useState(guessedCharacterId);
  const [slot, setSlot] = useState<Slot>(guessSlot(mod.tags));
  const [displayName, setDisplayName] = useState(mod.name);
  const install = useInstallFromGamebanana(characterId);

  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [speedBytesPerSec, setSpeedBytesPerSec] = useState<number | null>(null);
  const lastSample = useRef<{ time: number; downloaded: number } | null>(null);

  useEffect(() => {
    if (!install.isPending) {
      setProgress(null);
      setSpeedBytesPerSec(null);
      lastSample.current = null;
      return;
    }

    const unlistenPromise = listen<InstallProgress>("gamebanana-install-progress", (event) => {
      const now = performance.now();
      const previous = lastSample.current;
      if (previous) {
        const elapsedSec = (now - previous.time) / 1000;
        const bytesSinceLast = event.payload.downloaded - previous.downloaded;
        if (elapsedSec > 0) {
          setSpeedBytesPerSec(bytesSinceLast / elapsedSec);
        }
      }
      lastSample.current = { time: now, downloaded: event.payload.downloaded };
      setProgress(event.payload);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [install.isPending]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!characterId) return;
    install.mutate(
      {
        gamebananaModId: mod.id,
        gamebananaFileId: file.id,
        characterId,
        slot,
        displayName,
      },
      { onSuccess: onInstalled },
    );
  }

  function handleCancel() {
    cancelGamebananaInstall();
  }

  const percent =
    progress?.total && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null;

  return (
    <Dialog open onOpenChange={(next) => !next && onOpenChange(false)}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Install {mod.name}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <p className="text-xs text-muted-foreground">
              Confirm where this mod should be filed — auto-detected from the mod's category and
              tags, but not always right.
            </p>

            <div className="grid gap-2">
              <Label htmlFor="install-display-name">Display name</Label>
              <Input
                id="install-display-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                disabled={install.isPending}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="install-character">Character</Label>
              <Select
                value={characterId}
                onValueChange={setCharacterId}
                disabled={install.isPending}
              >
                <SelectTrigger id="install-character">
                  <SelectValue placeholder="Select a character" />
                </SelectTrigger>
                <SelectContent>
                  {(characters ?? []).map((character) => (
                    <SelectItem key={character.id} value={character.id}>
                      {character.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="install-slot">Slot</Label>
              <Select
                value={slot}
                onValueChange={(value) => setSlot(value as Slot)}
                disabled={install.isPending}
              >
                <SelectTrigger id="install-slot">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SLOTS.map((slotOption) => (
                    <SelectItem key={slotOption} value={slotOption}>
                      {slotOption}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {install.isPending && (
              <div className="space-y-1.5">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={
                      percent === null
                        ? "h-full w-1/3 animate-pulse rounded-full bg-primary"
                        : "h-full rounded-full bg-primary transition-all"
                    }
                    style={percent === null ? undefined : { width: `${percent}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {progress
                    ? `${formatBytes(progress.downloaded)}${
                        progress.total ? ` / ${formatBytes(progress.total)}` : ""
                      }${percent !== null ? ` (${percent}%)` : ""}${
                        speedBytesPerSec ? ` — ${formatBytes(speedBytesPerSec)}/s` : ""
                      }`
                    : "Starting download…"}
                </p>
              </div>
            )}

            {install.isError && <p className="text-sm text-destructive">{String(install.error)}</p>}
          </div>

          <DialogFooter>
            {install.isPending && (
              <Button type="button" variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={!characterId || install.isPending}>
              {install.isPending ? "Installing…" : "Install"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
