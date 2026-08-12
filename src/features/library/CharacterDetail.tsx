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
      {/* Full-bleed against the main region's padding, so the art reaches the window edges
          rather than floating in a 24px gutter. */}
      <div className="relative -mx-6 -mt-6 h-[300px] overflow-hidden border-b-2 border-primary bg-card">
        {character.portrait ? (
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
              className="absolute inset-y-0 right-0 h-full w-[54%] object-cover object-[50%_18%]"
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
            className="absolute inset-y-0 right-0 flex w-[54%] items-center justify-center bg-secondary font-heading text-[150px] leading-none text-muted-foreground/15"
            style={{
              maskImage: "linear-gradient(90deg, transparent, #000 34%)",
              WebkitMaskImage: "linear-gradient(90deg, transparent, #000 34%)",
            }}
          >
            {character.name.charAt(0)}
          </div>
        )}

        {/* Darkens the left side so the name and buttons stay legible over whatever art. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, rgba(10,10,12,.92) 0 30%, rgba(10,10,12,.1) 58%, transparent)",
          }}
        />

        <div className="absolute inset-0 flex flex-col justify-between p-5">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7 border-white/20 bg-background/50"
              onClick={onBack}
              aria-label="Back to library"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="font-heading text-[10px] uppercase tracking-[0.14em] text-primary">
              Library / Character
            </span>
          </div>

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
