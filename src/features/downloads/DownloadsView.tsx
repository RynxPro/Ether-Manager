import { Download as DownloadIcon, Pause, Play, RotateCcw, X } from "lucide-react";
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
  usePauseDownload,
  useResumeDownload,
  useRetryDownload,
  type LiveProgress,
} from "./hooks";
import { PageHeader } from "@/components/PageHeader";

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
  Paused: { text: "Paused", className: "text-muted-foreground" },
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
  const pause = usePauseDownload();
  const resume = useResumeDownload();
  const retry = useRetryDownload();
  const clearFinished = useClearFinishedDownloads();

  const active = activeDownloads(downloads);
  const activeIds = new Set(active.map((download) => download.id));
  const finished = (downloads ?? []).filter((download) => !activeIds.has(download.id));
  // The queue runs one at a time, so its head is the job actually in flight and everything behind
  // it is waiting. Paused counts as leading: it is still the one holding the slot, and its bytes
  // are the ones a resume continues from.
  const [leading, ...waiting] = active;

  return (
    <div className="space-y-5">
      <PageHeader title="Downloads" subtitle="One at a time, and they keep going if you leave">
        {finished.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => clearFinished.mutate()}
            disabled={clearFinished.isPending}
          >
            Clear finished
          </Button>
        )}
      </PageHeader>

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
          {/* The one in flight, given the page. Only one download runs at a time, so there is
              never a second hero competing with this — the rest are genuinely waiting. */}
          {leading && (
            <ActiveDownloadHero
              download={leading}
              live={progress[leading.id]}
              onCancel={() => cancel.mutate(leading.id)}
              onPause={() => pause.mutate(leading.id)}
              onResume={() => resume.mutate(leading.id)}
            />
          )}

          {waiting.length > 0 && (
            <section className="space-y-2">
              <h3 className="font-heading text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
                Up next · {waiting.length}
              </h3>
              {waiting.map((download) => (
                <DownloadRow
                  key={download.id}
                  download={download}
                  live={progress[download.id]}
                  onCancel={() => cancel.mutate(download.id)}
                  onPause={() => pause.mutate(download.id)}
                  onResume={() => resume.mutate(download.id)}
                  onRetry={() => retry.mutate(download.id)}
                  onOpenCharacter={onOpenCharacter}
                />
              ))}
            </section>
          )}

          {finished.length > 0 && (
            <section className="space-y-2">
              {/* Only worth saying when there is something above it to tell it apart from. With
                  nothing downloading, the finished list is the whole page and a heading over it
                  names nothing — the same reason the character page dropped its slot heading. */}
              {active.length > 0 && (
                <h3 className="font-heading text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
                  History
                </h3>
              )}
              {finished.map((download) => (
                <DownloadRow
                  key={download.id}
                  download={download}
                  live={progress[download.id]}
                  onCancel={() => cancel.mutate(download.id)}
                  onPause={() => pause.mutate(download.id)}
                  onResume={() => resume.mutate(download.id)}
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

/** How long the rest will take, in words, or null when there is nothing honest to say.
 *
 * Guarded on all three inputs because a wrong number here is worse than none: a stalled sample
 * reports zero bytes a second, which divides into a countdown of hours on a file that is nearly
 * done. Rounded to a scale a person reads rather than to the second — "about 2m" survives the
 * next sample changing its mind, where "1m 47s" visibly lurches. */
function formatEta(
  downloaded: number,
  total: number | null,
  speedBytesPerSec: number | null,
): string | null {
  if (!total || total <= 0 || !speedBytesPerSec || speedBytesPerSec <= 0) return null;
  const remaining = total - downloaded;
  if (remaining <= 0) return null;

  const seconds = remaining / speedBytesPerSec;
  if (seconds < 10) return "a few seconds left";
  if (seconds < 90) return `about ${Math.round(seconds / 5) * 5}s left`;
  if (seconds < 3600) return `about ${Math.round(seconds / 60)}m left`;
  return "over an hour left";
}

interface ActiveDownloadHeroProps {
  download: Download;
  live: LiveProgress | undefined;
  onCancel: () => void;
  onPause: () => void;
  onResume: () => void;
}

/** The one download that is actually happening, given the room to say so.
 *
 * Everything on this page used to take the same row, so the job in flight looked exactly like one
 * that finished a fortnight ago — and its Pause sat over 1300px from its name, which is the
 * distance that got the old mod row replaced by a card. Since only one download runs at a time,
 * that one can simply be the page: art large enough to recognise, the bar full width beneath it,
 * and the controls beside the name they act on.
 *
 * Queued and finished work stays in rows below. Three densities for three genuinely different
 * things — one you are watching, some that are waiting, and a history you glance at. */
function ActiveDownloadHero({
  download,
  live,
  onCancel,
  onPause,
  onResume,
}: ActiveDownloadHeroProps) {
  const isPaused = download.status === "Paused";
  const downloaded = isPaused
    ? download.downloaded_bytes
    : (live?.downloaded ?? download.downloaded_bytes);
  const total = isPaused ? download.total_bytes : (live?.total ?? download.total_bytes);
  const percent = total && total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : null;
  const isExtracting = download.status === "Extracting" || live?.isExtracting === true;
  const speed = isPaused || isExtracting ? null : (live?.speedBytesPerSec ?? null);
  const eta = formatEta(downloaded, total, speed);

  return (
    <div style={CUT_CORNER} className="flex gap-4 border-2 border-primary bg-card p-3.5">
      <div className="h-[105px] w-[168px] shrink-0 overflow-hidden border border-border bg-secondary">
        {download.thumbnail_url ? (
          <img src={download.thumbnail_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center font-heading text-2xl text-muted-foreground/30">
            {download.mod_name.charAt(0)}
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3
              className="truncate font-heading text-base uppercase tracking-[0.05em]"
              title={download.mod_name}
            >
              {download.mod_name}
            </h3>
            <p className="truncate text-xs text-muted-foreground" title={download.file_name}>
              {download.file_name}
            </p>
          </div>
          {/* Beside the name, not at the far edge — the whole reason this shape exists. */}
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              size="sm"
              variant={isPaused ? "default" : "outline"}
              onClick={isPaused ? onResume : onPause}
              // Extraction runs straight through once it starts, so neither stopping control can
              // reach it — same reasoning as the row.
              disabled={isExtracting}
            >
              {isPaused ? "Resume" : "Pause"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onCancel}
              disabled={isExtracting}
            >
              Cancel
            </Button>
          </div>
        </div>

        <div className="mt-auto pt-3">
          <div className="h-1.5 w-full overflow-hidden bg-secondary">
            <div
              className={`h-full bg-primary transition-[width] ${percent === null ? "w-1/3 animate-pulse" : ""}`}
              style={percent === null ? undefined : { width: `${percent}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {isExtracting ? (
              <span>Unpacking…</span>
            ) : (
              <>
                <span>
                  <span className="text-foreground">{formatBytes(downloaded)}</span>
                  {total ? ` of ${formatBytes(total)}` : ""}
                </span>
                {speed && <span>{formatBytes(speed)}/s</span>}
                {eta && <span>{eta}</span>}
                {isPaused && <span>Paused</span>}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface DownloadRowProps {
  download: Download;
  live: LiveProgress | undefined;
  onCancel: () => void;
  onPause: () => void;
  onResume: () => void;
  onRetry: () => void;
  onOpenCharacter: (characterId: string) => void;
}

function DownloadRow({
  download,
  live,
  onCancel,
  onPause,
  onResume,
  onRetry,
  onOpenCharacter,
}: DownloadRowProps) {
  const status = STATUS_LABELS[download.status];
  const isRunning = download.status === "Downloading" || download.status === "Extracting";
  const isQueued = download.status === "Queued";
  const isPaused = download.status === "Paused";
  const canRetry = download.status === "Failed" || download.status === "Cancelled";

  // Live bytes while running, the stored figures once it has stopped — the row keeps saying how
  // big the thing was long after the event stream is gone. A paused row reads from the row on
  // purpose: the last live sample is whatever arrived before the stop, and the stored figure is
  // the one the resume will actually continue from.
  const downloaded = isPaused
    ? download.downloaded_bytes
    : (live?.downloaded ?? download.downloaded_bytes);
  const total = isPaused ? download.total_bytes : (live?.total ?? download.total_bytes);
  const percent = total && total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : null;
  // The live flag is only trusted while the row is still running. It lingers in the progress map
  // after a download finishes, and reading it unconditionally left a finished row labelled
  // "Unpacking" forever next to a detail line that correctly said it was installed.
  const isExtracting =
    download.status === "Extracting" || (isRunning && live?.isExtracting === true);
  const isIndeterminate = isQueued || isExtracting || percent === null;
  // Paused shows a bar too, frozen where it stopped — the point of the state is that this much is
  // already done, and hiding it would make a pause look like a loss.
  const showsBar = isRunning || isQueued || isPaused;
  // Unpacking is deliberately absent. Extraction runs straight through once it starts, so neither
  // stopping control can reach it, and a button that quietly does nothing is worse than no button.
  const canStop = download.status === "Downloading" || isQueued || isPaused;

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
            className="flex min-w-0 items-baseline gap-2 font-heading text-[13px] uppercase tracking-[0.04em] text-foreground"
            title={download.mod_name}
          >
            <span className="truncate">{download.mod_name}</span>
            {/* Otherwise a reinstall is indistinguishable from a first install, and the two end
                very differently: one replaces a mod you already have, the other adds a copy. */}
            {download.target_mod_id !== null && (
              <span className="shrink-0 border border-border px-1 text-[9px] tracking-[0.12em] text-muted-foreground">
                Reinstall
              </span>
            )}
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
            {rowDetail({
              download,
              downloaded,
              total,
              isExtracting,
              speedBytesPerSec: live?.speedBytesPerSec ?? null,
            })}
          </span>
        </div>

        {showsBar && (
          <div className="mt-1.5 h-1 w-full overflow-hidden bg-secondary">
            <div
              // Nothing measurable in either case: queued has not started, and extraction
              // reports no progress. A pulsing sliver says "working" without claiming a position.
              className={
                isIndeterminate && !isPaused
                  ? "h-full w-1/3 animate-pulse bg-primary"
                  : // A paused bar goes grey and stops moving. Leaving it yellow would say the
                    // one thing that is not true of it, which is that something is happening.
                    `h-full transition-all ${isPaused ? "bg-muted-foreground/50" : "bg-primary"}`
              }
              style={isIndeterminate && !isPaused ? undefined : { width: `${percent ?? 0}%` }}
            />
          </div>
        )}

        {download.error && (
          <p
            // Red only when it actually failed. A row parked by the startup sweep carries an
            // explanation too ("interrupted when the app closed"), and painting that in the
            // failure colour would report a recoverable pause as a breakage — and teach the eye
            // to skip the colour by the time something really is wrong.
            className={`mt-1 line-clamp-2 text-[11px] ${
              download.status === "Failed" ? "text-destructive" : "text-muted-foreground/70"
            }`}
            title={download.error}
          >
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
        {isPaused && (
          <Button type="button" variant="outline" size="sm" onClick={onResume}>
            <Play className="h-3.5 w-3.5" />
            Resume
          </Button>
        )}
        {(download.status === "Downloading" || isQueued) && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onPause}
            aria-label={`Pause ${download.mod_name}`}
          >
            <Pause className="h-4 w-4" />
          </Button>
        )}
        {canStop && (
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

interface RowDetail {
  download: Download;
  downloaded: number;
  total: number | null;
  isExtracting: boolean;
  speedBytesPerSec: number | null;
}

/** The line under the file name — the one people read to answer "is this actually doing
 * anything". Every state gets its own sentence, so no two of them can be mistaken for each other.
 */
function rowDetail({
  download,
  downloaded,
  total,
  isExtracting,
  speedBytesPerSec,
}: RowDetail): string {
  switch (download.status) {
    case "Queued":
      return "Waiting its turn";
    case "Paused":
      return pausedDetail(downloaded, total);
    case "Downloading":
    case "Extracting":
      return liveDetail(downloaded, total, isExtracting, speedBytesPerSec);
    default:
      return restingDetail(download);
  }
}

function liveDetail(
  downloaded: number,
  total: number | null,
  isExtracting: boolean,
  speedBytesPerSec: number | null,
): string {
  if (isExtracting) return "Unpacking archive…";
  // Running, but nothing has come back yet: looking the file up and opening the connection both
  // happen before the first byte. This used to read "Waiting its turn", which is what a genuinely
  // queued download says — so a slow start was indistinguishable from one that never began, and
  // that is exactly how it was reported.
  if (downloaded === 0 && !total) return "Starting…";
  const size = total
    ? `${formatBytes(downloaded)} / ${formatBytes(total)}`
    : formatBytes(downloaded);
  return speedBytesPerSec ? `${size} · ${formatBytes(speedBytesPerSec)}/s` : size;
}

/** No speed and no time — a paused download is not moving, and how long ago it stopped is not
 * what you want to know about it. How much of it is already done is. */
function pausedDetail(downloaded: number, total: number | null): string {
  if (total && total > 0) {
    return `${formatBytes(downloaded)} / ${formatBytes(total)} · paused`;
  }
  return downloaded > 0 ? `${formatBytes(downloaded)} · paused` : "Not started";
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
