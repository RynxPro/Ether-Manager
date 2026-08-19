import { Download, XIcon } from "lucide-react";

interface ImportDropOverlayProps {
  isDragging: boolean;
  isBeginning: boolean;
  error: string | null;
  onDismissError: () => void;
}

/** The window's answer to a file being dragged over it, and to the wait that follows.
 *
 * Without this, dropping a mod on the app looks like nothing happening — there is no cursor
 * affordance to borrow, because Tauri handles the drag natively and the webview never sees it.
 * A feature nobody can tell is there is not a feature.
 *
 * The drag and unpacking states are `pointer-events-none`: Tauri decides where a drop lands, and
 * an overlay that ate clicks would break the app for anyone who dragged something over it and
 * changed their mind. The error notice is the exception — it has a button to dismiss. */
export function ImportDropOverlay({
  isDragging,
  isBeginning,
  error,
  onDismissError,
}: ImportDropOverlayProps) {
  return (
    <>
      {isDragging && (
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-background/70 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-3 border-2 border-primary bg-card px-10 py-8">
            <Download className="h-7 w-7 text-primary" />
            <p className="font-heading text-sm uppercase tracking-[0.12em]">Drop to import</p>
            <p className="text-[12px] text-muted-foreground">
              A .zip, .7z or .rar, or a folder you have already unpacked
            </p>
          </div>
        </div>
      )}

      {isBeginning && (
        // Unpacking happens before the sheet can open, and a large archive makes that a real
        // wait. Silence in that gap reads as a dropped file having been ignored.
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center pb-6">
          <p className="border-2 border-border bg-card px-4 py-2.5 font-heading text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Unpacking…
          </p>
        </div>
      )}

      {error && (
        <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center pb-6">
          <div className="flex max-w-[520px] items-start gap-3 border-2 border-destructive bg-card px-4 py-3">
            <p className="text-[13px] text-foreground">{error}</p>
            <button
              type="button"
              onClick={onDismissError}
              aria-label="Dismiss"
              className="-my-0.5 shrink-0 p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
