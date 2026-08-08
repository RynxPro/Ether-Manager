import { formatBytes } from "@/lib/format";
import type { InstallProgress } from "@/lib/tauri-commands";

interface InstallProgressBarProps {
  progress: InstallProgress | null;
  speedBytesPerSec: number | null;
  percent: number | null;
}

/** Shared by the install and update dialogs — both drive this from `useInstallProgress`. */
export function InstallProgressBar({ progress, speedBytesPerSec, percent }: InstallProgressBarProps) {
  return (
    <div className="space-y-1.5">
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={
            percent === null
              ? "h-full w-1/3 animate-pulse rounded-full bg-primary"
              : "h-full rounded-full bg-primary transition-all"
          }
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {progress
          ? `${formatBytes(progress.downloaded)}${
              progress.total ? ` / ${formatBytes(progress.total)}` : ""
            }${percent !== null ? ` (${percent}%)` : ""}${
              speedBytesPerSec ? ` — ${formatBytes(speedBytesPerSec)}/s` : ""
            }`
          : "Starting download…"}
      </p>
    </div>
  );
}
