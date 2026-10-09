import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { Slider } from "@/components/ui/slider";
import {
  useModsFolder,
  usePickModsFolder,
  useSetModsFolder,
} from "@/features/library/hooks";
import { MAGNIFIER_MAX_SIZE, MAGNIFIER_MIN_SIZE } from "@/lib/magnifier";
import type {
  MagnifierSettings,
  MatureVisibility,
  Theme,
} from "@/lib/tauri-commands";
import {
  useConflictWarnings,
  useMagnifierSettings,
  useMatureContentVisibility,
  useSetConflictWarnings,
  useSetMagnifierSettings,
  useSetMatureContentVisibility,
  useSetTheme,
  useTheme,
} from "./hooks";
import { PageHeader } from "@/components/PageHeader";

/** Shown for the moment before the stored settings arrive. Matches the Rust default so the
 * controls do not visibly jump into place on load. */
const MAGNIFIER_FALLBACK: MagnifierSettings = { enabled: true, size: 120 };

/** The two looks are one wall at two times of day, so the copy describes the place rather than
 * the brightness — "Light"/"Dark" would invite treating them as a generic pair. */
const THEME_OPTIONS: { value: Theme; label: string; description: string }[] = [
  {
    value: "Daylight",
    label: "Daylight",
    description: "Paper in the sun. Pale wall, printed cards, ink type.",
  },
  {
    value: "Night",
    label: "Night",
    description: "The same wall after dark. Painted panels, lit signage.",
  },
  {
    value: "System",
    label: "Match Windows",
    description: "Follow whatever Windows is set to, and switch when it does.",
  },
];

const OPTIONS: {
  value: MatureVisibility;
  label: string;
  description: string;
}[] = [
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

/** One setting, on its own piece of paper. Sections used to be separated by a hairline rule and
 * nothing else, which made the page one long document rather than a set of switches. */
const SHEET = "bg-card p-[18px] shadow-slap-lift";
/** What a setting is called. The display face, because these are the names of things — the
 * controls inside them wear the sign face. */
const SECTION_TITLE =
  "font-heading text-[24px] uppercase leading-none tracking-[0.02em] text-card-foreground";
/** The one place on this page that is genuinely prose: what a setting does and what it costs you.
 * Geist, because body copy is the one job Geist has in this app. */
const SECTION_COPY = "mt-1.5 text-[13px] leading-relaxed text-muted-foreground";
/** Something gone wrong, in the machine's voice because it is the machine reporting. */
const ERROR_LINE =
  "mt-3 flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-destructive";

interface SettingSheetProps {
  title: string;
  /** Needed by the controls inside: a radio group points `aria-labelledby` at this heading, and a
   * switch uses it as its own label rather than repeating the title as an `aria-label`. */
  headingId: string;
  description: string;
  /** The switch, for the two sections that are a single yes/no. Sits beside the title rather than
   * under the copy, so the state is readable without finishing the paragraph. */
  control?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

function SettingSheet({
  title,
  headingId,
  description,
  control,
  className = "",
  children,
}: SettingSheetProps) {
  return (
    <section className={`${SHEET} ${className}`}>
      <div className="flex items-start gap-5">
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className={SECTION_TITLE}>
            {title}
          </h3>
          <p className={SECTION_COPY}>{description}</p>
        </div>
        {control}
      </div>
      {children}
    </section>
  );
}

interface OptionSlabProps {
  label: string;
  description: string;
  isSelected: boolean;
  isDisabled: boolean;
  onClick: () => void;
}

/** One answer in a pick-one setting.
 *
 * Paper, and filled with the accent when it is the live one — the rule `FilterChip` settled for
 * the whole app: the surface says you can press it, the colour says which one is on, and neither
 * does the other's job. These were outlined boxes with a tick in the corner, which spent the
 * accent on drawing a border and left the chosen one made of the same material as the rest.
 *
 * Drawn in the wall colour rather than the card colour because it sits *on* a sheet; paper on
 * paper of the same shade has no edge at all. Same reasoning as the controls on the Downloads
 * hero. */
function OptionSlab({
  label,
  description,
  isSelected,
  isDisabled,
  onClick,
}: OptionSlabProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      disabled={isDisabled}
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3.5 px-3.5 py-2.5 text-left shadow-slap transition-[translate] duration-200 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:translate-y-0 disabled:opacity-50 ${
        isSelected ? "bg-primary text-primary-foreground" : "bg-background text-foreground"
      }`}
    >
      <span className="min-w-0">
        <span className="block font-sign text-[21px] uppercase leading-none tracking-[0.08em]">
          {label}
        </span>
        <span
          className={`mt-1 block text-[12.5px] leading-snug ${
            isSelected ? "text-primary-foreground/75" : "text-muted-foreground"
          }`}
        >
          {description}
        </span>
      </span>
      {/* The word rather than a tick: this page speaks in signage, and "On" says the same thing
          without borrowing an icon set. Hidden from assistive tech, which reads `aria-checked`. */}
      {isSelected && (
        <span aria-hidden className="shrink-0 font-sign text-[19px] uppercase tracking-[0.1em]">
          On
        </span>
      )}
    </button>
  );
}

interface SwitchPlateProps {
  isOn: boolean;
  onChange: (next: boolean) => void;
  labelledBy: string;
}

/** A yes/no, as a plate with a square knob.
 *
 * Replaces the rounded shadcn pill, which was the last soft-edged control in an app whose radius
 * is zero everywhere by design. It says its own state in words as well as by position — a knob
 * that has slid to one end only means something if you already know which end is which. Accent
 * fill when on, for the same reason the chosen option slab is filled: red means live.
 *
 * `role="switch"` with `aria-checked`, labelled by its section heading, so it reads exactly as
 * the Radix one did. */
function SwitchPlate({ isOn, onChange, labelledBy }: SwitchPlateProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      aria-labelledby={labelledBy}
      onClick={() => onChange(!isOn)}
      className={`relative flex h-[34px] w-[74px] shrink-0 items-center p-[3px] shadow-slap transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        isOn ? "bg-primary" : "bg-background"
      }`}
    >
      <span
        aria-hidden
        className={`absolute font-sign text-[15px] uppercase tracking-[0.14em] ${
          isOn ? "left-[9px] text-primary-foreground" : "right-[9px] text-muted-foreground"
        }`}
      >
        {isOn ? "On" : "Off"}
      </span>
      <span
        aria-hidden
        className={`block h-7 w-7 transition-transform duration-200 ${
          isOn ? "translate-x-10 bg-primary-foreground" : "translate-x-0 bg-muted-foreground"
        }`}
      />
    </button>
  );
}

/** A page rather than a dialog — Settings is a sidebar destination now, not something you open
 * on top of what you were doing.
 *
 * Two columns, because this page is a handful of switches rather than a document: capped at one
 * 672px column it ran off the bottom of the window while leaving a thousand pixels of bare wall
 * to its right, so you had to scroll to find out what the app can even be told to do. Paired up,
 * all of it is on screen at once. */
export function SettingsPage() {
  const { data: modsFolder } = useModsFolder();
  const pickFolder = usePickModsFolder();
  const setFolder = useSetModsFolder();
  const isChangingFolder = pickFolder.isPending || setFolder.isPending;

  // Cancelling the native picker returns nothing, which must leave the current folder alone
  // rather than clear it — the same shape as first-run setup, which this deliberately mirrors.
  async function handleChangeModsFolder() {
    const path = await pickFolder.mutateAsync();
    if (path) {
      setFolder.mutate(path);
    }
  }
  // If the query errors (a corrupted stored value), still render every option enabled —
  // picking any one writes a fresh, valid value, so this page is the recovery path and
  // must never be unusable.
  const { data: visibility, isError } = useMatureContentVisibility();
  const setVisibility = useSetMatureContentVisibility();

  // No error branch of its own: an unreadable stored theme still leaves every option pickable,
  // and choosing one writes a fresh valid value — the same recovery path as mature content.
  const { data: theme } = useTheme();
  const saveTheme = useSetTheme();

  const { data: conflictWarnings } = useConflictWarnings();
  const saveConflictWarnings = useSetConflictWarnings();

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
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        // A second word, not an echo of the title sitting in 48px on top of it.
        tag="Setup"
        subtitle="How Ether Manager behaves"
        // Unpinned, like every other page that has had the street pass. This was the last one
        // still taking the pinned default, which clips the sprayed tag against the rule.
        pinned={false}
      />

      <div className="grid items-start gap-[18px] lg:grid-cols-2">
        <SettingSheet
          title="Look"
          headingId="theme-heading"
          description="Two versions of the same wall. Everything moves together — nothing is only styled for one of them."
        >
          <div role="radiogroup" aria-labelledby="theme-heading" className="mt-3.5 grid gap-2">
            {THEME_OPTIONS.map((option) => (
              <OptionSlab
                key={option.value}
                label={option.label}
                description={option.description}
                // Undefined while the first read is in flight. Nothing is marked selected in that
                // window rather than guessing, because guessing wrong makes the row visibly jump
                // — and the theme itself is already painted correctly from the cache regardless.
                isSelected={theme === option.value}
                isDisabled={saveTheme.isPending}
                onClick={() => saveTheme.mutate(option.value)}
              />
            ))}
          </div>

          {saveTheme.isError && (
            <p className={ERROR_LINE}>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {String(saveTheme.error)}
            </p>
          )}
        </SettingSheet>

        <SettingSheet
          title="Mature content"
          headingId="mature-content-heading"
          description="How mods marked mature on GameBanana appear while you browse."
        >
          {isError && (
            <p className={ERROR_LINE}>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Your saved preference couldn&apos;t be read — pick one below to fix it.
            </p>
          )}

          <div
            role="radiogroup"
            aria-labelledby="mature-content-heading"
            className="mt-3.5 grid gap-2"
          >
            {OPTIONS.map((option) => (
              <OptionSlab
                key={option.value}
                label={option.label}
                description={option.description}
                isSelected={visibility === option.value}
                isDisabled={setVisibility.isPending}
                onClick={() => setVisibility.mutate(option.value)}
              />
            ))}
          </div>

          {setVisibility.isError && (
            <p className={ERROR_LINE}>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {String(setVisibility.error)}
            </p>
          )}
        </SettingSheet>

        <SettingSheet
          title="Warn about stacked mods"
          headingId="conflict-warnings-heading"
          description="Flags a character with more than one mod switched on — a mark on their card and a note on their page. ZZMI loads them all, and two mods that alter the same model usually fight over it. Turn this off if you stack mods deliberately; nothing about how mods load changes either way."
          control={
            <SwitchPlate
              // Undefined while the first read is in flight reads as on, matching what the
              // roster and the character pages show meanwhile.
              isOn={conflictWarnings !== false}
              onChange={(enabled) => saveConflictWarnings.mutate(enabled)}
              labelledBy="conflict-warnings-heading"
            />
          }
        >
          {saveConflictWarnings.isError && (
            <p className={ERROR_LINE}>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {String(saveConflictWarnings.error)}
            </p>
          )}
        </SettingSheet>

        <SettingSheet
          title="Preview magnifier"
          headingId="magnifier-heading"
          description="A square lens that follows the pointer over a mod's preview, magnifying what is under it. Clicking the preview still opens it full size either way."
          control={
            <SwitchPlate
              isOn={magnifier.enabled}
              onChange={(enabled) => saveMagnifier({ ...magnifier, enabled })}
              labelledBy="magnifier-heading"
            />
          }
        >
          {/* Kept mounted while off rather than hidden, so turning it back on does not make the
              page jump — and dimmed, because a size you cannot see the effect of is not worth
              reading as an equal control. */}
          <div
            className={`mt-4 transition-opacity ${magnifier.enabled ? "" : "pointer-events-none opacity-40"}`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <label
                htmlFor="magnifier-size"
                className="font-sign text-[16px] uppercase tracking-[0.16em] text-muted-foreground/80"
              >
                Lens size
              </label>
              <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] tabular-nums text-foreground">
                {draftSize} px
              </span>
            </div>
            {/* Live while dragging, written once on release: the lens updates as you move it, but
              a write per pixel would be dozens of database round trips for one decision. */}
            <Slider
              id="magnifier-size"
              className="mt-2"
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
            <div className="mt-4 flex items-center gap-4">
              <div
                className="shrink-0 border-2 border-primary bg-secondary"
                style={{ width: draftSize, height: draftSize }}
              />
              {/* Marker, because it is a note about the thing beside it rather than part of the
                  interface — the one job the hand face has. */}
              <span className="-rotate-[1.4deg] font-hand text-[14px] text-primary">
                actual size
              </span>
            </div>
          </div>

          {saveMagnifierSettings.isError && (
            <p className={ERROR_LINE}>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {String(saveMagnifierSettings.error)}
            </p>
          )}
        </SettingSheet>

        {/* Full width, and last. It is the only setting that is a value rather than a choice, and
            the only one whose value is long enough to need the room. */}
        <section className={`${SHEET} lg:col-span-2`}>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="min-w-[240px]">
              <h3 className={SECTION_TITLE}>Mods folder</h3>
              <p className={SECTION_COPY}>
                Where XXMI/ZZMI loads mods from. Ether Manager files installed mods inside it.
              </p>
            </div>
            {/* The path is a figure the machine holds, so it is set in the machine's face and on a
                plate rather than loose on the card — it is a value, not a sentence. */}
            <p
              className="min-w-0 flex-1 truncate bg-background px-3 py-2.5 font-mono text-[12.5px] font-bold text-foreground shadow-slap"
              title={modsFolder ?? undefined}
            >
              {modsFolder ?? "Not set"}
            </p>
            <button
              type="button"
              className="inline-flex h-9 shrink-0 items-center bg-primary px-5 font-sign text-[18px] uppercase tracking-[0.1em] text-primary-foreground shadow-slap transition-[translate] duration-200 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
              onClick={handleChangeModsFolder}
              disabled={isChangingFolder}
            >
              {isChangingFolder ? "Working…" : "Change"}
            </button>
          </div>
          {/* Said plainly because it is the surprising part: a mod's folder is recorded by its own
            full path, so pointing this somewhere new leaves everything already installed exactly
            where it is — still listed in the library, and no longer anywhere the game reads. */}
          <p className={SECTION_COPY}>
            Mods already installed stay where they are. The game only loads what is inside the
            folder chosen here.
          </p>
          {setFolder.isError && (
            <p className={ERROR_LINE}>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {String(setFolder.error)}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
