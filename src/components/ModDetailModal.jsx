import { useState, useEffect } from "react";
import { Download, X, AlertCircle, Calendar, Tag, ChevronDown, Check, Monitor, LayoutGrid, Bookmark, Heart, Eye, ChevronLeft, ChevronRight, CheckCircle, ImageIcon, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getAllCharacterNames } from "../lib/portraits";
import { cn } from "../lib/utils";
import SearchableDropdown from "./SearchableDropdown";

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
  onThumbnailChange
}) {
  const [selectedFile, setSelectedFile] = useState(mod._aFiles?.[0] || null);
  const [selectedCharacter, setSelectedCharacter] = useState(preSelectedCharacter || "");
  const [currentImgIndex, setCurrentImgIndex] = useState(0);
  const [isInstalling, setIsInstalling] = useState(false);
  const [error, setError] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isInstallComplete, setIsInstallComplete] = useState(false);

  const baseCharacters = getAllCharacterNames(game.id);
  const characters = ["User Interface", "Miscellaneous", ...baseCharacters];
  const images = mod.allImages || [mod.thumbnailUrl].filter(Boolean);

  // Auto-select character based on GameBanana Category tag
  useEffect(() => {
    if (!selectedCharacter) {
      // 1. Check Root Category first (Global categories)
      const rootCat = mod._aRootCategory?._sName?.toLowerCase();
      if (rootCat === "gui" || rootCat === "user interface" || rootCat === "hud" || rootCat === "ui") {
        setSelectedCharacter("User Interface");
        return;
      }
      if (rootCat === "scripts" || rootCat === "utilities" || rootCat === "tools" || rootCat === "fixes" || rootCat === "other/misc" || rootCat === "miscellaneous" || rootCat === "audio") {
        setSelectedCharacter("Miscellaneous");
        return;
      }

      // 2. Fallback to Sub-category matching (Characters)
      if (mod._aCategory?._sName) {
        const categoryName = mod._aCategory._sName.toLowerCase();
        const matchedChar = characters.find(
          (c) => c.toLowerCase() === categoryName
        );
        if (matchedChar) {
          setSelectedCharacter(matchedChar);
        }
      }
    }
  }, [mod, selectedCharacter, characters]);

  useEffect(() => {
    if (window.electronMods && window.electronMods.onDownloadProgress) {
      return window.electronMods.onDownloadProgress((data) => {
        if (data.gbModId === mod._idRow) {
          setDownloadProgress(data.percent);
        }
      });
    }
  }, [mod._idRow]);

  // Prevent background scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  const handleInstall = async () => {
    if (!selectedCharacter) {
      setError("Please assign a categorization folder first.");
      return;
    }
    if (!selectedFile) {
      setError("Please select a file to download.");
      return;
    }
    setIsInstalling(true);
    setError(null);
    setDownloadProgress(0);
    setIsInstallComplete(false);
    try {
      await onInstall({
        characterName: selectedCharacter,
        gbModId: mod._idRow,
        fileUrl: selectedFile._sDownloadUrl,
        fileName: selectedFile._sFile,
        category: mod._aRootCategory?._sName || mod._aCategory?._sName || "Unknown",
      });
      setIsInstallComplete(true);
    } catch (err) {
      setError(err.message || "Installation failed.");
    } finally {
      setIsInstalling(false);
    }
  };

  const handleSetThumbnail = async () => {
    if (!mod.localMod || !game || !window.electronConfig || !window.electronMods) return;
    try {
      const config = await window.electronConfig.getConfig();
      const importerPath = config[game.id];
      if (!importerPath) return;
      
      const result = await window.electronMods.setCustomThumbnail({
        importerPath,
        originalFolderName: mod.localMod.originalFolderName,
        thumbnailUrl: images[currentImgIndex]
      });
      
      if (result.success && onThumbnailChange) {
        // Optimistically update the local mod object
        mod.localMod.customThumbnail = images[currentImgIndex];
        onThumbnailChange();
      }
    } catch (err) {
      console.error("Failed to set custom thumbnail", err);
    }
  };

  const nextImage = () => setCurrentImgIndex((prev) => (prev + 1) % images.length);
  const prevImage = () => setCurrentImgIndex((prev) => (prev - 1 + images.length) % images.length);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 sm:p-8"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="w-full max-w-5xl bg-(--bg-overlay) border border-white/10 rounded-4xl overflow-hidden shadow-2xl flex flex-col md:flex-row h-full max-h-[700px] md:h-[700px] relative"
      >
        {/* Cinematic Backdrop Glow (floats behind everything) */}
        <div 
          className="absolute inset-x-0 top-0 h-[500px] opacity-15 pointer-events-none"
          style={{
            background: `radial-gradient(circle at 50% 0%, var(--active-accent) 0%, transparent 60%)`
          }}
        />
        {/* Left Side: Media Carousel */}
        <div className="md:w-[55%] bg-(--bg-base) relative flex flex-col group h-64 md:h-auto border-r border-white/5">
          {images.length > 0 ? (
            <div className="relative flex-1 overflow-hidden bg-(--bg-base)">
              <img
                key={currentImgIndex}
                src={images[currentImgIndex]}
                alt={mod._sName}
                className="w-full h-full object-contain"
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
                          i === currentImgIndex ? "bg-(--active-accent) w-4" : "bg-white/30"
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
                  className="absolute top-4 right-4 z-10 py-1.5 px-3 rounded-lg bg-black/60 text-white text-xs font-bold hover:bg-(--active-accent) hover:text-black transition-all border border-white/10 opacity-0 group-hover:opacity-100 flex items-center gap-2"
                >
                  <ImageIcon size={14} />
                  Set as Thumbnail
                </button>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-white/10 italic">
              No images available
            </div>
          )}
          
          {/* Thumbnails row (desktop) */}
          {images.length > 1 && (
            <div className="h-20 bg-white/5 border-t border-white/5 items-center gap-2 p-3 overflow-x-auto scroller-hidden hidden md:flex">
              {images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentImgIndex(i)}
                  className={cn(
                    "h-full aspect-video rounded-md overflow-hidden border-2 transition-all shrink-0",
                    i === currentImgIndex ? "border-(--active-accent)" : "border-transparent opacity-50 hover:opacity-100"
                  )}
                >
                  <img src={img} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Side: Info Area */}
        <div className="md:w-[45%] p-6 md:p-8 flex flex-col h-full bg-transparent overflow-hidden relative z-10">
          <div className="flex items-start justify-between mb-4 shrink-0">
            <div className="min-w-0 pr-4">
              <h2 className="text-2xl font-bold text-white mb-2 truncate" title={mod._sName}>{mod._sName}</h2>
              <div className="text-(--text-muted) text-sm truncate flex items-center gap-1">
                {mod._aSubmitter ? (
                  <button 
                    onClick={() => onCreatorClick?.(mod._aSubmitter)}
                    className="flex items-center gap-2 group/creator transition-colors hover:bg-white/5 p-1 -ml-1 pr-3 rounded-lg w-fit"
                    title={`View profile for ${mod._aSubmitter._sName}`}
                  >
                    <div className="w-6 h-6 rounded-full overflow-hidden bg-white/10 border border-white/5 flex items-center justify-center shrink-0 shadow-[0_0_10px_rgba(255,255,255,0.05)]">
                      {mod._aSubmitter._sAvatarUrl ? (
                        <img src={mod._aSubmitter._sAvatarUrl} alt={mod._aSubmitter._sName} className="w-full h-full object-cover" />
                      ) : (
                        <User size={12} className="text-white/30" />
                      )}
                    </div>
                    <span>
                      by <span className="text-(--active-accent) font-semibold group-hover/creator:underline">{mod._aSubmitter._sName}</span>
                    </span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2 p-1 -ml-1">
                    <div className="w-6 h-6 rounded-full overflow-hidden bg-white/5 border border-white/5 flex items-center justify-center shrink-0">
                      <User size={12} className="text-white/20" />
                    </div>
                    <span>
                      by <span className="text-(--active-accent)">Unknown</span>
                    </span>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-(--text-muted) hover:text-white transition-colors shrink-0"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex items-center gap-4 text-(--text-muted) text-xs mb-6 shrink-0">
            <span className="flex items-center gap-1.5">
              <Heart size={14} className="text-(--active-accent)" /> {mod._nLikeCount?.toLocaleString() || 0}
            </span>
            <span className="flex items-center gap-1.5">
              <Eye size={14} /> {mod._nViewCount?.toLocaleString() || 0}
            </span>
            <span className="flex items-center gap-1.5 text-(--active-accent)">
              <Download size={14} /> {mod._nDownloadCount?.toLocaleString() || 0}
            </span>
          </div>

          {/* Scrollable content area */}
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-8 mb-6">
            {/* Description */}
            <div>
              <h3 className="text-xs font-bold text-(--text-muted) uppercase tracking-widest mb-3">About this mod</h3>
              <div 
                className="text-sm text-(--text-body) leading-relaxed gb-description"
                dangerouslySetInnerHTML={{ __html: mod._sText || mod._sDescription || "No description provided." }}
              />
            </div>

            {/* Files Selector */}
            <div>
              <h3 className="text-xs font-bold text-(--text-muted) uppercase tracking-widest mb-3">Files / Versions</h3>
              <div className="space-y-2">
                {mod._aFiles?.map((file) => {
                  const installedData = installedFileInfo?.installedFiles?.find(f => f.fileName === file._sFile);
                  const isInstalled = !!installedData;
                  let isOutdated = false;
                  
                  if (isInstalled && mod._tsDateUpdated && installedData.installedAt) {
                    const installedDate = new Date(installedData.installedAt).getTime() / 1000;
                    if (mod._tsDateUpdated > installedDate + 60) {
                      isOutdated = true;
                    }
                  }

                  return (
                    <button
                      key={file._idRow}
                      onClick={() => setSelectedFile(file)}
                      className={cn(
                        "w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left",
                        selectedFile?._idRow === file._idRow
                          ? "bg-(--active-accent)/10 border-(--active-accent)/50 text-white"
                          : "bg-white/5 border-white/5 text-(--text-muted) hover:border-white/10 hover:text-(--text-body)"
                      )}
                    >
                      <div className="flex-1 min-w-0 mr-3">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{file._sFile}</p>
                          {isInstalled && (
                            isOutdated ? (
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-(--color-update)/10 text-(--color-update) border border-(--color-update)/20 uppercase tracking-tighter shrink-0 backdrop-blur-md">
                                Update Available
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-(--color-success)/10 text-(--color-success) border border-(--color-success)/20 uppercase tracking-tighter shrink-0 backdrop-blur-md shadow-[0_0_10px_rgba(74,222,128,0.1)]">
                                Stored
                              </span>
                            )
                          )}
                        </div>
                        <p className="text-[10px] opacity-60">{(file._nFilesize / 1024 / 1024).toFixed(1)} MB</p>
                      </div>
                      {selectedFile?._idRow === file._idRow && (
                        <div className="p-1 rounded-full bg-(--active-accent) text-black">
                          <Check size={12} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Installation Zone (Fixed at bottom) */}
          <div className="pt-6 border-t border-white/5 shrink-0">
            <div className="mb-6">
              <SearchableDropdown
                items={characters}
                value={selectedCharacter}
                onChange={setSelectedCharacter}
                placeholder="Select a target folder..."
                gameId={game.id}
                direction="up"
              />
            </div>

            {error && <p className="text-(--color-danger) text-xs mb-4">{error}</p>}

            {isInstallComplete ? (
              <div className="flex flex-col items-center gap-3">
                 <div className="flex items-center gap-2 text-(--active-accent) font-semibold bg-(--active-accent)/10 w-full justify-center py-3 rounded-xl border border-(--active-accent)/20 shadow-[0_0_20px_var(--active-accent)]/10">
                   <CheckCircle size={18} />
                   <span>Installed Successfully</span>
                 </div>
                 <button 
                   onClick={onClose}
                   className="w-full py-3 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-all text-sm"
                 >
                   Return to Browse
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 w-full">
                <button
                   onClick={(e) => {
                     e.stopPropagation();
                     onToggleBookmark?.(mod);
                   }}
                   className={cn(
                     "flex shrink-0 items-center justify-center p-4 rounded-xl transition-all border",
                     isBookmarked 
                       ? "bg-(--active-accent)/20 border-(--active-accent)/50 text-(--active-accent) hover:bg-(--active-accent)/30" 
                       : "bg-white/5 border-white/10 text-white hover:bg-white/10"
                   )}
                   title={isBookmarked ? "Remove Bookmark" : "Save Bookmark"}
                >
                  <Bookmark size={20} className={cn(isBookmarked && "fill-(--active-accent)")} />
                </button>

                <button
                  onClick={handleInstall}
                  disabled={isInstalling || !selectedCharacter || (isLibraryContext && !isUpdating)}
                  className={cn(
                    "flex-1 relative overflow-hidden flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-base transition-all",
                    isLibraryContext && !isUpdating
                      ? "bg-white/5 text-gray-600 cursor-not-allowed"
                      : "bg-(--active-accent) text-black hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  {isInstalling && downloadProgress > 0 && downloadProgress < 100 && (
                    <motion.div 
                      className="absolute left-0 top-0 bottom-0 bg-black/10" 
                      initial={{ width: 0 }}
                      animate={{ width: `${downloadProgress}%` }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2">
                    {isInstalling ? (
                      <>
                        {downloadProgress > 0 && downloadProgress < 100 
                          ? `Downloading ${downloadProgress}%` 
                          : "Preparing..."}
                      </>
                    ) : (
                      <>
                        <Download size={20} />
                        {isLibraryContext ? "Update" : "Install Now"}
                      </>
                    )}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
