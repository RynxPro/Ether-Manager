import { useState, useEffect, useMemo } from "react";
import {
  Download,
  Check,
  Bookmark,
  Heart,
  Eye,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  User,
  ExternalLink,
  Calendar,
  RefreshCw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "../store/useAppStore";
import { getAllCharacterNames } from "../lib/portraits";
import { cn } from "../lib/utils";
import SearchableDropdown from "./SearchableDropdown";
import { sanitizeHtml } from "../lib/sanitizeHtml";
import SidePanel from "./layout/SidePanel";

function inferCharacterFromMod(mod, characters) {
  const rootCat = mod._aRootCategory?._sName?.toLowerCase();
  if (
    rootCat === "gui" ||
    rootCat === "user interface" ||
    rootCat === "hud" ||
    rootCat === "ui"
  ) {
    return "User Interface";
  }
  if (
    rootCat === "scripts" ||
    rootCat === "utilities" ||
    rootCat === "tools" ||
    rootCat === "fixes" ||
    rootCat === "other/misc" ||
    rootCat === "miscellaneous" ||
    rootCat === "audio"
  ) {
    return "Miscellaneous";
  }

  const categoryName = mod._aCategory?._sName?.toLowerCase();
  if (!categoryName) {
    return "";
  }

  return (
    characters.find((character) => character.toLowerCase() === categoryName) ||
    ""
  );
}

export default function ModDetailModal({
  mod,
  game,
  onClose,
  onInstall,
  installedFileInfo,
  isBookmarked = false,
  onToggleBookmark,
  onCreatorClick,
  preSelectedCharacter = "",
  isUpdating = false,
  isLibraryContext = false,
  onThumbnailChange,
}) {
  const [selectedFile, setSelectedFile] = useState(mod._aFiles?.[0] || null);
  const [selectedCharacter, setSelectedCharacter] = useState(
    preSelectedCharacter || "",
  );
  const [currentImgIndex, setCurrentImgIndex] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [error, setError] = useState(null);

  const downloadJob = useAppStore((state) => state.downloads.find((d) => d.id === mod._idRow));
  const isDownloading = downloadJob?.status === "downloading" || downloadJob?.status === "extracting";

  // Reset load state whenever the visible image changes
  useEffect(() => {
    setImgLoaded(false);
  }, [currentImgIndex]);

  const characters = useMemo(
    () => ["User Interface", "Miscellaneous", ...getAllCharacterNames(game.id)],
    [game.id],
  );
  const images = mod.allImages || [mod.thumbnailUrl].filter(Boolean);
  const defaultSelectedCharacter = useMemo(
    () => preSelectedCharacter || inferCharacterFromMod(mod, characters),
    [preSelectedCharacter, mod, characters],
  );
  const effectiveSelectedCharacter =
    selectedCharacter || defaultSelectedCharacter;
  const safeDescriptionHtml = useMemo(
    () =>
      sanitizeHtml(
        mod._sText || mod._sDescription || "No description provided.",
      ),
    [mod._sText, mod._sDescription],
  );

  // Date Formatter
  const formatDate = (unixSeconds) => {
    if (!unixSeconds) return "Unknown";
    return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Prevent background scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  const handleInstall = async () => {
    if (!effectiveSelectedCharacter) {
      setError("Please assign a categorization folder first.");
      return;
    }
    if (!selectedFile) {
      setError("Please select a file to download.");
      return;
    }
    setError(null);

    try {
      // The view handler does preflight synchronously, then continues the install
      // in the background while the sidebar download queue takes over.
      await onInstall({
        characterName: effectiveSelectedCharacter,
        gbModId: mod._idRow,
        fileUrl: selectedFile._sDownloadUrl,
        fileName: selectedFile._sFile,
        modName: mod._sName,
        category:
          mod._aRootCategory?._sName || mod._aCategory?._sName || "Unknown",
      });

      onClose();
    } catch (err) {
      setError(err.message || "Installation failed.");
    }
  };

  const handleSetThumbnail = async () => {
    if (
      !mod.localMod ||
      !game ||
      !window.electronConfig ||
      !window.electronMods
    )
      return;
    try {
      const config = await window.electronConfig.getConfig();
      const importerPath = config[game.id];
      if (!importerPath) return;

      const result = await window.electronMods.setCustomThumbnail({
        importerPath,
        originalFolderName: mod.localMod.originalFolderName,
        thumbnailUrl: images[currentImgIndex],
      });

      if (result.success && onThumbnailChange) {
        onThumbnailChange(images[currentImgIndex]);
      }
    } catch (err) {
      console.error("Failed to set custom thumbnail", err);
    }
  };

  const nextImage = () =>
    setCurrentImgIndex((prev) => (prev + 1) % images.length);
  const prevImage = () =>
    setCurrentImgIndex((prev) => (prev - 1 + images.length) % images.length);

  return (
    <SidePanel isOpen={true} onClose={onClose} title="Mod Details">
      <div className="flex flex-col h-full bg-surface">
        
        {/* Top: Media Area */}
        <div className="w-full relative flex flex-col group bg-background border-b border-border z-0">
          {images.length > 0 ? (
            <div className="relative w-full aspect-video overflow-hidden bg-background">
              {/* Loading skeleton */}
              {!imgLoaded && (
                <div className="absolute inset-0 bg-white/5 animate-pulse z-10" />
              )}
              <img
                key={currentImgIndex}
                src={images[currentImgIndex]}
                alt={mod._sName}
                onLoad={() => setImgLoaded(true)}
                className={cn(
                  "w-full h-full object-contain transition-opacity duration-300",
                  imgLoaded ? "opacity-100" : "opacity-0"
                )}
              />

              {images.length > 1 && (
                <>
                  <button
                    onClick={prevImage}
                    className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-all opacity-0 group-hover:opacity-100"
                  >
                    <ChevronLeft size={24} />
                  </button>
                  <button
                    onClick={nextImage}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-all opacity-0 group-hover:opacity-100"
                  >
                    <ChevronRight size={24} />
                  </button>
                  {/* Indicators */}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {images.map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          "w-1.5 h-1.5 rounded-full transition-all",
                          i === currentImgIndex ? "bg-primary w-4" : "bg-white/30",
                        )}
                      />
                    ))}
                  </div>
                </>
              )}

              {/* Set Thumbnail Button */}
              {isLibraryContext && mod.localMod && (
                <button
                  onClick={handleSetThumbnail}
                  title="Use this image as the thumbnail in your library"
                  className="absolute top-4 right-4 z-10 py-1.5 px-3 rounded-lg bg-black/60 text-white text-xs font-bold hover:bg-primary hover:text-black transition-all border border-white/10 opacity-0 group-hover:opacity-100 flex items-center gap-2"
                >
                  <ImageIcon size={14} />
                  Set as Thumbnail
                </button>
              )}
            </div>
          ) : (
            <div className="w-full aspect-video flex items-center justify-center text-white/10 italic">
              No images available
            </div>
          )}

          {/* Thumbnails row */}
          {images.length > 1 && (
            <div className="h-20 bg-white/5 items-center gap-2 p-3 overflow-x-auto scroller-hidden flex">
              {images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentImgIndex(i)}
                  className={cn(
                    "h-full aspect-video rounded-md overflow-hidden border-2 transition-all shrink-0",
                    i === currentImgIndex
                      ? "border-primary"
                      : "border-transparent opacity-50 hover:opacity-100",
                  )}
                >
                  <img src={img} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bottom: Info Area */}
        <div className="flex-1 p-6 flex flex-col relative z-20">
          <div className="flex flex-col mb-4 shrink-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <div className="rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
                {mod._aRootCategory?._sName || mod._aCategory?._sName || "Mod"}
              </div>
              {isBookmarked && (
                <div className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                  Saved
                </div>
              )}
              {installedFileInfo?.installedFiles?.length > 0 && (
                <div className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                  Installed
                </div>
              )}
            </div>
            
            <div className="flex items-start justify-between gap-4 mb-3">
              <h2 className="text-2xl font-bold text-white leading-tight" title={mod._sName}>
                {mod._sName}
              </h2>
              <button
                onClick={() => window.electronConfig?.openExternal(`https://gamebanana.com/mods/${mod._idRow}`)}
                className="shrink-0 p-2 rounded-full border border-white/10 bg-white/5 text-text-muted hover:text-white hover:bg-white/10 hover:border-white/20 transition-all flex items-center gap-1"
                title="View on GameBanana"
              >
                <ExternalLink size={14} />
              </button>
            </div>

            <div className="flex items-center flex-wrap gap-4 text-text-muted text-sm mt-1">
              {mod._aSubmitter ? (
                <button
                  onClick={() => onCreatorClick?.(mod._aSubmitter)}
                  className="flex items-center gap-2 group/creator transition-colors hover:text-primary rounded-lg w-fit"
                >
                  <div className="w-6 h-6 rounded-full overflow-hidden bg-white/10 border border-white/5 flex items-center justify-center shrink-0 shadow-[0_0_10px_rgba(255,255,255,0.05)]">
                    {mod._aSubmitter._sAvatarUrl ? (
                      <img src={mod._aSubmitter._sAvatarUrl} alt="Creator" className="w-full h-full object-cover" />
                    ) : (
                      <User size={12} className="text-white/30" />
                    )}
                  </div>
                  <span className="font-medium text-text-secondary">
                    {mod._aSubmitter._sName}
                  </span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full overflow-hidden bg-white/5 flex items-center justify-center shrink-0">
                    <User size={12} className="text-white/20" />
                  </div>
                  <span className="font-medium text-text-muted">Unknown</span>
                </div>
              )}

              {/* Dates */}
              <div className="flex items-center gap-3 border-l border-border pl-4 ml-2">
                <div className="flex items-center gap-1.5 text-[11px]" title="Date Added">
                  <Calendar size={12} className="opacity-50" />
                  <span>{formatDate(mod._tsDateAdded)}</span>
                </div>
                {mod._tsDateUpdated > mod._tsDateAdded && (
                  <div className="flex items-center gap-1.5 text-[11px]" title="Last Updated">
                    <RefreshCw size={12} className="opacity-50" />
                    <span>{formatDate(mod._tsDateUpdated)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mb-6 flex flex-wrap items-center gap-3 text-xs text-text-muted shrink-0">
            <span className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5">
              <Heart size={14} className="text-primary" /> {mod._nLikeCount?.toLocaleString() || 0}
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5">
              <Eye size={14} /> {mod._nViewCount?.toLocaleString() || 0}
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-primary">
              <Download size={14} /> {mod._nDownloadCount?.toLocaleString() || 0}
            </span>
          </div>

          <div className="flex-1 space-y-8 mb-6">
            {/* Description */}
            <div>
              <div
                className="text-sm text-text-secondary leading-relaxed gb-description wrap-break-word"
                dangerouslySetInnerHTML={{ __html: safeDescriptionHtml }}
              />
            </div>

            {/* Files Selector */}
            <div>
              <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest mb-3">
                Files
              </h3>
              <div className="space-y-2">
                {mod._aFiles?.map((file) => {
                  const installedData = installedFileInfo?.installedFiles?.find((f) => f.fileName === file._sFile);
                  const isInstalled = !!installedData;
                  let isOutdated = false;

                  if (isInstalled && mod._tsDateUpdated && installedData.installedAt) {
                    const installedDate = new Date(installedData.installedAt).getTime() / 1000;
                    if (mod._tsDateUpdated > installedDate + 300) isOutdated = true;
                  }

                  return (
                    <button
                      key={file._idRow}
                      onClick={() => setSelectedFile(file)}
                      className={cn(
                        "w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left",
                        selectedFile?._idRow === file._idRow
                          ? "bg-primary/10 border-primary/50 text-text-primary"
                          : "bg-background border-border text-text-muted hover:border-white/20 hover:text-text-secondary"
                      )}
                    >
                      <div className="flex-1 min-w-0 mr-3">
                        <div className="flex flex-wrap items-center gap-2 mb-0.5">
                          <p className="text-sm font-medium truncate text-text-primary group-hover:text-white">{file._sFile}</p>
                          {isInstalled && (isOutdated ? (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-(--color-update)/10 text-(--color-update) border border-(--color-update)/20 uppercase tracking-tighter shrink-0">
                              Update Available
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-(--color-success)/10 text-(--color-success) border border-(--color-success)/20 uppercase tracking-tighter shrink-0">
                              Stored
                            </span>
                          ))}
                        </div>
                        {file._sDescription && (
                          <p className="text-[10px] text-text-muted mb-1 line-clamp-2 leading-relaxed" 
                             dangerouslySetInnerHTML={{ __html: sanitizeHtml(file._sDescription) }} />
                        )}
                        <p className="text-[10px] opacity-60">{(file._nFilesize / 1024 / 1024).toFixed(1)} MB</p>
                      </div>
                      {selectedFile?._idRow === file._idRow && (
                        <div className="p-1 rounded-full bg-primary text-black"><Check size={12} /></div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Installation Zone Fixed at bottom of panel block */}
          <div className="pt-6 border-t border-border shrink-0 pb-6">
            <div className="mb-6">
              <SearchableDropdown
                items={characters}
                value={effectiveSelectedCharacter}
                onChange={setSelectedCharacter}
                placeholder="Select a target folder..."
                gameId={game.id}
                direction="up"
              />
            </div>
            {error && <p className="text-red-500 text-xs mb-4">{error}</p>}

            {/* Install / Bookmark actions */}
            <div className="flex items-center gap-3 w-full">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleBookmark?.(mod);
                }}
                className={cn(
                  "flex shrink-0 items-center justify-center p-4 rounded-xl transition-all border",
                  isBookmarked ? "bg-primary/20 border-primary/50 text-primary" : "bg-white/5 border-white/10 text-white hover:bg-white/10"
                )}
                title={isBookmarked ? "Remove Bookmark" : "Save Bookmark"}
              >
                <Bookmark size={20} className={cn(isBookmarked && "fill-primary")} />
              </button>
              <button
                onClick={(e) => {
                  if (isDownloading) e.preventDefault();
                  else handleInstall();
                }}
                disabled={!effectiveSelectedCharacter || (isLibraryContext && !isUpdating) || isDownloading}
                className={cn(
                  "flex-1 relative overflow-hidden flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-base transition-all",
                  isDownloading 
                    ? "bg-primary/20 text-primary border border-primary/30 cursor-not-allowed"
                    : isLibraryContext && !isUpdating
                    ? "bg-white/5 text-gray-600 cursor-not-allowed"
                    : "bg-primary text-black hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                )}
              >
                {/* Progress Fill */}
                {isDownloading && (
                  <div 
                    className="absolute inset-y-0 left-0 bg-primary/20 transition-all duration-300 ease-linear"
                    style={{ width: `${downloadJob.percent}%` }}
                  />
                )}

                <div className="relative z-10 flex items-center gap-2">
                  <Download size={20} className={cn(isDownloading && "animate-bounce")} />
                  {isDownloading 
                    ? (downloadJob.status === "extracting" ? "Extracting..." : `Installing ${downloadJob.percent}%`) 
                    : isLibraryContext ? "Update" : "Install"}
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </SidePanel>
  );
}
