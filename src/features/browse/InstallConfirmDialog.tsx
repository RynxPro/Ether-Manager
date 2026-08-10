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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCharacters } from "@/features/library/hooks";
import { useInstallProgress } from "@/lib/useInstallProgress";
import {
  cancelGamebananaInstall,
  MISC_CHARACTER_ID,
  UI_CHARACTER_ID,
  type Character,
  type GbFile,
  type GbModDetail,
  type Slot,
} from "@/lib/tauri-commands";
import { useInstallFromGamebanana } from "./hooks";

interface InstallConfirmDialogProps {
  /** Always a real, freshly fetched detail — never the placeholder `GbMod` Bookmarks uses to
   * open `ModDetailPage`, so `detail.category` is reliable regardless of where this dialog
   * was opened from (Browse or Bookmarks). */
  detail: GbModDetail;
  file: GbFile;
  onOpenChange: (open: boolean) => void;
  onInstalled: () => void;
}

/** The only real fork left: a real character (always files as that character's Character
 * Skin — GameBanana has no per-character UI subcategory to further split on) or the global
 * UI/Misc buckets (no character involved at all). */
function slotForTarget(characterId: string): Slot {
  if (characterId === UI_CHARACTER_ID) return "Ui";
  if (characterId === MISC_CHARACTER_ID) return "Misc";
  return "CharacterSkin";
}

/** `detail.category` is GameBanana's most specific category for this mod — confirmed live it's
 * literally `"UI"`/`"Other/Misc"` for mods with no further subcategory, and a character's own
 * name for mods filed under "Character Skins" (which always has one). One check covers all
 * three cases, from data that's always live-fetched regardless of whether this dialog was
 * opened from Browse or Bookmarks. */
function guessInstallTarget(detail: GbModDetail, realCharacters: Character[]): string {
  if (detail.category.name === "UI") return UI_CHARACTER_ID;
  if (detail.category.name === "Other/Misc") return MISC_CHARACTER_ID;
  return realCharacters.find((character) => character.name === detail.category.name)?.id ?? "";
}

export function InstallConfirmDialog({
  detail,
  file,
  onOpenChange,
  onInstalled,
}: InstallConfirmDialogProps) {
  const { data: characters } = useCharacters();
  const realCharacters = (characters ?? []).filter(
    (character) => character.id !== UI_CHARACTER_ID && character.id !== MISC_CHARACTER_ID,
  );
  const guessedCharacterId = guessInstallTarget(detail, realCharacters);

  const [characterId, setCharacterId] = useState(guessedCharacterId);
  const [displayName, setDisplayName] = useState(detail.name);
  const install = useInstallFromGamebanana(characterId);
  const { progress, speedBytesPerSec, percent } = useInstallProgress(install.isPending);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!characterId) return;
    install.mutate(
      {
        gamebananaModId: detail.id,
        gamebananaFileId: file.id,
        characterId,
        slot: slotForTarget(characterId),
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
            <DialogTitle>Install {detail.name}</DialogTitle>
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
              <Label htmlFor="install-character">Install to</Label>
              <Select
                value={characterId}
                onValueChange={setCharacterId}
                disabled={install.isPending}
              >
                <SelectTrigger id="install-character">
                  <SelectValue placeholder="Select a character, or UI / Misc" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>General</SelectLabel>
                    <SelectItem value={UI_CHARACTER_ID}>UI</SelectItem>
                    <SelectItem value={MISC_CHARACTER_ID}>Misc</SelectItem>
                  </SelectGroup>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>Character (Skin)</SelectLabel>
                    {realCharacters.map((character) => (
                      <SelectItem key={character.id} value={character.id}>
                        {character.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
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
