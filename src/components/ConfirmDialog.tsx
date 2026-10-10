import { useRef } from "react";
import { XIcon } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Cancel and the action are the same slab cut from different paper.
 *
 * The footer band is `--background`, so a control standing on it has to be `--card` to have an
 * edge at all — and the one that carries colour is filled instead. Equal size on purpose: the
 * colour is what tells them apart, not the geometry, so nobody is nudged into the red one by
 * its being the bigger target. */
const FOOTER_SLAB =
  "inline-flex h-10 shrink-0 items-center justify-center px-5 font-sign text-[19px] uppercase tracking-[0.1em] shadow-slap outline-none transition-[translate,box-shadow] duration-200 hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none";

interface ConfirmDialogProps {
  /** The machine naming its own operation, in the caption voice: `Delete · mod`, not a
   * question. The question is the description, and the answer is the button. */
  title: string;
  /** What is about to happen, in the terms the user thinks in — what goes, and whether it can
   * be had back. A confirmation that only restates the button teaches nothing. */
  description: React.ReactNode;
  confirmLabel: string;
  /** Colours the confirm button red and is the reason this dialog exists. Off for things that
   * are merely tidy-up, where the same shape without the alarm is enough. */
  isDestructive?: boolean;
  /** Two or three words for the stamp: the *consequence*, not the alarm. "Deletes files" says
   * something a red button cannot; "Careful!" says nothing at all.
   *
   * Only drawn on a destructive confirm, because the stamp is cut from `--destructive`. */
  consequence?: string;
  isPending?: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}

/** One shape for "are you sure", so the app asks the same way every time.
 *
 * Deliberately narrow: it takes a sentence and a verb, not children. Every confirmation that has
 * come up is one question with two answers, and giving it a slot to render anything into is how
 * it ends up carrying forms.
 *
 * Cancel is the default focus and the plain button; the action carries the colour. Someone who
 * hits Enter out of habit should not lose files by it.
 *
 * The danger is stated by a stamp hung off the top edge rather than by a solid red bar across
 * the head of the panel. Three reasons it is the stamp: the bar spent Anton, the page-title
 * face, on an 11px caption; a filled band of `--destructive` at the top made every confirmation
 * look identical from across the room, alarming or not; and the stamp is an object this app
 * already owns — the install dialog hangs the same one off its flagged-file and
 * contains-a-program notices. Reusing it means a destructive confirm reads like the rest of the
 * app being emphatic, not like a different app. */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  isDestructive,
  consequence,
  isPending,
  onConfirm,
  onOpenChange,
}: ConfirmDialogProps) {
  const cancel = useRef<HTMLButtonElement>(null);

  return (
    <Dialog open onOpenChange={(next) => !next && onOpenChange(false)}>
      <DialogContent
        showCloseButton={false}
        // Focus lands on Cancel, not on the close button that happens to come first in the
        // markup, so Enter and Escape agree with each other. The whole point of asking is that
        // the default answer is no. Done here rather than with `autoFocus`, which is the same
        // thing but linted against — the rule is about pages, and this is a modal where the
        // focus is going to move regardless; all that is in question is where it lands.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancel.current?.focus();
        }}
        // No padding of its own, so the header rule and the footer band reach both edges. The
        // frame — square, 2px, slapped — comes from `DialogContent` itself now.
        className="gap-0 p-0 sm:max-w-[400px]"
      >
        {/* Hung off the corner, overhanging the edge, slightly off true: the same object as the
            install dialog's warnings, at the same size. It says what the press does rather than
            how worried to be, and on a tidy-up confirmation it is simply absent — which is
            what makes its presence mean anything. */}
        {isDestructive && consequence && (
          <span className="absolute -top-3 right-2 -rotate-[2deg] bg-destructive px-2 py-0.5 font-sign text-[13px] uppercase tracking-[0.1em] text-white shadow-slap">
            {consequence}
          </span>
        )}

        <DialogHeader className="flex-row items-center justify-between border-b-2 border-border px-4 py-2.5">
          <DialogTitle className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            {title}
          </DialogTitle>
          <DialogClose
            className="flex h-6 w-6 shrink-0 items-center justify-center bg-background text-card-foreground shadow-slap outline-none transition-[translate,box-shadow] duration-200 hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            aria-label="Close"
          >
            <XIcon className="h-3.5 w-3.5" />
          </DialogClose>
        </DialogHeader>

        {/* `DialogDescription` rather than a bare div: it is what Radix points the dialog's
            `aria-describedby` at, so this sentence is read out with the title instead of being
            something you have to go looking for. It renders a paragraph, which is why every
            caller builds its description out of spans. */}
        <DialogDescription className="px-4 py-4 leading-relaxed">
          {description}
        </DialogDescription>

        {/* `mx-0 mb-0` cancels the base footer's negative margins, which exist to bleed into
            `DialogContent`'s default padding. This content has none. */}
        <DialogFooter className="mx-0 mb-0 gap-2 px-4 py-3">
          <DialogClose
            ref={cancel}
            className={`${FOOTER_SLAB} bg-card text-card-foreground`}
          >
            Cancel
          </DialogClose>
          <button
            type="button"
            disabled={isPending}
            onClick={onConfirm}
            className={`${FOOTER_SLAB} ${
              isDestructive
                ? // `--destructive` is dark red in both themes, so the label is plain white
                  // rather than a token — there is no theme where it wants to be dark.
                  "bg-destructive text-white"
                : "bg-primary text-primary-foreground"
            }`}
          >
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
