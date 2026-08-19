import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Eridu's signature corner. Inline because a clip path cannot come from a border radius. */
const CUT_CORNER = {
  clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%)",
} as const;

interface ConfirmDialogProps {
  title: string;
  /** What is about to happen, in the terms the user thinks in — what goes, and whether it can
   * be had back. A confirmation that only restates the button teaches nothing. */
  description: React.ReactNode;
  confirmLabel: string;
  /** Colours the confirm button red and is the reason this dialog exists. Off for things that
   * are merely tidy-up, where the same shape without the alarm is enough. */
  isDestructive?: boolean;
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
 * hits Enter out of habit should not lose files by it. */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  isDestructive,
  isPending,
  onConfirm,
  onOpenChange,
}: ConfirmDialogProps) {
  return (
    <Dialog open onOpenChange={(next) => !next && onOpenChange(false)}>
      <DialogContent
        showCloseButton={false}
        style={CUT_CORNER}
        className="gap-0 border-2 border-border bg-card p-0 sm:max-w-[400px]"
      >
        <DialogHeader
          className={`flex-row items-center justify-between px-4 py-2.5 ${
            isDestructive ? "bg-destructive text-white" : "bg-primary text-primary-foreground"
          }`}
        >
          <DialogTitle className="font-heading text-[11px] font-semibold uppercase tracking-[0.16em]">
            {title}
          </DialogTitle>
          <DialogClose
            className="-my-1 -mr-1 p-1 transition-opacity hover:opacity-60"
            aria-label="Close"
          >
            <XIcon className="h-3.5 w-3.5" />
          </DialogClose>
        </DialogHeader>

        <div className="px-4 py-4 text-sm text-muted-foreground">{description}</div>

        <DialogFooter className="mx-0 mb-0 gap-2 border-t border-border bg-background px-4 py-3">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant={isDestructive ? "destructive" : "default"}
            disabled={isPending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
