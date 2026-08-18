import { openUrl } from "@tauri-apps/plugin-opener";
import DOMPurify from "dompurify";
import {
  ArrowLeft,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileWarning,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MatureContentShield } from "@/components/MatureContentShield";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDownloadProgress, useDownloads } from "@/features/downloads/hooks";
import {
  useInstalledFromGameBanana,
  useReinstallMod,
} from "@/features/library/hooks";
import { useMagnifierSettings, useMatureContentVisibility } from "@/features/settings/hooks";
import { executablesIn, fileScan } from "@/lib/fileScan";
import { shouldBlur } from "@/lib/mature";
import { exactDate, updatedLabel } from "@/lib/time";
import { cn } from "@/lib/utils";
import type {
  Download,
  GbFile,
  GbMod,
  GbModDetail,
  GbPreviewImage,
  Mod,
} from "@/lib/tauri-commands";
import { ImageLightbox } from "./ImageLightbox";
import { MagnifiedImage } from "./MagnifiedImage";
import {
  useAddBookmark,
  useBookmarks,
  useGamebananaModDetail,
  useRemoveBookmark,
} from "./hooks";

interface ModDetailPageProps {
  mod: GbMod;
  onBack: () => void;
  /** Passes the freshly fetched `detail` alongside `file` — unlike the outer `mod` prop (which
   * can be a placeholder when opened from Bookmarks, missing category/tag data), `detail` is
   * always a real live fetch, so the install flow's target-guessing reads from this instead. */
  onInstall: (file: GbFile, detail: GbModDetail) => void;
}

/** The signature cut corner (DESIGN.md). A radius cannot express it, so it is an inline style
 * rather than a utility. */
const CUT_CORNER = {
  clipPath:
    "polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%)",
} as const;

/** The shape the hero falls back to for the moment between mount and the image reporting its
 * real dimensions. Only ever visible on a cold load; after that the browser cache answers
 * immediately. */
const FALLBACK_RATIO = 1.6;

/** Queue states where the work is still coming. Everything else — installed, failed, cancelled —
 * is history the Downloads page keeps, and says nothing about what this button should do now. */
const UNFINISHED_STATUSES = new Set(["Queued", "Downloading", "Extracting", "Paused"]);

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
 * page's. Reached from Browse or Bookmarks; `onBack` returns to whichever sent you.
 *
 * Two columns, because the install control used to sit below the description — and a real
 * GameBanana description runs to eighteen thousand characters, so the one thing the page exists
 * for was a page-length scroll away. The right column carries it instead, and is pinned, so it
 * stays reachable however far down the description you are. */
export function ModDetailPage({ mod, onBack, onInstall }: ModDetailPageProps) {
  const { data: detail, isLoading } = useGamebananaModDetail(mod.id);
  const { data: visibility } = useMatureContentVisibility();
  // Falls back to on at the default size for the moment before the setting arrives — the lens
  // only appears on hover, so a wrong guess for one frame is invisible.
  const { data: magnifier = { enabled: true, size: 120 } } = useMagnifierSettings();
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
    ? DOMPurify.sanitize(detail.description_html)
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
    if (download.status === "Extracting" || live?.isExtracting) return "Unpacking…";

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

  // The back button lives in the header, and a long description scrolls that header away for
  // thousands of pixels — leaving the only way out of the page at the top of a scroll you have
  // to make in full. A slim bar takes over once the header goes, the same way Browse's controls
  // do, rather than pinning the header itself.
  const headerRef = useRef<HTMLDivElement>(null);
  const [isHeaderOnScreen, setIsHeaderOnScreen] = useState(true);
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const observer = new IntersectionObserver(([entry]) =>
      setIsHeaderOnScreen(entry.isIntersecting),
    );
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

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
      });
    }
  }

  return (
    <div className="space-y-5">
      <div
        ref={headerRef}
        className="flex items-end gap-4 border-b-2 border-primary pb-3.5"
      >
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onBack}
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-[10px] uppercase tracking-[0.18em] text-primary">
            {categoryName ? `Mod / ${categoryName}` : "Mod"}
          </p>
          {/* Broken anywhere, because GameBanana names are comma-joined runs the line breaker
              treats as a single token — the same trap the featured panel's title hit. */}
          <h2 className="mt-1 break-words font-heading text-[27px] uppercase leading-[1.05] tracking-[0.02em]">
            {detail?.name ?? mod.name}
          </h2>
          {/* Beside the title rather than down with the files, because it changes what this page
              is for: you came to decide whether to install something you already have. Which
              file you have is a separate question, answered in the list itself. */}
          {installedCount > 0 && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-success">
              <Check className="h-3.5 w-3.5 shrink-0" />
              {installedCount > 1
                ? `In your library — ${installedCount} variants installed`
                : "In your library"}
            </p>
          )}
        </div>
      </div>

      {isLoading || !detail ? (
        <div className="flex items-start gap-6">
          <div className="min-w-0 flex-1 space-y-3">
            <Skeleton className="h-[470px] w-full" />
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-40 w-full" />
          </div>
          <Skeleton className="h-[540px] w-[400px] shrink-0" />
        </div>
      ) : (
        <div className="flex items-start gap-6">
          <div className="min-w-0 flex-1 space-y-6">
            {/* Zero-height so it costs no layout, with the bar overflowing out of it, and
                `-mb-6` to cancel the gap `space-y-6` would otherwise open beneath it.
                `-top-6` rather than `top-0` because sticky pins to the scrolling element's
                padding box and the page's scroller carries `p-6`.
                Only as wide as this column, unlike Browse's full-bleed version: the right
                column is pinned too, and a bar reaching the window edge would sit across the
                top of it. */}
            {!isHeaderOnScreen && (
              <div className="sticky -top-6 z-30 -mb-6 h-0">
                <div className="flex animate-in items-center gap-3 border-b-2 border-primary bg-background py-2.5 duration-200 slide-in-from-top-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={onBack}
                    aria-label="Back"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <p className="min-w-0 truncate font-heading text-sm uppercase tracking-[0.06em]">
                    {detail?.name ?? mod.name}
                  </p>
                </div>
              </div>
            )}

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
                  <div
                    className="h-[400px] max-w-full overflow-hidden border-2 border-border bg-sidebar"
                    style={{ ...CUT_CORNER, aspectRatio: heroRatio }}
                  >
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
                          disabled={(isMature && !revealed) || !magnifier.enabled}
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
                  // Every image, in one strip, at its own shape. The four-tile grid it replaces
                  // could only reach the rest through an expander — a piece of state that
                  // existed solely to work around the grid.
                  <div className="mt-2 flex gap-2 overflow-x-auto pb-1.5">
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
                          className={cn(
                            "h-[82px] shrink-0 overflow-hidden border-2 transition-colors",
                            isActive
                              ? "border-primary"
                              : "border-border hover:border-muted-foreground",
                          )}
                          style={CUT_CORNER}
                        >
                          <img
                            src={imageUrl(image, false)}
                            alt=""
                            className={cn(
                              // `w-auto` is what makes the thumbnail hug its picture too, so a
                              // banner reads as a banner in the strip instead of being squared off.
                              "h-full w-auto max-w-none transition",
                              !isActive && "brightness-50 hover:brightness-90",
                              isMature && !revealed && "scale-105 blur-[6px]",
                            )}
                          />
                        </button>
                      );
                    })}
                  </div>
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
                      onClick={() => void openUrl(url)}
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
                <div
                  // Third-party HTML: real GameBanana descriptions ship <pre> blocks, wide
                  // tables and full-size images that otherwise push the whole window sideways.
                  // Anything too wide scrolls inside itself instead of overflowing the page.
                  // The rest gives this markup the app's own typography — until now it arrived
                  // with none at all, so an eighteen-thousand-character body rendered as one
                  // undifferentiated wall.
                  className="max-w-[900px] overflow-x-hidden text-sm leading-relaxed break-words text-foreground/85 [&_:is(h1,h2,h3,h4)]:mt-6 [&_:is(h1,h2,h3,h4)]:mb-2 [&_:is(h1,h2,h3,h4)]:font-heading [&_:is(h1,h2,h3,h4)]:uppercase [&_:is(h1,h2,h3,h4)]:tracking-[0.04em] [&_:is(h1,h2,h3,h4)]:text-foreground [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base [&_h4]:text-sm [&_p]:mb-3 [&_:is(ul,ol)]:mb-3 [&_:is(ul,ol)]:pl-5 [&_ul]:list-disc [&_ol]:list-decimal [&_a]:text-primary [&_a]:underline [&_:is(strong,b)]:text-foreground [&_hr]:my-5 [&_hr]:border-t-2 [&_hr]:border-border [&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_img]:my-3 [&_img]:h-auto [&_img]:max-w-full [&_img]:border-2 [&_img]:border-border [&_code]:bg-secondary [&_code]:px-1 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:border [&_pre]:border-border [&_pre]:bg-secondary [&_pre]:p-3 [&_table]:block [&_table]:overflow-x-auto"
                  // Sanitized above via DOMPurify — GameBanana descriptions are third-party
                  // user-submitted HTML and must never be rendered unsanitized.
                  dangerouslySetInnerHTML={{ __html: sanitizedDescription }}
                />
              </section>
            )}
          </div>

          {/* Pinned, and capped to the window: a fourteen-file list that ran past the bottom of
              a short window would put its last rows out of reach for as long as the column
              stayed stuck. The list takes whatever height is left and scrolls inside itself. */}
          <aside className="sticky top-0 flex max-h-[calc(100vh-3rem)] w-[400px] shrink-0 flex-col gap-3.5">
            <div
              className="shrink-0 border-2 border-border bg-card"
              style={CUT_CORNER}
            >
              <PanelHeader label="Details">
                {/* The opener plugin, not an anchor: `target="_blank"` does not navigate inside
                    a WebView2, so a plain link here would simply do nothing. */}
                <button
                  type="button"
                  onClick={() => void openUrl(detail.profile_url)}
                  className="flex items-center gap-1 border-b border-primary-foreground/40 tracking-[0.1em]"
                >
                  Open
                  <ExternalLink className="h-3 w-3" />
                </button>
              </PanelHeader>

              <div className="flex items-center gap-3 border-b border-border px-3.5 py-3">
                {detail.submitter.avatar_url ? (
                  <img
                    src={detail.submitter.avatar_url}
                    alt=""
                    className="h-9 w-9 shrink-0 border-2 border-border object-cover"
                  />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-border bg-secondary font-heading text-base text-muted-foreground">
                    {(detail.submitter.name || "?").charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.13em] text-muted-foreground">
                    Submitted by
                  </p>
                  <p className="truncate font-heading text-base tracking-[0.02em]">
                    {detail.submitter.name || "Unknown"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 divide-x divide-border border-b border-border bg-background">
                <StatCell
                  value={detail.like_count.toLocaleString()}
                  label="likes"
                />
                <StatCell
                  value={detail.view_count.toLocaleString()}
                  label="views"
                />
                <StatCell
                  value={detail.download_count.toLocaleString()}
                  label="downloads"
                />
              </div>

              <dl className="px-3.5 py-1">
                {categoryName && (
                  <MetaRow term="Category" value={categoryName} />
                )}
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
                <MetaRow
                  term="Rating"
                  value={detail.is_mature ? "Mature" : "Safe"}
                />
              </dl>

              <div className="border-t border-border px-3.5 py-3">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleToggleBookmark}
                  aria-label={
                    isBookmarked
                      ? `Remove ${detail.name} from bookmarks`
                      : `Bookmark ${detail.name}`
                  }
                >
                  <Bookmark
                    className="h-3.5 w-3.5"
                    fill={isBookmarked ? "currentColor" : "none"}
                  />
                  {isBookmarked ? "Bookmarked" : "Bookmark"}
                </Button>
              </div>
            </div>

            <div
              className="flex min-h-0 flex-col border-2 border-border bg-card"
              style={CUT_CORNER}
            >
              <PanelHeader label="Files">
                <span className="tabular-nums">{detail.files.length}</span>
              </PanelHeader>
              {/* A reinstall replaces files in place, so a failure has to be visible: the swap
                  rolls back on its own, but a button that quietly returns to normal is
                  indistinguishable from one that worked. */}
              {reinstall.isError && (
                <p className="border-b border-border px-3.5 py-2 text-xs text-destructive">
                  Reinstall failed — {String(reinstall.error)}
                </p>
              )}
              {detail.files.length === 0 ? (
                <p className="px-3.5 py-4 text-sm text-muted-foreground">
                  No downloadable files.
                </p>
              ) : (
                <ul className="min-h-0 flex-1 overflow-y-auto">
                  {detail.files.map((file, index) => (
                    <li
                      key={file.id}
                      className="group flex items-center border-b border-border transition-colors last:border-b-0 hover:bg-secondary"
                    >
                      {/* A ruled gutter rather than a bullet. The numeral goes accent only under
                          the cursor — row one is not "the newest", and GameBanana gives no
                          ordering that would justify marking it. */}
                      <span className="flex w-9 shrink-0 items-center justify-center self-stretch border-r border-border bg-background font-heading text-xs tabular-nums text-muted-foreground/50 transition-colors group-hover:text-primary">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 flex-1 px-3 py-2">
                        {/* The installed mark rides up here beside the name rather than at the
                            end of the meta line: a real date is much wider than "1y ago" was,
                            and on a row whose button reads "Reinstall" the old single line ran
                            out of room and broke a date across two of them. */}
                        <p className="flex items-center gap-1.5 text-[13px]">
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
                          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-foreground/70">
                            {file.description}
                          </p>
                        )}
                        {/* Wraps as whole facts when it must -- each item holds itself
                            together, so a narrow panel drops "20,650 dl" to its own line
                            instead of splitting "Feb 18, 2025" down the middle. */}
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                          {file.version && (
                            <span className="whitespace-nowrap border border-border px-1 font-heading tracking-[0.06em] text-foreground">
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
                        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
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
                        className="mr-2.5 w-24 justify-center tabular-nums"
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
                            thumbnailUrl: images[0] ? imageUrl(images[0], true) : null,
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

interface PanelHeaderProps {
  label: string;
  children?: React.ReactNode;
}

/** A solid accent bar, matching the featured panel: it gives a panel a hard edge to start from
 * and is the one place the accent can be filled without competing with artwork. */
function PanelHeader({ label, children }: PanelHeaderProps) {
  return (
    <div className="flex shrink-0 items-center justify-between bg-primary px-3.5 py-2 font-heading text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-foreground">
      <span>{label}</span>
      {children}
    </div>
  );
}

interface StatCellProps {
  value: string;
  label: string;
}

/** One cell of the details strip. Recessed to `--background` so the row reads as an inset well
 * inside the raised panel rather than more of the same surface. */
function StatCell({ value, label }: StatCellProps) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <p className="truncate font-heading text-[17px] tabular-nums text-primary">
        {value}
      </p>
      <p className="text-[9px] uppercase tracking-[0.13em] text-muted-foreground">
        {label}
      </p>
    </div>
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
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-1.5 last:border-b-0">
      <dt className="text-[10px] uppercase tracking-[0.13em] text-muted-foreground">
        {term}
      </dt>
      <dd className="min-w-0 truncate text-[13px]" title={title}>
        {value}
      </dd>
    </div>
  );
}
