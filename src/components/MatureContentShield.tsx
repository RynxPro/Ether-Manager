import { EyeOff } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type MatureContentShieldProps = {
  isBlurred: boolean;
  children: React.ReactNode;
  className?: string;
} & (
  | {
      /** Uncontrolled mode (both omitted): the shield manages its own per-instance reveal
       * state — used by the Browse grid, where each card reveals independently. */
      revealed?: undefined;
      onReveal?: undefined;
    }
  | {
      /** Controlled mode (both required together): the parent owns reveal state, so one
       * reveal can gate several shields at once — used by the mod detail dialog, where
       * revealing the hero image also un-blurs the thumbnail strip. Enforced as a pair at
       * the type level so a caller can't pass just one and get a shield that silently never
       * reveals (the write path) or never visually updates (the read path). */
      revealed: boolean;
      onReveal: () => void;
    }
);

/** Blurs `children` behind a real, keyboard-reachable reveal button until clicked. Reveal is
 * deliberately click-only (not hover) and never persisted — see Milestone 4 plan Decision 9.
 * `scale-105` is required, not decorative: a CSS blur samples transparent pixels past the
 * element's edge, which leaves a visible unblurred rim without the extra scale.
 *
 * The blur is deliberately light. Most of the ZZZ catalogue on GameBanana is mature-flagged, so
 * a heavy blur turned Browse into a wall of identical grey tiles that could not be told apart
 * or navigated. At this strength the composition and colour of a mod still read — enough to
 * decide whether it is worth revealing — while the detail does not. */
export function MatureContentShield({
  isBlurred,
  children,
  className,
  revealed: revealedProp,
  onReveal,
}: MatureContentShieldProps) {
  const [revealedState, setRevealedState] = useState(false);
  const isControlled = revealedProp !== undefined;
  const revealed = isControlled ? revealedProp : revealedState;
  const active = isBlurred && !revealed;

  function handleReveal() {
    if (isControlled) {
      onReveal();
    } else {
      setRevealedState(true);
    }
  }

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div
        className={cn(
          "h-full w-full transition-all",
          active && "scale-105 blur-sm brightness-[.85]",
        )}
      >
        {children}
      </div>
      {active && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            handleReveal();
          }}
          onKeyDown={(event) => {
            // Enter/Space on this button must not also reach an ancestor `div[role=button]`
            // (see GameBananaModCard) — without this, a keyboard user's Enter press both
            // reveals AND immediately opens the mod, since the keydown bubbles past this
            // button while the click event's own stopPropagation only stops mouse clicks.
            if (event.key === "Enter" || event.key === " ") {
              event.stopPropagation();
            }
          }}
          // A light scrim only. Anything heavier would undo the point of the lighter blur and
          // put the wall of grey tiles back.
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-1.5 bg-black/25 px-2 text-white [text-shadow:0_1px_6px_rgba(0,0,0,.9)]"
        >
          <EyeOff className="h-5 w-5" />
          <span className="text-center font-heading text-[11px] uppercase leading-tight tracking-[0.08em]">
            Mature content — click to reveal
          </span>
        </button>
      )}
    </div>
  );
}
