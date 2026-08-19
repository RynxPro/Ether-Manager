import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useCallback, useEffect, useState } from "react";
import { pickModArchive, type BegunImport } from "@/lib/tauri-commands";
import { useBeginImport } from "./hooks";

/** The whole "a mod arrived from somewhere else" flow, in one place.
 *
 * Called once, from `App`. Two call sites would mean two independent drag listeners and the
 * possibility of two import sheets open at once, which is not a state anything downstream is
 * prepared for.
 *
 * Dropping is the main way in and the button is the fallback, but they converge immediately:
 * both end at `start`, so there is one path to keep working.
 *
 * The drag events come from Tauri rather than the DOM. Tauri v2 enables its native drag-drop
 * handler by default, which suppresses the webview's own dragover/drop entirely — HTML drop
 * targets simply never fire. `onDragDropEvent` is the supported replacement and is the only
 * thing that knows the real filesystem paths, which is what the importer needs. */
export function useModImport() {
  const [begun, setBegun] = useState<BegunImport | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const begin = useBeginImport();

  const start = useCallback(
    async (path: string) => {
      setError(null);
      try {
        setBegun(await begin.mutateAsync(path));
      } catch (caught) {
        // The backend's refusals are already written for a person to read — "… is not a mod —
        // drop a .zip, .7z or .rar, or a folder" — so they are shown as they come.
        setError(String(caught));
      }
    },
    [begin],
  );

  const importFromPicker = useCallback(async () => {
    const path = await pickModArchive();
    if (path !== null) await start(path);
  }, [start]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "enter" || payload.type === "over") {
          setIsDragging(true);
          return;
        }
        setIsDragging(false);
        if (payload.type !== "drop" || payload.paths.length === 0) return;

        // One at a time. Each import owns a staging directory and a dialog, and stepping through
        // a queue of them is a flow in its own right — not something to improvise here. Taking
        // the first and saying so beats silently ignoring four.
        if (payload.paths.length > 1) {
          setError(
            `Importing the first of ${payload.paths.length} files — drop the rest one at a time.`,
          );
        }
        void start(payload.paths[0]);
      })
      .then((off) => {
        // Registration is async, so a component that unmounts first would otherwise leak a
        // listener that outlives it.
        if (cancelled) off();
        else unlisten = off;
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [start]);

  return {
    /** The unpacked, inspected import awaiting confirmation, or null when none is open. */
    begun,
    /** True while a file is over the window, for the drop target to show itself. */
    isDragging,
    /** True while an archive is being unpacked — which for a large `.7z` is a real wait. */
    isBeginning: begin.isPending,
    error,
    dismissError: useCallback(() => setError(null), []),
    importFromPicker,
    closeSheet: useCallback(() => setBegun(null), []),
  };
}
