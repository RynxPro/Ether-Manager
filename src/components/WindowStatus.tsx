import { useQuery } from "@tanstack/react-query";
import { checkGamebananaApi, isModsFolderLinked, type ApiHealth } from "@/lib/tauri-commands";
import { useAppUpdate, useAppVersion } from "@/lib/useAppUpdate";

/** How often the API is re-probed. Long enough that idling in the app costs one small request
 * a minute, short enough that an outage starting mid-session shows up without a restart. */
const API_POLL_MS = 60_000;

/** Bars lit per reading, and the colour they take.
 *
 * Green rather than the accent, which already means "active" throughout the app — a healthy
 * connection painted in it would read as something switched on rather than something fine. The
 * reading is positional too (one, two or three bars), so it never depends on colour alone.
 *
 * This is no longer the only `--success` in the app; the other is the "you already have this"
 * tag on a Browse or Bookmarks card. The token's own note in `global.css` carries the rule that
 * covers both. */
const SIGNAL: Record<ApiHealth, { bars: number; color: string; word: string }> = {
  Good: { bars: 3, color: "bg-success", word: "Responsive" },
  Fair: { bars: 2, color: "bg-primary", word: "Slow" },
  Poor: { bars: 1, color: "bg-destructive", word: "Barely responding" },
};

const BAR_HEIGHTS = ["h-1.5", "h-2.5", "h-3.5"];

interface WindowStatusProps {
  /** Pinned to the right-hand end of the row. The notification bell, in practice: it belongs with
   * the ambient readouts rather than with navigation, and it is the only one of them you press.
   *
   * A slot rather than the bell itself, so this component keeps knowing only about the three
   * things it reports on. */
  trailing?: React.ReactNode;
  /** Where to send someone who has just been told an update is waiting.
   *
   * The one control among the readouts, and it earns the exception: this is the only thing the
   * bar reports that asks for an answer, and a badge announcing a new version with no way to
   * reach it would be worse than not mentioning it. It does not install anything — pressing it
   * opens Settings, where the version, the notes and the Install button are. */
  onOpenSettings?: () => void;
}

/** What the app is attached to, what version it is, and whether GameBanana is answering.
 *
 * Lived at the foot of the sidebar until now, which was the wrong place for two reasons. These
 * are facts about the *window*, not about wherever you happen to have navigated — and the sidebar
 * is a column of destinations, so a block of readouts pinned beneath it was the one thing in there
 * you could not go to. The title bar already spans the app, never scrolls, and had an empty middle.
 *
 * None of the three is a control; they are things you check rather than operate, so the only
 * interaction is a hover explaining what the signal measures. Anything in `trailing` is the
 * exception and sits apart from them, at the end of the row.
 *
 * The update badge is the other exception, and the only one that appears and disappears: a new
 * release is a fact about this window in the same way its version is, and it is the one reading
 * here that is worth acting on the moment it is read. */
export function WindowStatus({ trailing, onOpenSettings }: WindowStatusProps) {
  const { data: version } = useAppVersion();

  // Mounted for the life of the window, which is what makes this the app's launch check: asking
  // here costs one request a run and puts the answer in the cache that Settings reads. An error
  // is deliberately silent in this row — a release server that did not answer is not a fact
  // about the window, and the Settings sheet is where it is reported.
  const { data: update } = useAppUpdate();

  // Polled rather than read once: the folder can stop existing while the app is open — an
  // external drive unplugged, ZZMI reinstalled elsewhere — and a stale "linked" is the one
  // answer worse than none.
  const { data: isLinked } = useQuery({
    queryKey: ["modsFolderLinked"],
    queryFn: isModsFolderLinked,
    refetchInterval: API_POLL_MS,
  });

  const { data: api } = useQuery({
    queryKey: ["gamebananaApi"],
    queryFn: checkGamebananaApi,
    refetchInterval: API_POLL_MS,
  });

  // Before the first probe lands there is nothing to report, so the bars sit unlit rather than
  // guessing at a reading the app does not have yet.
  const signal = api ? SIGNAL[api.health] : null;
  const latency = api?.latency_ms;

  return (
    // Uppercase Courier with slash separators, which is deliberately the LED sign's own grammar:
    // both are strips of machine-known readings, so they punctuate the same way. That is what
    // makes this read as part of the app rather than as leftover status text — hairline dividers
    // said "toolbar", and a toolbar is the one thing this design does not have.
    <div className="flex items-center gap-2 font-mono text-[13px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className={`size-2 shrink-0 ${isLinked === false ? "bg-destructive" : "bg-success"}`}
        />
        <span className={isLinked === false ? "text-destructive" : undefined}>
          {isLinked === false ? "Folder missing" : "ZZMI"}
        </span>
      </span>

      <Divider />

      {/* The hover lives on a group rather than a `title`, because the native tooltip's delay is
          long enough that a glance at the bars gives up before it appears. */}
      <span className="group relative flex shrink-0 items-end gap-px">
        {/* Drops downward, unlike the sidebar version which opened upward — there is nothing above
            a title bar to open into. Right-anchored so it cannot run off the window edge. */}
        <span className="pointer-events-none absolute right-0 top-5 z-50 hidden w-[184px] border border-border bg-popover p-2.5 font-sans text-[11px] leading-relaxed text-foreground group-hover:block">
          <span className="mb-0.5 block font-sign text-[14px] uppercase tracking-[0.14em] text-muted-foreground">
            GameBanana
          </span>
          {signal ? `${signal.word}${latency == null ? "" : ` — ${latency} ms`}` : "Checking…"}
          {/* Stated because the bars would otherwise be read as a verdict on downloads, and they
              are not: mod files come from separate hosts whose speed varies per node — one
              measured 0.4s while another took 11s with the API answering in 140ms. */}
          <span className="mt-1 block text-muted-foreground">
            Browsing and search only — downloads are separate
          </span>
        </span>

        {BAR_HEIGHTS.map((height, index) => (
          <span
            key={height}
            className={`w-[3.5px] ${height} ${
              signal && index < signal.bars ? signal.color : "bg-accent"
            }`}
          />
        ))}
      </span>

      <Divider />

      <span className="tabular-nums">{version ? `v${version}` : ""}</span>

      {/* Only ever rendered when there is genuinely something newer, so its presence is the
          whole message — there is no "up to date" state of this badge to read past. A channel
          offering something *older* is deliberately not badged: that is the way back from
          Nightly, it is not news, and announcing it up here told someone who had just installed
          0.2.0 that 0.1.1 was waiting for them. Filled with
          the accent because that is what the app uses for the live thing on screen, and this is
          the one reading in the row that is asking rather than telling. */}
      {update && !update.is_downgrade && onOpenSettings && (
        <button
          type="button"
          onClick={onOpenSettings}
          title={`Version ${update.version} is available — open Settings to install it`}
          className="-my-0.5 shrink-0 bg-primary px-1.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-primary-foreground transition-[translate] duration-200 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Update {update.version}
        </button>
      )}

      {/* `-my-1` so a control taller than a 13px line of text does not stretch the row and push
          the readouts off the baseline they share. */}
      {trailing && <span className="-my-1 shrink-0">{trailing}</span>}
    </div>
  );
}

/** The separator, and it is a slash rather than a rule on purpose.
 *
 * A hairline is a toolbar's punctuation — it divides controls. These are not controls, they are a
 * printed line of readings, and the LED sign a few pixels below already joins its readings with
 * exactly this character. Using the same one makes the two obviously the same kind of thing. */
function Divider() {
  return (
    <span aria-hidden className="shrink-0 text-muted-foreground/40">
      /
    </span>
  );
}
