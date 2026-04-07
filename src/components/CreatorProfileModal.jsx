import { useState, useEffect, useCallback, useId } from "react";
import {
  X,
  User,
  ChevronLeft,
  ChevronRight,
  Bookmark,
  Check,
  ExternalLink,
  Globe,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import GbModCard from "./GbModCard";
import { cn } from "../lib/utils";
import { StateGridSkeleton, StatePanel } from "./ui/StatePanel";

const PER_PAGE = 20;

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

export default function CreatorProfileModal({
  creator,
  game,
  onClose,
  installedModsInfo,
  bookmarkIds,
  onToggleBookmark,
  isCreatorBookmarked,
  onToggleCreatorBookmark,
  onModClick,
}) {
  const titleId = useId();
  const [mods, setMods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const fetchMods = useCallback(async () => {
    if (!game.gbGameId || !creator._idRow) return;
    if (!window.electronMods?.browseGbMods) {
      setLoading(false);
      setError(
        "GameBanana browser is unavailable because the Electron bridge failed to load.",
      );
      return;
    }
    
    setLoading(true);
    setError(null);

    try {
      const result = await window.electronMods.browseGbMods({
        gbGameId: game.gbGameId,
        submitterId: creator._idRow,
        page,
        perPage: PER_PAGE,
      });

      if (result.success) {
        setMods(result.records);
        setTotal(result.total);
      } else {
        setError(result.error || "Failed to load mods from GameBanana.");
      }
    } catch (err) {
      setError(err.message || "Network error.");
    } finally {
      setLoading(false);
    }
  }, [game.gbGameId, creator._idRow, page]);

  useEffect(() => {
    fetchMods();
  }, [fetchMods]);

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed right-0 top-0 bottom-0 left-0 md:left-64 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-6 sm:p-12 overflow-hidden"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-full max-h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a0a] shadow-[0_30px_100px_rgba(0,0,0,0.8)]"
      >
        <div className="shrink-0 border-b border-white/10 bg-background/70 px-6 py-5 backdrop-blur-md sm:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                {creator._sAvatarUrl ? (
                  <img
                    src={creator._sAvatarUrl}
                    alt={creator._sName}
                    className="h-full w-full object-cover"
                    style={{ imageRendering: "pixelated" }}
                  />
                ) : (
                  <User size={24} className="text-white/25" />
                )}
              </div>

              <div className="min-w-0">
                <h2
                  id={titleId}
                  className="truncate text-2xl font-black tracking-tight text-white sm:text-3xl"
                >
                  {creator._sName}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <div className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white/65">
                    {total.toLocaleString()} Mods
                  </div>
                  <div className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-primary">
                    {game.name}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCreatorBookmark?.(creator);
                }}
                className={cn(
                  "ui-focus-ring inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-[10px] font-black uppercase tracking-[0.18em] transition-all",
                  isCreatorBookmarked
                    ? "border-primary bg-primary text-black hover:brightness-110"
                    : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white",
                )}
              >
                {isCreatorBookmarked ? (
                  <>
                    <Check size={14} strokeWidth={3.5} />
                    Saved
                  </>
                ) : (
                  <>
                    <Bookmark size={14} strokeWidth={2.4} />
                    Follow
                  </>
                )}
              </button>

              {creator._sProfileUrl ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.electronConfig?.openExternal?.(creator._sProfileUrl);
                  }}
                  className="ui-focus-ring flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                  title="Open GameBanana profile"
                >
                  <ExternalLink size={16} />
                </button>
              ) : null}

              <button
                onClick={onClose}
                className="ui-focus-ring flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Close creator panel"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col bg-[#0a0a0a]">
          <div className="shrink-0 border-b border-white/10 bg-background/55 px-6 py-4 sm:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm font-semibold text-text-secondary">
                {total.toLocaleString()} mod{total !== 1 ? "s" : ""}
              </div>

              {totalPages > 1 ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="ui-focus-ring flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-white/60">
                    {page} / {totalPages}
                  </div>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="ui-focus-ring flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
                    aria-label="Next page"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="custom-scrollbar flex-1 overflow-y-auto p-6 sm:p-8">
            {loading ? (
              <StateGridSkeleton count={10} />
            ) : error ? (
              <StatePanel
                icon={Globe}
                title="Could not load creator mods"
                message={error}
                tone="danger"
                actionLabel="Retry"
                onAction={fetchMods}
                className="min-h-[20rem]"
              />
            ) : (
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-2 gap-4 pb-8 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
              >
                {mods.map((mod) => {
                  const installedInfo = installedModsInfo[mod._idRow];
                  const isInstalled = !!installedInfo;
                  let hasUpdate = false;

                  if (isInstalled && installedInfo.installedFiles.length > 0) {
                    hasUpdate = installedInfo.installedFiles.some((file) => {
                      if (!file.installedAt) return false;
                      const installedDate =
                        new Date(file.installedAt).getTime() / 1000;
                      return mod._tsDateUpdated > installedDate + 300;
                    });
                  }

                  const isBookmarked = (bookmarkIds || []).includes(mod._idRow);

                  return (
                    <GbModCard
                      key={mod._idRow}
                      mod={mod}
                      isInstalled={isInstalled}
                      hasUpdate={hasUpdate}
                      onClick={onModClick}
                      onInstall={onModClick}
                      isBookmarked={isBookmarked}
                      onToggleBookmark={() => onToggleBookmark?.(mod)}
                    />
                  );
                })}

                {mods.length === 0 ? (
                  <div className="col-span-full">
                    <StatePanel
                      title="No creator mods found"
                      message={`No public releases found for ${game.name}.`}
                      className="min-h-[18rem]"
                    />
                  </div>
                ) : null}
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
