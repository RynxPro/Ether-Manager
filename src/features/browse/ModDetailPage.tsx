import {
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileWarning,
  Settings as SettingsIcon,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { MatureContentShield } from "@/components/MatureContentShield";
import { PageHeader } from "@/components/PageHeader";
import { SignStrip } from "@/components/SignStrip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDownloadProgress, useDownloads } from "@/features/downloads/hooks";
import {
  useInstalledFromGameBanana,
  useReinstallMod,
} from "@/features/library/hooks";
import {
  useMagnifierSettings,
  useMatureContentVisibility,
} from "@/features/settings/hooks";
import { executablesIn, fileScan } from "@/lib/fileScan";
import { shouldBlur } from "@/lib/mature";
import { tiltFor } from "@/lib/tilt";
import {
  gameBananaModId,
  useExternalLink,
  ZZZ_GAME_ID,
} from "@/lib/useExternalLink";
import { placeholderGbMod } from "@/lib/placeholderGbMod";
import { parkedHrefFrom, sanitizeUserHtml } from "@/lib/userHtml";
import { useQueryClient } from "@tanstack/react-query";
import { exactDate, updatedLabel } from "@/lib/time";
import { cn } from "@/lib/utils";
import {
  getGamebananaModDetail,
  type Download,
  type GbFile,
  type GbMod,
  type GbModDetail,
  type GbPreviewImage,
  type Mod,
} from "@/lib/tauri-commands";
import { ImageLightbox } from "./ImageLightbox";
import { ModComments } from "./ModComments";
import { MagnifiedImage } from "./MagnifiedImage";
import {
  useAddBookmark,
  useBookmarks,
  useGamebananaModDetail,
  useRemoveBookmark,
} from "./hooks";

interface ModDetailPageProps {
  mod: GbMod;
  /** Passes the freshly fetched `detail` alongside `file` — unlike the outer `mod` prop (which
   * can be a placeholder when opened from Bookmarks, missing category/tag data), `detail` is
   * always a real live fetch, so the install flow's target-guessing reads from this instead. */
  onInstall: (file: GbFile, detail: GbModDetail) => void;
  /** Opens the author's page. The submitter block is the only route to it — a mod is how you
   * find a creator worth following. */
  onOpenCreator: (id: number, name: string) => void;
  /** Opens another mod, for the GameBanana links authors put in their descriptions. */
  onOpenMod: (mod: GbMod) => void;
}

/** The shape the hero falls back to for the moment between mount and the image reporting its
 * real dimensions. Only ever visible on a cold load; after that the browser cache answers
 * immediately. */
const FALLBACK_RATIO = 1.6;

/** Queue states where the work is still coming. Everything else — installed, failed, cancelled —
 * is history the Downloads page keeps, and says nothing about what this button should do now. */
const UNFINISHED_STATUSES = new Set([
  "Queued",
  "Downloading",
  "Extracting",
  "Paused",
]);

/** The right column's width, shared by the panel and the skeleton that stands in for it while
 * the fetch is in flight. Two places that have to agree. */
const SIDE_PANEL_WIDTH = "w-[430px]";

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The hero shows the original upload; the tiles take the pre-rendered 530px size, which is
 * already wider than a tile ever gets. */
function imageUrl(image: GbPreviewImage, full: boolean): string {
  return `${image.base_url}/${full ? image.file : (image.file_530 ?? image.file)}`;
}

/** GameBanana's `_aEmbeddedMedia` is a list of raw video page URLs (YouTube, confirmed live),
 * not ready-to-embed ones — this extracts the video id and builds the `/embed/` form. */
function youtubeEmbedUrl(url: string): string | null {
  const match =
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/.exec(url);
  return match ? `https://www.youtube.com/embed/${match[1]}` : null;
}

/** A page rather than a dialog: screenshots, showcase video, a full description and a file list
 * are more content than a modal can hold without its own inner scroll region fighting the
 * page's. Reached from Browse or Bookmarks; the title bar's back arrow returns to
 * whichever sent you.
 *
 * Two columns, because the install control used to sit below the description — and a real
 * GameBanana description runs to eighteen thousand characters, so the one thing the page exists
 * for was a page-length scroll away. The right column carries it instead, and is pinned, so it
 * stays reachable however far down the description you are. */
export function ModDetailPage({
  mod,
  onInstall,
  onOpenCreator,
  onOpenMod,
}: ModDetailPageProps) {
  const { data: detail, isLoading } = useGamebananaModDetail(mod.id);
  const externalLink = useExternalLink();
  const queryClient = useQueryClient();

  /** Follows a link out of a mod's description.
   *
   * A GameBanana link to a ZZZ mod opens that mod's page here instead of in a browser — authors
   * point at each other constantly ("pairs with this hair", "needs my other mod"), and sending
   * you out to a website to read something this app renders better was always the wrong answer.
   *
   * The game has to be checked first, because `Mod/:id` answers for every game on the site and
   * the id came out of somebody's description. Anything that is not ZZZ, and anything that is
   * not a mod page at all, falls through to the browser confirmation untouched.
   *
   * `fetchQuery` rather than a bare fetch, on the same key the detail page reads: the check and
   * the page it leads to are the same request, so the page opens against a warm cache instead of
   * asking twice. */
  async function followDescriptionLink(url: string) {
    const modId = gameBananaModId(url);
    if (modId === null) {
      externalLink.requestOpen(url, "author");
      return;
    }

    try {
      const linked = await queryClient.fetchQuery({
        queryKey: ["gbModDetail", modId],
        queryFn: () => getGamebananaModDetail(modId),
      });
      if (linked.game.id !== ZZZ_GAME_ID) {
        externalLink.requestOpen(url, "author");
        return;
      }
      onOpenMod(
        placeholderGbMod({
          gamebananaModId: linked.id,
          name: linked.name,
          thumbnailUrl: linked.preview_media.images[0]
            ? imageUrl(linked.preview_media.images[0], true)
            : null,
          dateModified: linked.date_modified,
        }),
      );
    } catch {
      // The lookup failed, so nothing is known about the mod — including whether it is ZZZ.
      // Falling back to the browser is the honest outcome; the link itself is still good.
      externalLink.requestOpen(url, "author");
    }
  }
  const { data: visibility } = useMatureContentVisibility();
  // Falls back to on at the default size for the moment before the setting arrives — the lens
  // only appears on hover, so a wrong guess for one frame is invisible.
  const { data: magnifier = { enabled: true, size: 120 } } =
    useMagnifierSettings();
  const { data: bookmarks } = useBookmarks();
  const addBookmark = useAddBookmark();
  const removeBookmark = useRemoveBookmark();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  // Deliberately not reset when the selection changes: holding the previous picture's shape
  // until the next one has decoded keeps the frame from snapping through the fallback on
  // every click.
  const [heroRatio, setHeroRatio] = useState(FALLBACK_RATIO);

  const images = detail?.preview_media.images ?? [];
  const activeImage = images[activeImageIndex] ?? images[0];
  const sanitizedDescription = detail?.description_html
    ? sanitizeUserHtml(detail.description_html)
    : "";
  const installed = useInstalledFromGameBanana();
  const installedCount = installed.countByModId.get(mod.id) ?? 0;
  const reinstall = useReinstallMod();

  // The queue's own view of what is in flight. Pressing Install here hands the work to the
  // Downloads page, which used to mean the button went straight back to saying "Install" while
  // megabytes were arriving — the one screen you pressed it on being the only one with nothing
  // to report. These two are what the Downloads page reads; borrowing them costs a second
  // listener and keeps a single description of the queue.
  const { data: downloads } = useDownloads();
  const liveProgress = useDownloadProgress();

  /** The unfinished download for a file, if any. Finished, failed and cancelled rows stay in
   * the queue as history, and none of them should hold the button hostage. */
  const inFlightByFileId = new Map<number, Download>();
  for (const download of downloads ?? []) {
    if (UNFINISHED_STATUSES.has(download.status)) {
      inFlightByFileId.set(download.gamebanana_file_id, download);
    }
  }

  /** What the button says while this file is being fetched, or `null` when it is not.
   *
   * Live bytes where there are any, the stored ones otherwise — the persisted counts only move
   * at phase boundaries, so a row that started before this page was opened still shows a real
   * figure rather than 0% until the next tick. A percentage needs a total, and GameBanana does
   * not always send one, so the no-total case says what is happening instead of inventing a
   * number. */
  function inFlightLabel(fileId: number): string | null {
    const download = inFlightByFileId.get(fileId);
    if (!download) return null;
    if (download.status === "Queued") return "Queued";
    if (download.status === "Paused") return "Paused";

    const live = liveProgress[download.id];
    if (download.status === "Extracting" || live?.isExtracting)
      return "Unpacking…";

    const downloaded = live?.downloaded ?? download.downloaded_bytes;
    const total = live?.total ?? download.total_bytes;
    if (!total) return "Fetching…";
    return `${Math.min(100, Math.floor((downloaded / total) * 100))}%`;
  }

  /** What pressing this file's button should do, and say.
   *
   * Reinstalling replaces one library row's files in place, so it needs exactly one row to
   * address. With none there is nothing to replace; with two — the same file filed under two
   * characters — there is no way to choose, and silently picking one would be worse than not
   * offering it. Both of those fall back to installing a fresh copy, which is what the button
   * has always done, now labelled honestly. */
  function fileAction(fileId: number): {
    kind: "install" | "again" | "reinstall";
    label: string;
    target: Mod | null;
  } {
    const rows = installed.byFileId.get(fileId) ?? [];
    if (rows.length === 0)
      return { kind: "install", label: "Install", target: null };
    if (rows.length > 1)
      return { kind: "again", label: "Install again", target: null };
    return { kind: "reinstall", label: "Reinstall", target: rows[0] };
  }
  // Blurring reads the `mod` list record, not `detail`, and that is deliberate: the two other
  // ways into this page — a bookmark, an installed mod — build their `mod` with
  // `placeholderGbMod`, which reports `is_mature: false` on purpose. Both describe something
  // the user already chose, so covering it back up would ask a question they have answered.
  // Also gated on the visibility setting, same as BrowseGrid/FeaturedBanner.
  //
  // The Rating row below must NOT use this. It states a fact about the mod rather than deciding
  // what to cover, and a placeholder would have it call every mod in your library "Safe".
  const isMature = shouldBlur(visibility, mod.is_mature);
  const isBookmarked = (bookmarks ?? []).some(
    (entry) => entry.gamebanana_mod_id === mod.id,
  );
  // A bookmark placeholder from the Bookmarks view carries no category, so fall through to
  // nothing rather than printing a bare "Mod /".
  const categoryName =
    detail?.category.name ?? mod.sub_category?.name ?? mod.root_category.name;

  // Arrowing past the eighth of fifteen thumbnails would otherwise leave the lit one somewhere
  // off the side of the strip, so the strip follows the selection.
  const activeThumb = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeThumb.current?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [activeImageIndex]);

  function step(delta: number) {
    setActiveImageIndex(
      (current) => (current + delta + images.length) % images.length,
    );
  }

  function handleToggleBookmark() {
    if (isBookmarked) {
      removeBookmark.mutate(mod.id);
    } else {
      addBookmark.mutate({
        gamebananaModId: mod.id,
        name: detail?.name ?? mod.name,
        thumbnailUrl: images[0] ? imageUrl(images[0], true) : null,
        // `detail` is a live fetch and carries the one specific category; the placeholder
        // fallback covers bookmarking before it lands, and the backfill sorts that out later.
        categoryName: detail?.category.name ?? mod.sub_category?.name ?? null,
      });
    }
  }

  return (
    <div className="space-y-5">
      {externalLink.dialog}
      {/* One header, always here, pinned to the top of the page.
          It used to be two: a tall band that scrolled away and a slim bar that faded in to
          replace it once an observer decided the first was gone. Three rounds of bugs came out
          of the two having to agree — the bar mounting and unmounting fed back into the page
          height and made it flicker; the observer only flipped when the tall band was gone to
          the last pixel, so on a short page it never appeared at all and there was no way back;
          and because the bar had to stop short of the pinned right column while the band ran
          the full width, the accent rule visibly broke in half the moment you scrolled.
          None of those are separate faults. They are all the cost of a heading that changes
          identity partway down the page, so it does not change any more.

          Nothing here depends on scroll position, which is what makes it stable: no observer,
          no state, no second copy of the title or of the way out, and a constant height that
          cannot feed back into the scrolling it would be measured against. The rule is the
          header's own bottom border, so it is the full width of the page at every scroll
          position by construction rather than by two elements matching.

          The pinning itself now lives in `PageHeader`, which every page gets: this page wanted
          it first and carried its own wrapper for a while, but "which page am I on, and how do I
          leave it" is not a question only a mod page has. The mechanics, and why the gallery's
          arrows have to lose the z-index fight, are documented there. */}
      <PageHeader
        title={detail?.name ?? mod.name}
        // The app's own word for what kind of page this is, sprayed on the wall behind the
        // title — never the mod's name, which is arbitrary length and somebody else's text.
        tag="Mod"
        subtitle={categoryName ? `Mod · ${categoryName}` : "Mod"}
        // Unpinned, and that is a real trade rather than a free win. A GameBanana description
        // runs to eighteen thousand characters, so this is the longest scroll in the app and
        // the page it replaced pinned its header specifically to keep the title in view. But
        // pinning forces `overflow-hidden`, and the wall tag is deliberately taller than the
        // band it sits in — a pinned header cuts the sprayed word in half and puts a rule under
        // it, which is the exact chrome this pass exists to remove. The title bar carries back
        // and forward, so nothing here is unreachable once the heading scrolls away.
        pinned={false}
      >
        {/* Up here rather than down with the files, because it changes what this page is for:
            you came to decide whether to install something you already have. Which file you
            have is a separate question, answered in the list itself. */}
        {installedCount > 0 && (
          <span className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-success">
            <Check className="h-3.5 w-3.5 shrink-0" />
            {installedCount > 1
              ? `In your library · ${installedCount} variants`
              : "In your library"}
          </span>
        )}
        {/* Both controls come up from the side panel. They act on the mod as a whole rather
            than on one of its files, which is what the header band is for — and it leaves the
            panel below holding only the things that differ per file. Paper, tilted opposite
            ways, exactly as the Library and All Mods headers do it. */}
        {detail && (
          <>
            <Button
              type="button"
              size="sm"
              onClick={handleToggleBookmark}
              aria-label={
                isBookmarked
                  ? `Remove ${detail.name} from bookmarks`
                  : `Bookmark ${detail.name}`
              }
              className="h-[38px] rotate-[0.6deg] border-0 bg-card px-4 font-sign text-[17px] uppercase tracking-[0.1em] text-card-foreground shadow-slap transition-[rotate,translate] duration-200 hover:-translate-y-px hover:rotate-0 hover:bg-card"
            >
              <Bookmark
                className="h-3.5 w-3.5"
                fill={isBookmarked ? "currentColor" : "none"}
              />
              {isBookmarked ? "Bookmarked" : "Bookmark"}
            </Button>
            {/* The opener plugin, not an anchor: `target="_blank"` does not navigate inside a
                WebView2, so a plain link here would simply do nothing. */}
            <Button
              type="button"
              size="sm"
              onClick={() => externalLink.requestOpen(detail.profile_url)}
              className="h-[38px] -rotate-[0.5deg] border-0 bg-card px-4 font-sign text-[17px] uppercase tracking-[0.1em] text-card-foreground/70 shadow-slap transition-[rotate,translate] duration-200 hover:-translate-y-px hover:rotate-0 hover:bg-card hover:text-card-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              GameBanana
            </Button>
          </>
        )}
      </PageHeader>

      {/* What the page can say about itself in numbers, on the sign every other page uses.
          These were three cells in a bordered grid inside the side panel; they are live
          readings about the mod, which is the one thing the strip is for. */}
      {detail && (
        <SignStrip
          items={[
            `${detail.like_count.toLocaleString()} LIKES`,
            `${detail.view_count.toLocaleString()} VIEWS`,
            `${detail.download_count.toLocaleString()} DOWNLOADS`,
            ...(installedCount > 0 ? ["IN YOUR LIBRARY"] : []),
          ]}
        />
      )}

      {isLoading || !detail ? (
        <div className="flex items-start gap-6">
          <div className="min-w-0 flex-1 space-y-3">
            <Skeleton className="h-[470px] w-full" />
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-40 w-full" />
          </div>
          <Skeleton className={`h-[540px] ${SIDE_PANEL_WIDTH} shrink-0`} />
        </div>
      ) : (
        <div className="flex items-start gap-6">
          <div className="min-w-0 flex-1 space-y-6">
            {activeImage && (
              <section>
                <SectionLabel
                  left="Preview"
                  right={`${images.length} ${images.length === 1 ? "image" : "images"}`}
                />
                {/* The frame takes the picture's own aspect ratio rather than imposing one, so
                    there is nothing left over to letterbox and nothing cropped. Measured live,
                    ZZZ preview ratios run from 0.93 to 2.55 — a mod of near-square shots and a
                    mod of 2.5:1 banners cannot share a fixed frame. The ratio has to come from
                    the decoded image because `GbPreviewImage` carries no dimensions: GameBanana
                    supplied them for exactly one of fifteen images on the mod this was built
                    against. */}
                <div className="relative flex justify-center">
                  {/* The picture sits on top of a small heap of the ones on either side of it.
                      Nothing else in the app overlaps anything else, which is exactly why a pile
                      reads as a different kind of object rather than another panel — and it says
                      "one of several" without spending a row saying it. The prints behind are
                      real neighbouring frames, dimmed, not blank board.

                      Sized off the same `aspectRatio` as the frame so the heap tracks the
                      picture's own shape: a 2.5:1 banner and a near-square shot both keep their
                      corners showing in the right places. */}
                  <div
                    className="relative h-[400px] max-w-full"
                    style={{ aspectRatio: heroRatio }}
                  >
                    {images.length > 1 && (
                      <>
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-y-4 -right-3 left-5 rotate-[1.5deg] overflow-hidden border-2 border-border bg-card shadow-slap-lift"
                        >
                          <img
                            src={imageUrl(images[(activeImageIndex + 2) % images.length], false)}
                            alt=""
                            className="h-full w-full object-cover brightness-[.42] saturate-50"
                          />
                        </span>
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-y-2 -right-1.5 left-2.5 rotate-[0.75deg] overflow-hidden border-2 border-border bg-card shadow-slap-lift"
                        >
                          <img
                            src={imageUrl(images[(activeImageIndex + 1) % images.length], false)}
                            alt=""
                            className="h-full w-full object-cover brightness-[.42] saturate-50"
                          />
                        </span>
                      </>
                    )}
                    <div className="relative z-10 h-full w-full -rotate-[0.5deg] border-2 border-border bg-card p-[5px] shadow-slap-lift">
                      <div className="h-full w-full overflow-hidden bg-art">
                    <MatureContentShield
                      isBlurred={isMature}
                      revealed={revealed}
                      onReveal={() => setRevealed(true)}
                      className="h-full w-full"
                    >
                      {/* A button rather than an image with a click handler, so it is reachable
                          by keyboard and announces itself. Withheld while the shield is up: the
                          shield owns that click, and opening a mature preview full-screen is
                          precisely what it exists to make deliberate. */}
                      <button
                        type="button"
                        disabled={isMature && !revealed}
                        onClick={() => setIsLightboxOpen(true)}
                        aria-label={`View ${detail.name} full size`}
                        className="h-full w-full outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
                      >
                        {/* The lens is the cursor here, so no `cursor-zoom-in`: a magnifier
                            glyph beside a magnifier would be saying it twice. */}
                        <MagnifiedImage
                          src={imageUrl(activeImage, true)}
                          alt={detail.name}
                          disabled={
                            (isMature && !revealed) || !magnifier.enabled
                          }
                          size={magnifier.size}
                          onLoad={(event) =>
                            setHeroRatio(
                              event.currentTarget.naturalWidth /
                                event.currentTarget.naturalHeight,
                            )
                          }
                        />
                      </button>
                      </MatureContentShield>
                      </div>
                    </div>
                  </div>

                  {images.length > 1 && (
                    <>
                      {/* Anchored to the column, not to the frame. The frame is a different
                          width for every picture, so arrows pinned to its edges would jump
                          sideways on each step — here they hold one position no matter what
                          shape arrives. Being outside the art also means they never cover it,
                          and `z-30` still clears the shield so a mature mod stays navigable
                          without revealing anything. */}
                      <button
                        type="button"
                        onClick={() => step(-1)}
                        aria-label="Previous image"
                        className="absolute top-1/2 left-0 z-30 flex h-14 w-9 -translate-y-1/2 items-center justify-center border border-border bg-card text-foreground transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => step(1)}
                        aria-label="Next image"
                        className="absolute top-1/2 right-0 z-30 flex h-14 w-9 -translate-y-1/2 items-center justify-center border border-border bg-card text-foreground transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </button>
                    </>
                  )}
                </div>

                {isLightboxOpen && detail && (
                  <ImageLightbox
                    sources={images.map((image) => imageUrl(image, true))}
                    index={activeImageIndex}
                    onIndexChange={setActiveImageIndex}
                    onClose={() => setIsLightboxOpen(false)}
                    title={detail.name}
                  />
                )}

                {images.length > 1 && (
                  // The rest of the shots, laid out as prints — the same object the pile above
                  // is made of, so the hero and the row are one idea rather than a picture and
                  // a widget. Each is board with a print margin and a wider mount along the
                  // bottom carrying its number, at its own angle.
                  //
                  // The frames are a uniform 16:10, which reverses what this strip used to do:
                  // it gave every thumbnail its own `w-auto` shape so a banner read as a banner.
                  // That is right for loose tiles and wrong for a row of prints, which only
                  // reads as a set if the mounts match. The hero still takes each picture's true
                  // ratio, so the shape is never actually lost — the row trades it for the
                  // material.
                  //
                  // Fixed width and scrolling rather than `flex-1`: at fourteen images an even
                  // split gives 80px prints, which is below the size where you can tell two
                  // screenshots of the same character apart.
                  <div className="-mx-1 mt-5 flex gap-3.5 overflow-x-auto px-1 pb-3 pt-2">
                    {images.map((image, index) => {
                      const isActive = index === activeImageIndex;
                      return (
                        <button
                          key={image.file}
                          ref={isActive ? activeThumb : undefined}
                          type="button"
                          onClick={() => setActiveImageIndex(index)}
                          aria-label={`Show image ${index + 1}`}
                          aria-current={isActive}
                          style={
                            { "--tilt": `${tiltFor(image.file)}deg` } as CSSProperties
                          }
                          className={cn(
                            "relative w-[172px] shrink-0 rotate-[var(--tilt)] border-2 bg-card p-1 pb-[18px] shadow-slap-lift outline-none transition-[rotate,translate,border-color] duration-200 hover:-translate-y-0.5 hover:rotate-0",
                            isActive
                              ? "border-primary"
                              : "border-border hover:border-primary",
                            "focus-visible:border-primary",
                          )}
                        >
                          <span className="relative block aspect-[16/10] w-full overflow-hidden bg-art">
                            <img
                              src={imageUrl(image, false)}
                              alt=""
                              className={cn(
                                "absolute inset-0 h-full w-full object-cover transition",
                                !isActive && "brightness-[.62] saturate-[.7]",
                                isMature && !revealed && "scale-105 blur-[6px]",
                              )}
                            />
                          </span>
                          {/* On the mount, centred, the way a photo print carries its number. */}
                          <span
                            className={cn(
                              "absolute inset-x-0 bottom-[3px] text-center font-mono text-[9px] font-bold tracking-[0.14em]",
                              isActive ? "text-primary" : "text-card-foreground/45",
                            )}
                          >
                            {String(index + 1).padStart(2, "0")}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* What the author says has to be in place, on the page rather than only inside the
                install dialog.
                It was in the dialog alone, which is after the decision — and of the thirty
                most-downloaded ZZZ mods, seventeen declare something. Several of those are
                in-game settings rather than downloads, the kind that let a mod install perfectly
                and then do nothing at all, so they are worth meeting while you are still looking
                at the pictures.
                Bordered in the accent rather than filled: this is a condition, not a control,
                and nothing here is pressable except the links the author supplied. */}
            {detail.requirements.length > 0 && (
              <section className="relative -rotate-[0.35deg] border-2 border-primary bg-card p-5 shadow-slap-lift">
                <span className="absolute -top-3 right-2 rotate-[2.5deg] bg-primary px-2.5 py-0.5 font-sign text-[15px] uppercase tracking-[0.12em] text-primary-foreground shadow-slap">
                  Before you install
                </span>
                <h3 className="font-heading text-[19px] uppercase leading-none text-card-foreground">
                  {detail.requirements.length === 1
                    ? "It needs one thing"
                    : `It needs ${detail.requirements.length} things`}
                </h3>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {detail.requirements.map(({ name, url }) => (
                    <li key={`${name}:${url ?? ""}`}>
                      {url ? (
                        <button
                          type="button"
                          onClick={() => externalLink.requestOpen(url, "author")}
                          className="flex items-center gap-2 bg-background px-3 py-1.5 font-mono text-[11.5px] font-bold uppercase tracking-[0.06em] text-card-foreground transition-colors hover:text-primary"
                        >
                          <ExternalLink className="h-3 w-3 shrink-0 text-primary" />
                          {name}
                        </button>
                      ) : (
                        // No link means the author named a game setting rather than a download,
                        // so it gets a different mark and no affordance to press.
                        <span className="flex items-center gap-2 bg-background px-3 py-1.5 font-mono text-[11.5px] font-bold uppercase tracking-[0.06em] text-card-foreground">
                          <SettingsIcon className="h-3 w-3 shrink-0 text-primary" />
                          {name}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {detail.requirements.some((r) => r.url === null) && (
                  <p className="mt-3 font-mono text-[11px] leading-relaxed tracking-[0.04em] text-card-foreground/55">
                    The ones with a cog are game settings, not downloads — get them wrong and the
                    mod installs fine and then does nothing.
                  </p>
                )}
              </section>
            )}

            {detail.embedded_media.length > 0 && (
              <section className="max-w-3xl space-y-2">
                {detail.embedded_media.map((url) => {
                  const embedUrl = youtubeEmbedUrl(url);
                  return embedUrl ? (
                    <iframe
                      key={url}
                      src={embedUrl}
                      title={`${detail.name} showcase video`}
                      className="aspect-video w-full border-2 border-border"
                      allow="encrypted-media; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      loading="lazy"
                    />
                  ) : (
                    <button
                      key={url}
                      type="button"
                      onClick={() => externalLink.requestOpen(url)}
                      className="text-sm text-primary underline"
                    >
                      Watch showcase video
                    </button>
                  );
                })}
              </section>
            )}

            {sanitizedDescription && (
              <section>
                <SectionLabel left="Description" />
                {/* The handlers below delegate for the anchors inside, which carry `role="link"`
                    and a tab stop of their own — this container is not itself interactive and
                    must not claim to be. jsx-a11y cannot see that from here: it sees handlers on
                    a div. Binding per anchor is not available, since this markup arrives as a
                    string rather than as elements. */}
                {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
                <div
                  // Third-party HTML: real GameBanana descriptions ship <pre> blocks, wide
                  // tables and full-size images that otherwise push the whole window sideways.
                  // Anything too wide scrolls inside itself instead of overflowing the page.
                  // The rest gives this markup the app's own typography — until now it arrived
                  // with none at all, so an eighteen-thousand-character body rendered as one
                  // undifferentiated wall.
                  className="max-w-[900px] overflow-x-hidden text-sm leading-relaxed break-words text-foreground/85 [&_:is(h1,h2,h3,h4)]:mt-6 [&_:is(h1,h2,h3,h4)]:mb-2 [&_:is(h1,h2,h3,h4)]:font-heading [&_:is(h1,h2,h3,h4)]:uppercase [&_:is(h1,h2,h3,h4)]:tracking-[0.04em] [&_:is(h1,h2,h3,h4)]:text-foreground [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base [&_h4]:text-sm [&_p]:mb-3 [&_:is(ul,ol)]:mb-3 [&_:is(ul,ol)]:pl-5 [&_ul]:list-disc [&_ol]:list-decimal [&_a]:text-primary [&_a]:underline [&_a]:cursor-pointer [&_:is(strong,b)]:text-foreground [&_hr]:my-5 [&_hr]:border-t-2 [&_hr]:border-border [&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_img]:my-3 [&_img]:h-auto [&_img]:max-w-full [&_img]:border-2 [&_img]:border-border [&_code]:bg-secondary [&_code]:px-1 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:border [&_pre]:border-border [&_pre]:bg-secondary [&_pre]:p-3 [&_table]:block [&_table]:overflow-x-auto"
                  // The links inside have had their `href` removed by `sanitizeUserHtml`,
                  // so following one is only possible through here. Delegated from the
                  // container rather than bound per anchor, because this markup is set as a
                  // string and there are no React elements to attach handlers to.
                  onClick={(event) => {
                    const href = parkedHrefFrom(event.target);
                    if (href === null) return;
                    event.preventDefault();
                    void followDescriptionLink(href);
                  }}
                  // Enter and Space too: the anchors keep `role="link"` and a tab stop, so they
                  // are still reachable without a mouse and have to answer to it.
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    const href = parkedHrefFrom(event.target);
                    if (href === null) return;
                    event.preventDefault();
                    void followDescriptionLink(href);
                  }}
                  // Sanitized above via DOMPurify — GameBanana descriptions are third-party
                  // user-submitted HTML and must never be rendered unsanitized.
                  dangerouslySetInnerHTML={{ __html: sanitizedDescription }}
                />
              </section>
            )}

            {/* Under the description on purpose: what the author says about a mod comes before
                what everyone else says about it. Renders nothing when there are none. */}
            {detail && (
              <ModComments
                modId={detail.id}
                postCount={detail.post_count}
                onFollowLink={(url) => void followDescriptionLink(url)}
              />
            )}
          </div>

          {/* Pinned, and capped to the window: a fourteen-file list that ran past the bottom of
              a short window would put its last rows out of reach for as long as the column
              stayed stuck. The list takes whatever height is left and scrolls inside itself. */}
          {/* Pinned below the header rather than at the window edge — the header spans the full
              width and pins first, so anything sharing the top of the window with it ends up
              underneath it.

              The offset is the header (3rem) plus the 1.25rem `space-y-5` already opens between
              them, so the panel holds the same distance from the accent rule pinned as it does
              at rest. Landing it flush on the rule instead made the two read as one welded
              object and left the panel's own yellow caption bar sitting directly under a yellow
              line. What it can claim in height is the window less that offset and the padding at
              the foot of the page. */}
          {/* Separate things stuck on the wall rather than one panel with rules through it.
              Each takes its own angle, which is what stops a column of board reading as a single
              welded object — the same move the character page makes with its band and its cards.

              The whole column scrolls now instead of the file list scrolling inside a fixed box.
              That box existed because the panel was one object with a header that had to stay
              put; with the blocks separated there is nothing to pin, and a nested scroller
              inside a sticky column was always going to be two scrollbars arguing.

              `Open` and `Bookmark` are gone from here — they act on the mod rather than on any
              one of its files, so they moved up to the header band with the title. */}
          <aside
            // The negative margins buy the scroll box room to show what hangs outside the cards
            // without moving them: `overflow-y-auto` makes this a clipping context, and the
            // author stamp deliberately overhangs its card's top-right corner, so without the
            // padding the stamp is sheared off. The matching negative margin keeps the column
            // sitting exactly where it did.
            className={`sticky -top-3 -mr-2 -mt-3 flex max-h-[calc(100vh-2.5rem)] ${SIDE_PANEL_WIDTH} shrink-0 flex-col gap-4 overflow-y-auto pb-2 pr-2 pt-3`}
          >
            <div className="shrink-0 -rotate-[0.3deg] border-2 border-border bg-card shadow-slap-lift">
              {/* The whole row is the way to the author's page, not just the avatar: a 36px
                  target is a small thing to ask someone to hit, and the name beside it points
                  at the same place. Hover lights the border and the name so it reads as a way
                  through rather than as a caption. */}
              <button
                type="button"
                onClick={() =>
                  onOpenCreator(detail.submitter.id, detail.submitter.name)
                }
                aria-label={`View ${detail.submitter.name || "this creator"}'s mods`}
                className="group/creator relative flex w-full items-start gap-3.5 p-4 text-left"
              >
                {/* Stamped, and hanging off the corner the way the requirements notice does —
                    it names what the card is without spending a row on a caption. */}
                <span className="absolute -top-2.5 right-[-5px] rotate-[2.5deg] bg-primary px-2.5 py-0.5 font-sign text-[13px] uppercase tracking-[0.12em] text-primary-foreground shadow-slap">
                  Author
                </span>
                {detail.submitter.avatar_url ? (
                  <img
                    src={detail.submitter.avatar_url}
                    alt=""
                    className="h-[70px] w-[70px] shrink-0 border-2 border-border object-cover transition-colors group-hover/creator:border-primary"
                  />
                ) : (
                  <span className="flex h-[70px] w-[70px] shrink-0 items-center justify-center border-2 border-border bg-art font-heading text-2xl text-muted-foreground transition-colors group-hover/creator:border-primary">
                    {(detail.submitter.name || "?").charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  {/* The person gets the display face at the size the page's own headings use.
                      They were a 16px line under a label, which made the author of the thing you
                      are about to install the quietest text in the column. */}
                  <span className="block truncate font-heading text-[26px] uppercase leading-none tracking-[0.005em] text-card-foreground transition-colors group-hover/creator:text-primary">
                    {detail.submitter.name || "Unknown"}
                  </span>
                  <span className="mt-2 block font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Submitter · GameBanana
                  </span>
                  {/* Signage on the wall colour, so the way through reads as a control laid on
                      the card rather than as a coloured word at the end of a row. */}
                  <span className="mt-3 inline-block bg-background px-2.5 py-1 font-sign text-[15px] uppercase tracking-[0.1em] text-primary">
                    See mods →
                  </span>
                </span>
              </button>

            </div>

            {/* What the machine knows about the mod, on its own board. */}
            <div className="shrink-0 rotate-[0.25deg] border-2 border-border bg-card shadow-slap-lift">
              {/* Two by two, label over value, rather than four ruled rows.
                  As rows every fact was the same weight and the same colour, so the block read
                  as a table to be parsed rather than as four things to be glanced at. Here the
                  label is small machine type and the value carries the display face, which is
                  the same relationship the sign strip and the character cards already use.
                  The two dates keep their pairing on the bottom row: read together they say how
                  long the mod has been around and whether anyone is still looking after it,
                  which neither answers on its own. */}
              <dl className="grid grid-cols-2 gap-x-3 gap-y-4 px-4 py-4">
                {categoryName && (
                  <MetaRow term="Category" value={categoryName} />
                )}
                {/* `detail`, not `mod`: the list record is synthesised when this page is opened
                    from the library or from bookmarks and reports "not mature" by design, which
                    would call every mod you own Safe. `detail.is_mature` comes from GameBanana's
                    own `_bIsNsfw` on the fetch this page already makes. */}
                <MetaRow
                  term="Rating"
                  value={detail.is_mature ? "Mature" : "Safe"}
                />
                {/* Published then Updated, oldest first: read together they say how long the
                    mod has been around and whether anyone is still looking after it, which
                    neither date answers on its own.

                    Real dates rather than "1y ago" — this panel is the one people read with
                    the mod's GameBanana page open beside it, and a bucketed age disagrees with
                    what that page says. Two mods published three months apart can both round to
                    "1y ago", which reads as the app being wrong. The age is on hover, where it
                    costs nothing. */}
                <MetaRow
                  term="Published"
                  value={exactDate(detail.date_added)}
                  title={updatedLabel(detail.date_added)}
                />
                <MetaRow
                  term="Updated"
                  value={exactDate(detail.date_modified)}
                  title={updatedLabel(detail.date_modified)}
                />
                {/* `detail`, not `mod` — see the note beside `isMature`. The list record is
                    synthesised when this page is opened from the library or from bookmarks, and
                    reports "not mature" by design, which would make this row call every mod you
                    own "Safe". `detail.is_mature` comes from GameBanana's own `_bIsNsfw` on the
                    fetch this page already makes, so the honest answer costs nothing. */}
              </dl>

            </div>

            {/* Annotation, so it takes the marker — it is the app pointing at the thing you
                came here to press, not a caption naming a region. */}
            <div className="flex shrink-0 items-baseline gap-2.5 pl-1 pt-1">
              <span className="-rotate-[1.5deg] font-hand text-[15px] text-primary">
                {detail.files.length === 1
                  ? "the one you can install \u2192"
                  : `the ${detail.files.length} you can install \u2192`}
              </span>
            </div>

            <div className="flex shrink-0 flex-col gap-4">
              {/* A reinstall replaces files in place, so a failure has to be visible: the swap
                  rolls back on its own, but a button that quietly returns to normal is
                  indistinguishable from one that worked. */}
              {reinstall.isError && (
                <p className="border-2 border-destructive bg-card px-3.5 py-2 text-xs text-destructive shadow-slap-lift">
                  Reinstall failed — {String(reinstall.error)}
                </p>
              )}
              {detail.files.length === 0 ? (
                <p className="border-2 border-border bg-card px-3.5 py-4 text-sm text-muted-foreground shadow-slap-lift">
                  No downloadable files.
                </p>
              ) : (
                <ul className="flex flex-col gap-4">
                  {detail.files.map((file, index) => (
                    <li
                      key={file.id}
                      style={{ "--tilt": `${tiltFor(file.id)}deg` } as CSSProperties}
                      className="group flex items-stretch rotate-[var(--tilt)] border-2 border-border bg-card shadow-slap-lift transition-[rotate,translate,border-color] duration-200 hover:-translate-y-0.5 hover:rotate-0 hover:border-primary"
                    >
                      {/* The stub of a ticket, torn off down a punched line, rather than a
                          ruled gutter. It says what the row is — one claim on one file, of
                          several — in the shape rather than in a word.

                          The numeral goes accent only under the cursor: row one is not "the
                          newest", and GameBanana gives no ordering that would justify marking
                          it. */}
                      <span className="ticket-perf relative flex w-[70px] shrink-0 flex-col items-center justify-center self-stretch bg-background py-3">
                        <span className="font-heading text-[26px] leading-none tabular-nums text-primary">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="mt-1 font-mono text-[9px] font-bold tracking-[0.1em] text-muted-foreground/60">
                          of {detail.files.length}
                        </span>
                      </span>
                      <div className="min-w-0 flex-1 px-3.5 py-3">
                        {/* The installed mark rides up here beside the name rather than at the
                            end of the meta line: a real date is much wider than "1y ago" was,
                            and on a row whose button reads "Reinstall" the old single line ran
                            out of room and broke a date across two of them. */}
                        <p className="flex items-center gap-1.5 font-heading text-[17px] uppercase leading-tight tracking-[0.01em] text-card-foreground">
                          <span className="truncate">{file.file_name}</span>
                          {(installed.byFileId.get(file.id)?.length ?? 0) >
                            0 && (
                            <Check
                              className="h-3.5 w-3.5 shrink-0 text-success"
                              aria-label="Installed"
                            />
                          )}
                        </p>
                        {/* The uploader's note on this file — "SFW Variants Only", "6. Black
                            Ver. Nude", "OUTDATED DO NOT DOWNLOAD". Two thirds of files carry
                            one, and on a mod whose files are named v72.zip / v73.zip it is the
                            only thing that says which is which, so it sits above the numbers
                            rather than among them. Clamped: most are a few words, but they run
                            to a full sentence often enough to swallow the row. */}
                        {file.description && (
                          // A stamped chip rather than a line of prose: it is a label on the
                          // file ("SFW Variants Only", "OUTDATED DO NOT DOWNLOAD"), and on a mod
                          // whose files are named v72.zip and v73.zip it is the only thing that
                          // tells them apart, so it should read as a mark rather than as more
                          // small print.
                          <span className="mt-1.5 inline-block max-w-full truncate bg-background px-2 py-0.5 align-top font-sign text-[13px] uppercase tracking-[0.08em] text-card-foreground">
                            {file.description}
                          </span>
                        )}
                        {/* Wraps as whole facts when it must -- each item holds itself
                            together, so a narrow panel drops "20,650 dl" to its own line
                            instead of splitting "Feb 18, 2025" down the middle. */}
                        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                          {file.version && (
                            <span className="whitespace-nowrap border border-border px-1 text-card-foreground">
                              v{file.version}
                            </span>
                          )}
                          <span className="whitespace-nowrap">
                            {formatFileSize(file.file_size)}
                          </span>
                          <span className="text-border">·</span>
                          {/* Each file's own upload date, not the mod's. On a mod with a dozen
                              files this is what tells you which one is current -- the list
                              arrives in no meaningful order and the version labels are the
                              uploader's own, so they are often missing or repeated. Exact, for
                              the same reason the panel above is. */}
                          <span
                            className="whitespace-nowrap"
                            title={updatedLabel(file.date_added)}
                          >
                            {exactDate(file.date_added)}
                          </span>
                          <span className="text-border">·</span>
                          <span className="whitespace-nowrap">
                            {file.download_count.toLocaleString()} dl
                          </span>
                        </p>
                        {/* The safety line gets a row of its own rather than trailing the
                            numbers above. Sharing that row left it up to how much space was
                            left over -- a wider "Reinstall" button or a longer date pushed it
                            onto a second line -- so the same verdict sat beside the size on one
                            row and under it on the next. It is the line that most wants to be
                            found at a glance down the list, and a column that moves is one you
                            have to hunt for on every row. */}
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                          <FileScanMark file={file} />
                          {executablesIn(file).length > 0 && (
                            <>
                              <span className="text-border">·</span>
                              <ExecutableMark paths={executablesIn(file)} />
                            </>
                          )}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        // One width for every state, so a label that counts upward does not
                        // resize the button under the cursor — "0%" is 41px and "Downloading…"
                        // was 109px, and the row twitched on every tick. 96px is the widest
                        // label any of these buttons can hold ("Install again", "Unpacking…"),
                        // measured rather than guessed, which also lines the list up into a
                        // single column instead of a ragged edge.
                        className="my-auto mr-3 w-24 shrink-0 justify-center tabular-nums"
                        variant={
                          fileAction(file.id).kind === "install"
                            ? "default"
                            : "outline"
                        }
                        // Only this file's button waits on this file's work — a queuing
                        // reinstall used to disable every button in the list.
                        disabled={
                          inFlightLabel(file.id) !== null ||
                          (reinstall.isPending &&
                            reinstall.variables?.gamebananaFileId === file.id)
                        }
                        onClick={() => {
                          const action = fileAction(file.id);
                          // Reinstall replaces the row's files where it stands; the other two
                          // both mean "put a new copy in the library", which is `onInstall`.
                          if (action.kind !== "reinstall" || !action.target) {
                            onInstall(file, detail);
                            return;
                          }
                          // Queued, not awaited — the work belongs to the Downloads page from
                          // here, which is where its progress, pause and cancel live.
                          reinstall.mutate({
                            gamebananaModId: mod.id,
                            gamebananaFileId: file.id,
                            modName: detail.name,
                            fileName: file.file_name,
                            thumbnailUrl: images[0]
                              ? imageUrl(images[0], true)
                              : null,
                            characterId: action.target.character_id,
                            slot: action.target.slot,
                            displayName: action.target.display_name,
                            targetModId: action.target.id,
                          });
                        }}
                      >
                        {inFlightLabel(file.id) ??
                          (reinstall.isPending &&
                          reinstall.variables?.gamebananaFileId === file.id
                            ? "Queuing…"
                            : fileAction(file.id).label)}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

          </aside>
        </div>
      )}
    </div>
  );
}

interface SectionLabelProps {
  left: string;
  right?: string;
}

/** A ruled label rather than a heading. The page already has one title; these name bands
 * within it, which is the small-uppercase-Bahnschrift job described in DESIGN.md. */
function SectionLabel({ left, right }: SectionLabelProps) {
  return (
    <div className="mb-3 flex items-center justify-between border-b-2 border-border pb-1.5 font-heading text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
      <span>{left}</span>
      {right && <span>{right}</span>}
    </div>
  );
}

interface FileScanMarkProps {
  file: GbFile;
}

/** GameBanana's verdict on one uploaded file, colour-coded: green passed, yellow could not be
 * checked, red failed.
 *
 * "Not scanned" is amber rather than red on purpose. It means the archive would not open, so
 * nothing was ever looked at — worth knowing before you download, but an absence of a finding
 * is not a finding. */
function FileScanMark({ file }: FileScanMarkProps) {
  const scan = fileScan(file);
  const isClean = scan.verdict === "clean";
  const Icon = isClean ? ShieldCheck : ShieldAlert;

  return (
    <span
      className={cn(
        "flex items-center gap-1 whitespace-nowrap",
        scan.verdict === "clean" && "text-success",
        scan.verdict === "unscanned" && "text-primary",
        scan.verdict === "flagged" && "text-destructive",
      )}
      title={scan.detail ?? undefined}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {scan.label}
    </span>
  );
}

/** Names the programs inside an archive that should not have needed any.
 *
 * Separate from the scan verdict because it answers a different question: that one is "did
 * GameBanana's check pass", this one is "will something in here run". A file can be perfectly
 * clean and still contain an installer. Shown only when there is something to show, so it stays
 * a real signal — eight files in 264 tripped GameBanana's flag at all, and only two of those
 * held anything this considers a program. */
function ExecutableMark({ paths }: { paths: string[] }) {
  return (
    <span
      className="flex items-center gap-1 whitespace-nowrap text-destructive"
      title={`Contains ${paths.join(", ")}`}
    >
      <FileWarning className="h-3 w-3 shrink-0" />
      {paths.length === 1 ? "Executable" : `${paths.length} executables`}
    </span>
  );
}



interface MetaRowProps {
  term: string;
  value: string;
  /** Spelled-out form of a relative `value`, revealed on hover. */
  title?: string;
}

function MetaRow({ term, value, title }: MetaRowProps) {
  return (
    // One cell of the two-by-two: the term in small machine type, the value under it in the
    // display face. The label says what kind of fact this is and wants to be skimmed past; the
    // value is the fact and wants to be read, so they take different voices rather than the
    // same one at two opacities.
    <div className="min-w-0">
      <dt className="mb-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {term}
      </dt>
      <dd
        className="truncate font-heading text-[17px] uppercase leading-none tracking-[0.005em] text-card-foreground"
        title={title}
      >
        {value}
      </dd>
    </div>
  );
}
