import { AlertTriangle, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useModsFolder } from "@/features/library/hooks";
import { MAGNIFIER_MAX_SIZE, MAGNIFIER_MIN_SIZE } from "@/lib/magnifier";
import type { MagnifierSettings, MatureVisibility } from "@/lib/tauri-commands";
import {
  useMagnifierSettings,
  useMatureContentVisibility,
  useSetMagnifierSettings,
  useSetMatureContentVisibility,
} from "./hooks";
import { PageHeader } from "@/components/PageHeader";

/** Shown for the moment before the stored settings arrive. Matches the Rust default so the
 * controls do not visibly jump into place on load. */
const MAGNIFIER_FALLBACK: MagnifierSettings = { enabled: true, size: 120 };

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

  const { data: storedMagnifier } = useMagnifierSettings();
  const saveMagnifierSettings = useSetMagnifierSettings();
  const magnifier = storedMagnifier ?? MAGNIFIER_FALLBACK;
  // The slider's own position while it is being dragged. Seeded from the stored value and
  // resynced whenever that changes, so a save landing mid-drag does not yank the thumb.
  const [draftSize, setDraftSize] = useState(magnifier.size);
  useEffect(() => setDraftSize(magnifier.size), [magnifier.size]);

  function saveMagnifier(next: MagnifierSettings) {
    saveMagnifierSettings.mutate(next);
  }

  return (
    <div className="max-w-2xl space-y-8">
      <PageHeader title="Settings" subtitle="How Ether Manager behaves" />

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

      <section className="space-y-3 border-t border-border pt-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h3 id="magnifier-heading" className="text-sm font-medium text-foreground">
              Preview magnifier
            </h3>
            <p className="text-xs text-muted-foreground">
              A square lens that follows the pointer over a mod&apos;s preview, magnifying what
              is under it. Clicking the preview still opens it full size either way.
            </p>
          </div>
          <Switch
            checked={magnifier.enabled}
            onCheckedChange={(enabled) => saveMagnifier({ ...magnifier, enabled })}
            aria-labelledby="magnifier-heading"
          />
        </div>

        {/* Kept mounted while off rather than hidden, so turning it back on does not make the
            page jump — and dimmed, because a size you cannot see the effect of is not worth
            reading as an equal control. */}
        <div
          className={`space-y-2 transition-opacity ${magnifier.enabled ? "" : "pointer-events-none opacity-40"}`}
        >
          <div className="flex items-baseline justify-between gap-3">
            <label
              htmlFor="magnifier-size"
              className="font-heading text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70"
            >
              Lens size
            </label>
            <span className="text-xs tabular-nums text-muted-foreground">{draftSize}px</span>
          </div>
          {/* Live while dragging, written once on release: the lens updates as you move it, but
              a write per pixel would be dozens of database round trips for one decision. */}
          <Slider
            id="magnifier-size"
            min={MAGNIFIER_MIN_SIZE}
            max={MAGNIFIER_MAX_SIZE}
            step={4}
            value={[draftSize]}
            onValueChange={([size]) => setDraftSize(size)}
            onValueCommit={([size]) => saveMagnifier({ ...magnifier, size })}
            disabled={!magnifier.enabled}
            aria-label="Lens size"
          />
          {/* The number alone says little — this is the square you will actually see. */}
          <div className="flex items-center gap-3 pt-1">
            <div
              className="shrink-0 border-2 border-primary bg-secondary"
              style={{ width: draftSize, height: draftSize }}
            />
            <p className="text-xs text-muted-foreground">Actual size.</p>
          </div>
        </div>

        {saveMagnifierSettings.isError && (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {String(saveMagnifierSettings.error)}
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
