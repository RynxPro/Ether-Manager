import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { FolderOpen, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import { MISC_CHARACTER_ID, UI_CHARACTER_ID, type Mod } from "@/lib/tauri-commands";
import { useCharacters, useMoveMod, useRenameMod } from "./hooks";

/** The two destinations that are not roster members. Kept out of the search because nobody
 * looks for "Misc" by typing it, and they are where library-wide mods go. */
const PSEUDO_DESTINATIONS = [
  { id: UI_CHARACTER_ID, label: "UI" },
  { id: MISC_CHARACTER_ID, label: "Misc" },
] as const;

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
  const { data: characters } = useCharacters();
  const realCharacters = (characters ?? []).filter(
    (character) => character.id !== UI_CHARACTER_ID && character.id !== MISC_CHARACTER_ID,
  );

  const [displayName, setDisplayName] = useState(mod.display_name);
  // Where the mod *would* go. Staged rather than applied, so picking a character is a decision
  // you can still take back — a move relocates a folder on disk, and the only honest way to
  // offer Cancel is to not have moved anything yet.
  const [characterId, setCharacterId] = useState(mod.character_id);
  const [query, setQuery] = useState("");
  const rename = useRenameMod();
  const move = useMoveMod();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);

  // The roster is in game order, so the character a mod is filed under is usually somewhere
  // below the fold — opening on "Von Lycaon" when the mod is Nicole's asks you to scroll just to
  // learn where you already are. Runs once: after that the scroll position is the user's.
  useEffect(() => {
    // A frame late on purpose: the dialog mounts into a portal and animates in, so on the
    // effect's own tick the list has no layout yet and scrolling it is a no-op.
    const frame = requestAnimationFrame(() => {
      const list = listRef.current;
      const current = list?.querySelector<HTMLElement>('[aria-current="true"]');
      if (!list || !current) return;
      list.scrollTop = current.offsetTop - list.clientHeight / 2 + current.offsetHeight / 2;
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? realCharacters.filter((character) => character.name.toLowerCase().includes(needle))
    : realCharacters;

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
            {/* A dropdown of sixty characters is a scroll, not a choice. Typing two letters
                gets there instead, and UI / Misc stay out of the filter entirely — they are not
                roster members, and they are common enough destinations to be worth a permanent
                pair of buttons rather than something to search for. */}
            <Input
              id="edit-mod-location"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search characters…"
              aria-label="Search characters"
              disabled={isSaving}
            />

            <div className="flex gap-1.5">
              {PSEUDO_DESTINATIONS.map(({ id, label }) => (
                <Button
                  key={id}
                  type="button"
                  variant={characterId === id ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  disabled={isSaving}
                  onClick={() => setCharacterId(id)}
                >
                  {label}
                </Button>
              ))}
            </div>

            {/* Fixed height rather than growing with the results, so the dialog does not jump
                about as you type. Tall enough for six rows, which is where a search stops being
                a list you scan and starts being one you scroll. */}
            <div
              ref={listRef}
              // `relative` so a row's offsetTop is measured against this list rather than
              // against the dialog, which is the nearest positioned ancestor otherwise.
              className="relative h-[168px] overflow-y-auto border border-border bg-background"
            >
              {matches.length === 0 ? (
                <p className="px-2.5 py-2 text-[11px] text-muted-foreground">
                  No character matches “{query}”.
                </p>
              ) : (
                matches.map((character) => {
                  const isCurrent = character.id === characterId;
                  return (
                    <button
                      key={character.id}
                      type="button"
                      disabled={isSaving}
                      aria-current={isCurrent}
                      onClick={() => setCharacterId(character.id)}
                      className={`flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-secondary disabled:opacity-50 ${
                        isCurrent ? "text-primary" : "text-foreground"
                      }`}
                    >
                      {character.name}
                      {isCurrent && (
                        <span className="font-heading text-[10px] uppercase tracking-[0.1em]">
                          {isLocationChanged ? "Selected" : "Current"}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
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
