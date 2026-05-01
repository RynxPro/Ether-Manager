import { Bookmark, Download, Check, RefreshCw } from "lucide-react";
import { cn } from "../../lib/utils";
import SearchableDropdown from "../../components/SearchableDropdown";
import { sanitizeHtml } from "../../lib/sanitizeHtml";
import { getInstalledFileUpdateState } from "../../lib/modUpdateState";

export default function ModInstaller({
  mod,
  game,
  characters,
  effectiveSelectedCharacter,
  setSelectedCharacter,
  error,
  localBookmarked,
  setLocalBookmarked,
  onToggleBookmark,
  isDownloading,
  downloadJob,
  installedFileInfo,
  handleInstall,
  isLibraryContext,
  isUpdating,
  setShowReinstallConfirm,
  selectedFile,
  setSelectedFile,
}) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-6 shadow-xl flex flex-col relative overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute top-0 right-0 w-full h-32 bg-linear-to-b from-primary/10 to-transparent opacity-50 pointer-events-none" />

      <div className="relative z-10">
        <h3 className="text-sm font-bold text-text-primary mb-4">
          Installation
        </h3>

        <div className="mb-5">
          <label className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-2 block">
            Target Folder
          </label>
          <SearchableDropdown
            items={characters}
            value={effectiveSelectedCharacter}
            onChange={setSelectedCharacter}
            placeholder="Select character..."
            gameId={game.id}
          />
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs mb-5 font-medium">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3 w-full mb-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setLocalBookmarked(!localBookmarked);
              onToggleBookmark?.(mod);
            }}
            className={cn(
              "flex shrink-0 items-center justify-center p-4 rounded-xl transition-all border shadow-sm",
              localBookmarked
                ? "bg-primary/20 border-primary/50 text-primary"
                : "bg-white/5 border-white/10 text-white hover:bg-white/10"
            )}
            title={localBookmarked ? "Remove Bookmark" : "Save Bookmark"}
          >
            <Bookmark
              size={20}
              className={cn(localBookmarked && "fill-primary")}
            />
          </button>

          {!mod.isImported &&
            (isDownloading ? (
              /* ── Downloading / Extracting progress ── */
              <div className="flex-1 relative overflow-hidden flex items-center justify-center gap-2 py-4 rounded-xl font-black text-base uppercase tracking-wider bg-primary/20 text-primary border border-primary/30 cursor-not-allowed">
                <div
                  className="absolute inset-y-0 left-0 bg-white/20 transition-all duration-300 ease-linear"
                  style={{ width: `${downloadJob.percent}%` }}
                />
                <div className="relative z-10 flex items-center gap-2">
                  <Download size={20} className="animate-bounce" />
                  {downloadJob.status === "extracting"
                    ? "Extracting..."
                    : `${downloadJob.percent}%`}
                </div>
              </div>
            ) : installedFileInfo?.installedFiles?.length > 0 ? (
              /* ── Already installed ── */
              <div className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl font-black text-base uppercase tracking-wider bg-primary/5 text-primary/70 border border-primary/20 select-none">
                <Check size={20} />
                Installed
              </div>
            ) : (
              /* ── Not yet installed ── */
              <button
                onClick={(e) => {
                  if (isDownloading) e.preventDefault();
                  else handleInstall();
                }}
                disabled={
                  !effectiveSelectedCharacter ||
                  (isLibraryContext && !isUpdating) ||
                  isDownloading
                }
                className={cn(
                  "flex-1 relative overflow-hidden flex items-center justify-center gap-2 py-4 rounded-xl font-black text-base transition-all uppercase tracking-wider shadow-lg",
                  isLibraryContext && !isUpdating
                    ? "bg-white/5 text-gray-600 cursor-not-allowed border border-white/5"
                    : "bg-primary text-black hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                )}
              >
                <div className="relative z-10 flex items-center gap-2">
                  <Download size={20} />
                  {isLibraryContext ? "Update Mod" : "Install Mod"}
                </div>
              </button>
            ))}
        </div>

        {/* Reinstall — prominent secondary action when already installed */}
        {!mod.isImported &&
          installedFileInfo?.installedFiles?.length > 0 &&
          !isDownloading && (
            <button
              onClick={() => setShowReinstallConfirm(true)}
              disabled={!effectiveSelectedCharacter}
              className="w-full flex items-center justify-center gap-2 py-3 mb-6 rounded-xl border border-white/10 bg-white/5 text-text-secondary hover:bg-white/10 hover:text-white transition-all text-xs font-bold uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed group"
              title="Download and overwrite existing files"
            >
              <RefreshCw
                size={14}
                className="group-hover:rotate-180 transition-transform duration-500"
              />
              Reinstall Mod
            </button>
          )}

        {/* Files Selection */}
        {!mod.isImported && mod._aFiles?.length > 0 && (
          <div className="pt-5 border-t border-white/5">
            <label className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-3 block">
              Available Files ({mod._aFiles.length})
            </label>
            <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
              {mod._aFiles.map((file) => {
                const installedData = installedFileInfo?.installedFiles?.find(
                  (f) => f.fileName === file._sFile
                );
                const { isInstalled, hasUpdate: isOutdated } =
                  getInstalledFileUpdateState(mod, installedData, file);

                return (
                  <button
                    key={file._idRow}
                    onClick={() => setSelectedFile(file)}
                    className={cn(
                      "w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left group",
                      selectedFile?._idRow === file._idRow
                        ? "bg-primary/10 border-primary/50 text-text-primary shadow-inner"
                        : "bg-background border-border text-text-muted hover:border-white/20 hover:bg-white/5"
                    )}
                  >
                    <div className="flex-1 min-w-0 mr-3">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <p
                          className={cn(
                            "text-sm font-semibold truncate transition-colors",
                            selectedFile?._idRow === file._idRow
                              ? "text-primary"
                              : "text-text-primary group-hover:text-white"
                          )}
                        >
                          {file._sFile}
                        </p>
                        {isInstalled &&
                          (isOutdated ? (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20 uppercase tracking-tighter shrink-0">
                              Update Available
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-green-500/10 text-green-400 border border-green-500/20 uppercase tracking-tighter shrink-0">
                              Stored
                            </span>
                          ))}
                      </div>
                      {file._sDescription && (
                        <p
                          className="text-[10px] text-text-muted mb-1.5 line-clamp-2 leading-relaxed"
                          dangerouslySetInnerHTML={{
                            __html: sanitizeHtml(file._sDescription),
                          }}
                        />
                      )}
                      <p className="text-[10px] font-mono opacity-60">
                        {(file._nFilesize / 1024 / 1024).toFixed(1)} MB
                      </p>
                    </div>
                    <div
                      className={cn(
                        "shrink-0 h-5 w-5 rounded-full border flex items-center justify-center transition-all",
                        selectedFile?._idRow === file._idRow
                          ? "bg-primary border-primary text-black"
                          : "border-white/10 text-transparent"
                      )}
                    >
                      <Check size={12} strokeWidth={3} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
