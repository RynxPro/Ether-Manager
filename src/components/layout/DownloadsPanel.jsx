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

function DownloadRow({ job, onClear }) {
  const Icon = STATUS_ICONS[job.status];
  const isActive = job.status === "downloading" || job.status === "extracting";
  const isError = job.status === "error";
  const isDone = job.status === "done";

  return (
    <div className="relative flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/5 border border-white/5 overflow-hidden group">
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
        <p className={cn(
          "text-[10px] font-medium mt-0.5",
          isActive && "text-primary",
          isDone && "text-green-400",
          isError && "text-red-400",
        )}>
          {job.status === "downloading" && `${job.percent}%`}
          {job.status === "extracting" && "Extracting..."}
          {job.status === "done" && "Installed"}
          {job.status === "error" && (job.error || "Failed")}
        </p>
      </div>

      {/* Dismiss (on non-active) */}
      {!isActive && (
        <button
          onClick={() => onClear(job.id)}
          className="relative z-10 p-1 rounded-md text-text-muted hover:text-white hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

export default function DownloadsPanel() {
  const downloads = useAppStore((state) => state.downloads);
  const clearDownload = useAppStore((state) => state.clearDownload);
  const [collapsed, setCollapsed] = useState(false);

  if (downloads.length === 0) return null;

  const activeCount = downloads.filter(
    (d) => d.status === "downloading" || d.status === "extracting"
  ).length;

  return (
    <div className="mt-auto border-t border-border">
      {/* Header */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center gap-2 px-3 py-3 hover:bg-white/5 transition-colors"
      >
        <div className="relative shrink-0">
          <Download size={14} className="text-text-muted" />
          {activeCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-primary text-black text-[8px] font-black flex items-center justify-center">
              {activeCount}
            </span>
          )}
        </div>
        <span className="text-xs font-bold text-text-secondary flex-1 text-left tracking-wide">
          Downloads
        </span>
        <span className="text-text-muted">
          {collapsed ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </span>
      </button>

      {/* Queue list */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-2 pb-3 space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar">
              <AnimatePresence initial={false}>
                {downloads.map((job) => (
                  <motion.div
                    key={job.id}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <DownloadRow job={job} onClear={clearDownload} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
