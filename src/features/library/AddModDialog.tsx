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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SLOTS, type Slot } from "@/lib/tauri-commands";
import { useAddMod } from "./hooks";

interface AddModDialogProps {
  characterId: string;
  defaultSlot: Slot;
}

export function AddModDialog({ characterId, defaultSlot }: AddModDialogProps) {
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState<Slot>(defaultSlot);
  const [displayName, setDisplayName] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const addMod = useAddMod(characterId);

  function resetAndClose() {
    setDisplayName("");
    setSourcePath("");
    setSlot(defaultSlot);
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
              <Label htmlFor="mod-slot">Slot</Label>
              <Select value={slot} onValueChange={(value) => setSlot(value as Slot)}>
                <SelectTrigger id="mod-slot">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SLOTS.map((slotOption) => (
                    <SelectItem key={slotOption} value={slotOption}>
                      {slotOption}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
