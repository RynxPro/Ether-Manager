"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-200 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

/** The panel every dialog in the app is cut from.
 *
 * It carries the frame rather than leaving each dialog to re-declare it: square, a 2px edge,
 * and the hard slap shadow with its lift — paper held off the wall, the same object a card is.
 * It replaced `rounded-xl` and a permanent `ring-1`, both of which were the scaffold talking.
 * A ring in this app means focus or hover, so wearing one at rest was a lie.
 *
 * `duration-200` to match everything else that moves.
 */
function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] [&>*]:min-w-0 -translate-x-1/2 -translate-y-1/2 gap-4 rounded-none border-2 border-border bg-popover p-4 text-sm text-popover-foreground shadow-slap-lift duration-200 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-2 right-2"
              size="icon-sm"
            >
              <XIcon
              />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 border-t-2 border-border bg-background p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

/** The head of a docket.
 *
 * Every dialog in the app wears the same one, so it is built here rather than retyped: the
 * machine naming its own operation in the caption voice, a 2px rule under it, and the way out
 * as a small piece of paper. What it replaced was a solid bar of colour with the page-title
 * face set at 11px inside it — which made every dialog shout its own name and spent the
 * accent on the panel rather than on the thing you press.
 *
 * `title` is the operation, not a sentence: `Edit · mod`, `Install · consignment`. It is also
 * the dialog's accessible name, which is why it says what this is rather than how it feels. */
function DialogDocketHeader({
  title,
  /** True while the dialog is running something it will not abandon — an install, an update.
   * Those dialogs already refuse Escape and a click on the backdrop, so a close button that
   * still looked pressable would be the only one of the three lying about it. */
  isLocked = false,
}: {
  title: React.ReactNode
  isLocked?: boolean
}) {
  return (
    <DialogHeader className="flex-row items-center justify-between border-b-2 border-border px-4 py-2.5">
      <DialogTitle className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
        {title}
      </DialogTitle>
      <DialogClose
        disabled={isLocked}
        className="flex h-6 w-6 shrink-0 items-center justify-center bg-background text-card-foreground shadow-slap outline-none transition-[translate,box-shadow] duration-200 hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:translate-y-0 disabled:opacity-40 disabled:shadow-none"
        aria-label="Close"
      >
        <XIcon className="h-3.5 w-3.5" />
      </DialogClose>
    </DialogHeader>
  )
}

/** What a field inside a docket is called: the sign face, like every control in the app.
 *
 * Not the display face. A label names the thing you are about to change rather than the thing
 * itself — whatever this dialog is about is already named in the caption, or on the card that
 * opened it. */
const DOCKET_LABEL =
  "font-sign text-[16px] uppercase tracking-[0.16em] text-muted-foreground/80"

/** The sentence under a field, saying what pressing the action will actually do. Geist, because
 * genuine prose is the one job Geist has in this app. */
const DOCKET_HINT = "text-[12px] leading-snug text-muted-foreground"

/** Something gone wrong, in the machine's voice, because it is the machine reporting. */
const DOCKET_ERROR =
  "flex items-start gap-1.5 font-mono text-[10.5px] font-bold uppercase leading-relaxed tracking-[0.06em] text-destructive"

/** A docket's panel is paper, so a control standing on it inverts to `--background`: paper on
 * paper of the same shade has no edge, and the slap is what makes it look pressable. */
const DOCKET_ON_PAPER =
  "bg-background text-foreground shadow-slap outline-none transition-[translate,box-shadow] duration-200 hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"

/** A control on that paper which is pressed rather than typed into. */
const DOCKET_BUTTON = `inline-flex h-9 shrink-0 items-center justify-center gap-1.5 px-3.5 font-sign text-[17px] uppercase tracking-[0.1em] ${DOCKET_ON_PAPER}`

/** A condition rather than a control: bordered, never filled, with a stamp hung off the corner
 * saying the consequence in two or three words.
 *
 * The install dialog built this for its flagged-file and contains-a-program notices, the
 * confirmation borrowed the stamp for "Deletes files", and the update dialog needs the whole
 * object. Pass the stamp as the first child. */
const DOCKET_NOTICE = "relative border-2 border-destructive px-3 py-2.5"
const DOCKET_STAMP =
  "absolute -top-3 right-2 -rotate-[2deg] bg-destructive px-2 py-0.5 font-sign text-[13px] uppercase tracking-[0.1em] text-white shadow-slap"
/** The words inside a notice: short, and the machine saying them. */
const DOCKET_NOTICE_COPY =
  "font-mono text-[10.5px] font-bold uppercase leading-relaxed tracking-[0.05em] text-card-foreground"

/** A dialog footer's buttons: one shape, cut from `--card` because the footer band is
 * `--background` and paper needs a shade between it and what it sits on.
 *
 * Cancel and the action are the same size on purpose — the colour is what tells them apart,
 * so nobody is nudged into the committing one by its being the bigger target. Add the fill:
 * `bg-card text-card-foreground` to walk away, `bg-primary text-primary-foreground` to go
 * ahead, `bg-destructive text-white` when going ahead is the thing you cannot undo. */
const DOCKET_SLAB =
  "inline-flex h-10 shrink-0 items-center justify-center px-5 font-sign text-[19px] uppercase tracking-[0.1em] shadow-slap outline-none transition-[translate,box-shadow] duration-200 hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"

export {
  DOCKET_BUTTON,
  DOCKET_ERROR,
  DOCKET_HINT,
  DOCKET_LABEL,
  DOCKET_NOTICE,
  DOCKET_NOTICE_COPY,
  DOCKET_ON_PAPER,
  DOCKET_SLAB,
  DOCKET_STAMP,
  Dialog,
  DialogDocketHeader,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
