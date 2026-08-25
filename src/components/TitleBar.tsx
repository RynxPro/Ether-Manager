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
export function TitleBar() {
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

      <div className="ml-auto flex h-full">
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
