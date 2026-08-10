import { AlertTriangle, Check } from "lucide-react";
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

/** A page rather than a dialog — Settings is a sidebar destination now, not something you open
 * on top of what you were doing. */
export function SettingsPage() {
  const { data: modsFolder } = useModsFolder();
  // If the query errors (a corrupted stored value), still render every option enabled —
  // picking any one writes a fresh, valid value, so this page is the recovery path and
  // must never be unusable.
  const { data: visibility, isError } = useMatureContentVisibility();
  const setVisibility = useSetMatureContentVisibility();

  return (
    <div className="max-w-2xl space-y-8">
      <h2 className="text-2xl font-semibold text-foreground">Settings</h2>

      <section className="space-y-3">
        <div>
          <h3 id="mature-content-heading" className="text-sm font-medium text-foreground">
            Mature content
          </h3>
          <p className="text-xs text-muted-foreground">
            How mods marked mature on GameBanana appear while you browse.
          </p>
        </div>

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
                {selected && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
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
      </section>

      <section className="space-y-1 border-t border-border pt-6">
        <h3 className="text-sm font-medium text-foreground">Mods folder</h3>
        <p className="text-xs text-muted-foreground">
          Where XXMI/ZZMI loads mods from. Ether Manager files installed mods inside it.
        </p>
        <p className="truncate pt-1 font-mono text-xs text-foreground">{modsFolder ?? "Not set"}</p>
      </section>
    </div>
  );
}
