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
  const [query, setQuery] = useState("");
  const rename = useRenameMod();
  const move = useMoveMod();
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

  function moveTo(characterId: string) {
    if (characterId === mod.character_id) return;
    move.mutate({ modId: mod.id, characterId });
  }

  const trimmedName = displayName.trim();
  const isNameChanged = trimmedName.length > 0 && trimmedName !== mod.display_name;

  function handleRename() {
    if (!isNameChanged) return;
    rename.mutate({ modId: mod.id, displayName: trimmedName });
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
            <div className="flex gap-2">
              <Input
                id="edit-mod-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleRename();
                  }
                }}
                disabled={rename.isPending}
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                disabled={!isNameChanged || rename.isPending}
                onClick={handleRename}
              >
                {rename.isPending ? "Saving…" : "Rename"}
              </Button>
            </div>
            {/* The variant is the installer's record of which file this came from, and renaming
                does not change which file is on disk — so it stays put, as a reminder of what
                the mod actually is while its name is being rewritten. */}
            {mod.variant_label && (
              <p className="text-[11px] text-muted-foreground">
                From <span className="text-foreground">{mod.variant_label}</span>
              </p>
            )}
            {rename.isError && (
              <p className="text-[11px] text-destructive">{String(rename.error)}</p>
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
              disabled={move.isPending}
            />

            <div className="flex gap-1.5">
              {PSEUDO_DESTINATIONS.map(({ id, label }) => (
                <Button
                  key={id}
                  type="button"
                  variant={mod.character_id === id ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  disabled={move.isPending}
                  onClick={() => moveTo(id)}
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
                  const isCurrent = character.id === mod.character_id;
                  return (
                    <button
                      key={character.id}
                      type="button"
                      disabled={move.isPending}
                      aria-current={isCurrent}
                      onClick={() => moveTo(character.id)}
                      className={`flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-secondary disabled:opacity-50 ${
                        isCurrent ? "text-primary" : "text-foreground"
                      }`}
                    >
                      {character.name}
                      {isCurrent && (
                        <span className="font-heading text-[10px] uppercase tracking-[0.1em]">
                          Current
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {move.isPending ? "Moving the files…" : "Moves the mod's folder to match."}
            </p>
            {move.isError && <p className="text-[11px] text-destructive">{String(move.error)}</p>}
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

        <DialogFooter className="mx-0 mb-0 border-t border-border bg-background px-4 py-3">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Done
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
