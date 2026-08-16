import { useQuery } from "@tanstack/react-query";
import { getVersion } from "@tauri-apps/api/app";
import { checkGamebananaApi, isModsFolderLinked, type ApiHealth } from "@/lib/tauri-commands";

/** How often the API is re-probed. Long enough that idling in the app costs one small request
 * a minute, short enough that an outage starting mid-session shows up without a restart. */
const API_POLL_MS = 60_000;

/** Bars lit per reading, and the colour they take. Green is the only place `--success` is used:
 * yellow already means "active" throughout the app, so a healthy connection painted yellow
 * would read as something switched on rather than something fine. */
const SIGNAL: Record<ApiHealth, { bars: number; color: string; word: string }> = {
  Good: { bars: 3, color: "bg-success", word: "Responsive" },
  Fair: { bars: 2, color: "bg-primary", word: "Slow" },
  Poor: { bars: 1, color: "bg-destructive", word: "Barely responding" },
};

const BAR_HEIGHTS = ["h-1", "h-2", "h-3"];

/** The sidebar's resting state: what the app is attached to, what version it is, and whether
 * GameBanana is answering. All three are things you check rather than operate, so none of them
 * is a control — the signal's only interaction is a hover that explains what it measures. */
export function SidebarFooter() {
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
    <div className="mt-auto flex flex-col gap-2.5 border-t border-sidebar-border pt-3">
      <div className="flex items-center gap-2 px-2 text-[11px] text-muted-foreground">
        <span
          aria-hidden
          className={`size-1.5 shrink-0 ${isLinked === false ? "bg-destructive" : "bg-success"}`}
        />
        <span className={isLinked === false ? "text-destructive" : undefined}>
          {isLinked === false ? "Folder missing" : "ZZMI"}
        </span>

        <span className="ml-auto tabular-nums">{version ? `v${version}` : ""}</span>

        {/* The hover lives on a group rather than a `title`, because the native tooltip's delay
            is long enough that a glance at the bars gives up before it appears. */}
        <span className="group relative flex shrink-0 items-end gap-px">
          {/* Anchored right, and narrow enough to stay inside the sidebar's 224px. Overflowing
              it is not a cosmetic problem: `main` follows `aside` in the DOM and scrolls, so
              anything hanging past the edge is painted underneath the page rather than over it. */}
          <span className="pointer-events-none absolute right-0 bottom-5 hidden w-[184px] border border-border bg-popover p-2.5 text-[11px] leading-relaxed text-foreground group-hover:block">
            <span className="mb-0.5 block font-heading text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              GameBanana
            </span>
            {signal ? `${signal.word}${latency == null ? "" : ` — ${latency} ms`}` : "Checking…"}
            {/* Stated because the bars would otherwise be read as a verdict on downloads, and
                they are not: mod files come from separate hosts whose speed varies per node —
                one measured 0.4s while another took 11s with the API answering in 140ms. */}
            <span className="mt-1 block text-muted-foreground">
              Browsing and search only — downloads are separate
            </span>
          </span>

          {BAR_HEIGHTS.map((height, index) => (
            <span
              key={height}
              className={`w-[3px] ${height} ${
                signal && index < signal.bars ? signal.color : "bg-accent"
              }`}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
