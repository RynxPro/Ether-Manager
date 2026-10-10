import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** `twMerge`, taught about the app's two custom shadows.
 *
 * It resolves conflicts by knowing which utilities share a CSS property, and it only knows the
 * ones Tailwind ships with. `shadow-slap` and `shadow-slap-lift` are ours, so out of the box it
 * treated them as unrelated to `shadow-none` and kept both — leaving the winner to whichever
 * rule the stylesheet happened to emit last. That is how the lightbox, which asks for no shadow
 * at all, kept the slap the base dialog had given it.
 *
 * Registered here rather than worked around with `!` at each call site, for the same reason
 * `gbImageUrl` is shared: the workaround has to be remembered every single time, and the one
 * time it is not, nothing errors — it just quietly looks wrong. */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "shadow": [{ shadow: ["slap", "slap-lift"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
