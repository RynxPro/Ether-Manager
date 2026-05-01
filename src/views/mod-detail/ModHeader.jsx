import { Calendar, ExternalLink, RefreshCw, Star, User, EyeOff } from "lucide-react";

export default function ModHeader({
  mod,
  game,
  isNsfw,
  localBookmarked,
  installedFileInfo,
  pushPage,
  onToggleBookmark,
  onInstall,
}) {
  const formatDate = (unixSeconds) => {
    if (!unixSeconds) return "Unknown";
    return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="flex flex-col mb-8">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="rounded-full border border-border bg-background px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-text-muted shadow-sm">
          {mod._aSubCategory?._sName ||
            mod._aRootCategory?._sName ||
            mod._aCategory?._sName ||
            "Mod"}
        </div>
        {isNsfw && (
          <div className="flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-red-400">
            <EyeOff size={12} /> NSFW
          </div>
        )}
        {mod._bWasFeatured && (
          <div className="flex items-center gap-1.5 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-yellow-400">
            <Star size={12} className="fill-yellow-400" /> Featured
          </div>
        )}
        {localBookmarked && (
          <div className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-primary">
            Saved
          </div>
        )}
        {installedFileInfo?.installedFiles?.length > 0 && (
          <div className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-primary">
            Installed
          </div>
        )}
      </div>

      <div className="flex items-start justify-between gap-6 mb-4">
        <h1
          className="text-4xl lg:text-5xl font-black text-white leading-tight tracking-tight drop-shadow-sm"
          title={mod._sName}
        >
          {mod._sName}
        </h1>
        <div className="flex shrink-0 items-center gap-3 mt-2">
          {mod._sVersion && (
            <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-text-muted font-mono shadow-inner">
              {mod._sVersion}
            </span>
          )}
          {!mod.isImported && (
            <button
              onClick={() =>
                window.electronConfig?.openExternal(
                  `https://gamebanana.com/mods/${mod._idRow}`
                )
              }
              className="shrink-0 p-2.5 rounded-full border border-white/10 bg-white/5 text-text-muted hover:text-white hover:bg-white/10 hover:border-white/20 transition-all flex items-center justify-center shadow-sm group"
              title="View on GameBanana"
            >
              <ExternalLink
                size={16}
                className="group-hover:scale-110 transition-transform"
              />
            </button>
          )}
        </div>
      </div>

      {!mod.isImported && (
        <div className="flex items-center flex-wrap gap-5 text-text-muted text-sm border-b border-border pb-6">
          {mod._aSubmitter ? (
            <button
              onClick={() => {
                pushPage({
                  id: `creator-${mod._aSubmitter._idRow}`,
                  component: "CreatorProfile",
                  props: {
                    creator: mod._aSubmitter,
                    game,
                    bookmarkIds: [],
                    onToggleBookmark,
                    onInstall,
                  },
                });
              }}
              className="flex items-center gap-3 group/creator transition-colors hover:text-primary rounded-xl px-2 py-1 -ml-2"
            >
              <div className="relative w-8 h-8 rounded-full overflow-hidden bg-white/10 border border-white/5 flex items-center justify-center shrink-0 shadow-sm">
                {mod._aSubmitter._sHdAvatarUrl ||
                mod._aSubmitter._sAvatarUrl ? (
                  <img
                    src={
                      mod._aSubmitter._sHdAvatarUrl ||
                      mod._aSubmitter._sAvatarUrl
                    }
                    alt="Creator"
                    className="w-full h-full object-cover will-change-transform transform-gpu backface-hidden antialiased"
                  />
                ) : (
                  <User size={14} className="text-white/30" />
                )}
                {mod._aSubmitter._bIsOnline && (
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-background" />
                )}
              </div>
              <span className="font-semibold text-text-secondary text-base">
                {mod._aSubmitter._sName}
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-white/5 flex items-center justify-center shrink-0">
                <User size={14} className="text-white/20" />
              </div>
              <span className="font-semibold text-text-muted text-base">
                Unknown
              </span>
            </div>
          )}

          {/* Dates */}
          <div className="flex items-center gap-4 border-l border-border pl-5">
            <div
              className="flex items-center gap-2 text-xs font-medium"
              title="Date Added"
            >
              <Calendar size={14} className="opacity-50" />
              <span>{formatDate(mod._tsDateAdded)}</span>
            </div>
            {mod._tsDateUpdated > mod._tsDateAdded && (
              <div
                className="flex items-center gap-2 text-xs font-medium text-primary/80"
                title="Last Updated"
              >
                <RefreshCw size={14} />
                <span>{formatDate(mod._tsDateUpdated)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
