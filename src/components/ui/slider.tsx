import { Slider as SliderPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/** Square, hard-edged and accent-filled — Radix ships behaviour, not looks, so the track and
 * thumb are styled here rather than left rounded.
 *
 * Street weights: the track is thick enough to read as a channel cut into the wall rather than a
 * hairline, and the thumb is a slap sitting proud of it, carrying the same hard offset shadow as
 * every other grabbable thing in the app. At 6px with a flat square on it, this read as a
 * progress bar someone had dropped a tile onto. */
function Slider({ className, ...props }: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(
        "relative flex w-full touch-none items-center select-none data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-2.5 w-full grow bg-secondary ring-1 ring-inset ring-border">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-5 w-[18px] border-2 border-primary bg-card shadow-slap transition-[translate] duration-200 hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none" />
    </SliderPrimitive.Root>
  );
}

export { Slider };
