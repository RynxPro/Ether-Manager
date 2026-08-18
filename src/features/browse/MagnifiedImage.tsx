import { useRef, useState } from "react";
import { MAGNIFIER_ZOOM as ZOOM } from "@/lib/magnifier";

interface MagnifiedImageProps {
  src: string;
  alt: string;
  onLoad?: React.ReactEventHandler<HTMLImageElement>;
  /** Suppresses the lens — used while the mature shield is up, where the point is that the
   * picture is *not* being shown, and when it is switched off in Settings. */
  disabled?: boolean;
  /** Side of the square lens, from Settings. */
  size: number;
  /** Wraps the image. Defaults to filling its parent, which is what the page's fixed frame
   * wants; the full-size view overrides it to shrink around the picture instead. */
  className?: string;
  imageClassName?: string;
}

/** A square lens that follows the pointer and magnifies what is under it.
 *
 * The frame on the page is capped at 400px so a preview cannot push the description and the
 * install panel off screen, which means every shot is being shown at a fraction of the size it
 * was uploaded at. Opening the full view answers that for the picture as a whole; this answers
 * it for one part of it, without leaving the page — which is the question actually being asked
 * when someone leans in at a mod's screenshot.
 *
 * The lens replaces the pointer rather than accompanying it: the cursor is hidden while it is up,
 * so the square *is* the cursor. It never takes a click, so the image underneath keeps its own
 * behaviour of opening the full view. */
export function MagnifiedImage({
  src,
  alt,
  onLoad,
  disabled,
  size,
  className = "block h-full w-full",
  imageClassName = "h-full w-full object-contain",
}: MagnifiedImageProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [lens, setLens] = useState<{ x: number; y: number } | null>(null);

  function handleMove(event: React.MouseEvent<HTMLElement>) {
    if (disabled) return;
    const image = imageRef.current;
    if (!image) return;
    const rect = image.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    // Leaving through a corner can land a final move event a pixel outside; without this the
    // lens hangs on at the edge until the pointer comes back.
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
      setLens(null);
      return;
    }
    setLens({ x, y });
  }

  const rect = imageRef.current?.getBoundingClientRect();
  const zoomedWidth = (rect?.width ?? 0) * ZOOM;
  const zoomedHeight = (rect?.height ?? 0) * ZOOM;

  // Centre the magnified point in the lens, then hold the background inside the image so the
  // corners show picture rather than empty space — the cost is that the very edges magnify
  // slightly off-centre, which is less jarring than a lens half full of nothing.
  const offsetX = lens
    ? Math.min(Math.max(lens.x * ZOOM - size / 2, 0), Math.max(zoomedWidth - size, 0))
    : 0;
  const offsetY = lens
    ? Math.min(Math.max(lens.y * ZOOM - size / 2, 0), Math.max(zoomedHeight - size, 0))
    : 0;

  return (
    <span
      className={`relative ${className}`}
      onMouseMove={handleMove}
      onMouseLeave={() => setLens(null)}
    >
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        onLoad={onLoad}
        className={`${imageClassName} ${lens ? "cursor-none" : ""}`}
      />

      {lens && (
        <span
          aria-hidden
          className="pointer-events-none absolute border-2 border-primary"
          style={{
            width: size,
            height: size,
            left: lens.x - size / 2,
            top: lens.y - size / 2,
            backgroundImage: `url(${src})`,
            backgroundSize: `${zoomedWidth}px ${zoomedHeight}px`,
            backgroundPosition: `-${offsetX}px -${offsetY}px`,
            backgroundRepeat: "no-repeat",
          }}
        />
      )}
    </span>
  );
}
