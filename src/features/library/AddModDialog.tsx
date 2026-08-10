import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Slot } from "@/lib/tauri-commands";
import { useAddMod } from "./hooks";

interface AddModDialogProps {
  characterId: string;
  /** Fixed, not user-chosen — each caller already represents exactly one slot (a character's
   * one Character Skin section, or the global UI/Misc sections), so there's nothing to pick. */
  slot: Slot;
}

export function AddModDialog({ characterId, slot }: AddModDialogProps) {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const addMod = useAddMod();

  function resetAndClose() {
    setDisplayName("");
    setSourcePath("");
    setOpen(false);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    addMod.mutate(
      { characterId, slot, displayName, sourcePath },
      { onSuccess: resetAndClose },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Add mod
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add a mod</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="mod-display-name">Display name</Label>
              <Input
                id="mod-display-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Neon Dream Outfit"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="mod-source-path">
                Source path (archive file or already-extracted folder)
              </Label>
              <Input
                id="mod-source-path"
                value={sourcePath}
                onChange={(event) => setSourcePath(event.target.value)}
                placeholder="C:\Downloads\mod.zip"
                required
              />
            </div>

            {addMod.isError && (
              <p className="text-sm text-destructive">{String(addMod.error)}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={addMod.isPending}>
              {addMod.isPending ? "Adding…" : "Add mod"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
