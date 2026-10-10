import { AlertTriangle, Check, FolderOpen } from "lucide-react";
import { DOCKET_ERROR } from "@/components/ui/dialog";
import {
  useDetectedModsFolder,
  usePickModsFolder,
  useSetModsFolder,
} from "@/features/library/hooks";

/** A control on this sheet. The sheet is paper, so what you press inverts to `--background`;
 * the one that carries the decision is filled with the accent instead. */
const SLAB =
  "inline-flex h-10 shrink-0 items-center justify-center gap-1.5 px-5 font-sign text-[18px] uppercase tracking-[0.1em] shadow-slap outline-none transition-[translate,box-shadow] duration-200 hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none";

/** The first thing anyone sees, and the only question the app has to ask before it works.
 *
 * One sheet on the wall rather than a column of centred text. Centred text with a button under
 * it is the shape of every setup screen ever made; this is the same shape the rest of the app
 * uses for a thing you act on, which is the point — the app looks like itself from the first
 * screen rather than from the second. */
export function FirstRunSetup() {
  const pickFolder = usePickModsFolder();
  const setFolder = useSetModsFolder();
  // XXMI writes down where it keeps ZZMI, so the answer is looked up rather than asked for. See
  // `crate::xxmi` — it only ever reports a folder with a `d3dx.ini` beside it, so anything that
  // comes back here is safe to offer plainly rather than hedge about.
  const detected = useDetectedModsFolder();

  async function handlePickFolder() {
    const path = await pickFolder.mutateAsync();
    if (path) {
      setFolder.mutate(path);
    }
  }

  const isBusy = pickFolder.isPending || setFolder.isPending || detected.isPending;

  return (
    <div className="flex min-h-full items-center justify-center p-8">
      <div className="w-full max-w-[540px] border-2 border-border bg-card p-7 shadow-slap-lift">
        {/* The machine naming the step, the way every docket in the app does. */}
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Setup &middot; mods folder
        </p>

        <h1 className="mt-2.5 font-heading text-[38px] uppercase leading-[0.92] tracking-[0.01em] text-card-foreground">
          Welcome to
          <br />
          Ether Manager
        </h1>

        <p className="mt-3.5 max-w-[46ch] text-[13px] leading-relaxed text-muted-foreground">
          {detected.data
            ? "Found where XXMI/ZZMI loads mods from. Ether Manager will organize installed mods inside it, by character."
            : "Before you start, select the mods folder XXMI/ZZMI loads mods from. Ether Manager will organize installed mods inside it, by character and slot."}
        </p>

        {detected.data ? (
          // The path is shown rather than summarised: this is the one decision that quietly
          // breaks everything if it is wrong — mods get filed somewhere the game never reads —
          // so it is worth being able to check before agreeing to it. On a plate and in the
          // machine's face, because it is a value the machine found rather than a sentence.
          <>
            <p
              className="mt-5 truncate bg-background px-3 py-2.5 font-mono text-[12px] font-bold text-foreground shadow-slap"
              title={detected.data}
            >
              {detected.data}
            </p>
            {/* Marker, because it is the app leaning in to say something about the line above
                rather than part of the interface — the one job the hand face has. */}
            <p className="mt-2 -rotate-[1.1deg] font-hand text-[13px] text-primary">
              found it for you
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => setFolder.mutate(detected.data as string)}
                className={`${SLAB} bg-primary text-primary-foreground`}
              >
                <Check className="h-4 w-4" />
                {isBusy ? "Working…" : "Use this folder"}
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={handlePickFolder}
                className={`${SLAB} bg-background text-foreground`}
              >
                <FolderOpen className="h-4 w-4" />
                Choose another
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={handlePickFolder}
            disabled={isBusy}
            className={`${SLAB} mt-5 bg-primary text-primary-foreground`}
          >
            <FolderOpen className="h-4 w-4" />
            {isBusy ? "Working…" : "Choose mods folder"}
          </button>
        )}

        {setFolder.isError && (
          <p className={`${DOCKET_ERROR} mt-4`}>
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {String(setFolder.error)}
          </p>
        )}
      </div>
    </div>
  );
}
