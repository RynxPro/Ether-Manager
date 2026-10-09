import { ArrowDown, Compass, FilePlus2, FolderOpen } from "lucide-react";
import { useRef, useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { PageHeader } from "@/components/PageHeader";
import { SignStrip } from "@/components/SignStrip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CARD_GRID } from "@/lib/layout";
import type { Character, Mod, UpdateCheck } from "@/lib/tauri-commands";
import { SlotSection } from "./SlotSection";
import { useModsForCharacter, useToggleMod, useUpdateChecks } from "./hooks";

interface CharacterDetailProps {
  character: Character;
  onBrowse: () => void;
  /** Opens an installed mod's GameBanana page, via App's shared detail route. */
  onOpenModDetail: (mod: Mod) => void;
  /** Opens the file picker and starts an import — for a mod that came from somewhere other
   * than GameBanana. Dropping the file anywhere on the window does the same thing. */
  onImport: () => void;
}

/** On a character page a mod is a look the character is wearing, not a feature being switched
 * on, so the cards say so. Everywhere else `ModCard` is rendered — the Library's UI and Misc
 * tabs, All Mods — the default Enable/Disable stands, because a HUD skin is not worn. */
const WEAR_VERBS = { enable: "Wear this", disable: "Take it off" };

/** Every real character has exactly one slot — Character Skin. There's no per-character UI
 * slot; UI mods (character-themed or not) live in the global UI section on the Library page
 * instead (see Library.tsx). Because there is only ever one slot, the page never names it:
 * the banner is the heading, and the slot section below renders bare.
 *
 * This page was the last one still wearing the pre-street look, and that — rather than any
 * change of behaviour — is what the rewrite is about. It opened with a hand-rolled breadcrumb
 * and a full-bleed band framed top and bottom in the accent: a red rule across the window, which
 * is the exact element `PageHeader` was rebuilt to stop drawing, and which made the banner read
 * as a channel cut through the page rather than an object on it. Its two actions were shadcn's
 * default and outline buttons, in an app where everything you can press is paper.
 *
 * So it now starts the way every other top-level page starts: `PageHeader`, which brings the
 * 48px display title, the accent sprayed under the word instead of ruled across the window, and
 * the section's name tagged on the wall behind it. Then the `SignStrip`, carrying what this page
 * can say about itself in numbers. The banner keeps its place and its carefully measured crop,
 * but becomes what every other surface here is — board with a drawn edge, a print margin, and
 * one hard shadow under it. */
export function CharacterDetail({
  character,
  onBrowse,
  onOpenModDetail,
  onImport,
}: CharacterDetailProps) {
  const { data: mods, isLoading } = useModsForCharacter(character.id);
  const { data: updateChecks } = useUpdateChecks();
  const toggleMod = useToggleMod();
  // Either of the band's two verbs can fail — a folder moved since the last read, a rename the
  // game is holding open — and a button that silently does nothing is the worst of the options.
  // One slot for both, because they cannot fail at the same moment, and it takes the band's
  // machine line rather than a row of its own so nothing here can change height.
  const [bandError, setBandError] = useState<string | null>(null);
  // Held locally rather than read off `toggleMod.isPending`: taking several mods off is several
  // mutations in a row, and the shared pending flag drops to false between each one, which would
  // flicker the label.
  const [isTakingOff, setIsTakingOff] = useState(false);

  /** The shelf of looks this character already owns. The band needs a handle on it so
   * "Wear one" can point at something concrete. */
  const shelf = useRef<HTMLDivElement>(null);

  /** Sends you to the mods you already have, rather than out to Browse.
   *
   * The empty band had one verb on it and it was Find more, which leaves the app — while four
   * looks you had already installed sat two hundred pixels below, unmentioned. This scrolls to
   * them and puts focus on the first, so the keyboard arrives where the eye does. Deliberately
   * not "enable the first one for you": which look a character wears is the one decision this
   * page exists to let you make. */
  function goToShelf() {
    const node = shelf.current;
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "start" });
    node.querySelector<HTMLElement>("button, a, [role=button]")?.focus({ preventScroll: true });
  }

  async function revealWornFolder(folderPath: string) {
    setBandError(null);
    try {
      await revealItemInDir(folderPath);
    } catch (error) {
      setBandError(`Could not open the folder — ${String(error)}`);
    }
  }

  /** Turns off every mod that is on, one at a time.
   *
   * Sequential rather than parallel, and that is not caution for its own sake: switching a mod
   * off renames its folder on disk, `toggle_mod` runs on the main thread with a two-second retry
   * budget when a file is locked, and firing several renames at once inside one character's
   * directory is a race with the window frozen for the duration. In a row, each one finishes
   * before the next starts and the worst case is slow rather than wrong.
   *
   * A failure stops the run, so the mods after it stay on — which is honest: the band will still
   * say what is on, and the line below says what went wrong. */
  async function takeOffEnabled(mods: Mod[]) {
    setBandError(null);
    setIsTakingOff(true);
    try {
      for (const mod of mods) {
        await toggleMod.mutateAsync({ modId: mod.id, enabled: false });
      }
    } catch (error) {
      setBandError(String(error));
    } finally {
      setIsTakingOff(false);
    }
  }
  const updateChecksByModId = new Map<number, UpdateCheck>(
    (updateChecks ?? []).map((check) => [check.mod_id, check]),
  );

  const skins = (mods ?? []).filter((mod) => mod.slot === "CharacterSkin");
  const enabled = skins.filter((mod) => mod.enabled);

  // The mod the page is about. With more than one on, the first is the one the band names and
  // the one its buttons act on — the same mod `wearing` leads with, so the words and the
  // controls can never be talking about different things.
  const worn = enabled[0] ?? null;

  let wearing: string | null = null;
  if (enabled.length === 1) {
    wearing = enabled[0].display_name;
  } else if (enabled.length > 1) {
    wearing = `${enabled[0].display_name} +${enabled.length - 1} more`;
  }

  const wornVariant = worn?.variant_label?.trim() || null;
  const byline = worn
    ? [wornVariant, worn.gamebanana_mod_id === null ? "Added by hand" : "From GameBanana"]
        .filter(Boolean)
        .join(" · ")
    : "";

  // This character's, not the library's: the strip reports the page it is bolted to.
  const updatesWaiting = skins.filter(
    (mod) => updateChecksByModId.get(mod.id)?.status === "UpdateAvailable",
  ).length;

  // Built only from what the page already knows, and skipping anything still loading rather than
  // printing a zero — a strip that reads "0 MODS" for a moment on every open is worse than one
  // that arrives a beat late. Ordered most- to least-changeable, since the strip shows only part
  // of itself at once and the first item is the one on screen when the page opens.
  const signItems = [
    mods === undefined ? null : `${skins.length} ${skins.length === 1 ? "MOD" : "MODS"}`,
    mods === undefined ? null : wearing === null ? "NOTHING ON" : `WEARING ${wearing}`,
    updatesWaiting > 0 ? `${updatesWaiting} WAITING` : null,
  ].filter((item): item is string => item !== null);

  const subtitle =
    skins.length === 0
      ? "No mods yet"
      : `${skins.length} ${skins.length === 1 ? "mod" : "mods"} · ${enabled.length} on`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={character.name}
        // A drill-down, but the tag still earns its place: it is the app's own word for what
        // kind of page this is, never the character's name — that is user-visible roster content,
        // and at 148px an arbitrary name runs off the window.
        tag="Character"
        subtitle={subtitle}
        // The page below is a short grid, not a sixty-card roster, so nothing scrolls far enough
        // for a pinned band to be worth the context it costs.
        //
        // And no `leading` back button. The title bar carries back and forward, never scrolls,
        // and is where every browser and file manager puts them — TitleBar's own comment says
        // the point of moving them there was that no page would need its own. This page had one
        // anyway, left over from before that change, so pressing it and pressing the arrow eight
        // pixels above it did the same thing.
        pinned={false}
      >
        {/* Import alone. Find more moved down into the band, where the rest of the verbs
            about this character live — see the comment on the button row there. */}
        <Button
          type="button"
          size="sm"
          onClick={onImport}
          className="h-[38px] rotate-[0.7deg] border-0 bg-card px-4 font-sign text-[17px] uppercase tracking-[0.1em] text-card-foreground shadow-slap transition-[rotate,translate] duration-200 hover:-translate-y-px hover:rotate-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary hover:bg-card"
        >
          <FilePlus2 className="h-3.5 w-3.5" />
          Import
        </Button>
      </PageHeader>

      <SignStrip items={signItems} />

      {/* Board on the wall, not a framed strip.

          It used to be full-bleed with `border-y-2 border-primary` — a red rule across the whole
          window, top and bottom. As paper it is the same object as the cards below it: a drawn
          edge, a 5px print margin, a recessed well, one hard shadow. The tilt is a third of a
          degree, which is enough that its top edge is not quite parallel with the sign above it,
          and that near-miss is the whole trick. */}
      <div className="relative -rotate-[0.35deg] border-2 border-border bg-card p-[5px] shadow-slap-lift">
        <div className="relative h-[440px] overflow-hidden bg-art">
          {character.banner ? (
            // Filling the well rather than placed against its right edge.
            //
            // It used to be pinned right at its natural height, which is a defensible way to
            // avoid cropping and it left two thirds of the band empty — a wide dark rectangle
            // with a figure stuck on one end. Covering the whole well is what makes this a
            // picture the page is built on instead of a strip with a decoration in it.
            //
            // It does cost a crop, and the crop is real: the banners are 810px tall and 1395 to
            // 1935 wide, so covering a band this shape keeps a horizontal slice and discards the
            // rest. `object-position` is set high because these are close-up bust illustrations
            // and the face sits in the upper third of essentially all of them — one blind rule
            // for the whole roster, the same call `CharacterCard` makes about its portraits.
            <img
              src={character.banner}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: "50% 22%" }}
            />
          ) : character.portrait ? (
            <>
              {/* The same portrait, blurred hard, fills the width behind the figure. Without it
                  the left two thirds are flat and the band reads as empty. Lifted from .34 to
                  .5: it is under the scrim now as well, and two darkenings stacked took it to
                  near-black. */}
              <img
                src={character.portrait}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full scale-110 object-cover blur-3xl brightness-[.5] saturate-50"
              />
              {/* The figure itself, faded out on its left edge so it dissolves into the wash
                  instead of ending on a hard vertical seam.

                  Scaled up, and that is the whole fix here. These are 480x640 transparent
                  cutouts of a standing figure, so a good third of the frame is empty air — drop
                  one into a box this size untouched and the character comes out about 200px
                  wide in a 440px band, which is what made this fallback look thin beside the 58
                  characters who have a real banner. `origin-top` with a 1.4x scale crops into
                  the art the way `CharacterCard` does, so the figure fills the height instead of
                  floating in the middle of it.

                  Fixed width, not a percentage: cover scales the art up until it fills the box,
                  so a box that grew with the window would magnify the portrait with it. */}
              <img
                src={character.portrait}
                alt=""
                aria-hidden
                className="absolute inset-y-0 right-0 h-full w-[560px] origin-top scale-[1.4] object-cover object-top"
                style={{
                  maskImage: "linear-gradient(90deg, transparent, #000 34%)",
                  WebkitMaskImage: "linear-gradient(90deg, transparent, #000 34%)",
                }}
              />
            </>
          ) : (
            // 7 of the 60 ship without art. The initial takes the figure's place rather than
            // stretching a placeholder across the whole band, and fades out on the same edge —
            // a flat panel here would put a hard vertical seam where the portrait feathers.
            <div
              className="absolute inset-y-0 right-0 flex w-[560px] items-center justify-center bg-secondary font-heading text-[190px] leading-none text-muted-foreground/15"
              style={{
                maskImage: "linear-gradient(90deg, transparent, #000 34%)",
                WebkitMaskImage: "linear-gradient(90deg, transparent, #000 34%)",
              }}
            >
              {character.name.charAt(0)}
            </div>
          )}

          {/* Two axes, because the art now runs under everything: the left one gives the words
              a surface to sit on, the bottom one stops the picture ending against the well's
              edge in mid-detail.

              Both were pulled back — the left wash from 45% at 30% to 30% at 20%, the bottom
              from 58% to 64% — because they were covering the thing the page is for. The band
              is the one place a character is shown at size, and two short lines of Courier do
              not need half a banner darkened behind them to stay legible. What made this look
              unavoidable was Belle and Wise, the two characters with no banner at all: their
              fallback blurs a portrait at .5 brightness and then this scrim darkened it again,
              which read as a black rectangle and got blamed on the scrim rather than on the
              missing art.
              Both run to the well's own colour rather than to black, which is what keeps this
              reading as a recess in board instead of a gradient laid over a photograph — and it
              is why it works in Daylight too, where a black scrim would be a bruise. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, var(--art) 2%, color-mix(in srgb, var(--art) 30%, transparent) 20%, transparent 42%), linear-gradient(transparent 64%, color-mix(in srgb, var(--art) 88%, transparent))",
            }}
          />

          {/* Top and bottom rather than centred: the words hang off the top edge of the well and
              the controls off the bottom, which is what stops a 440px band reading as a caption
              floating in the middle of a picture. */}
          <div className="absolute inset-0 flex flex-col justify-between p-6">
            <div className="max-w-[520px]">
              <span className="block font-mono text-[12px] font-bold uppercase tracking-[0.22em] text-primary">
                {/* No pronoun. A third of the roster is not a "she" — Anton, Ben Bigger,
                    Billy Kid, Harumasa, Hugo, Lighter, Seth, Von Lycaon and Wise among them —
                    and Pyrois and Promeia are not people at all. The character's own name is
                    already the page title directly above, so the label does not need a subject:
                    dropping it is shorter as well as correct. */}
                {worn ? "Wearing" : "Wearing nothing"}
              </span>
              {worn ? (
                <>
                  {/* Annotation, and the one place on this page allowed the marker: it is the
                      app talking about the picture, not data being reported. */}
                  <span className="mt-4 inline-block -rotate-[1.5deg] font-hand text-[15px] text-primary">
                    right now →
                  </span>
                  <p className="mt-1 font-heading text-[38px] uppercase leading-[0.96] tracking-[0.005em] text-foreground">
                    {wearing}
                  </p>
                  <p className="mt-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    {bandError
                      ? bandError
                      : enabled.length > 1
                        ? `${enabled.length} enabled — they may conflict`
                        : byline}
                  </p>
                </>
              ) : (
                <p className="mt-3 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  {skins.length === 0
                    ? "Nothing installed yet"
                    : `${skins.length} to choose from below`}
                </p>
              )}
            </div>

            {/* The worn mod's own controls. They belong to the band rather than to a card,
                because this is the one mod the page is actually about — and the card for it is
                one of six identical rectangles below, where "the thing you are wearing" is not
                where the eye goes first.
                Paper, tilted opposite ways, in the same sizes the header's slaps use. */}
            {/* The verbs for this character, on the band rather than split between here and the
                page header.

                Mod page is gone from this row: it acted on the worn mod, which already has a
                card in the shelf below whose whole picture opens exactly that page — so it was
                the one button here duplicating something a click away, and it vanished entirely
                for a hand-added mod, leaving a row that changed length depending on where the
                mod came from.

                Find more took its place and came down from the header, because it belongs with
                these: they are all things you do about this character. It is also the one verb
                that has to be here when nothing is on — a character with an empty shelf is
                precisely who needs it — so it renders on its own in that case. */}
            <div className="flex flex-wrap items-center gap-2.5">
              {worn && (
                <>
                  {/* One verb, and it says how many it is about to act on. Stacking is allowed
                      but rarely a good idea — the line above already warns that mods touching
                      the same model conflict — so when more than one is on, the useful button is
                      the one that clears them all rather than the one that peels off whichever
                      happened to be first. */}
                  <button
                    type="button"
                    disabled={isTakingOff}
                    onClick={() => void takeOffEnabled(enabled)}
                    className="inline-flex h-[38px] -rotate-[0.6deg] items-center gap-2 bg-primary px-4 font-sign text-[17px] uppercase tracking-[0.1em] text-primary-foreground shadow-slap transition-[rotate,translate] duration-200 hover:-translate-y-px hover:rotate-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-70"
                  >
                    {isTakingOff
                      ? enabled.length > 1
                        ? "Taking them off…"
                        : "Taking it off…"
                      : enabled.length > 1
                        ? `Take all ${enabled.length} off`
                        : "Take it off"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void revealWornFolder(worn.folder_path)}
                    className="inline-flex h-[38px] rotate-[0.5deg] items-center gap-2 bg-card px-4 font-sign text-[17px] uppercase tracking-[0.1em] text-card-foreground shadow-slap transition-[rotate,translate] duration-200 hover:-translate-y-px hover:rotate-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    Open folder
                  </button>
                </>
              )}
              {/* Only when there is something to wear. On a character with an empty shelf the
                  one honest verb is Find more, which is why that renders unconditionally. */}
              {!worn && skins.length > 0 && (
                <button
                  type="button"
                  onClick={goToShelf}
                  className="inline-flex h-[38px] -rotate-[0.6deg] items-center gap-2 bg-primary px-4 font-sign text-[17px] uppercase tracking-[0.1em] text-primary-foreground shadow-slap transition-[rotate,translate] duration-200 hover:-translate-y-px hover:rotate-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                  Wear one
                </button>
              )}
              <button
                type="button"
                onClick={onBrowse}
                className="inline-flex h-[38px] -rotate-[0.4deg] items-center gap-2 bg-card px-4 font-sign text-[17px] uppercase tracking-[0.1em] text-card-foreground/70 shadow-slap transition-[rotate,translate] duration-200 hover:-translate-y-px hover:rotate-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary hover:text-card-foreground"
              >
                <Compass className="h-3.5 w-3.5" />
                Find more
              </button>
            </div>
          </div>
        </div>
      </div>

      <div ref={shelf}>
        {isLoading ? (
          <div className={CARD_GRID}>
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="aspect-[16/10] w-full" />
            ))}
          </div>
        ) : (
          <SlotSection
            mods={skins}
            updateChecksByModId={updateChecksByModId}
            onOpenModDetail={onOpenModDetail}
            verbs={WEAR_VERBS}
            // The one surface where being on is rare: a character wears a single look, so one
            // card in this shelf is marked and the rest are not.
            emphasiseEnabled
          />
        )}
      </div>
    </div>
  );
}
