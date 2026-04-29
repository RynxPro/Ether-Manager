import { Bookmark, User } from "lucide-react";
import { cn } from "../../lib/utils";

export default function SavedCreatorsStrip({
  creators,
  hydratedCreators,
  onCreatorClick,
}) {
  if (!creators?.length) return null;

  return (
    <section className="ui-panel mb-5 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-text-muted">
          <Bookmark className="text-primary" size={14} />
          Creators
        </div>
        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-text-muted">
          {creators.length}
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto scroller-hidden pb-2">
        {creators.map((creator) => {
          const hydrated = hydratedCreators[creator._idRow];
          const displayCreator = hydrated ?? creator;
          const avatarUrl =
            hydrated?._sHdAvatarUrl ||
            hydrated?._sAvatarUrl ||
            creator._sAvatarUrl;
          const isOnline = hydrated?._bIsOnline ?? false;
          return (
            <button
              key={creator._idRow}
              onClick={() => onCreatorClick(displayCreator)}
              className="ui-focus-ring group/savedcreator min-w-[120px] shrink-0 rounded-[var(--radius-md)] border border-border bg-background px-3 py-3 text-left shadow-card transition-all hover:border-primary/20 hover:bg-white/4"
            >
              <div className="relative mx-auto h-14 w-14">
                <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-border bg-surface shadow-surface transition-all group-hover/savedcreator:shadow-[0_0_20px_var(--color-primary)]/20">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={displayCreator._sName}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User
                      size={24}
                      className="text-text-muted group-hover/savedcreator:text-text-secondary transition-colors"
                    />
                  )}
                </div>
                <span
                  className={cn(
                    "absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-background",
                    isOnline ? "bg-green-500" : "bg-gray-600",
                  )}
                />
              </div>
              <span className="block w-full truncate pt-3 text-center text-sm font-bold text-text-primary transition-colors group-hover/savedcreator:text-primary">
                {displayCreator._sName}
              </span>
              {hydrated?._sUserTitle && (
                <span className="block w-full truncate text-center text-[10px] text-text-muted">
                  {hydrated._sUserTitle}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
