import { User } from "lucide-react";
import { useMemo } from "react";
import { sanitizeHtml } from "../../lib/sanitizeHtml";
import { cn } from "../../lib/utils";

export default function ModDescription({ mod, game, pushPage, onToggleBookmark }) {
  const safeDescriptionHtml = useMemo(
    () =>
      sanitizeHtml(
        mod._sText || mod._sDescription || "No description provided.",
      ),
    [mod._sText, mod._sDescription],
  );

  return (
    <div className="space-y-12 pb-20">
      {/* Description */}
      <div className="w-full">
        <h3 className="text-sm font-bold text-text-primary mb-4">About this mod</h3>
        <div className="bg-surface border border-border rounded-2xl p-6 lg:p-8 shadow-sm">
          <div
            className={cn(
              "text-base text-text-secondary leading-relaxed gb-description wrap-break-word",
              mod.isImported && "italic opacity-50"
            )}
            dangerouslySetInnerHTML={{
              __html: mod.isImported
                ? `This mod was imported from your local files. You can manage it here, set a custom thumbnail, or re-assign its category collection.<br/><br/>Source folder: <code>${mod.localMod?.originalFolderName}</code>`
                : safeDescriptionHtml,
            }}
          />
        </div>
      </div>

      {/* Credits */}
      {!mod.isImported && mod._aCredits?.length > 0 && (
        <div className="w-full">
          <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
            <User size={18} className="text-primary" /> Credits
          </h3>
          <div className="bg-surface border border-border rounded-2xl p-6 lg:p-8 shadow-sm space-y-6">
            {mod._aCredits.map((group, gi) => (
              <div key={gi}>
                {group._sGroupName && (
                  <p className="text-xs font-black uppercase tracking-widest text-text-muted mb-3 border-b border-border pb-2">
                    {group._sGroupName}
                  </p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {(group._aAuthors || []).map((author) => (
                    <button
                      key={author._idRow}
                      type="button"
                      onClick={() => {
                        pushPage({
                          id: `creator-${author._idRow}`,
                          component: "CreatorProfile",
                          props: {
                            creator: author,
                            game,
                            bookmarkIds: [],
                            onToggleBookmark,
                          },
                        });
                      }}
                      className="flex items-center gap-3 rounded-xl border border-white/5 bg-background px-3 py-2.5 text-sm font-semibold text-text-secondary transition-colors hover:border-primary/30 hover:text-primary hover:bg-white/5 shadow-sm"
                    >
                      {author._sAvatarUrl ? (
                        <img
                          src={author._sAvatarUrl}
                          alt={author._sName}
                          loading="lazy"
                          decoding="async"
                          className="h-8 w-8 rounded-full object-cover border border-white/10"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                          <User size={14} className="text-white/30" />
                        </div>
                      )}
                      <div className="flex flex-col items-start min-w-0">
                        <span className="truncate w-full text-left">
                          {author._sName}
                        </span>
                        {author._sRole && (
                          <span className="opacity-50 text-[10px] uppercase tracking-wider truncate w-full text-left">
                            {author._sRole}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
