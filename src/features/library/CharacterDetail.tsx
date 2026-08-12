import { ArrowLeft, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Character, UpdateCheck } from "@/lib/tauri-commands";
import { AddModDialog } from "./AddModDialog";
import { SlotSection } from "./SlotSection";
import { useModsForCharacter, useUpdateChecks } from "./hooks";

interface CharacterDetailProps {
  character: Character;
  onBack: () => void;
  onBrowse: () => void;
}

/** Every real character has exactly one slot — Character Skin. There's no per-character UI
 * slot; UI mods (character-themed or not) live in the global UI section on the Library page
 * instead (see Library.tsx). Because there is only ever one slot, the page never names it:
 * the banner is the heading, and the slot section below renders bare. */
export function CharacterDetail({ character, onBack, onBrowse }: CharacterDetailProps) {
  const { data: mods, isLoading } = useModsForCharacter(character.id);
  const { data: updateChecks } = useUpdateChecks();
  const updateChecksByModId = new Map<number, UpdateCheck>(
    (updateChecks ?? []).map((check) => [check.mod_id, check]),
  );

  const skins = (mods ?? []).filter((mod) => mod.slot === "CharacterSkin");
  const enabled = skins.filter((mod) => mod.enabled);

  let wearing: string | null = null;
  if (enabled.length === 1) {
    wearing = enabled[0].display_name;
  } else if (enabled.length > 1) {
    wearing = `${enabled[0].display_name} +${enabled.length - 1} more`;
  }

  return (
    <div className="space-y-6">
      {/* The breadcrumb sits above the band, on the page's own background, so the band below
          is a closed frame rather than an open area the art trails out of. */}
      <div className="-mt-2 mb-4 flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={onBack}
          aria-label="Back to library"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="font-heading text-[10px] uppercase tracking-[0.14em] text-primary">
          Library / Character
        </span>
      </div>

      {/* Bordered top and bottom. The art is clipped by the frame, so wherever it ends it ends
          against a yellow line instead of stopping in open space — which is what made it look
          like it was floating. Full-bleed horizontally so it reaches the window edges. */}
      <div className="relative -mx-6 h-[300px] overflow-hidden border-y-2 border-primary bg-card">
        {/* The name again, oversized and barely visible, filling the empty left side. First
            word only — a full name at this size just runs off before it reads as anything.
            Rendered before the art so it paints underneath it without needing a z-index. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -top-1.5 left-3.5 whitespace-nowrap font-heading text-[150px] uppercase leading-none tracking-[0.02em]"
          style={{ color: "rgba(255,255,255,.03)" }}
        >
          {character.name.split(" ")[0]}
        </span>

        {character.banner ? (
          // Purpose-made banner art: 16:9, figure to one side, transparent background. It is
          // sized to the band's height and pinned right, so it is placed rather than cropped —
          // no blurred wash and no feathered mask, because the art already has empty space
          // where the text goes.
          <img
            src={character.banner}
            alt=""
            aria-hidden
            // Scaled and offset so the figure spans the band exactly, touching both borders.
            // The figure occupies y 120-958 of the 1920x1080 canvas — 838px of real content
            // with dead black above and below. At 387px tall those 838px scale to the band's
            // 300px, and pulling the image up 43px puts the top of the figure on the top
            // border and the bottom of it on the bottom one.
            className="absolute right-0 top-[-43px] h-[387px] w-auto max-w-none"
          />
        ) : character.portrait ? (
          <>
            {/* The same portrait, blurred hard, fills the width behind the figure. Without it
                the left two thirds are flat black and the banner reads as empty. */}
            <img
              src={character.portrait}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full scale-110 object-cover blur-3xl brightness-[.34] saturate-50"
            />
            {/* The figure itself: a cover crop of the right half, faded out on its left edge so
                it dissolves into the wash instead of ending on a hard vertical seam. */}
            <img
              src={character.portrait}
              alt=""
              aria-hidden
              // Fixed width, not a percentage: cover scales the art up until it fills the box,
              // so a box that grows with the window magnifies the portrait with it. 460x300
              // matches the 1000x1303 source at half height, so this crops to the top half at
              // roughly 1:1 and stays that way at every window size.
              className="absolute inset-y-0 right-0 h-full w-[460px] object-cover object-top"
              style={{
                maskImage: "linear-gradient(90deg, transparent, #000 34%)",
                WebkitMaskImage: "linear-gradient(90deg, transparent, #000 34%)",
              }}
            />
          </>
        ) : (
          // 7 of the 60 ship without art. The initial takes the figure's place rather than
          // stretching a placeholder across the whole banner, and fades out on the same edge —
          // a flat panel here would put a hard vertical seam where the portrait feathers.
          <div
            className="absolute inset-y-0 right-0 flex w-[460px] items-center justify-center bg-secondary font-heading text-[150px] leading-none text-muted-foreground/15"
            style={{
              maskImage: "linear-gradient(90deg, transparent, #000 34%)",
              WebkitMaskImage: "linear-gradient(90deg, transparent, #000 34%)",
            }}
          >
            {character.name.charAt(0)}
          </div>
        )}

        {/* Darkens the left side so the name and buttons stay legible over the portrait crop.
            Banner art already has a clear black field where the text goes, and tinting it would
            only reintroduce a visible seam against the band. */}
        {!character.banner && (
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, rgba(10,10,12,.92) 0 30%, rgba(10,10,12,.1) 58%, transparent)",
            }}
          />
        )}

        <div className="absolute inset-0 flex flex-col justify-end p-5">
          <div>
            <h2 className="text-[46px] leading-[0.92] [text-shadow:0_3px_24px_rgba(0,0,0,.95)]">
              {character.name}
            </h2>
            <p className="mt-2 font-heading text-[11px] uppercase tracking-[0.12em] text-primary">
              {skins.length === 0
                ? "No mods yet"
                : `${skins.length} ${skins.length === 1 ? "mod" : "mods"} · ${enabled.length} on`}
            </p>
            {wearing && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Wearing <span className="font-semibold text-foreground">{wearing}</span>
              </p>
            )}
            <div className="mt-3.5 flex gap-2">
              <AddModDialog
                characterId={character.id}
                slot="CharacterSkin"
                triggerVariant="default"
              />
              <Button type="button" variant="outline" size="sm" onClick={onBrowse}>
                <Compass className="h-3.5 w-3.5" />
                Browse for more
              </Button>
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="aspect-[16/10] w-full" />
          ))}
        </div>
      ) : (
        <SlotSection
          characterId={character.id}
          slot="CharacterSkin"
          mods={skins}
          updateChecksByModId={updateChecksByModId}
          showHeader={false}
        />
      )}
    </div>
  );
}
