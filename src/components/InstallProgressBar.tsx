import { formatBytes } from "@/lib/format";
import type { InstallProgress } from "@/lib/tauri-commands";

interface InstallProgressBarProps {
  progress: InstallProgress | null;
  speedBytesPerSec: number | null;
  percent: number | null;
}

/** Shared by the install and update dialogs — both drive this from `useInstallProgress`.
 *
 * Square, not a pill. `--radius` is 0 across this app, but `rounded-full` is a fixed 9999px
 * rather than a token, so it survived the switch to square corners and was the one rounded
 * shape left on either dialog.
 *
 * The readout is a row of separated figures rather than one run-on sentence: the percentage is
 * the thing you glance at, and it was previously buried mid-string behind two byte counts. */
export function InstallProgressBar({
  progress,
  speedBytesPerSec,
  percent,
}: InstallProgressBarProps) {
  return (
    <div className="space-y-1.5">
      <div className="h-1.5 w-full overflow-hidden bg-secondary">
        <div
          className={
            percent === null
              ? "h-full w-1/3 animate-pulse bg-primary"
              : "h-full bg-primary transition-all"
          }
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </div>
      {progress ? (
        <div className="flex items-baseline justify-between gap-3 text-[11px] tabular-nums text-muted-foreground">
          <span>
            {formatBytes(progress.downloaded)}
            {progress.total ? ` / ${formatBytes(progress.total)}` : ""}
          </span>
          <span className="flex items-center gap-2">
            {speedBytesPerSec ? <span>{formatBytes(speedBytesPerSec)}/s</span> : null}
            {percent !== null && <span className="text-foreground">{percent}%</span>}
          </span>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">Starting download…</p>
      )}
    </div>
  );
}
