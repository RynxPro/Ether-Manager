import { useState } from "react";
import {
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
  ArrowLeft,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import GbModCard from "./GbModCard";
import { cn } from "../lib/utils";
import { StateGridSkeleton, StatePanel } from "./ui/StatePanel";
import { useGbQuery } from "../hooks/useGbQuery";
import { useFetchCache } from "../hooks/useFetchCache";
import { useAppStore } from "../store/useAppStore";

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
      "flex flex-col items-center justify-center p-4 rounded-2xl border bg-background/50 backdrop-blur-sm",
      accent
        ? "border-primary/25 bg-primary/10 text-primary"
        : "border-white/5 shadow-sm"
    )}>
      <Icon size={20} className={cn("mb-2", accent ? "text-primary" : "text-text-muted")} />
      <span className="text-xl font-black tabular-nums tracking-tight">{value}</span>
      <span className="text-[10px] font-bold uppercase tracking-widest opacity-50 mt-1">{label}</span>
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

export default function CreatorProfilePage({
  creator,
  game,
  installedModsInfo,
  bookmarkIds,
  onToggleBookmark,
  isCreatorBookmarked,
  onToggleCreatorBookmark,
}) {
  const popPage = useAppStore(state => state.popPage);
  const pushPage = useAppStore(state => state.pushPage);
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
    refetch: fetchMods
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

  const handleModClick = (mod) => {
    pushPage({
      id: `mod-${mod._idRow}`,
      component: 'ModDetail',
      props: {
        mod,
        game,
        installedFileInfo: installedModsInfo?.[mod._idRow] || null,
        isBookmarked: (bookmarkIds || []).includes(mod._idRow),
        onToggleBookmark: () => onToggleBookmark?.(mod),
        onCreatorClick: (clickedCreator) => {
          if (clickedCreator._idRow === creator._idRow) return; // Prevent pushing same creator
          pushPage({
            id: `creator-${clickedCreator._idRow}`,
            component: 'CreatorProfile',
            props: {
              creator: clickedCreator,
              game,
              installedModsInfo,
              bookmarkIds,
              onToggleBookmark,
            }
          });
        }
      }
    });
  };

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
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="w-full h-full bg-background overflow-y-auto custom-scrollbar flex flex-col"
    >
      {/* 1. Hero Banner */}
      <div className="relative w-full h-[45vh] min-h-[350px] shrink-0 bg-[#050505] overflow-hidden flex items-end justify-center border-b border-border">
        
        {/* Back Button */}
        <button
          onClick={popPage}
          className="absolute top-6 left-6 z-50 flex items-center gap-2 px-4 py-2 rounded-full bg-black/50 border border-white/10 hover:bg-black/80 text-white backdrop-blur-md transition-all shadow-lg group"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          <span className="font-bold tracking-wider uppercase text-[11px]">Back</span>
        </button>

        {/* Blurred Background */}
        <AnimatePresence>
          {avatarUrl && (
            <motion.div 
              key={avatarUrl}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.2 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1 }}
              className="absolute inset-0 bg-cover bg-center blur-3xl transform scale-110"
              style={{ backgroundImage: `url(${avatarUrl})` }}
            />
          )}
        </AnimatePresence>

        {/* Creator Info Overlay */}
        <div className="relative z-10 w-full max-w-[1400px] px-6 lg:px-12 pb-12 flex flex-col md:flex-row items-end gap-8">
          
          {/* Avatar */}
          <div className="relative shrink-0 group">
            <div className="relative flex h-32 w-32 md:h-40 md:w-40 items-center justify-center overflow-hidden rounded-[2rem] border-4 border-background bg-surface shadow-2xl transition-transform duration-500 group-hover:scale-105">
              <AnimatePresence mode="popLayout">
                {avatarUrl ? (
                  <motion.img
                    key={avatarUrl}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    src={avatarUrl}
                    alt={displayProfile._sName}
                    className="h-full w-full object-cover absolute inset-0"
                  />
                ) : (
                  <User size={64} className="text-white/20" />
                )}
              </AnimatePresence>
            </div>
            {/* Online indicator */}
            <div className={cn(
              "absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full border-4 border-background shadow-lg",
              isOnline ? "bg-green-500" : "bg-gray-600"
            )}>
              {isOnline
                ? <Wifi size={14} className="text-white" />
                : <WifiOff size={14} className="text-white/50" />
              }
            </div>
          </div>

          <div className="flex-1 pb-2">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white drop-shadow-md">
                {displayProfile._sName}
              </h1>
              {profile?._sUserTitle && (
                <span className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary shadow-sm">
                  {profile._sUserTitle}
                </span>
              )}
            </div>
            
            <div className="flex flex-wrap items-center gap-4 text-sm text-text-muted font-medium">
              {joinDate && (
                <span className="flex items-center gap-2">
                  <CalendarDays size={16} className="opacity-70" />
                  Joined {joinDate}
                  {profile?._sAccountAge && ` · ${profile._sAccountAge}`}
                </span>
              )}
              <span className={cn(
                "flex items-center gap-2 font-bold",
                isOnline ? "text-green-400" : "text-text-muted"
              )}>
                <span className={cn("h-2 w-2 rounded-full", isOnline ? "bg-green-400" : "bg-gray-600")} />
                {isOnline ? "Online" : "Offline"}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pb-2">
            {donationMethods.map((method) =>
              method._bIsUrl && method._sValue ? (
                <button
                  key={method._sTitle}
                  type="button"
                  onClick={() => window.electronConfig?.openExternal?.(method._sValue)}
                  className="flex h-12 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 text-xs font-bold uppercase tracking-widest text-white/80 transition-colors hover:bg-white/10 hover:text-white shadow-sm"
                >
                  <ExternalLink size={16} />
                  {method._sTitle?.replace(" Profile", "") ?? "Support"}
                </button>
              ) : null
            )}

            <button
              onClick={() => onToggleCreatorBookmark?.(creator)}
              className={cn(
                "flex h-12 items-center gap-2 rounded-xl border px-6 text-xs font-black uppercase tracking-widest transition-all shadow-lg",
                isCreatorBookmarked
                  ? "border-primary bg-primary text-black hover:brightness-110"
                  : "border-white/10 bg-white/5 text-white hover:bg-white/10",
              )}
            >
              {isCreatorBookmarked ? (
                <><Check size={16} strokeWidth={3} />Following</>
              ) : (
                <><Bookmark size={16} />Follow</>
              )}
            </button>

            {displayProfile._sProfileUrl && (
              <button
                type="button"
                onClick={() => window.electronConfig?.openExternal?.(displayProfile._sProfileUrl)}
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                title="Open GameBanana profile"
              >
                <ExternalLink size={18} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Content Grid */}
      <div className="w-full max-w-[1400px] mx-auto px-6 lg:px-12 py-10 flex flex-col xl:flex-row gap-12 relative">
        
        {/* LEFT COLUMN: Stats Sidebar */}
        <div className="w-full xl:w-80 shrink-0">
          <div className="sticky top-10 flex flex-col gap-6">
            {!profileLoading && profile && (
              <div className="grid grid-cols-2 gap-3">
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

        {/* RIGHT COLUMN: Mod Grid */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 pb-4 border-b border-border">
            <h2 className="text-xl font-black text-white flex items-center gap-3">
              <Package className="text-primary" />
              Releases in {game.name}
              <span className="text-text-muted font-medium text-sm ml-2 px-3 py-1 bg-surface rounded-full border border-white/5">
                {total.toLocaleString()} Mods
              </span>
            </h2>

            {totalPages > 1 && (
              <div className="flex items-center gap-2 mt-4 sm:mt-0">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="rounded-xl border border-white/10 bg-surface px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white/60">
                  {page} / {totalPages}
                </div>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </div>

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
              className="grid grid-cols-2 gap-4 pb-12 md:grid-cols-3 lg:grid-cols-4"
            >
              {mods.map((mod) => {
                const installedInfo = installedModsInfo?.[mod._idRow];
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
                    onClick={() => handleModClick(mod)}
                    onInstall={() => handleModClick(mod)}
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
  );
}
