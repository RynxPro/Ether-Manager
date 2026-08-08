import { useState } from "react";
import { InstallProgressBar } from "@/components/InstallProgressBar";
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
import { useInstallProgress } from "@/lib/useInstallProgress";
import { cancelGamebananaInstall, SLOTS, type GbFile, type GbMod, type Slot } from "@/lib/tauri-commands";
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
  const { progress, speedBytesPerSec, percent } = useInstallProgress(install.isPending);

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
              <InstallProgressBar
                progress={progress}
                speedBytesPerSec={speedBytesPerSec}
                percent={percent}
              />
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
