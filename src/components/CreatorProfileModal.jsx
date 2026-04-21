import { useId, useState } from "react";
import {
  X,
  User,
  ChevronLeft,
  ChevronRight,
  Bookmark,
  Check,
  ExternalLink,
  Globe,
  Star,
  Trophy,
  Heart,
  Users,
  Package,
  Zap,
  CalendarDays,
  Wifi,
  WifiOff,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import GbModCard from "./GbModCard";
import { cn } from "../lib/utils";
import { StateGridSkeleton, StatePanel } from "./ui/StatePanel";
import { useGbQuery } from "../hooks/useGbQuery";
import { useFetchCache } from "../hooks/useFetchCache";

const PER_PAGE = 20;

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

function StatPill({ icon: Icon, label, value, accent }) {
  return (
    <div className={cn(
      "flex items-center gap-2 rounded-xl border px-3 py-2 text-xs",
      accent
        ? "border-primary/25 bg-primary/10 text-primary"
        : "border-white/8 bg-white/4 text-text-secondary"
    )}>
      <Icon size={12} className="shrink-0 opacity-70" />
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="opacity-60">{label}</span>
    </div>
  );
}

function formatJoinDate(ts) {
  if (!ts) return null;
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

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
  const [page, setPage] = useState(1);
  const { fetchMemberProfile, browseMods } = useFetchCache();
  const {
    data: profile,
    loading: profileLoading,
  } = useGbQuery({
    enabled: Boolean(creator._idRow),
    queryKey: ["gb-member-profile", creator._idRow],
    queryFn: () => fetchMemberProfile(creator._idRow),
    ttlMs: 90_000,
  });
  const {
    data: modsResult,
    loading,
    error,
  } = useGbQuery({
    enabled: Boolean(game.gbGameId && creator._idRow),
    queryKey: ["gb-creator-mods", game.gbGameId, creator._idRow, page],
    queryFn: () =>
      browseMods({
        gbGameId: game.gbGameId,
        submitterId: creator._idRow,
        page,
        perPage: PER_PAGE,
      }),
    ttlMs: 45_000,
    initialData: { records: [], total: 0 },
  });

  const mods = modsResult?.records || [];
  const total = modsResult?.total || 0;
  const totalPages = Math.ceil(total / PER_PAGE);
  const displayProfile = profile ?? creator;
  const avatarUrl = profile?._sHdAvatarUrl || profile?._sAvatarUrl || creator._sAvatarUrl;
  const isOnline = profile?._bIsOnline ?? false;
  const joinDate = formatJoinDate(profile?._tsJoinDate);
  const donationMethods = profile?._aDonationMethods ?? [];

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
        className="relative flex h-full max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a0a] shadow-[0_30px_100px_rgba(0,0,0,0.8)]"
      >
        {/* Header */}
        <div className="shrink-0 border-b border-white/10 bg-background/70 px-6 py-5 backdrop-blur-md sm:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            {/* Avatar + Name + Stats */}
            <div className="flex min-w-0 items-start gap-4">
              {/* Avatar with online indicator */}
              <div className="relative shrink-0">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={displayProfile._sName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <User size={24} className="text-white/25" />
                  )}
                </div>
                {/* Online indicator */}
                <div className={cn(
                  "absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-[#0a0a0a]",
                  isOnline ? "bg-green-500" : "bg-gray-600"
                )}>
                  {isOnline
                    ? <Wifi size={8} className="text-white" />
                    : <WifiOff size={8} className="text-white/50" />
                  }
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2
                    id={titleId}
                    className="truncate text-2xl font-black tracking-tight text-white sm:text-3xl"
                  >
                    {displayProfile._sName}
                  </h2>
                  {profile?._sUserTitle && (
                    <span className="shrink-0 rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">
                      {profile._sUserTitle}
                    </span>
                  )}
                </div>

                {/* Meta row: join date, age, online status */}
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                  {joinDate && (
                    <span className="flex items-center gap-1">
                      <CalendarDays size={11} />
                      Joined {joinDate}
                      {profile?._sAccountAge && ` · ${profile._sAccountAge}`}
                    </span>
                  )}
                  <span className={cn(
                    "flex items-center gap-1 font-medium",
                    isOnline ? "text-green-400" : "text-text-muted"
                  )}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", isOnline ? "bg-green-400" : "bg-gray-600")} />
                    {isOnline ? "Online" : "Offline"}
                  </span>
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                    {game.name}
                  </span>
                </div>

                {/* Core stats pills */}
                {!profileLoading && profile && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {profile._nSubmissionsCount > 0 && (
                      <StatPill icon={Package} value={profile._nSubmissionsCount.toLocaleString()} label="Mods" />
                    )}
                    {profile._nSubscriberCount > 0 && (
                      <StatPill icon={Users} value={profile._nSubscriberCount.toLocaleString()} label="Followers" />
                    )}
                    {profile._nFeaturedCount > 0 && (
                      <StatPill icon={Star} value={profile._nFeaturedCount} label="Featured" accent />
                    )}
                    {profile._nThanksReceived > 0 && (
                      <StatPill icon={Heart} value={profile._nThanksReceived.toLocaleString()} label="Thanks" />
                    )}
                    {profile._nPoints > 0 && (
                      <StatPill icon={Zap} value={`#${profile._nPointsRank?.toLocaleString()}`} label="Rank" />
                    )}
                    {profile._nMedalsCount > 0 && (
                      <StatPill icon={Trophy} value={profile._nMedalsCount} label="Medals" />
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-start justify-end gap-2">
              {/* Donation links */}
              {donationMethods.map((method) =>
                method._bIsUrl && method._sValue ? (
                  <button
                    key={method._sTitle}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.electronConfig?.openExternal?.(method._sValue);
                    }}
                    className="ui-focus-ring flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-[11px] font-semibold text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                    title={method._sTitle}
                  >
                    <ExternalLink size={13} />
                    {method._sTitle?.replace(" Profile", "") ?? "Support"}
                  </button>
                ) : null
              )}

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
                  <><Check size={14} strokeWidth={3.5} />Saved</>
                ) : (
                  <><Bookmark size={14} strokeWidth={2.4} />Follow</>
                )}
              </button>

              {displayProfile._sProfileUrl ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.electronConfig?.openExternal?.(displayProfile._sProfileUrl);
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

        {/* Mod grid */}
        <div className="flex min-h-0 flex-1 flex-col bg-[#0a0a0a]">
          <div className="shrink-0 border-b border-white/10 bg-background/55 px-6 py-4 sm:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm font-semibold text-text-secondary">
                {total.toLocaleString()} mod{total !== 1 ? "s" : ""} in {game.name}
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
                      const installedDate = new Date(file.installedAt).getTime() / 1000;
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
