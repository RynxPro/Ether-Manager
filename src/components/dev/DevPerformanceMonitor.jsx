import { useCallback, useEffect, useState, useRef } from "react";
import {
  Cpu,
  ChevronDown,
  ChevronUp,
  Activity,
  Layers,
  Monitor,
} from "lucide-react";
import { cn } from "../../lib/utils";

const POLL_MS = 1000;

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function Section({ title, children, className }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <h3 className="text-[9px] font-bold uppercase tracking-[0.12em] text-blue-400/70">
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

export default function DevPerformanceMonitor() {
  const [open, setOpen] = useState(true);
  const [memoryStats, setMemoryStats] = useState(null);
  const [fps, setFps] = useState(0);
  
  const frameCount = useRef(0);
  const lastFpsUpdate = useRef(0);

  const updateStats = useCallback(() => {
    // 1. Memory Stats
    if (performance.memory) {
      setMemoryStats({
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit,
      });
    }

    // 2. FPS Calculation
    const now = performance.now();
    const delta = now - lastFpsUpdate.current;
    if (delta >= 1000) {
      setFps(Math.round((frameCount.current * 1000) / delta));
      frameCount.current = 0;
      lastFpsUpdate.current = now;
    }
  }, []);

  useEffect(() => {
    lastFpsUpdate.current = performance.now();
    let rafId;
    const loop = () => {
      frameCount.current++;
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    const intervalId = setInterval(updateStats, POLL_MS);
    return () => {
      cancelAnimationFrame(rafId);
      clearInterval(intervalId);
    };
  }, [updateStats]);

  return (
    <div
      className={cn(
        "no-drag pointer-events-auto fixed bottom-3 left-3 z-200",
        "max-w-[min(26rem,calc(100vw-1.5rem))]",
      )}
    >
      <div className="overflow-hidden rounded-xl border border-blue-500/30 bg-[#0d0d12]/95 shadow-2xl backdrop-blur-md">
        <div className="flex w-full items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-blue-400/95">
              <Cpu className="h-3.5 w-3.5 shrink-0" />
              Engine Performance
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
        </div>

        {open && (
          <div className="max-h-[min(72vh,32rem)] overflow-y-auto px-3 py-2.5 text-[10px] leading-relaxed text-text-secondary">
            <div className="space-y-4">
              <Section title="Real-time Rendering">
                <Row
                  label="Framerate"
                  value={`${fps} FPS`}
                  valueClassName={cn(
                    fps > 55 ? "text-emerald-400" : fps > 30 ? "text-amber-400" : "text-red-400"
                  )}
                  hint="UI thread refresh rate. Targets 60+ for fluidity."
                />
                <Row
                  label="GPU Acceleration"
                  value="Enabled"
                  valueClassName="text-blue-400"
                  hint="Forced layer promotion (translate3d) is active."
                />
              </Section>

              <Section title="Memory (V8 Heap)">
                {memoryStats ? (
                  <>
                    <Row
                      label="Used Heap"
                      value={formatBytes(memoryStats.used)}
                      valueClassName="text-blue-200"
                      hint="Actual memory currently used by app objects."
                    />
                    <Row
                      label="Allocated"
                      value={formatBytes(memoryStats.total)}
                      hint="Total memory the browser has reserved for the app."
                    />
                    <div className="mt-2 h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                      <div 
                        className="h-full bg-blue-500 transition-all duration-1000"
                        style={{ width: `${(memoryStats.used / memoryStats.limit) * 100}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[8px] text-text-muted text-right">
                      Limit: {formatBytes(memoryStats.limit)}
                    </p>
                  </>
                ) : (
                  <p className="text-text-muted italic">Memory API not available in this environment.</p>
                )}
              </Section>

              <Section title="System Architecture">
                <Row
                  label="Engine"
                  value="Chromium / V8"
                />
                <Row
                  label="Platform"
                  value={window.process?.platform || "web"}
                />
              </Section>
            </div>
            
            <div className="mt-4 pt-3 border-t border-white/5 text-[9px] text-text-muted flex items-center gap-2">
              <Activity size={10} className="text-blue-400" />
              <span>GPU Compositing is active for all view shells.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
