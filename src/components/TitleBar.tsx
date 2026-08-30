import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** The window's own title bar, drawn by the app rather than by Windows.
 *
 * `decorations: false` in `tauri.conf.json` is what makes this necessary: with the native frame
 * gone, nothing else can move, minimise, maximise or close the window. That is also why this
 * renders above *every* app state including the loading screen and first-run setup — a window
 * you cannot move or close while it is still working out where your mods folder is would be a
 * trap, and those two states are exactly where someone is most likely to want out.
 *
 * The trade is real and worth stating: Windows 11's Snap Layouts, the flyout that appears when
 * you hover a native maximise button, is gone. Nothing a web page draws can bring it back.
 * Snapping by dragging to an edge and the Win+Arrow shortcuts are unaffected, since those belong
 * to the window rather than to its buttons.
 */
interface TitleBarProps {
  /** Navigation, hoisted out of the page and into the window's own chrome.
   *
   * It lived in the page header before, which forced every long page to pin that header — the way
   * out of a mod's detail page cannot be something you have to scroll back up to find. Pinning it
   * meant a tall band frozen over the content, cards sliced at its lower edge, and the header
   * unable to be the thing the design wanted it to be.
   *
   * The title bar solves it by already being the answer: it never scrolls, it is always visible,
   * it is where every browser and file manager puts these two, and its middle was empty. With back
   * and forward living here, no page needs a pinned header at all.
   *
   * Optional, because the bar is mounted above the loading and first-run states too, where there
   * is no history to move through yet. */
  onBack?: () => void;
  onForward?: () => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
  /** The ambient readouts — what the app is attached to, whether GameBanana is answering, the
   * version, the notification bell. They sat under the sidebar before; they are facts about the
   * window rather than about a destination, so they belong in the window's own strip. Passed in
   * rather than rendered here so this component stays presentational and does no data fetching. */
  status?: React.ReactNode;
}

export function TitleBar({
  onBack,
  onForward,
  canGoBack = false,
  canGoForward = false,
  status,
}: TitleBarProps = {}) {
  const appWindow = getCurrentWindow();
  const [isMaximized, setIsMaximized] = useState(false);

  // Maximised state is not ours to hold: double-clicking the bar, Win+Up, dragging to the top of
  // the screen and Aero Snap all change it without going through the button below. So it is read
  // from the window and re-read whenever the window resizes, rather than toggled locally — a
  // local flag would drift the first time the window was snapped by any other route.
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      const current = await appWindow.isMaximized();
      if (!cancelled) setIsMaximized(current);

      const stop = await appWindow.onResized(() => {
        void appWindow.isMaximized().then((value) => {
          if (!cancelled) setIsMaximized(value);
        });
      });
      // The listener can finish registering after the component has already gone; without this
      // it would be left attached to a window whose React tree no longer exists.
      if (cancelled) stop();
      else unlisten = stop;
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [appWindow]);

  return (
    // `data-tauri-drag-region` applies only to the element carrying it, never to its children —
    // which is what keeps the buttons clickable. Tauri also treats a double-click on this region
    // as maximise/restore, so that gesture works without any code here.
    <div
      data-tauri-drag-region
      className="flex h-8 shrink-0 items-center border-b border-border bg-sidebar"
    >
      {/* `pointer-events-none` so a press on the lettering lands on the bar behind it. Without
          it, the one part of the bar with something written on it would be the one part you
          could not drag by. */}
      <span className="pointer-events-none select-none pl-3.5 font-heading text-[11px] uppercase tracking-[0.14em] text-primary">
        Ether Manager
      </span>

      {onBack && onForward && (
        // Left, next to the wordmark, rather than centred: this is where the eye already goes for
        // it, and a control you reach for constantly should not be hunted for in the middle of an
        // otherwise draggable strip.
        <div className="ml-4 flex h-full">
          <NavButton label="Back" onClick={onBack} disabled={!canGoBack}>
            <path d="M6.5 1 2.5 5l4 4" />
          </NavButton>
          <NavButton label="Forward" onClick={onForward} disabled={!canGoForward}>
            <path d="M3.5 1 7.5 5l-4 4" />
          </NavButton>
        </div>
      )}

      {/* Right-aligned but held clear of the window controls: close is the one button in the app
          whose misfire cannot be undone, and readouts crowding it would put a hover target next
          to it. The gap is the safety margin. */}
      {status && <div className="ml-auto pr-4">{status}</div>}

      <div className={`flex h-full ${status ? "" : "ml-auto"}`}>
        <ControlButton
          label="Minimize"
          onClick={() => void appWindow.minimize()}
        >
          <line x1="0" y1="5.5" x2="10" y2="5.5" />
        </ControlButton>

        <ControlButton
          label={isMaximized ? "Restore" : "Maximize"}
          onClick={() => void appWindow.toggleMaximize()}
        >
          {isMaximized ? (
            // Two offset outlines, the shape Windows uses for restore — a single square would
            // say the same thing in both states and leave no way to tell which one you are in.
            <>
              <rect x="0.5" y="2.5" width="7" height="7" />
              <path d="M2.5 2.5V0.5H9.5V7.5H7.5" />
            </>
          ) : (
            <rect x="0.5" y="0.5" width="9" height="9" />
          )}
        </ControlButton>

        <ControlButton
          label="Close"
          isClose
          onClick={() => void appWindow.close()}
        >
          <line x1="0.5" y1="0.5" x2="9.5" y2="9.5" />
          <line x1="9.5" y1="0.5" x2="0.5" y2="9.5" />
        </ControlButton>
      </div>
    </div>
  );
}

/** Back or forward.
 *
 * Narrower than the window controls at 34px, and deliberately so: those three are a Windows
 * convention measured in muscle memory, and matching their 46px here would make navigation look
 * like a fourth and fifth window control. These belong to the app, not to the frame.
 *
 * Disabled rather than hidden at the ends of the trail — a control that vanishes moves the one
 * beside it, and a back button that jumps under the cursor is worse than one that is greyed. */
function NavButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-full w-[34px] items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
    >
      {/* 16px on the same 10-unit grid, so the chevrons carry the weight of a control pressed
          constantly rather than reading as hairlines. The window controls stay at 10px on purpose:
          those are a Windows convention drawn at an exact size, and matching them here would make
          navigation look like two more of them. */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 10 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {children}
      </svg>
    </button>
  );
}

/** One of the three window controls.
 *
 * 46x32 because that is what Windows uses, and muscle memory for the close button is measured in
 * pixels — a smaller target here is felt rather than seen. Close takes red on hover for the same
 * reason: it is the one control in the app whose misfire cannot be undone. */
function ControlButton({
  label,
  onClick,
  isClose = false,
  children,
}: {
  label: string;
  onClick: () => void;
  isClose?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-full w-[46px] items-center justify-center text-muted-foreground transition-colors ${
        isClose
          ? "hover:bg-destructive hover:text-white"
          : "hover:bg-accent hover:text-foreground"
      }`}
    >
      {/* Hand-drawn at 10x10 with a 1px stroke rather than taken from the icon set: these three
          glyphs are a Windows convention with exact expected proportions, and an icon library's
          rounded caps and 24px grid read as approximately-right, which is worse here than
          anywhere else in the app. `shapeRendering` keeps the hairlines from softening. */}
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        shapeRendering="crispEdges"
        aria-hidden
      >
        {children}
      </svg>
    </button>
  );
}
