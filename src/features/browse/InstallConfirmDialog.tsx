import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, FileWarning, XIcon } from "lucide-react";
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
import { executablesIn, fileScan } from "@/lib/fileScan";
import { formatBytes } from "@/lib/format";
import { suggestedDisplayName } from "@/lib/installName";
import {
  MISC_CHARACTER_ID,
  SLOT_LABELS,
  UI_CHARACTER_ID,
  type Character,
  type GbFile,
  type GbModDetail,
  type Slot,
} from "@/lib/tauri-commands";
import { useEnqueueDownload } from "./hooks";

/** Eridu's signature corner. Inline because a clip path cannot come from a border radius. */
const CUT_CORNER = {
  clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%)",
} as const;

/** GameBanana's scan result, but only when it is worth saying. Printing "clean" on every
 * install would be noise nobody reads, which is exactly how a real warning gets missed.
 *
 * The wording comes from the shared `fileScan`, so this dialog and the file list cannot drift
 * into describing the same file two different ways. */
function scanWarning(file: GbFile): string | null {
  const scan = fileScan(file);
  if (scan.verdict === "clean") return null;
  return scan.detail ?? scan.label;
}

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
  const [displayName, setDisplayName] = useState(() =>
    suggestedDisplayName(detail, file),
  );
  const enqueue = useEnqueueDownload();

  const thumbnail = detail.preview_media.images[0];
  const thumbnailUrl = thumbnail
    ? `${thumbnail.base_url}/${thumbnail.file_220 ?? thumbnail.file}`
    : null;

  // Where it lands, in the library's own words rather than as a filesystem path: the folder the
  // installer actually creates is slugged and de-duplicated backend-side, so a path printed here
  // would eventually be a confident lie. Character plus slot is the decision being made anyway.
  const target = (characters ?? []).find((character) => character.id === characterId);
  const destination = target
    ? target.id === UI_CHARACTER_ID || target.id === MISC_CHARACTER_ID
      ? SLOT_LABELS[slotForTarget(target.id)]
      : `${target.name} · ${SLOT_LABELS.CharacterSkin}`
    : null;
  const warning = scanWarning(file);
  const executables = executablesIn(file);

  /** Queues the install and gets out of the way. The download is owned by Rust from here, so
   * closing immediately costs nothing — and where this dialog used to hold the only copy of a
   * failure, the queue now has a row for it. */
  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!characterId) return;
    enqueue.mutate(
      {
        gamebananaModId: detail.id,
        gamebananaFileId: file.id,
        modName: detail.name,
        fileName: file.file_name,
        thumbnailUrl: thumbnailUrl,
        characterId,
        slot: slotForTarget(characterId),
        displayName,
      },
      { onSuccess: onInstalled },
    );
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onOpenChange(false)}>
      <DialogContent
        showCloseButton={false}
        // Eridu's panel shape rather than shadcn's default card: 2px border, square, cut corner,
        // and no padding of its own so each band can reach the edges the way the mod detail
        // page's panels do. Wider than `max-w-sm` because this now confirms a file as well as
        // asking a question.
        style={CUT_CORNER}
        className="gap-0 border-2 border-border bg-card p-0 sm:max-w-[460px]"
      >
        <form onSubmit={handleSubmit}>
          {/* A solid accent bar, matching the DETAILS and FILES panels this dialog opens from —
              it gives the panel a hard edge to start from and names the action once, so the
              mod's own name is free to sit with its artwork below instead of being squeezed
              into a title. */}
          <DialogHeader className="flex-row items-center justify-between bg-primary px-4 py-2.5 text-primary-foreground">
            <DialogTitle className="font-heading text-[11px] font-semibold uppercase tracking-[0.16em]">
              Install mod
            </DialogTitle>
            <DialogClose
              className="-my-1 -mr-1 p-1 transition-opacity hover:opacity-60"
              aria-label="Close"
            >
              <XIcon className="h-3.5 w-3.5" />
            </DialogClose>
          </DialogHeader>

          {/* What you are installing. The old dialog was text only, on the one screen in this
              app where the picture is the entire reason you got here. */}
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <div className="h-[54px] w-[72px] shrink-0 overflow-hidden border border-border bg-secondary">
              {/* Not shielded, matching Bookmarks: reaching the install dialog is an active,
                  already-informed choice, and a reveal button in a 72px box helps nobody. */}
              {thumbnailUrl ? (
                <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center font-heading text-lg text-muted-foreground/40">
                  {detail.name.charAt(0)}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p
                className="truncate font-heading text-sm uppercase tracking-[0.04em]"
                title={detail.name}
              >
                {detail.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                by {detail.submitter.name}
              </p>
            </div>
          </div>

          {/* Which file. A mod routinely ships a dozen archives — the detail page's list is full
              of `v72.zip`, `v73.zip` — and the dialog used to name only the mod, so the one thing
              you could still get wrong was the one thing it did not show. */}
          <div className="border-b border-border px-4 py-3">
            <p className="mb-1 font-heading text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
              File
            </p>
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate text-xs text-foreground" title={file.file_name}>
                {file.file_name}
              </p>
              <span className="flex shrink-0 items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
                {file.version && (
                  <span className="border border-border px-1 py-px font-heading tracking-[0.06em]">
                    v{file.version}
                  </span>
                )}
                {formatBytes(file.file_size)}
              </span>
            </div>
            {warning && (
              <p className="mt-1.5 text-[11px] text-destructive">
                GameBanana flagged this file: {warning}
              </p>
            )}
          </div>

          {/* A mod is data — meshes, textures, .ini files — so a program inside one is worth
              stopping on even when it is legitimate, and sometimes it is: a few mods ship a
              genuine fixer utility. This names the files rather than saying "contains an
              executable", because the name is what lets you tell a fixer from a surprise, and
              because the alarm is only useful while it stays rare enough to read.

              It informs rather than blocks. Nothing here runs on install — the archive is
              unpacked into the mods folder and that is all — so the risk arrives later, if you
              go and run it. Refusing the install would be theatre; saying what is in there,
              before it is on disk, is the part that actually helps. */}
          {executables.length > 0 && (
            <div className="border-b border-border bg-destructive/10 px-4 py-3">
              <p className="flex items-center gap-1.5 font-heading text-[10px] uppercase tracking-[0.12em] text-destructive">
                <FileWarning className="h-3.5 w-3.5 shrink-0" />
                Contains {executables.length === 1 ? "a program" : "programs"}
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {executables.map((path) => (
                  <li
                    key={path}
                    className="truncate font-mono text-[11px] text-foreground"
                    title={path}
                  >
                    {path}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Installing only unpacks {executables.length === 1 ? "it" : "them"} into your mods
                folder — nothing is run. Mods do not normally need to, so open{" "}
                {executables.length === 1 ? "it" : "them"} only if you know what it does.
              </p>
            </div>
          )}

          <div className="grid gap-3.5 px-4 py-4">
            <div className="grid gap-1.5">
              <Label
                htmlFor="install-display-name"
                className="font-heading text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70"
              >
                Display name
              </Label>
              <Input
                id="install-display-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                disabled={enqueue.isPending}
                required
              />
              {/* Only when the mod has more than one file, because that is the only time the
                  suggestion is not simply the mod's name — and the only time it needs
                  explaining. Naming it after the file is what stops two files from one mod
                  arriving in the library as two rows with the same name. */}
              {detail.files.length > 1 && (
                <p className="text-[11px] text-muted-foreground">
                  Named after the file, so another file from this mod does not land under the
                  same name.
                </p>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label
                htmlFor="install-character"
                className="font-heading text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70"
              >
                Install to
              </Label>
              <Select
                value={characterId}
                onValueChange={setCharacterId}
                disabled={enqueue.isPending}
              >
                <SelectTrigger id="install-character" className="w-full">
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
              {/* The hedge the old dialog led with, moved to where the doubt actually is. It was
                  two lines of apology above every control; here it sits under the one field it
                  is about, and it states the result rather than the caveat. */}
              <p className="text-[11px] text-muted-foreground">
                {destination ? (
                  <>
                    Files under <span className="text-foreground">{destination}</span>. Guessed
                    from the mod&apos;s category — change it if that is wrong.
                  </>
                ) : (
                  "Pick a character, or UI / Misc."
                )}
              </p>
            </div>

            {/* No progress bar here anymore. The download outlives this dialog, so showing its
                progress inside a box the user is about to close would be claiming that closing
                matters — it does not, and the Downloads page is where a running install actually
                lives. This error is only about failing to *queue* one. */}
            {enqueue.isError && <p className="text-sm text-destructive">{String(enqueue.error)}</p>}
          </div>

          {/* `mx-0 mb-0` cancels the base footer's `-mx-4 -mb-4`, which exists to bleed into
              `DialogContent`'s default padding. This content has none, so those negatives lifted
              the whole footer clean out of the panel. */}
          <DialogFooter className="mx-0 mb-0 items-center border-t border-border bg-background px-4 py-3 sm:justify-between">
            {/* Says where the work goes, because the dialog closing on Install would otherwise
                look like nothing happened until the mod appeared minutes later. */}
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <ArrowRight className="h-3 w-3" />
              Downloads in the background
            </span>
            <Button type="submit" disabled={!characterId || enqueue.isPending}>
              {enqueue.isPending ? "Queueing…" : "Install"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
