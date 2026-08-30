import { useQuery } from "@tanstack/react-query";
import { getVersion } from "@tauri-apps/api/app";
import { checkGamebananaApi, isModsFolderLinked, type ApiHealth } from "@/lib/tauri-commands";

/** How often the API is re-probed. Long enough that idling in the app costs one small request
 * a minute, short enough that an outage starting mid-session shows up without a restart. */
const API_POLL_MS = 60_000;

/** Bars lit per reading, and the colour they take. Green is the only place `--success` is used:
 * the accent already means "active" throughout the app, so a healthy connection painted in it
 * would read as something switched on rather than something fine. */
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
 * exception and sits apart from them, at the end of the row. */
export function WindowStatus({ trailing }: WindowStatusProps) {
  const { data: version } = useQuery({
    queryKey: ["appVersion"],
    queryFn: getVersion,
    staleTime: Infinity,
  });

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
          <span className="mb-0.5 block font-heading text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
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
