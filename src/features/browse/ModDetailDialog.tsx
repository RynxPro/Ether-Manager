import DOMPurify from "dompurify";
import { useState } from "react";
import { MatureContentShield } from "@/components/MatureContentShield";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useMatureContentVisibility } from "@/features/settings/hooks";
import { cn } from "@/lib/utils";
import type { GbFile, GbMod, GbModDetail } from "@/lib/tauri-commands";
import { useGamebananaModDetail } from "./hooks";

interface ModDetailDialogProps {
  mod: GbMod | null;
  onOpenChange: (open: boolean) => void;
  /** Passes the freshly fetched `detail` alongside `file` — unlike the outer `mod` prop (which
   * can be a placeholder when opened from Bookmarks, missing category/tag data), `detail` is
   * always a real live fetch, so the install flow's target-guessing reads from this instead. */
  onInstall: (file: GbFile, detail: GbModDetail) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** GameBanana's `_aEmbeddedMedia` is a list of raw video page URLs (YouTube, confirmed live),
 * not ready-to-embed ones — this extracts the video id and builds the `/embed/` form. */
function youtubeEmbedUrl(url: string): string | null {
  const match = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/.exec(url);
  return match ? `https://www.youtube.com/embed/${match[1]}` : null;
}

export function ModDetailDialog({ mod, onOpenChange, onInstall }: ModDetailDialogProps) {
  const { data: detail, isLoading } = useGamebananaModDetail(mod?.id ?? null);
  const { data: visibility } = useMatureContentVisibility();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const open = mod !== null;
  const images = detail?.preview_media.images ?? [];
  const activeImage = images[activeImageIndex] ?? images[0];
  const sanitizedDescription = detail?.description_html
    ? DOMPurify.sanitize(detail.description_html)
    : "";
  // The `mod` list record is authoritative — confirmed live that `@gbprofile` never sends
  // the content-rating fields at all, so `detail.is_mature` always defaults to `false`. Also
  // gated on the visibility setting, same as BrowseGrid/FeaturedBanner — fixes a bug where this
  // dialog blurred mature mods unconditionally, ignoring a "Show" preference entirely.
  const isMature = (visibility ?? "Blur") === "Blur" && (mod?.is_mature ?? false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setActiveImageIndex(0);
          setRevealed(false);
          onOpenChange(false);
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        {isLoading || !detail ? (
          <div className="space-y-4 py-4">
            <Skeleton className="aspect-video w-full rounded-lg" />
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{detail.name}</DialogTitle>
            </DialogHeader>

            <div className="max-h-[70vh] space-y-4 overflow-y-auto py-2">
              {activeImage && (
                <div className="space-y-2">
                  <MatureContentShield
                    isBlurred={isMature}
                    revealed={revealed}
                    onReveal={() => setRevealed(true)}
                    className="aspect-video w-full rounded-lg"
                  >
                    <img
                      src={`${activeImage.base_url}/${activeImage.file}`}
                      alt={detail.name}
                      className="aspect-video w-full rounded-lg object-cover"
                    />
                  </MatureContentShield>
                  {images.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto">
                      {images.map((image, index) => (
                        <button
                          type="button"
                          key={image.file}
                          onClick={() => setActiveImageIndex(index)}
                          className={`h-14 w-14 shrink-0 overflow-hidden rounded-md border ${
                            index === activeImageIndex ? "border-primary" : "border-transparent"
                          }`}
                        >
                          <img
                            src={`${image.base_url}/${image.file_220 ?? image.file}`}
                            alt=""
                            className={cn(
                              "h-full w-full object-cover transition-all",
                              isMature && !revealed && "scale-110 blur-md",
                            )}
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {detail.embedded_media.length > 0 && (
                <div className="space-y-2">
                  {detail.embedded_media.map((url) => {
                    const embedUrl = youtubeEmbedUrl(url);
                    return embedUrl ? (
                      <iframe
                        key={url}
                        src={embedUrl}
                        title={`${detail.name} showcase video`}
                        className="aspect-video w-full rounded-lg"
                        allow="encrypted-media; picture-in-picture; web-share"
                        referrerPolicy="strict-origin-when-cross-origin"
                        loading="lazy"
                      />
                    ) : (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary underline"
                      >
                        Watch showcase video
                      </a>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <Badge variant="secondary">{detail.category.name}</Badge>
                <span>{detail.like_count} likes</span>
                <span>{detail.view_count} views</span>
                <span>{detail.download_count} downloads</span>
                {detail.is_nsfw && <Badge variant="destructive">NSFW</Badge>}
              </div>

              {sanitizedDescription && (
                <div
                  className="prose prose-sm max-w-none text-foreground"
                  // Sanitized above via DOMPurify — GameBanana descriptions are third-party
                  // user-submitted HTML and must never be rendered unsanitized.
                  dangerouslySetInnerHTML={{ __html: sanitizedDescription }}
                />
              )}

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Files</p>
                {detail.files.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No downloadable files.</p>
                ) : (
                  <ul className="space-y-1">
                    {detail.files.map((file) => (
                      <li
                        key={file.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border p-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm text-foreground">{file.file_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(file.file_size)}
                          </p>
                        </div>
                        <Button type="button" size="sm" onClick={() => onInstall(file, detail)}>
                          Install
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <DialogFooter showCloseButton />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
