import { Check, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useDetectedModsFolder,
  usePickModsFolder,
  useSetModsFolder,
} from "@/features/library/hooks";

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
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="max-w-md space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">Welcome to Ether Manager</h1>
        <p className="text-sm text-muted-foreground">
          {detected.data
            ? "Found where XXMI/ZZMI loads mods from. Ether Manager will organize installed mods inside it, by character."
            : "Before you start, select the mods folder XXMI/ZZMI loads mods from. Ether Manager will organize installed mods inside it, by character and slot."}
        </p>
      </div>

      {detected.data ? (
        // The path is shown rather than summarised: this is the one decision that quietly breaks
        // everything if it is wrong — mods get filed somewhere the game never reads — so it is
        // worth being able to check before agreeing to it.
        <div className="flex w-full max-w-md flex-col items-center gap-3">
          <p className="w-full truncate font-mono text-xs text-foreground" title={detected.data}>
            {detected.data}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={isBusy}
              onClick={() => setFolder.mutate(detected.data as string)}
            >
              <Check className="h-3.5 w-3.5" />
              {isBusy ? "Working…" : "Use this folder"}
            </Button>
            <Button type="button" variant="outline" disabled={isBusy} onClick={handlePickFolder}>
              <FolderOpen className="h-3.5 w-3.5" />
              Choose another
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" onClick={handlePickFolder} disabled={isBusy}>
          {isBusy ? "Working…" : "Choose mods folder"}
        </Button>
      )}

      {setFolder.isError && <p className="text-sm text-destructive">{String(setFolder.error)}</p>}
    </div>
  );
}
