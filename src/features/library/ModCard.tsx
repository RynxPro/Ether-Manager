import {
  AlertTriangle,
  Archive,
  Check,
  Folder,
  ImageOff,
  Package,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useState, type CSSProperties } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { MiddleTruncate } from "@/components/MiddleTruncate";
import { modArtSrc } from "@/lib/modArt";
import { tiltFor } from "@/lib/tilt";
import { MOD_FOLDER_MISSING_PREFIX, type Mod, type UpdateCheck } from "@/lib/tauri-commands";
import { EditModDialog } from "./EditModDialog";
import { UpdateModDialog } from "./UpdateModDialog";

interface ModCardProps {
  mod: Mod;
  updateCheck?: UpdateCheck;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
  onCheckUpdate: () => void;
  isToggling: boolean;
  isDeleting: boolean;
  isCheckingUpdate: boolean;
  /** Set for a few seconds after a check came back with nothing to install. Finding an update
   * rewrites this card on its own; finding none used to leave it identical to before the button
   * was pressed, which reads as the button having done nothing. */
  isConfirmedUpToDate: boolean;
  /** Opens this mod's GameBanana page. Absent for hand-added mods, which have no listing to
   * open — the preview then stays inert rather than offering a link to nothing. */
  onOpenDetail?: () => void;
  /** The most recent toggle/delete failure for this specific mod, if any — see SlotSection,
   * which matches the shared toggle/delete mutations' state against this card's own mod id. */
  error?: string;
  /** Offers the edit dialog — name, where it is filed, and a way to its folder. */
  isEditable?: boolean;
  /** What turning this mod on and off is called, on the surface rendering the card.
   *
   * A character wears one look at a time, so on a character page the verb is "Wear this" / "Take it
   * off"; a UI skin or a global tweak is not worn, so everywhere else it stays Enable/Disable.
   * Passed in rather than derived from the slot because it is the *page* that knows which
   * sentence it is in the middle of, not the mod. */
  verbs?: { enable: string; disable: string };
  /** Whether being switched on is worth marking loudly — the card straightening to true, taking
   * the accent ring, and holding its verb open instead of waiting for the cursor.
   *
   * Off by default, and the default is the important half. `CharacterCard` tried exactly this
   * ring for enabled and dropped it, because in a real library nearly every character has
   * something on, so the mark landed on nearly every card and marked nothing. The same trap
   * catches any surface that pools mods from more than one character: All Mods here shows 11 of
   * 23 on, which is half a grid of ringed cards.
   *
   * A character page is the one place the mark is rare — a character wears one look, so one card
   * in the shelf is on — and rare is the whole condition. Everywhere else, colour against grey
   * already answers "what is on?" without spending the app's one loud colour on it. */
  emphasiseEnabled?: boolean;
}

const DEFAULT_VERBS = { enable: "Enable", disable: "Disable" } as const;

/** A mod as a slap: printed board stuck to the wall slightly off true, a sunk well with the
 * preview in it, and the name printed on the stock below.
 *
 * Built from the same parts as `CharacterCard`, deliberately and part by part — the 2px edge,
 * the 5px print margin, the recessed `bg-art` well, the id-derived tilt, and the hover that
 * straightens the card and rings it in the accent. The two never share a grid, so the well is
 * 16:10 here rather than 3:4, because GameBanana previews are landscape without exception.
 * Everything else about the object is the same object.
 *
 * What this replaces is the reason it is worth reading. The card used to be a stack of bands
 * with a rule between each: preview, then a name band, then a full-width enable bar, then a row
 * of icon buttons, then a notice, then an error. Six horizontal strips, each announcing itself
 * with a border — which is a HUD panel, and it was the last piece of the pre-street look still
 * standing while the Library around it had moved on.
 *
 * So the bands are gone. The bottom of the card is `CharacterCard`'s bottom: bare stock carrying
 * a name and one machine line, and nothing else. The controls moved onto the art as small slaps
 * of paper that appear under the cursor — the same `bg-card shadow-slap` object the page header
 * and the nav use — because the app's rule is that anything you can press is paper stuck to the
 * wall, and a bar welded across a card is not that.
 *
 * The single machine line is what makes it hold. Everything the card might have to say — an
 * update waiting, a retirement, a missing folder, a failed toggle — takes that one line *in
 * place of* the variant rather than adding a row beneath it. A card can therefore never grow
 * taller than its neighbours, which is what kept the old grid ragged: two cards in a row would
 * be six bands and four, and the line of the shelf broke.
 *
 * Enabled mods keep their colour and disabled ones grey out, which makes "what am I wearing?"
 * answerable without reading anything. Colour returns on hover so a greyed shelf is still
 * browsable. That part the card already did, and it is the best thing about it. */
export function ModCard({
  mod,
  updateCheck,
  onToggle,
  onDelete,
  onCheckUpdate,
  isToggling,
  isDeleting,
  isCheckingUpdate,
  isConfirmedUpToDate,
  onOpenDetail,
  error,
  isEditable,
  verbs = DEFAULT_VERBS,
  emphasiseEnabled = false,
}: ModCardProps) {
  // GameBanana's remote preview, or the picture that came inside the archive for a mod imported
  // from outside the app. Resolved in one place so every surface showing a mod agrees.
  const artSrc = modArtSrc(mod);
  const hasUpdate = updateCheck?.status === "UpdateAvailable";
  // Retired by its author, or taken down by GameBanana. Independent of `hasUpdate` — a mod can
  // be both — and deliberately not shown as a problem with the mod itself, because it is not
  // one: what is on disk goes on working exactly as it did.
  const isRetired = updateCheck?.is_obsolete === true || updateCheck?.is_withdrawn === true;
  // Known before anything is attempted, now that the backend resolves it on every read — so the
  // card says so straight away instead of only after a toggle has failed. The error check stays
  // for the case where the folder disappears between a read and an action.
  const isFolderMissing =
    mod.files_missing || (error?.startsWith(MOD_FOLDER_MISSING_PREFIX) ?? false);
  // Only GameBanana-installed mods can be update-checked at all — a hand-added folder has no
  // remote counterpart to compare against, which is why its card shows no update control.
  const isFromGameBanana = mod.gamebanana_mod_id !== null;
  // No de-duplicating against the name any more: the name is the mod's and this is the file's,
  // so the two cannot say the same thing by construction.
  const variant = mod.variant_label?.trim() || null;

  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  // One stamp, worst first: a missing folder is a thing to fix, an update is a thing to do, a
  // retirement is only a thing to know. Two stamps on a 265px card would sit on top of one
  // another, and a mod really can be all three at once.
  let stamp: { label: string; tone: string } | null = null;
  if (isFolderMissing) {
    stamp = { label: "Missing", tone: "bg-destructive text-white" };
  } else if (hasUpdate) {
    stamp = { label: "Update", tone: "bg-primary text-primary-foreground" };
  } else if (isRetired) {
    stamp = {
      label: updateCheck?.is_withdrawn ? "Taken down" : "Retired",
      tone: "bg-muted-foreground text-card",
    };
  }

  // The one machine line, in the same worst-first order, replacing the variant rather than
  // adding to it.
  let line: string;
  let lineTone: string;
  if (isFolderMissing) {
    line = "Files missing — moved or deleted";
    lineTone = "text-destructive";
  } else if (error) {
    line = error;
    lineTone = "text-destructive";
  } else if (hasUpdate && updateCheck?.suggested_file_name) {
    line = `New file: ${updateCheck.suggested_file_name}`;
    lineTone = "text-card-foreground/80";
  } else if (hasUpdate) {
    line = "An update is waiting";
    lineTone = "text-card-foreground/80";
  } else if (isRetired) {
    line = updateCheck?.is_withdrawn ? "Removed from GameBanana" : "Retired by its author";
    lineTone = "text-card-foreground/60";
  } else {
    line = variant ?? (isFromGameBanana ? "GameBanana" : "Added by hand");
    lineTone = mod.enabled ? "text-card-foreground/80" : "text-card-foreground/40";
  }

  const verb = mod.enabled ? verbs.disable : verbs.enable;
  const verbLabel = isToggling ? (mod.enabled ? "Turning off…" : "Turning on…") : verb;

  const style = { "--tilt": `${tiltFor(mod.id)}deg` } as CSSProperties;
  // Only where being on is the rare state — see `emphasiseEnabled`.
  const isMarkedOn = mod.enabled && emphasiseEnabled;

  return (
    <div
      style={style}
      // Paper stuck to the wall, at the same angle rule the roster uses. Enabled straightens the
      // card and rings it in the accent, and it stays that way rather than only under the
      // cursor: a character wears exactly one mod, so in any shelf precisely one card is on and
      // the rest are off. `CharacterCard` tried the same ring and dropped it, correctly — nearly
      // every character has something enabled, so a ring there landed on nearly every card and
      // marked nothing. The condition it could not meet is the ordinary case here.
      className={`group/card relative flex flex-col border-2 bg-card p-[5px] pb-0 shadow-slap-lift transition-[rotate,translate,box-shadow] duration-200 hover:-translate-y-0.5 hover:rotate-0 hover:border-primary hover:ring-2 hover:ring-primary ${
        isMarkedOn
          ? "rotate-0 border-primary ring-2 ring-primary"
          : "rotate-[var(--tilt)] border-border"
      }`}
    >
      {/* 16:10, not the roster's 3:4: GameBanana previews are landscape without exception, so a
          portrait frame would crop most of every image away. */}
      <span className="relative block aspect-[16/10] w-full overflow-hidden bg-art">
        {artSrc ? (
          <img
            src={artSrc}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover transition-[filter,scale] duration-300 ${
              mod.enabled
                ? ""
                : "brightness-[.68] grayscale group-hover/card:scale-[1.04] group-hover/card:brightness-100 group-hover/card:grayscale-0"
            }`}
          />
        ) : (
          // Permanent for hand-added mods, which have no remote listing to take a picture from,
          // and the resting state for any GameBanana mod whose submission has no preview image.
          // A designed state, not a load failure, so it gets an icon and a label.
          <span
            className={`absolute inset-0 flex flex-col items-center justify-center gap-1 font-heading text-[11px] uppercase tracking-[0.12em] text-card-foreground/25 ${
              mod.enabled ? "" : "group-hover/card:text-card-foreground/40"
            }`}
          >
            <ImageOff className="h-6 w-6 opacity-70" />
            No preview
          </span>
        )}

        {/* Flush into the corner of the well rather than inset from it, the way the roster's
            does — a stamp hits the edge of the thing it is stamping. Signage, not display type:
            it is the app talking, and every other label the app puts on a control is Bebas. */}
        {stamp && (
          <span
            className={`absolute right-0 top-0 z-20 px-1.5 py-px font-sign text-[15px] uppercase tracking-[0.06em] ${stamp.tone}`}
          >
            {stamp.label}
          </span>
        )}

        {/* The preview opens the mod's page, the same gesture as in Browse — an installed mod is
            the same object you were looking at there, so pointing at its picture should mean the
            same thing. It fills the well and sits beneath the controls, which stop the click. */}
        {onOpenDetail && (
          <button
            type="button"
            onClick={onOpenDetail}
            aria-label={`View ${mod.display_name} on GameBanana`}
            title="View on GameBanana"
            className="absolute inset-0 z-10 cursor-pointer outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
          />
        )}

        {/* The verb, as a slap of paper laid on the art — the same object as the page header's
            buttons, which is the point: the app has one kind of pressable thing. It appears
            under the cursor, and stays put in the accent while the mod is on, so a shelf at rest
            is a row of pictures rather than a row of identical buttons. */}
        <button
          type="button"
          disabled={isToggling}
          onClick={() => onToggle(!mod.enabled)}
          className={`absolute bottom-2 left-2 z-30 inline-flex h-8 -rotate-1 items-center px-3 font-sign text-[17px] uppercase tracking-[0.1em] shadow-slap transition-opacity disabled:pointer-events-none ${
            mod.enabled ? "bg-primary text-primary-foreground" : "bg-card text-card-foreground"
          } ${
            isMarkedOn
              ? "opacity-100"
              : "opacity-0 focus-visible:opacity-100 group-hover/card:opacity-100"
          }`}
        >
          {verbLabel}
        </button>

        {/* The tools, as three more slaps. They were a bordered strip welded under the card;
            here they are objects lying on the art, and they exist only while you are pointing at
            it — which is the only time they can be used anyway. */}
        <span className="absolute bottom-2 right-2 z-30 flex gap-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/card:opacity-100">
          {hasUpdate && updateCheck ? (
            <UpdateModDialog
              key={`${updateCheck.mod_id}:${updateCheck.suggested_file_id ?? "none"}`}
              mod={mod}
              updateCheck={updateCheck}
            />
          ) : isFromGameBanana ? (
            // Widens into a labelled confirmation rather than swapping the glyph in place: a
            // tick where a refresh arrow was is easy to miss on a small target, and the word is
            // what actually answers "did that do anything?".
            isConfirmedUpToDate ? (
              <span
                className="flex h-8 rotate-1 items-center gap-1.5 bg-card px-2 font-sign text-[15px] uppercase tracking-[0.06em] text-success shadow-slap"
                role="status"
              >
                <Check className="h-3.5 w-3.5 shrink-0" />
                Up to date
              </span>
            ) : (
              <button
                type="button"
                disabled={isCheckingUpdate}
                onClick={onCheckUpdate}
                aria-label={`Check ${mod.display_name} for updates`}
                title="Check for updates"
                className="flex h-8 w-8 -rotate-1 items-center justify-center bg-card text-card-foreground shadow-slap hover:text-primary disabled:pointer-events-none"
              >
                <RefreshCw className={`h-4 w-4 ${isCheckingUpdate ? "animate-spin" : ""}`} />
              </button>
            )
          ) : null}

          {isEditable && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              aria-label={`Edit ${mod.display_name}`}
              title="Edit mod"
              className="flex h-8 w-8 rotate-1 items-center justify-center bg-card text-card-foreground shadow-slap hover:text-primary"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}

          <button
            type="button"
            disabled={isDeleting}
            onClick={() => setIsConfirmingDelete(true)}
            aria-label={`Delete ${mod.display_name}`}
            title="Delete mod"
            className="flex h-8 w-8 -rotate-1 items-center justify-center bg-card text-card-foreground shadow-slap hover:text-destructive disabled:pointer-events-none"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </span>
      </span>

      {/* Bare stock, exactly as the roster's card ends: a name, then one machine line. No rules,
          no bands, nothing that can grow. */}
      <span className="relative block px-0.5 pb-1.5 pt-1">
        <span className="flex items-center justify-between gap-1.5">
          {/* Middle-truncated: a hand-written name can outrun the card, and the tail is where a
              name says which of several similar things this is. */}
          <MiddleTruncate
            text={mod.display_name}
            className={`min-w-0 flex-1 font-heading text-[18px] uppercase leading-none ${
              mod.enabled ? "text-card-foreground" : "text-card-foreground/85"
            }`}
          />
          {/* At the end of the name line and so directly above the machine line — the mark and
              the sentence it is about form one column. A mark rather than a second sentence: the
              card has no room for one, and the line below already says what happened. */}
          {isFolderMissing || error ? (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
          ) : isRetired ? (
            <Archive className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : null}
        </span>
        <span className="mt-1 flex items-baseline justify-between gap-1.5">
          <span
            className={`min-w-0 truncate font-mono text-[11px] font-bold uppercase tracking-wide ${lineTone}`}
          >
            {line}
          </span>
          {/* Where the roster puts its counts: the right-hand end of the machine line. Where a
              mod came from is the one fact about it the app knows and the name never says. */}
          <span
            className="shrink-0 text-card-foreground/40"
            title={isFromGameBanana ? "From GameBanana" : "Added by hand"}
          >
            {isFromGameBanana ? <Package className="h-3 w-3" /> : <Folder className="h-3 w-3" />}
          </span>
        </span>
      </span>

      {/* Mounted only while open so it starts from the mod as it is now — reopening after a
          rename must not offer the name it had before. */}
      {isEditing && <EditModDialog mod={mod} onOpenChange={setIsEditing} />}

      {/* Asked here rather than at each caller, so the character page and All Mods cannot
          disagree about whether deleting is guarded. */}
      {isConfirmingDelete && (
        <ConfirmDialog
          title="Delete mod"
          description={
            <>
              <span className="text-foreground">{mod.display_name}</span> and its folder are
              removed from disk. Ether Manager cannot put them back
              {isFromGameBanana ? " — you would install it again from GameBanana." : "."}
            </>
          }
          confirmLabel={isDeleting ? "Deleting…" : "Delete"}
          isDestructive
          isPending={isDeleting}
          onConfirm={() => {
            setIsConfirmingDelete(false);
            onDelete();
          }}
          onOpenChange={setIsConfirmingDelete}
        />
      )}

      {/* The author's own words, and the only thing on the card allowed a second line. It is not
          an action and there is nothing to dismiss — the mod still works — so it hangs off the
          bottom of the stock as a torn-off note rather than joining the card's body. Rendered
          only when the notice actually says something: "retired" alone is already on the machine
          line above, and repeating it would spend two lines saying one thing. */}
      {isRetired && updateCheck?.withdrawal_notice?.trim() && (
        <p className="relative -mx-[5px] flex items-start gap-1.5 bg-muted px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
          <Archive className="mt-px h-3.5 w-3.5 shrink-0" />
          <span className="line-clamp-2">{updateCheck.withdrawal_notice.trim()}</span>
        </p>
      )}

      {/* The one case that earns a control of its own: the files are gone, so every other verb on
          this card would fail, and the only useful move left is to forget it. */}
      {isFolderMissing && (
        <button
          type="button"
          disabled={isDeleting}
          onClick={onDelete}
          className="relative -mx-[5px] bg-destructive/15 px-2 py-1.5 text-center font-sign text-[15px] uppercase tracking-[0.1em] text-destructive transition-colors hover:bg-destructive hover:text-white disabled:pointer-events-none"
        >
          Remove from library
        </button>
      )}
    </div>
  );
}
