import { useState } from "react";
import { useExternalLink } from "@/lib/useExternalLink";
import { XIcon } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
function guessInstallTarget(
  detail: GbModDetail,
  realCharacters: Character[],
): string {
  if (detail.category.name === "UI") return UI_CHARACTER_ID;
  if (detail.category.name === "Other/Misc") return MISC_CHARACTER_ID;
  return (
    realCharacters.find((character) => character.name === detail.category.name)
      ?.id ?? ""
  );
}

export function InstallConfirmDialog({
  detail,
  file,
  onOpenChange,
  onInstalled,
}: InstallConfirmDialogProps) {
  const { data: characters } = useCharacters();
  const externalLink = useExternalLink();
  const realCharacters = (characters ?? []).filter(
    (character) =>
      character.id !== UI_CHARACTER_ID && character.id !== MISC_CHARACTER_ID,
  );
  const guessedCharacterId = guessInstallTarget(detail, realCharacters);

  const [characterId, setCharacterId] = useState(guessedCharacterId);
  // The mod's own name, plainly. Which *file* of the mod this is gets recorded separately as
  // the row's variant label, so the name no longer has to carry both facts — which is what used
  // to make it long enough to need truncating and repetitive enough to need de-duplicating.
  const [displayName, setDisplayName] = useState(detail.name);
  const enqueue = useEnqueueDownload();

  const thumbnail = detail.preview_media.images[0];
  const thumbnailUrl = thumbnail
    ? `${thumbnail.base_url}/${thumbnail.file_220 ?? thumbnail.file}`
    : null;

  // Where it lands, in the library's own words rather than as a filesystem path: the folder the
  // installer actually creates is slugged and de-duplicated backend-side, so a path printed here
  // would eventually be a confident lie. Character plus slot is the decision being made anyway.
  const target = (characters ?? []).find(
    (character) => character.id === characterId,
  );
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

  // Two voices, used the way the rest of the app uses them: the small caption that names a
  // region is machine type, and the value under it is either machine type (a fact) or the
  // display face (a decision). Held here so the docket cannot drift between its own halves.
  const CAPTION =
    "font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground";

  // Every row in the character list is a thing you press, so it is signage, like the nav and
  // the chips and every button in the app — not the primitive's 14px Geist. Highlighted takes
  // the accent fill rather than a grey rounded bar, which is how "chosen" is said everywhere
  // else here; `focus` and `data-highlighted` are both covered because Radix moves DOM focus on
  // pointer and sets the attribute on keyboard.
  const OPTION =
    "rounded-none px-2 py-1.5 pr-8 font-sign text-[16px] uppercase tracking-[0.08em] text-card-foreground [&_svg]:text-primary focus:bg-primary focus:text-primary-foreground focus:[&_svg]:text-primary-foreground data-[highlighted]:bg-primary data-[highlighted]:text-primary-foreground data-[highlighted]:[&_svg]:text-primary-foreground";

  return (
    <Dialog open onOpenChange={(next) => !next && onOpenChange(false)}>
      {/* Nested inside this dialog on purpose: a requirement's link is reached from in here,
          and sending the confirmation somewhere else in the tree would close this one to ask
          about a link you have not decided to follow yet. */}
      {externalLink.dialog}
      <DialogContent
        showCloseButton={false}
        // Paper on the wall, like everything else you can act on: 2px edge, square, the hard
        // slap shadow, and no padding of its own so each band reaches the edges.
        //
        // 600px rather than 460. The docket runs left-to-right — goods, arrow, destination —
        // and at 460 the two halves of that sentence were too narrow to hold a file name and a
        // character name without both truncating, which is the one thing this dialog exists to
        // show you.
        className="gap-0 border-2 border-border bg-card p-0 shadow-slap-lift sm:max-w-[600px]"
      >
        <form onSubmit={handleSubmit} className="min-w-0">
          {/* Machine type, not a title. It says which of the app's operations this is, the way
              the mod page labels its regions — where the old dialog spent Anton, the page-title
              face, on an 11px caption inside a solid red bar. The accent is needed further down
              for the thing you press. */}
          <DialogHeader className="flex-row items-center justify-between border-b-2 border-border px-4 py-2.5">
            <DialogTitle className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Install &middot; consignment
            </DialogTitle>
            <DialogClose
              className="flex h-6 w-6 shrink-0 items-center justify-center bg-background text-card-foreground shadow-slap transition-[translate] duration-200 hover:-translate-y-px"
              aria-label="Close"
            >
              <XIcon className="h-3.5 w-3.5" />
            </DialogClose>
          </DialogHeader>

          {/* What you are installing, with its picture. Tilted and slapped, because it is a
              print of the thing rather than a thumbnail in a slot. */}
          <div className="flex items-center gap-3.5 p-3.5">
            <div className="h-[112px] w-[168px] shrink-0 rotate-[0.7deg] border-2 border-border bg-art p-1 shadow-slap">
              {/* Not shielded, matching Bookmarks: reaching the install dialog is an active,
                  already-informed choice, and a reveal button in a 168px box helps nobody. */}
              {thumbnailUrl ? (
                <img
                  src={thumbnailUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center font-heading text-2xl text-muted-foreground/40">
                  {detail.name.charAt(0)}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              {/* Wraps rather than truncating, unlike every other name in this dialog. This is
                  the one you are being asked to confirm, and GameBanana names are long. Two
                  lines hold nearly all of them without letting the dialog grow without limit;
                  `break-words` is for the ones that arrive as a single unbroken run. */}
              <p
                className="line-clamp-2 break-words font-heading text-[25px] uppercase leading-[0.98] tracking-[0.005em] text-card-foreground"
                title={detail.name}
              >
                {detail.name}
              </p>
              <p className="mt-2 truncate font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {detail.submitter.name}
              </p>
            </div>
          </div>

          {/* The sentence the dialog exists to say: this file goes on that shelf. The arrow is
              the whole idea, and the destination is the heavier half on purpose — it carries
              the display face because it is the decision, while the file carries machine type
              because it is a fact you are only confirming.

              A dozen archives named v72.zip and v73.zip is normal, so the file's own name is
              here rather than left to the list you came from. */}
          <div className="mx-3.5 flex items-stretch bg-background shadow-slap">
            <div className="min-w-0 flex-1 px-3 py-2.5">
              <span className={CAPTION}>The file</span>
              <p
                className="mt-1.5 truncate font-mono text-[12px] font-bold text-card-foreground"
                title={file.file_name}
              >
                {file.file_name}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                {file.version && (
                  <span className="whitespace-nowrap border border-border px-1 text-card-foreground">
                    v{file.version}
                  </span>
                )}
                <span className="whitespace-nowrap">
                  {formatBytes(file.file_size)}
                </span>
              </p>
            </div>
            <div
              aria-hidden
              className="flex w-[46px] shrink-0 items-center justify-center font-heading text-[26px] leading-none text-primary"
            >
              &rarr;
            </div>
            <div className="min-w-0 flex-1 px-3 py-2.5">
              <span className={CAPTION} id="install-character-label">
                Lands under
              </span>
              <Select
                value={characterId}
                onValueChange={setCharacterId}
                disabled={enqueue.isPending}
              >
                {/* Paper laid on the card, in the display face at the size the mod page gives a
                    card name — the one thing on this dialog that can be wrong is the largest
                    thing on it. `border-0` beats the primitive's own edge; the slap replaces it. */}
                <SelectTrigger
                  id="install-character"
                  aria-labelledby="install-character-label install-character"
                  className="mt-1.5 h-auto w-full border-0 bg-card px-2.5 py-2 font-heading text-[19px] uppercase leading-tight tracking-[0.005em] text-card-foreground shadow-slap [&>svg]:text-primary [&>svg]:opacity-100"
                >
                  {/* `SelectValue` with its own children, not a plain span. Radix renders the
                      chosen item's label by portalling it into this node, and that gives only
                      the character's name — the slot is half the answer to "where does this
                      land", so `destination` says the whole sentence instead.
                      
                      It has to stay a `SelectValue` even so: the component registers itself as
                      the trigger's value node, and `position="item-aligned"` positions the list
                      by aligning the selected row over that node. Swapping it for a span left
                      the node null and the whole list rendered at (0, viewport bottom), open but
                      completely off-screen. */}
                  <SelectValue placeholder="Pick one" className="min-w-0 truncate">
                    {destination}
                  </SelectValue>
                </SelectTrigger>
                {/* The panel is paper too. Scoped here rather than changed in the shared
                    primitive, which Settings and the rest of the app still use. */}
                <SelectContent
                  position="popper"
                  className="max-h-80 border-2 border-border bg-card shadow-slap-lift ring-0 [&_[data-slot=select-scroll-down-button]]:bg-card [&_[data-slot=select-scroll-down-button]]:text-primary [&_[data-slot=select-scroll-up-button]]:bg-card [&_[data-slot=select-scroll-up-button]]:text-primary"
                >
                  <SelectGroup>
                    <SelectLabel className={CAPTION}>General</SelectLabel>
                    <SelectItem className={OPTION} value={UI_CHARACTER_ID}>
                      UI
                    </SelectItem>
                    <SelectItem className={OPTION} value={MISC_CHARACTER_ID}>
                      Misc
                    </SelectItem>
                  </SelectGroup>
                  <SelectSeparator className="h-0.5 bg-border" />
                  <SelectGroup>
                    <SelectLabel className={CAPTION}>
                      Character (Skin)
                    </SelectLabel>
                    {realCharacters.map((character) => (
                      <SelectItem
                        key={character.id}
                        className={OPTION}
                        value={character.id}
                      >
                        {character.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* The hedge sits under the half it is about and states the result rather than the
              caveat. It was two lines of apology above every control in the old dialog. */}
          <p className="mt-1.5 px-3.5 text-right font-mono text-[9.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
            {destination
              ? "Guessed from the category — change it if that is wrong"
              : "Pick a character, or UI / Misc"}
          </p>

          <div className="px-3.5 pt-3">
            <label htmlFor="install-display-name" className={CAPTION}>
              Call it
            </label>
            {/* The app's own field: wall colour, slapped, machine type — you are typing a
                value, and every other value in this dialog is set in Courier. */}
            <input
              id="install-display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              disabled={enqueue.isPending}
              required
              className="mt-1.5 block w-full bg-background px-2.5 py-2 font-mono text-[13px] text-foreground shadow-slap outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
            />
          </div>

          {/* Worst first, and each one is the same object as the mod page's requirements
              notice: a bordered block with a stamp hanging off its corner. Bordered rather than
              filled, because these are conditions rather than controls — nothing in any of them
              is pressable except the links the author supplied. */}
          {warning && (
            <div className="relative mx-3.5 mt-3.5 border-2 border-destructive px-3 py-2.5">
              <span className="absolute -top-3 right-2 bg-destructive px-2 py-0.5 font-sign text-[13px] uppercase tracking-[0.1em] text-white shadow-slap">
                Flagged
              </span>
              <p className="font-mono text-[10.5px] font-bold uppercase leading-relaxed tracking-[0.05em] text-card-foreground">
                GameBanana flagged this file: {warning}
              </p>
            </div>
          )}

          {/* A mod is data — meshes, textures, .ini files — so a program inside one is worth
              stopping on even when it is legitimate, and sometimes it is: a few mods ship a
              genuine fixer utility. This names the files rather than saying "contains an
              executable", because the name is what lets you tell a fixer from a surprise.

              It informs rather than blocks. Nothing here runs on install — the archive is
              unpacked into the mods folder and that is all — so the risk arrives later, if you
              go and run it. Refusing the install would be theatre; saying what is in there,
              before it is on disk, is the part that actually helps. */}
          {executables.length > 0 && (
            <div className="relative mx-3.5 mt-3.5 border-2 border-destructive px-3 py-2.5">
              <span className="absolute -top-3 right-2 bg-destructive px-2 py-0.5 font-sign text-[13px] uppercase tracking-[0.1em] text-white shadow-slap">
                Contains {executables.length === 1 ? "a program" : "programs"}
              </span>
              <ul className="flex flex-wrap gap-1.5">
                {executables.map((path) => (
                  <li
                    key={path}
                    className="max-w-full truncate bg-background px-2 py-0.5 font-mono text-[10.5px] font-bold text-card-foreground"
                    title={path}
                  >
                    {path}
                  </li>
                ))}
              </ul>
              <p className="mt-2 font-mono text-[9.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                Installing only unpacks{" "}
                {executables.length === 1 ? "it" : "them"} &mdash; nothing is run
              </p>
            </div>
          )}

          {/* Before the install, not after, because that is the only moment it can save you
              anything. The app cannot check any of these — the same requirement is written
              "XXMI", "xxmi" and "XXMI Launcher" across three mods — so this passes on the
              author's own words and gets out of the way.

              Not styled as a warning. Most entries are the loader you already have, and
              colouring the routine case red teaches people to ignore it by the third install.
              What it is really for is the other kind: "Character Quality -> High" is a graphics
              setting that makes a mod silently do nothing when it is wrong, with no error
              anywhere and nothing to search for. */}
          {detail.requirements.length > 0 && (
            <div className="relative mx-3.5 mt-3.5 border-2 border-primary px-3 py-2.5">
              <span className="absolute -top-3 right-2 bg-primary px-2 py-0.5 font-sign text-[13px] uppercase tracking-[0.1em] text-primary-foreground shadow-slap">
                Author says
              </span>
              <ul className="flex flex-wrap gap-1.5">
                {detail.requirements.map(({ name, url }) => (
                  <li key={`${name}:${url ?? ""}`}>
                    {/* The opener plugin, not an anchor: `target="_blank"` does not navigate
                        inside a WebView2, so a plain link here would simply do nothing. */}
                    {url ? (
                      <button
                        type="button"
                        onClick={() => externalLink.requestOpen(url, "author")}
                        className="bg-background px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.05em] text-card-foreground transition-colors hover:text-primary"
                      >
                        {name} &rarr;
                      </button>
                    ) : (
                      // No link means the author named a game setting rather than a download,
                      // so it gets no affordance to press.
                      <span className="bg-background px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.05em] text-card-foreground">
                        {name}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* No progress bar here anymore. The download outlives this dialog, so showing its
              progress inside a box the user is about to close would be claiming that closing
              matters — it does not, and the Downloads page is where a running install actually
              lives. This error is only about failing to *queue* one. */}
          {enqueue.isError && (
            <p className="mx-3.5 mt-3.5 border-2 border-destructive bg-card px-3 py-2 font-mono text-[10.5px] font-bold text-destructive">
              {String(enqueue.error)}
            </p>
          )}

          {/* `mx-0 mb-0` cancels the base footer's `-mx-4 -mb-4`, which exists to bleed into
              `DialogContent`'s default padding. This content has none, so those negatives lifted
              the whole footer clean out of the panel. */}
          <DialogFooter className="mx-0 mb-0 mt-3.5 items-center border-t-2 border-border bg-background px-3.5 py-3 sm:justify-between">
            {/* Annotation, so it takes the marker: it is the app leaning in to say what happens
                next, not a caption naming a region. Says where the work goes, because the
                dialog closing on Install would otherwise look like nothing happened until the
                mod appeared minutes later. */}
            <span className="-rotate-[1.2deg] font-hand text-[13px] text-primary">
              runs in the background &rarr;
            </span>
            <button
              type="submit"
              disabled={!characterId || enqueue.isPending}
              className="h-10 shrink-0 bg-primary px-6 font-sign text-[20px] uppercase tracking-[0.1em] text-primary-foreground shadow-slap transition-[translate] duration-200 hover:-translate-y-px disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
            >
              {enqueue.isPending ? "Queueing…" : "Install"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
