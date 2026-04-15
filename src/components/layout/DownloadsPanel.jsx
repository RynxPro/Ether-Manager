import { Download, CheckCircle, XCircle, X, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "../../store/useAppStore";
import { cn } from "../../lib/utils";

const STATUS_ICONS = {
  downloading: null,
  extracting: null,
  done: CheckCircle,
  error: XCircle,
};

function formatSpeed(bps) {
  if (!bps) return "";
  if (bps >= 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
  if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${bps.toFixed(0)} B/s`;
}

function DownloadRow({ job, onClear, onCancel }) {
  const Icon = STATUS_ICONS[job.status];
  const isActive = job.status === "downloading" || job.status === "extracting";
  const isError = job.status === "error";
  const isDone = job.status === "done";

  return (
    <div className="group relative flex items-center gap-3 overflow-hidden rounded-[var(--radius-md)] border border-white/6 bg-background/65 px-3 py-2.5">
      {/* Progress bar fill */}
      {isActive && (
        <motion.div
          className="absolute left-0 top-0 bottom-0 bg-primary/10"
          initial={{ width: 0 }}
          animate={{ width: `${job.percent}%` }}
          transition={{ ease: "linear", duration: 0.3 }}
        />
      )}

      {/* Icon */}
      <div className="relative z-10 shrink-0">
        {isActive ? (
          <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Download size={13} className="text-primary animate-bounce" />
          </div>
        ) : isDone ? (
          <div className="w-7 h-7 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
            <CheckCircle size={13} className="text-green-400" />
          </div>
        ) : (
          <div className="w-7 h-7 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <XCircle size={13} className="text-red-400" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="relative z-10 flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-text-primary truncate">
          {job.title}
        </p>
        <div className={cn(
          "flex justify-between items-center text-[10px] font-medium mt-0.5",
          isActive && "text-primary",
          isDone && "text-green-400",
          isError && "text-red-400",
        )}>
          <span>
            {job.status === "downloading" && `${job.percent}%`}
            {job.status === "extracting" && "Extracting..."}
            {job.status === "done" && "Installed"}
            {job.status === "error" && (job.error || "Failed")}
          </span>
          {job.status === "downloading" && job.bytesPerSecond > 0 && (
            <span className="opacity-80 font-mono text-[9px]">{formatSpeed(job.bytesPerSecond)}</span>
          )}
        </div>
      </div>

      {/* Dismiss / Cancel */}
      <button
        onClick={() => isActive ? onCancel(job.id) : onClear(job.id)}
        className="relative z-10 p-1 rounded-md text-text-muted hover:text-white hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
        title={isActive ? "Cancel Download" : "Clear"}
      >
        <X size={12} />
      </button>
    </div>
  );
}

export default function DownloadsPanel() {
  const downloads = useAppStore((state) => state.downloads);
  const clearDownload = useAppStore((state) => state.clearDownload);
  const cancelDownload = useAppStore((state) => state.cancelDownload);
  const [collapsed, setCollapsed] = useState(false);

  if (downloads.length === 0) return null;

  const activeCount = downloads.filter(
    (d) => d.status === "downloading" || d.status === "extracting"
  ).length;

  return (
    <section className="flex flex-col gap-2">
      <p className="ui-eyebrow px-3">Queue</p>
      <div className="ui-panel overflow-hidden rounded-[var(--radius-md)] border-white/8 bg-background/55 shadow-interactive">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/4"
        >
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-surface/80">
            <Download size={15} className="text-text-secondary" />
            {activeCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[8px] font-black text-black">
                {activeCount}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-text-primary">
              Downloads
            </div>
            <div className="mt-1 text-[11px] text-text-muted">
              {activeCount > 0
                ? `${activeCount} active task${activeCount === 1 ? "" : "s"} in progress`
                : `${downloads.length} recent download${downloads.length === 1 ? "" : "s"}`}
            </div>
          </div>
          <span className="text-text-muted">
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </span>
        </button>

        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="custom-scrollbar max-h-64 space-y-2 border-t border-white/6 px-3 pb-3 pt-3">
                <AnimatePresence initial={false}>
                  {downloads.map((job) => (
                    <motion.div
                      key={job.id}
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <DownloadRow job={job} onClear={clearDownload} onCancel={cancelDownload} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
