import {
  AlertTriangle,
  Check,
  ExternalLink,
  Folder,
  ImageOff,
  Package,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { MiddleTruncate } from "@/components/MiddleTruncate";
import { Button } from "@/components/ui/button";
import { modArtSrc } from "@/lib/modArt";
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
}

/** A mod as a card rather than a row: preview on top, then the name, then the controls, so a
 * slot reads as a rack of looks you can compare instead of a stack of full-width strips whose
 * buttons sat a window's width away from the name they acted on.
 *
 * Enabled mods keep their colour and disabled ones grey out, which makes "what am I wearing?"
 * answerable without reading anything. Colour returns on hover so a greyed slot is still
 * browsable. */
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
}: ModCardProps) {
  // GameBanana's remote preview, or the picture that came inside the archive for a mod imported
  // from outside the app. Resolved in one place so every surface showing a mod agrees.
  const artSrc = modArtSrc(mod);
  const hasUpdate = updateCheck?.status === "UpdateAvailable";
  const isFolderMissing = error?.startsWith(MOD_FOLDER_MISSING_PREFIX) ?? false;
  // Only GameBanana-installed mods can be update-checked at all — a hand-added folder has no
  // remote counterpart to compare against, which is why its card shows no update control.
  const isFromGameBanana = mod.gamebanana_mod_id !== null;
  // No de-duplicating against the name any more: the name is the mod's and this is the file's,
  // so the two cannot say the same thing by construction.
  const variant = mod.variant_label?.trim() || null;

  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  return (
    <div
      // The cut corner is Eridu's signature and cannot come from a border-radius, so it is a
      // clip-path rather than a utility class — same shape as the character cards.
      style={{
        clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%)",
      }}
      className={`group/card flex flex-col border-2 bg-card transition-all hover:-translate-y-0.5 hover:border-primary ${
        hasUpdate ? "border-primary" : "border-border"
      }`}
    >
      {/* 16:10, not the roster's 3:4: GameBanana previews are landscape without exception, so a
          portrait frame would crop most of every image away. These cards never share a grid with
          character cards, so the shape can differ while the styling stays identical. */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-secondary">
        {artSrc ? (
          <img
            src={artSrc}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover transition-[filter] ${
              mod.enabled
                ? ""
                : "brightness-50 grayscale group-hover/card:brightness-100 group-hover/card:grayscale-0"
            }`}
          />
        ) : (
          // Permanent for hand-added mods, which have no remote listing to take a picture from,
          // and the resting state for any GameBanana mod whose submission has no preview image.
          // A designed state, not a load failure, so it gets an icon and a label.
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center gap-1 font-heading text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 ${
              mod.enabled ? "" : "opacity-55 group-hover/card:opacity-100"
            }`}
          >
            <ImageOff className="h-6 w-6 opacity-70" />
            No preview
          </div>
        )}

        {/* No scanlines or foot gradient here, unlike the character cards. Those sit under a
            single clean portrait and have a name printed over the art; a mod preview is a busy
            screenshot, often with its own text baked in, and nothing is overlaid on it — the
            name lives in the strip below. Texture on top of that only makes it harder to read
            what the mod actually looks like, which is the one job this image has. */}

        {hasUpdate && (
          <span className="absolute right-1.5 top-1.5 bg-primary px-1.5 py-px font-heading text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
            Update
          </span>
        )}

        {/* The preview opens the mod's page, the same gesture as in Browse — an installed mod is
            the same object you were looking at there, so pointing at its picture should mean the
            same thing. It sits above the image and below the update badge, and the card's own
            action stays the bar below: this reads about the mod, that changes it. */}
        {onOpenDetail && (
          <button
            type="button"
            onClick={onOpenDetail}
            aria-label={`View ${mod.display_name} on GameBanana`}
            className="absolute inset-0 cursor-pointer outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
          >
            {/* Only on hover, and only a hint: the picture is the target, this says so without
                sitting on top of the artwork the rest of the time. */}
            <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 bg-background/85 px-1.5 py-px font-heading text-[10px] uppercase tracking-[0.1em] text-foreground opacity-0 transition-opacity group-hover/card:opacity-100">
              <ExternalLink className="h-2.5 w-2.5" />
              Details
            </span>
          </button>
        )}
      </div>

      <div
        className={`border-t-2 bg-background px-2.5 pb-2 pt-1.5 group-hover/card:border-t-primary ${
          hasUpdate ? "border-t-primary" : "border-t-border"
        }`}
      >
        {/* Middle-truncated: a hand-written name can outrun the card, and the tail is where a
            name says which of several similar things this is. */}
        <MiddleTruncate
          text={mod.display_name}
          className={`font-heading text-sm font-semibold uppercase tracking-wide ${
            mod.enabled ? "text-foreground" : "text-muted-foreground"
          }`}
        />
        {/* The source, not the enabled state — the bar below already says that, and saying it
            twice was the first thing that read as noise.

            Which file of the mod this is takes this line when there is one, rather than adding a
            third — "Belle Bottom Heavy Nsfw", "Main file". Two cards from one mod page then read
            as one mod in two variants, which is what they are, and the icon still says where
            they came from. */}
        <span
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70"
          title={isFromGameBanana ? "From GameBanana" : "Added by hand"}
        >
          {isFromGameBanana ? (
            <Package className="h-3 w-3 shrink-0" />
          ) : (
            <Folder className="h-3 w-3 shrink-0" />
          )}
          <span className="truncate">
            {variant ?? (isFromGameBanana ? "GameBanana" : "Added by hand")}
          </span>
        </span>
      </div>

      {/* The bar carries the state at rest and the verb on hover: an enabled mod reads ENABLED
          in solid accent, then drops the fill and says DISABLE under the cursor, so the click's
          result is visible before committing to it. */}
      <button
        type="button"
        disabled={isToggling}
        onClick={() => onToggle(!mod.enabled)}
        className={`group/bar w-full border-t px-2.5 py-2 text-center font-heading text-xs font-bold uppercase tracking-[0.1em] transition-colors disabled:pointer-events-none ${
          mod.enabled
            ? "border-t-primary bg-primary text-primary-foreground hover:bg-transparent hover:text-primary"
            : "border-t-border text-muted-foreground hover:bg-primary/10 hover:text-primary"
        }`}
      >
        {isToggling ? (
          mod.enabled ? (
            "Disabling…"
          ) : (
            "Enabling…"
          )
        ) : mod.enabled ? (
          <>
            <span className="group-hover/bar:hidden">Enabled</span>
            <span className="hidden group-hover/bar:inline">Disable</span>
          </>
        ) : (
          "Enable"
        )}
      </button>

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

      {/* Update on the left, delete pushed to the far right and ghosted until hovered. They are
          deliberately unlike each other in size, weight and position: one is routine, the other
          destroys files. */}
      <div className="flex items-center gap-1.5 border-t border-border px-2 py-1.5">
        {hasUpdate && updateCheck ? (
          <UpdateModDialog
            key={`${updateCheck.mod_id}:${updateCheck.suggested_file_id ?? "none"}`}
            mod={mod}
            updateCheck={updateCheck}
          />
        ) : isFromGameBanana ? (
          // Widens into a labelled confirmation rather than swapping the glyph in place: a tick
          // where a refresh arrow was is easy to miss on a 28px target, and the word is what
          // actually answers "did that do anything?".
          isConfirmedUpToDate ? (
            <span
              className="flex h-7 items-center gap-1.5 border border-success/40 px-2 text-[11px] text-success"
              role="status"
            >
              <Check className="h-3.5 w-3.5 shrink-0" />
              Up to date
            </span>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={isCheckingUpdate}
              onClick={onCheckUpdate}
              aria-label={`Check ${mod.display_name} for updates`}
              title="Check for updates"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isCheckingUpdate ? "animate-spin" : ""}`} />
            </Button>
          )
        ) : null}

        <div className="flex-1" />

        {/* Sits with delete rather than beside the name: the name is for reading, and a control
            parked against it would be one more thing between the eye and the word. */}
        {isEditable && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-45 hover:bg-transparent hover:text-primary hover:opacity-100"
            onClick={() => setIsEditing(true)}
            aria-label={`Edit ${mod.display_name}`}
            title="Edit mod"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-45 hover:bg-transparent hover:text-destructive hover:opacity-100"
          disabled={isDeleting}
          onClick={() => setIsConfirmingDelete(true)}
          aria-label={`Delete ${mod.display_name}`}
          title="Delete mod"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {error && (
        <div className="border-t border-destructive/30 bg-destructive/10 px-2.5 py-2">
          <p className="flex items-start gap-1.5 text-[11px] text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 translate-y-px" />
            {isFolderMissing
              ? "This mod's files are missing — was it deleted or moved outside the app?"
              : error}
          </p>
          {isFolderMissing && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 w-full"
              disabled={isDeleting}
              onClick={onDelete}
            >
              Remove from library
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
