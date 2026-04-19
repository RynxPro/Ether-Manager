import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  TimerReset,
  Info,
} from "lucide-react";
import { cn } from "../../lib/utils";

const POLL_MS = 1000;

function formatMs(ms) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function Section({ title, children, className }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <h3 className="text-[9px] font-bold uppercase tracking-[0.12em] text-amber-400/70">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Row({ label, value, valueClassName, hint }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 text-text-muted">{label}</span>
        <span
          className={cn(
            "shrink-0 text-right tabular-nums text-text-primary",
            valueClassName,
          )}
        >
          {value}
        </span>
      </div>
      {hint ? (
        <p className="text-[9px] leading-snug text-text-muted/85">{hint}</p>
      ) : null}
    </div>
  );
}

export default function DevNetworkMonitor() {
  const [open, setOpen] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [stats, setStats] = useState(null);
  const [lastError, setLastError] = useState(null);
  const [resetting, setResetting] = useState(false);

  const poll = useCallback(async () => {
    if (!window.electronMods?.getGbRequestStats) {
      setLastError("getGbRequestStats not on bridge");
      return;
    }
    try {
      const res = await window.electronMods.getGbRequestStats();
      setLastError(null);
      if (res?.success && res.data) {
        setStats(res.data);
      } else {
        setStats(null);
        setLastError(res?.error || "Unknown error");
      }
    } catch (e) {
      setLastError(e?.message || String(e));
    }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  const handleResetRateLimit = useCallback(async () => {
    if (!window.electronMods?.resetGbState) {
      setLastError("resetGbState not on bridge");
      return;
    }
    setResetting(true);
    try {
      const res = await window.electronMods.resetGbState();
      setLastError(null);
      if (res?.success && res.data) {
        setStats(res.data);
      } else {
        setLastError(res?.error || "Reset failed");
      }
    } catch (e) {
      setLastError(e?.message || String(e));
    } finally {
      setResetting(false);
    }
  }, []);

  const status = useMemo(() => {
    if (!stats) return { label: "…", tone: "muted" };
    const cd = stats.cooldownRemainingMs ?? 0;
    const q =
      (stats.queuedHigh ?? 0) +
      (stats.queuedMedium ?? 0) +
      (stats.queuedLow ?? 0);
    if (cd > 0) {
      return {
        label: `Cooldown ${formatMs(cd)}`,
        tone: "warn",
        sub: "Client is blocking new GB requests until this expires.",
      };
    }
    if ((stats.rateLimitResponses ?? 0) > 0 && q > 0) {
      return {
        label: "Recovering",
        tone: "caution",
        sub: "Had server rate limits; work may be waiting in queue.",
      };
    }
    if (q > 0) {
      return {
        label: `Queued (${q})`,
        tone: "info",
        sub: "Requests waiting for a free network slot.",
      };
    }
    if ((stats.inFlight ?? 0) > 0) {
      return {
        label: `In flight (${stats.inFlight})`,
        tone: "active",
        sub: "HTTP requests currently on the wire.",
      };
    }
    return { label: "Idle", tone: "ok", sub: "No queued GB work." };
  }, [stats]);

  const avoided = stats
    ? (stats.cacheHits ?? 0) + (stats.dedupeHits ?? 0)
    : 0;
  const total = stats?.totalCalls ?? 0;
  const avoidPct =
    total > 0 ? Math.round((avoided / total) * 100) : null;

  const toneStyles = {
    ok: "border-emerald-500/35 bg-emerald-500/10 text-emerald-200/95",
    active: "border-sky-500/35 bg-sky-500/10 text-sky-200/95",
    info: "border-sky-500/35 bg-sky-500/10 text-sky-200/90",
    caution: "border-amber-500/40 bg-amber-500/12 text-amber-200/95",
    warn: "border-orange-500/45 bg-orange-500/15 text-orange-200/95",
    muted: "border-white/10 bg-white/5 text-text-muted",
  };

  return (
    <div
      className={cn(
        "no-drag pointer-events-auto fixed bottom-3 right-3 z-200",
        "max-w-[min(26rem,calc(100vw-1.5rem))]",
      )}
    >
      <div className="overflow-hidden rounded-xl border border-amber-500/30 bg-[#0d0d12]/95 shadow-2xl backdrop-blur-md">
        <div className="flex w-full items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-amber-400/95">
              <Activity className="h-3.5 w-3.5 shrink-0" />
              GameBanana API
            </span>
            <span className="rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-text-muted/90">
              dev
            </span>
            {open ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />
            ) : (
              <ChevronUp className="h-4 w-4 shrink-0 text-text-muted" />
            )}
          </button>
          <button
            type="button"
            onClick={() => void poll()}
            className="rounded p-1 text-text-muted hover:bg-white/10"
            title="Refresh now"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {open && (
          <div className="max-h-[min(72vh,32rem)] overflow-y-auto px-3 py-2.5 text-[10px] leading-relaxed text-text-secondary">
            {lastError && (
              <p className="mb-2 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-red-300/95">
                {lastError}
              </p>
            )}
            {!stats && !lastError && (
              <p className="text-text-muted">Loading…</p>
            )}

            {stats && (
              <>
                <div
                  className={cn(
                    "mb-3 rounded-lg border px-2.5 py-2",
                    toneStyles[status.tone] ?? toneStyles.muted,
                  )}
                >
                  <div className="text-[10px] font-bold uppercase tracking-wide">
                    {status.label}
                  </div>
                  {status.sub && (
                    <p className="mt-1 text-[9px] leading-snug opacity-95">
                      {status.sub}
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  <Section title="Rate limit (this app)">
                    <Row
                      label="Cooldown remaining"
                      value={formatMs(stats.cooldownRemainingMs)}
                      valueClassName="text-orange-200/90"
                      hint="After a 429/1015, the client pauses new requests for this long (capped for UX)."
                    />
                    <Row
                      label="Strike level"
                      value={String(stats.rateLimitStrikeCount ?? 0)}
                      hint="Each server rate limit bumps this; longer cooldowns use exponential backoff (capped)."
                    />
                    <Row
                      label="Server rate-limit responses"
                      value={String(stats.rateLimitResponses ?? 0)}
                      valueClassName="text-red-400/90"
                      hint="Raw HTTP 429 / GameBanana 1015 responses from their servers — not the same as “cooldown blocks” below."
                    />
                    <Row
                      label="Cooldown blocks"
                      value={String(stats.cooldownBlocks ?? 0)}
                      valueClassName="text-orange-400/85"
                      hint="How many times a request hit the client cooldown gate (no extra HTTP call). Often spikes after a single 429 while the UI keeps trying."
                    />
                  </Section>

                  <Section title="Traffic">
                    <Row
                      label="fetchFromGB calls (total)"
                      value={String(stats.totalCalls ?? 0)}
                      hint="Every code path that asked for a URL — before cache, dedupe, or cooldown."
                    />
                    <Row
                      label="Actual HTTP requests"
                      value={String(stats.networkCalls ?? 0)}
                      hint="Requests that reached the network (not served from RAM cache or deduped)."
                    />
                    <Row
                      label="RAM cache hits"
                      value={String(stats.cacheHits ?? 0)}
                      valueClassName="text-emerald-400/90"
                      hint="Same URL returned from in-memory TTL cache (fast, no network)."
                    />
                    <Row
                      label="In-flight dedupe hits"
                      value={String(stats.dedupeHits ?? 0)}
                      valueClassName="text-sky-400/90"
                      hint="Same URL coalesced with another request already in progress — one HTTP call, multiple waiters."
                    />
                    {avoidPct != null && (
                      <Row
                        label="Avoided duplicate network"
                        value={
                          total > 0
                            ? `${avoided} (~${avoidPct}% of calls)`
                            : "—"
                        }
                        hint="Cache hits + dedupe hits — good signs the client is not spamming identical URLs."
                      />
                    )}
                    <Row
                      label="Throttle wait (total)"
                      value={formatMs(stats.throttleWaitMs)}
                      hint="Time spent waiting for per-endpoint spacing (throttle buckets), not connection latency."
                    />
                  </Section>

                  <Section title="Scheduler">
                    <Row
                      label="In flight (unique URLs)"
                      value={String(stats.inFlight ?? 0)}
                      hint="Distinct in-flight fetchFromGB operations right now."
                    />
                    <Row
                      label="Max concurrent slots"
                      value={String(stats.maxConcurrentRequests ?? "—")}
                      hint="Global cap on simultaneous GB HTTP requests across the app."
                    />
                    <Row
                      label="Queue: high / med / low"
                      value={`${stats.queuedHigh ?? 0} / ${stats.queuedMedium ?? 0} / ${stats.queuedLow ?? 0}`}
                      hint="Waiters for a free slot, by priority (browse/search tends to be high)."
                    />
                    <Row
                      label="Cache entries (RAM)"
                      value={String(stats.cacheEntries ?? 0)}
                      hint="Number of cached URL responses in memory (expires by TTL)."
                    />
                  </Section>
                </div>

                <button
                  type="button"
                  onClick={() => setShowHelp((v) => !v)}
                  className="mt-3 flex w-full items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[9px] font-semibold text-text-muted hover:bg-white/10"
                >
                  <Info className="h-3 w-3 shrink-0" />
                  {showHelp ? "Hide" : "Show"} quick glossary
                </button>
                {showHelp && (
                  <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[9px] leading-snug text-text-muted">
                    <li>
                      <span className="text-text-secondary/95">Cooldown blocks</span>{" "}
                      rising without new HTTP 429s usually means many features tried to
                      call the API while the client was already in cooldown — not dozens
                      of separate server punishments.
                    </li>
                    <li>
                      <span className="text-text-secondary/95">Dedupe</span> only helps
                      when two callers request the{" "}
                      <span className="text-text-secondary/95">exact same URL</span> at
                      the same time. Different mod IDs are always separate requests.
                    </li>
                    <li>
                      Presets thumbnails and Library update checks are throttled and
                      gated so they do not stack on Browse at startup.
                    </li>
                  </ul>
                )}

                <div className="mt-3 border-t border-white/10 pt-2">
                  <button
                    type="button"
                    disabled={resetting || !window.electronMods?.resetGbState}
                    onClick={() => void handleResetRateLimit()}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-200/95 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <TimerReset className="h-3.5 w-3.5" />
                    {resetting ? "Resetting…" : "Reset client cooldown"}
                  </button>
                  <p className="mt-1.5 text-[9px] leading-snug text-text-muted">
                    Clears this app&apos;s cooldown timer and strike counter only. Does
                    not clear the RAM cache or cancel in-flight requests. Remote
                    GameBanana limits may still apply.
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
