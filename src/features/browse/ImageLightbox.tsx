import { ChevronLeft, ChevronRight, XIcon } from "lucide-react";
import { useEffect } from "react";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useMagnifierSettings } from "@/features/settings/hooks";
import { MagnifiedImage } from "./MagnifiedImage";

interface ImageLightboxProps {
  sources: string[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** Names the view for screen readers, and captions nothing on screen — the picture is the
   * whole point and a title bar over it would be the only thing competing with it. */
  title: string;
}

/** The preview at the size the window can actually give it.
 *
 * The page's frame is capped at 400px tall so the picture cannot push the description and the
 * install panel off screen — which is right for a page you read, and wrong the moment you want
 * to look closely at a mod's artwork, since that artwork is most of what tells you whether you
 * want the thing.
 *
 * Built on the app's dialog rather than a bare overlay, so Escape, the scroll lock, the focus
 * trap and returning focus to whatever opened it all come from one place that already gets them
 * right. The dialog's own sizing is overridden away entirely: this is the one surface that
 * should be as large as the window allows. */
export function ImageLightbox({
  sources,
  index,
  onIndexChange,
  onClose,
  title,
}: ImageLightboxProps) {
  const hasSeveral = sources.length > 1;
  const { data: magnifier = { enabled: true, size: 120 } } = useMagnifierSettings();

  // Arrow keys, because a viewer opened to compare a mod's shots is one you page through, and
  // reaching for the mouse between every image is the slow way to do it. Escape is Radix's.
  useEffect(() => {
    if (!hasSeveral) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        onIndexChange((index - 1 + sources.length) % sources.length);
      }
      if (event.key === "ArrowRight") {
        onIndexChange((index + 1) % sources.length);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasSeveral, index, sources.length, onIndexChange]);

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton={false}
        // Everything the base content assumes about being a sheet of paper is undone here: no
        // edge, no shadow, no padding, no max width, and transparent so the backdrop is the only
        // surface behind the picture. The panel is not an object in this one — the photograph is.
        className="top-0 left-0 flex h-screen max-w-none translate-x-0 translate-y-0 items-center justify-center border-0 bg-transparent p-0 shadow-none sm:max-w-none"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>

        {/* Clicking away closes, which is what a picture filling the screen invites. */}
        <DialogClose aria-label="Close" className="absolute inset-0 cursor-zoom-out outline-none" />

        {/* The lens follows here too — this view is larger but still short of the source, so
            there is detail left to find. It also takes the pointer, which means a click on the
            artwork no longer reaches the backdrop behind it: previously the image was inert and
            clicking it closed the view, which is the wrong answer while you are inspecting it.
            The backdrop, the X and Escape all still close. */}
        <MagnifiedImage
          src={sources[index]}
          alt={title}
          size={magnifier.size}
          disabled={!magnifier.enabled}
          className="relative"
          imageClassName="max-h-[92vh] max-w-[92vw] object-contain"
        />

        <DialogClose
          aria-label="Close"
          className="absolute top-4 right-4 h-9 w-9 flex items-center justify-center bg-card text-foreground shadow-slap outline-none transition-[translate,box-shadow,background-color,color] duration-200 hover:-translate-y-px hover:bg-primary hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        >
          <XIcon className="h-4 w-4" />
        </DialogClose>

        {hasSeveral && (
          <>
            <button
              type="button"
              onClick={() => onIndexChange((index - 1 + sources.length) % sources.length)}
              aria-label="Previous image"
              className="absolute top-1/2 left-4 flex h-14 w-9 -translate-y-1/2 items-center justify-center bg-card text-foreground shadow-slap outline-none transition-[box-shadow,background-color,color] duration-200 hover:bg-primary hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => onIndexChange((index + 1) % sources.length)}
              aria-label="Next image"
              className="absolute top-1/2 right-4 flex h-14 w-9 -translate-y-1/2 items-center justify-center bg-card text-foreground shadow-slap outline-none transition-[box-shadow,background-color,color] duration-200 hover:bg-primary hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            >
              <ChevronRight className="h-5 w-5" />
            </button>

            <span className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-card px-2.5 py-1 font-mono text-[11px] font-bold tabular-nums tracking-[0.14em] text-muted-foreground shadow-slap">
              {index + 1} / {sources.length}
            </span>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
