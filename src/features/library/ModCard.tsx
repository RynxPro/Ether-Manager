import { AlertTriangle, Folder, ImageOff, Package, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MOD_FOLDER_MISSING_PREFIX, type Mod, type UpdateCheck } from "@/lib/tauri-commands";
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
  /** The most recent toggle/delete failure for this specific mod, if any — see SlotSection,
   * which matches the shared toggle/delete mutations' state against this card's own mod id. */
  error?: string;
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
  error,
}: ModCardProps) {
  const hasUpdate = updateCheck?.status === "UpdateAvailable";
  const isFolderMissing = error?.startsWith(MOD_FOLDER_MISSING_PREFIX) ?? false;
  // Only GameBanana-installed mods can be update-checked at all — a hand-added folder has no
  // remote counterpart to compare against, which is why its card shows no update control.
  const isFromGameBanana = mod.gamebanana_mod_id !== null;

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
        {mod.thumbnail_url ? (
          <img
            src={mod.thumbnail_url}
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
      </div>

      <div
        className={`border-t-2 bg-background px-2.5 pb-2 pt-1.5 group-hover/card:border-t-primary ${
          hasUpdate ? "border-t-primary" : "border-t-border"
        }`}
      >
        <p
          className={`truncate font-heading text-sm font-semibold uppercase tracking-wide ${
            mod.enabled ? "text-foreground" : "text-muted-foreground"
          }`}
          title={mod.display_name}
        >
          {mod.display_name}
        </p>
        {/* The source, not the enabled state — the bar below already says that, and saying it
            twice was the first thing that read as noise. */}
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
          {isFromGameBanana ? (
            <Package className="h-3 w-3 shrink-0" />
          ) : (
            <Folder className="h-3 w-3 shrink-0" />
          )}
          {isFromGameBanana ? "GameBanana" : "Added by hand"}
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
        ) : null}

        <div className="flex-1" />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-45 hover:bg-transparent hover:text-destructive hover:opacity-100"
          disabled={isDeleting}
          onClick={onDelete}
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
