import { AlertTriangle, Check, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useModsFolder } from "@/features/library/hooks";
import type { MatureVisibility } from "@/lib/tauri-commands";
import { useMatureContentVisibility, useSetMatureContentVisibility } from "./hooks";

const OPTIONS: { value: MatureVisibility; label: string; description: string }[] = [
  {
    value: "Show",
    label: "Show",
    description: "Mature mods render normally, same as everything else.",
  },
  {
    value: "Blur",
    label: "Blur",
    description: "Mature mods are blurred behind a click-to-reveal gate.",
  },
  {
    value: "Hide",
    label: "Hide",
    description: "Mature mods are left out of Browse results entirely.",
  },
];

export function SettingsDialog() {
  const { data: modsFolder } = useModsFolder();
  // If the query errors (a corrupted stored value), still render every option enabled —
  // picking any one writes a fresh, valid value, so this dialog is the recovery path and
  // must never be unusable.
  const { data: visibility, isError } = useMatureContentVisibility();
  const setVisibility = useSetMatureContentVisibility();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="icon-sm" aria-label="Settings">
          <SettingsIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <p id="mature-content-heading" className="text-sm font-medium text-foreground">
              Mature content
            </p>
            {isError && (
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Your saved preference couldn't be read — pick one below to fix it.
              </p>
            )}
            <div role="radiogroup" aria-labelledby="mature-content-heading" className="grid gap-2">
              {OPTIONS.map((option) => {
                const selected = visibility === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={setVisibility.isPending}
                    onClick={() => setVisibility.mutate(option.value)}
                    className={`flex items-start justify-between gap-2 rounded-lg border p-3 text-left transition-colors ${
                      selected
                        ? "border-primary bg-primary/5"
                        : "border-border bg-background hover:bg-muted"
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{option.label}</p>
                      <p className="text-xs text-muted-foreground">{option.description}</p>
                    </div>
                    {selected && (
                      <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
            {setVisibility.isError && (
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {String(setVisibility.error)}
              </p>
            )}
          </div>

          <div className="grid gap-1 border-t border-border pt-4">
            <p className="text-sm font-medium text-foreground">Mods folder</p>
            <p className="truncate text-xs text-muted-foreground">
              {modsFolder ?? "Not set"}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
