import { Download as DownloadIcon, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/format";
import { updatedLabel } from "@/lib/time";
import type { Download, DownloadStatus } from "@/lib/tauri-commands";
import {
  activeDownloads,
  useCancelDownload,
  useClearFinishedDownloads,
  useDownloadProgress,
  useDownloads,
  useRetryDownload,
  type LiveProgress,
} from "./hooks";

/** Eridu's signature corner. Inline because a clip path cannot come from a border radius. */
const CUT_CORNER = {
  clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%)",
} as const;

/** What each state is called on screen, and whether it reads as a problem.
 *
 * `Failed` is the only one that takes `--destructive`. A cancelled download is not an error —
 * you asked for it — and colouring it red would train the eye to ignore the colour by the time
 * something actually breaks. */
const STATUS_LABELS: Record<DownloadStatus, { text: string; className: string }> = {
  Queued: { text: "Waiting", className: "text-muted-foreground" },
  Downloading: { text: "Downloading", className: "text-primary" },
  Extracting: { text: "Unpacking", className: "text-primary" },
  Installed: { text: "Installed", className: "text-foreground" },
  Failed: { text: "Failed", className: "text-destructive" },
  Cancelled: { text: "Cancelled", className: "text-muted-foreground" },
};

interface DownloadsViewProps {
  /** Opens the character a finished download landed on, so the page leads back into the
   * library rather than being a dead end. */
  onOpenCharacter: (characterId: string) => void;
}

/** Every install the app has been asked to do, running or finished.
 *
 * This page exists because the work outlives the dialog that starts it. Closing the install
 * dialog never cancelled the download — it only threw away the progress bar, and with it any
 * error, so a failed install used to vanish without a word. Here a failure is a row you can read
 * and retry. */
export function DownloadsView({ onOpenCharacter }: DownloadsViewProps) {
  const { data: downloads, isLoading } = useDownloads();
  const progress = useDownloadProgress();
  const cancel = useCancelDownload();
  const retry = useRetryDownload();
  const clearFinished = useClearFinishedDownloads();

  const active = activeDownloads(downloads);
  const activeIds = new Set(active.map((download) => download.id));
  const finished = (downloads ?? []).filter((download) => !activeIds.has(download.id));

  return (
    <div className="space-y-5">
      <div className="flex items-baseline gap-3 border-b-2 border-primary pb-3.5">
        <h2 className="font-heading text-2xl uppercase tracking-[0.06em] text-foreground">
          Downloads
        </h2>
        <span className="font-heading text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
          One at a time, and they keep going if you leave
        </span>
        {finished.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => clearFinished.mutate()}
            disabled={clearFinished.isPending}
          >
            Clear finished
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-[74px] animate-pulse border-2 border-border bg-card" />
          ))}
        </div>
      ) : (downloads ?? []).length === 0 ? (
        // A designed state rather than a line of grey text: an empty queue is the normal
        // condition, not a failure.
        <div className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border bg-card px-6 py-16 text-center">
          <DownloadIcon className="h-7 w-7 text-muted-foreground/40" />
          <p className="font-heading text-sm uppercase tracking-[0.1em] text-foreground">
            Nothing downloaded yet
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Installing a mod from Browse queues it here. You can close the dialog straight away —
            it keeps going.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {active.length > 0 && (
            <section className="space-y-2">
              <h3 className="font-heading text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
                In progress · {active.length}
              </h3>
              {active.map((download) => (
                <DownloadRow
                  key={download.id}
                  download={download}
                  live={progress[download.id]}
                  onCancel={() => cancel.mutate(download.id)}
                  onRetry={() => retry.mutate(download.id)}
                  onOpenCharacter={onOpenCharacter}
                />
              ))}
            </section>
          )}

          {finished.length > 0 && (
            <section className="space-y-2">
              <h3 className="font-heading text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
                History
              </h3>
              {finished.map((download) => (
                <DownloadRow
                  key={download.id}
                  download={download}
                  live={progress[download.id]}
                  onCancel={() => cancel.mutate(download.id)}
                  onRetry={() => retry.mutate(download.id)}
                  onOpenCharacter={onOpenCharacter}
                />
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

interface DownloadRowProps {
  download: Download;
  live: LiveProgress | undefined;
  onCancel: () => void;
  onRetry: () => void;
  onOpenCharacter: (characterId: string) => void;
}

function DownloadRow({ download, live, onCancel, onRetry, onOpenCharacter }: DownloadRowProps) {
  const status = STATUS_LABELS[download.status];
  const isRunning = download.status === "Downloading" || download.status === "Extracting";
  const isQueued = download.status === "Queued";
  const canRetry = download.status === "Failed" || download.status === "Cancelled";

  // Live bytes while running, the stored figures once it has stopped — the row keeps saying how
  // big the thing was long after the event stream is gone.
  const downloaded = live?.downloaded ?? download.downloaded_bytes;
  const total = live?.total ?? download.total_bytes;
  const percent = total && total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : null;
  const isExtracting = download.status === "Extracting" || live?.isExtracting === true;
  const isIndeterminate = isQueued || isExtracting || percent === null;

  return (
    <div
      style={CUT_CORNER}
      className={`flex items-center gap-3 border-2 bg-card px-3 py-2.5 transition-colors ${
        // Yellow marks the one actually running, which is this app's rule for "on".
        isRunning ? "border-primary" : "border-border"
      }`}
    >
      <div className="h-[42px] w-[56px] shrink-0 overflow-hidden border border-border bg-secondary">
        {download.thumbnail_url ? (
          <img src={download.thumbnail_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center font-heading text-base text-muted-foreground/40">
            {download.mod_name.charAt(0)}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p
            className="truncate font-heading text-[13px] uppercase tracking-[0.04em] text-foreground"
            title={download.mod_name}
          >
            {download.mod_name}
          </p>
          <span
            className={`shrink-0 font-heading text-[10px] uppercase tracking-[0.12em] ${status.className}`}
          >
            {isExtracting ? STATUS_LABELS.Extracting.text : status.text}
          </span>
        </div>

        <div className="flex items-baseline justify-between gap-3 text-[11px] tabular-nums text-muted-foreground/70">
          <span className="truncate" title={download.file_name}>
            {download.file_name}
          </span>
          <span className="shrink-0">
            {isRunning || isQueued
              ? liveDetail(downloaded, total, isExtracting, live?.speedBytesPerSec ?? null)
              : restingDetail(download)}
          </span>
        </div>

        {(isRunning || isQueued) && (
          <div className="mt-1.5 h-1 w-full overflow-hidden bg-secondary">
            <div
              // Nothing measurable in either case: queued has not started, and extraction
              // reports no progress. A pulsing sliver says "working" without claiming a position.
              className={
                isIndeterminate
                  ? "h-full w-1/3 animate-pulse bg-primary"
                  : "h-full bg-primary transition-all"
              }
              style={isIndeterminate ? undefined : { width: `${percent}%` }}
            />
          </div>
        )}

        {download.error && (
          <p className="mt-1 line-clamp-2 text-[11px] text-destructive" title={download.error}>
            {download.error}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {download.status === "Installed" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenCharacter(download.character_id)}
          >
            Open
          </Button>
        )}
        {canRetry && (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            <RotateCcw className="h-3.5 w-3.5" />
            Retry
          </Button>
        )}
        {(isRunning || isQueued) && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onCancel}
            aria-label={`Cancel ${download.mod_name}`}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function liveDetail(
  downloaded: number,
  total: number | null,
  isExtracting: boolean,
  speedBytesPerSec: number | null,
): string {
  if (isExtracting) return "Unpacking archive…";
  if (downloaded === 0 && !total) return "Waiting its turn";
  const size = total
    ? `${formatBytes(downloaded)} / ${formatBytes(total)}`
    : formatBytes(downloaded);
  return speedBytesPerSec ? `${size} · ${formatBytes(speedBytesPerSec)}/s` : size;
}

function restingDetail(download: Download): string {
  const when = updatedLabel(download.finished_at ?? download.created_at).toLowerCase();
  // `total_bytes` is null when the server sent no Content-Length, so fall back to what actually
  // came down — for a finished install those are the same number, and one of them is always
  // known. A download that never started has neither, and just shows when it was.
  const size = download.total_bytes ?? download.downloaded_bytes;
  if (download.status === "Installed" && size > 0) {
    return `${formatBytes(size)} · ${when}`;
  }
  return when;
}
