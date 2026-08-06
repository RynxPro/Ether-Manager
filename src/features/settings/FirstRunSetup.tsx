import { Button } from "@/components/ui/button";
import { usePickModsFolder, useSetModsFolder } from "@/features/library/hooks";

export function FirstRunSetup() {
  const pickFolder = usePickModsFolder();
  const setFolder = useSetModsFolder();

  async function handlePickFolder() {
    const path = await pickFolder.mutateAsync();
    if (path) {
      setFolder.mutate(path);
    }
  }

  const isBusy = pickFolder.isPending || setFolder.isPending;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="max-w-md space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">Welcome to Ether Manager</h1>
        <p className="text-sm text-muted-foreground">
          Before you start, select the mods folder XXMI/ZZMI loads mods from. Ether Manager
          will organize installed mods inside it, by character and slot.
        </p>
      </div>

      <Button type="button" onClick={handlePickFolder} disabled={isBusy}>
        {isBusy ? "Working…" : "Choose mods folder"}
      </Button>

      {setFolder.isError && (
        <p className="text-sm text-destructive">{String(setFolder.error)}</p>
      )}
    </div>
  );
}
