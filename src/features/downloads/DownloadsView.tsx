import { Inbox, X } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
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
import { SignStrip } from "@/components/SignStrip";

/** What each state is called on screen.
 *
 * `Failed` is the only one that takes `--destructive`, which the stamp below decides rather than
 * this table. A cancelled download is not an error — you asked for it — and colouring it red
 * would train the eye to ignore the colour by the time something actually breaks. */
const STATUS_LABELS: Record<DownloadStatus, string> = {
  Queued: "Waiting",
  Downloading: "Downloading",
  Extracting: "Unpacking",
  Paused: "Paused",
  Installed: "Installed",
  Failed: "Failed",
  Cancelled: "Cancelled",
};

/** A control sitting *on* a piece of paper — the hero's Pause and Cancel, and the queue's stop.
 *
 * Drawn in the wall colour rather than the card colour, which is the opposite way round from a
 * control on the wall. The material rule still holds: paper on paper of the same shade has no
 * edge at all, so the thing underneath stays paper and the thing on top reads as a plate stamped
 * out of it. Same object as the install dialog's close button, for the same reason. */
const ON_PAPER =
  "inline-flex shrink-0 items-center justify-center gap-1.5 bg-background font-sign uppercase tracking-[0.1em] text-foreground shadow-slap transition-[translate] duration-200 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:translate-y-0 disabled:opacity-40 disabled:shadow-none";

/** A control on the wall — the page's own action, beside the title. Paper, per the material rule. */
const ON_WALL =
  "inline-flex h-9 shrink-0 items-center gap-1.5 bg-card px-4 font-sign text-[17px] uppercase tracking-[0.1em] text-card-foreground shadow-slap transition-[translate] duration-200 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none";

/** The name of what a finished card does, printed on the paper rather than boxed.
 *
 * Not a control of its own: the card *is* the control, so this is its label. A plate stamped out
 * of every entry would put a second object in each one competing with the art, and it would mean
 * the card lifted under the cursor while only a 60px word answered the click. It inks in with the
 * card, so the thing you are about to do is lit at the same moment the card says it is live. */
const PRINTED_ACTION =
  "shrink-0 px-1.5 py-0.5 font-sign text-[17px] uppercase tracking-[0.1em] text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground";

/** The machine's own voice: sizes, speeds, file names, timestamps. Courier everywhere it appears
 * on this page, because every one of these is a figure the app measured rather than a word it
 * chose. */
const FACTS = "font-mono text-[11px] font-bold uppercase tracking-[0.12em] tabular-nums";

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
 * and retry.
 *
 * Three densities for three genuinely different things: the one job in flight gets the page, the
 * queue behind it is a short stack of thin stubs, and each finished install is a card with its
 * art large enough to recognise. What this page is not any more is one row shape repeated — that
 * made a job in flight look exactly like one that finished a fortnight ago, and it put every
 * "Open" some 1500px from the name it belonged to. */
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
  const installed = finished.filter((download) => download.status === "Installed");
  const failedCount = finished.filter((download) => download.status === "Failed").length;
  /** Everything this app has ever pulled down, added up. The one reading here that is about the
   * page as a whole rather than about a row, and the only figure the log cannot be read off at a
   * glance — which is what earns it a place on the sign. */
  const bytesPulled = installed.reduce(
    (sum, download) => sum + (download.total_bytes ?? download.downloaded_bytes),
    0,
  );
  const total = (downloads ?? []).length;

  /** What the page can say about itself, in words. Written once because it is said twice: here,
   * where it can be read, and again on the sign, which is `aria-hidden` and moving. */
  const summary = [
    leading ? "1 running" : null,
    waiting.length > 0 ? `${waiting.length} waiting` : null,
    finished.length > 0 ? `${finished.length} done` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Downloads"
        // The app's own word for what kind of page this is, sprayed on the wall behind the title.
        // "Queue" rather than "Downloads": the tag is a second word, not an echo of the one
        // already set in 48px directly on top of it.
        tag="Queue"
        subtitle="One at a time"
        // Unpinned, like every other page that has had the street pass — the tag is deliberately
        // taller than the band, so a pinned header clips the sprayed word against a rule.
        pinned={false}
      >
        {!isLoading && total > 0 && (
          <>
            <span className={`${FACTS} text-muted-foreground`}>{summary}</span>
            {finished.length > 0 && (
              <button
                type="button"
                className={ON_WALL}
                onClick={() => clearFinished.mutate()}
                disabled={clearFinished.isPending}
              >
                Clear finished
              </button>
            )}
          </>
        )}
      </PageHeader>

      {/* The live readings, on the same lit sign the other pages carry. Ordered most- to
          least-changeable: the strip only ever shows part of itself at once, and the first item is
          what is on screen when the page opens. */}
      {!isLoading && total > 0 && (
        <SignStrip
          items={[
            // Nothing at all when nothing is running, rather than "queue empty". An idle queue is
            // this page's resting state, and a sign that announces it makes the normal condition
            // sound like a shortfall.
            leading ? liveSignReading(leading, progress[leading.id]) : null,
            waiting.length > 0 ? `${waiting.length} waiting` : null,
            installed.length > 0 ? `${installed.length} installed` : null,
            failedCount > 0 ? `${failedCount} failed` : null,
            bytesPulled > 0 ? `${formatBytes(bytesPulled)} pulled` : null,
          ].filter((item): item is string => item !== null)}
        />
      )}

      {isLoading ? (
        <div className="space-y-5">
          <div className="h-[158px] animate-pulse bg-card shadow-slap" />
          <div className="h-[212px] animate-pulse bg-card shadow-slap" />
        </div>
      ) : total === 0 ? (
        // No verb: an idle queue is the normal condition of this page, not a problem to solve,
        // and a button here would be inventing work. The note keeps the one thing worth saying.
        <EmptyState
          icon={Inbox}
          title="Nothing downloaded yet"
          say="Installing a mod from Browse queues it here."
          note="it keeps going if you leave"
        />
      ) : (
        <div className="space-y-5">
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
              <h3 className="font-sign text-[15px] uppercase tracking-[0.16em] text-muted-foreground/75">
                Up next · {waiting.length}
              </h3>
              {waiting.map((download, index) => (
                <QueueRow
                  key={download.id}
                  download={download}
                  // The queue runs in order and the head of it is the hero above, so the first
                  // stub here is the second job. Counting from 2 is what makes the number mean
                  // "your place in the line" rather than "row index".
                  position={index + 2}
                  onCancel={() => cancel.mutate(download.id)}
                  onResume={() => resume.mutate(download.id)}
                />
              ))}
            </section>
          )}

          {finished.length > 0 && (
            <section className="space-y-2">
              {/* Only worth saying when there is something above it to tell it apart from. With
                  nothing downloading, the log is the whole page and a heading over it names
                  nothing — the same reason the character page dropped its slot heading. */}
              {active.length > 0 && (
                <h3 className="font-sign text-[15px] uppercase tracking-[0.16em] text-muted-foreground/75">
                  History · {finished.length}
                </h3>
              )}
              {/* Wall between them, not a rule. These were rows on one ruled sheet, which packed
                  seven entries into 480px and read as a table printed in the dark — the art was
                  letterboxed down to 84px and nothing had room to be looked at. Each one is its
                  own piece of paper again, with its own shadow and a gap of wall showing through.
                  What was worth avoiding was seven *identical* panels; at this size the art is
                  what tells them apart, so they no longer read that way. */}
              <div className="space-y-3">
                {finished.map((download) => (
                  <LogRow
                    key={download.id}
                    download={download}
                    onRetry={() => retry.mutate(download.id)}
                    onOpenCharacter={onOpenCharacter}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

/** The single reading the sign leads with while something is running. Short enough to be read as
 * it goes past, which is the only thing on the strip that has to be. */
function liveSignReading(download: Download, live: LiveProgress | undefined): string {
  if (download.status === "Paused") return "Paused";
  if (download.status === "Extracting" || live?.isExtracting) return "Unpacking";
  const downloaded = live?.downloaded ?? download.downloaded_bytes;
  const total = live?.total ?? download.total_bytes;
  const percent = total && total > 0 ? Math.round((downloaded / total) * 100) : null;
  if (percent === null) return "Downloading";
  const speed = live?.speedBytesPerSec;
  return speed ? `${percent}% · ${formatBytes(speed)}/s` : `${percent}%`;
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

interface ThumbProps {
  url: string | null;
  name: string;
  /** Tailwind sizing for the well, since this appears at three sizes on one page. */
  className: string;
  /** The initial's size at that scale — a letter set for an 84px stub is illegible at 58. */
  fallbackClassName: string;
}

/** The art, at whatever size the row it sits in can afford.
 *
 * Every row has one, the finished ones included. A log you read by file name is a log you cannot
 * scan: `belle_summer_skin_-_hazeker_redux_4eff7.zip` and `luciamod_99e81.zip` are the same shape
 * of thing to the eye, and the picture is the part of a mod anyone actually remembers. */
function Thumb({ url, name, className, fallbackClassName }: ThumbProps) {
  if (url) {
    return <img src={url} alt="" className={`${className} shrink-0 bg-art object-cover`} />;
  }
  return (
    <span
      className={`${className} ${fallbackClassName} flex shrink-0 items-center justify-center bg-art font-heading uppercase leading-none text-muted-foreground/40`}
    >
      {name.charAt(0)}
    </span>
  );
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
 * the controls beside the name they act on, and the percentage set large enough to read from
 * across the room, which is where you are while it downloads.
 *
 * The accent border is not decoration: red means "live" everywhere else in this app, and this is
 * the only element on the page that is. */
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
    <div className="flex gap-4 border-2 border-primary bg-card p-3.5 shadow-slap-lift">
      {/* Tilted, and only this one. The hero is a single object on the page rather than one of a
          set, so a hair off square reads as hand-placed instead of as a grid that failed. */}
      <div className="h-[130px] w-[208px] shrink-0 -rotate-[0.8deg] bg-art p-1 shadow-slap">
        <Thumb
          url={download.thumbnail_url}
          name={download.mod_name}
          className="h-full w-full"
          fallbackClassName="text-[34px]"
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3
              className="truncate font-heading text-[30px] uppercase leading-none text-card-foreground"
              title={download.mod_name}
            >
              {download.mod_name}
            </h3>
            <p
              className={`mt-1.5 truncate ${FACTS} text-muted-foreground`}
              title={download.file_name}
            >
              {download.file_name}
            </p>
          </div>
          {/* Beside the name, not at the far edge — the whole reason this shape exists. */}
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              className={`${ON_PAPER} h-8 px-3.5 text-[16px]`}
              onClick={isPaused ? onResume : onPause}
              // Extraction runs straight through once it starts, so neither stopping control can
              // reach it — a button that quietly does nothing is worse than no button.
              disabled={isExtracting}
            >
              {isPaused ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              className={`${ON_PAPER} h-8 px-3.5 text-[16px]`}
              onClick={onCancel}
              disabled={isExtracting}
            >
              Cancel
            </button>
          </div>
        </div>

        <div className="mt-auto flex items-end gap-4 pt-3">
          <div className="min-w-0 flex-1">
            <div
              className={`mb-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 ${FACTS} text-card-foreground`}
            >
              {isExtracting ? (
                <span>Unpacking…</span>
              ) : (
                <>
                  <span>
                    {formatBytes(downloaded)}
                    {total ? ` of ${formatBytes(total)}` : ""}
                  </span>
                  {speed && <span className="text-muted-foreground">{formatBytes(speed)}/s</span>}
                  {eta && <span className="text-muted-foreground">{eta}</span>}
                  {isPaused && <span className="text-muted-foreground">Paused</span>}
                </>
              )}
            </div>
            <div className="h-3.5 w-full bg-secondary ring-1 ring-inset ring-border">
              <div
                className={
                  // Nothing measurable in either case: a queue head that has not been told its
                  // size, and extraction, which reports no progress at all. A pulsing sliver says
                  // "working" without claiming a position.
                  percent === null
                    ? "h-full w-1/3 animate-pulse bg-primary"
                    : // A paused bar goes grey and stops moving. Leaving it accent-coloured would
                      // say the one thing that is not true of it, which is that something is
                      // happening.
                      `h-full transition-[width] ${isPaused ? "bg-muted-foreground/50" : "bg-primary"}`
                }
                style={percent === null ? undefined : { width: `${percent}%` }}
              />
            </div>
          </div>
          {/* Absent rather than zeroed while the size is unknown: a large "0%" on a download that
              has simply not been told how big it is reads as a stall. */}
          {percent !== null && (
            <span className="shrink-0 font-heading text-[46px] leading-[0.8] tabular-nums text-primary">
              {percent}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

interface QueueRowProps {
  download: Download;
  position: number;
  onCancel: () => void;
  onResume: () => void;
}

/** A job waiting its turn: a stub, not a card.
 *
 * It carries the least of the three densities on purpose. Nothing about a queued download is
 * moving, so there is no bar and no byte count to keep watching — only which one it is, where it
 * is in the line, and the way out of it. */
function QueueRow({ download, position, onCancel, onResume }: QueueRowProps) {
  const isPaused = download.status === "Paused";

  return (
    <div className="flex h-11 items-center gap-3 bg-card px-3 shadow-slap">
      <span className="w-7 shrink-0 font-heading text-[19px] leading-none tabular-nums text-primary">
        {String(position).padStart(2, "0")}
      </span>
      <Thumb
        url={download.thumbnail_url}
        name={download.mod_name}
        className="h-[33px] w-[58px]"
        fallbackClassName="text-[15px]"
      />
      <p
        className="min-w-0 flex-1 truncate font-heading text-[16px] uppercase tracking-[0.03em] text-card-foreground"
        title={download.mod_name}
      >
        {download.mod_name}
      </p>
      {/* The file name is the first thing to go when the window narrows: on a job that has not
          started, which mod it is matters and which archive it came in does not. */}
      <span className={`hidden min-w-0 truncate ${FACTS} text-muted-foreground lg:block`}>
        {download.file_name}
      </span>
      <span className={`w-[86px] shrink-0 text-right ${FACTS} text-muted-foreground`}>
        {STATUS_LABELS[download.status]}
      </span>
      {isPaused && (
        <button type="button" className={`${ON_PAPER} h-7 px-3 text-[15px]`} onClick={onResume}>
          Resume
        </button>
      )}
      <button
        type="button"
        className={`${ON_PAPER} h-7 w-7`}
        onClick={onCancel}
        aria-label={`Cancel ${download.mod_name}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

interface LogRowProps {
  download: Download;
  onRetry: () => void;
  onOpenCharacter: (characterId: string) => void;
}

/** One entry in the log — a thing that already happened, and what became of it.
 *
 * Its own piece of paper, with wall showing between it and the next. It spent a version as a row
 * on one shared sheet, which was tighter but wrong: at 69px with the art squeezed to 84px wide,
 * seven installs read as a table rather than as seven things you did. The art is what makes an
 * entry recognisable, so the entry is sized around the art. */
function LogRow({ download, onRetry, onOpenCharacter }: LogRowProps) {
  const isFailed = download.status === "Failed";
  const canRetry = isFailed || download.status === "Cancelled";

  /** Every finished entry has exactly one thing to offer, so the card carries it rather than a
   * word in the corner. Retry is the one worth a second thought about mis-clicks, and it stays —
   * it only queues the download again, which the hero above can then cancel. */
  const action = download.status === "Installed" ? "Open" : canRetry ? "Retry" : null;
  const activate =
    download.status === "Installed"
      ? () => onOpenCharacter(download.character_id)
      : canRetry
        ? onRetry
        : null;

  // Transparent at rest rather than `--border`, unlike the roster cards: these sit in a stack of
  // their own with wall between them, so an edge is not what separates them, and the accent one
  // on hover then arrives without the card changing size.
  const shell =
    "group flex w-full items-center gap-4 border-2 border-transparent bg-card p-2.5 text-left shadow-slap";
  const live =
    "transition-[translate,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-primary hover:ring-2 hover:ring-primary focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary";

  const body = (
    <>
      <Thumb
        url={download.thumbnail_url}
        name={download.mod_name}
        className="h-[90px] w-40"
        fallbackClassName="text-[30px]"
      />

      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-2">
          <span
            className="truncate font-heading text-[20px] uppercase tracking-[0.03em] text-card-foreground"
            title={download.mod_name}
          >
            {download.mod_name}
          </span>
          {/* Otherwise a reinstall is indistinguishable from a first install, and the two end very
              differently: one replaces a mod you already have, the other adds a copy. */}
          {download.target_mod_id !== null && (
            <span className={`shrink-0 border border-border px-1.5 ${FACTS} text-muted-foreground`}>
              Reinstall
            </span>
          )}
        </span>
        {/* The error takes this line when there is one, because on a card that failed the file
            name is the least useful thing the app knows. Red only when it actually failed: a row
            parked by the startup sweep carries an explanation too ("interrupted when the app
            closed"), and painting that in the failure colour would report a recoverable pause as a
            breakage — and teach the eye to skip the colour by the time something really is
            wrong. */}
        <span
          className={`mt-2 block truncate ${FACTS} ${isFailed ? "text-destructive" : "text-muted-foreground/70"}`}
          title={download.error ?? download.file_name}
        >
          {download.error ?? download.file_name}
        </span>
      </span>

      <span className={`shrink-0 text-right ${FACTS} text-muted-foreground`}>
        {restingDetail(download)}
      </span>
      <StatusStamp status={download.status} />
      {/* Fixed width whether or not the card has an action, so the stamps above and below stay in
          one column instead of stepping in and out. */}
      <span className="w-[62px] shrink-0 text-right">
        {action && <span className={PRINTED_ACTION}>{action}</span>}
      </span>
    </>
  );

  // No action, no lift. A card that rises under the cursor and then does nothing is worse than a
  // card that sits still — it is the hover itself that makes the promise.
  if (!activate) return <div className={shell}>{body}</div>;

  return (
    <button type="button" className={`${shell} ${live}`} onClick={activate}>
      {body}
    </button>
  );
}

/** How a finished row ended, stamped rather than written.
 *
 * `Failed` is filled and the rest are outlines, which is the reading you want from across the
 * room: one thing on this sheet went wrong and it is the one with ink on it. `text-white` and not
 * a token, deliberately — `--destructive` is a dark red in *both* themes, so neither `text-card`
 * nor `text-foreground` is legible on it in both. A light foreground is a constant here. */
function StatusStamp({ status }: { status: DownloadStatus }) {
  const base =
    "w-[88px] shrink-0 text-center font-sign text-[15px] uppercase leading-[1.6] tracking-[0.12em]";
  if (status === "Failed") {
    return <span className={`${base} bg-destructive text-white`}>Failed</span>;
  }
  return (
    <span
      className={`${base} border border-border ${
        status === "Installed" ? "text-card-foreground" : "text-muted-foreground"
      }`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

/** The right-hand figures on a finished row: how big it was, and when it was. */
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
