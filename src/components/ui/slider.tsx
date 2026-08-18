import { Slider as SliderPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/** Square, hard-edged and accent-filled, matching the rest of the Eridu controls — Radix ships
 * behaviour, not looks, so the track and thumb are styled here rather than rounded by default. */
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
      <SliderPrimitive.Track className="relative h-1.5 w-full grow bg-secondary">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-4 w-4 border-2 border-primary bg-background transition-colors hover:bg-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none" />
    </SliderPrimitive.Root>
  );
}

export { Slider };
