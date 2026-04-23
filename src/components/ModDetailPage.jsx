import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Download,
  Check,
  Bookmark,
  Heart,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  User,
  ExternalLink,
  Calendar,
  RefreshCw,
  Star,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "../store/useAppStore";
import { getAllCharacterNames } from "../lib/portraits";
import { cn } from "../lib/utils";
import SearchableDropdown from "./SearchableDropdown";
import { sanitizeHtml } from "../lib/sanitizeHtml";
import ImageLightbox from "./ImageLightbox";
import UpdateBadge from "./UpdateBadge";

function inferCharacterFromMod(mod, characters) {
  const cats = [
    mod._aRootCategory?._sName,
    mod._aCategory?._sName,
    mod._aSubCategory?._sName,
  ].filter(Boolean).map(c => c.toLowerCase());

  // 1. UI Mapping
  const uiKeywords = ["gui", "ui", "user interface", "hud", "menus", "loading screens"];
  if (cats.some(c => uiKeywords.some(kw => c.includes(kw)))) {
    return "User Interface";
  }

  // 2. Misc / Audio Mapping
  const miscKeywords = ["scripts", "utilities", "tools", "fixes", "misc", "miscellaneous", "audio", "sounds", "sfx", "bgm", "music", "voice", "weapons", "items", "effects"];
  if (cats.some(c => miscKeywords.some(kw => c.includes(kw)))) {
    return "Miscellaneous";
  }

  // 3. Exact or Partial Category Match for Characters
  for (const character of characters) {
    if (character === "User Interface" || character === "Miscellaneous") continue;
    const charLower = character.toLowerCase();
    if (cats.some(c => c.includes(charLower))) {
      return character;
    }
  }

  // 4. Mod Name Match for Characters (Word boundary check)
  const modName = (mod._sName || "").toLowerCase();
  for (const character of characters) {
    if (character === "User Interface" || character === "Miscellaneous") continue;
    const charLower = character.toLowerCase();
    const regex = new RegExp(`\\b${charLower}\\b`, 'i');
    if (regex.test(modName)) {
      return character;
    }
  }

  return "";
}

export default function ModDetailPage({
  mod,
  game,
  onClose,
  onInstall,
  installedFileInfo,
  isBookmarked = false,
  onToggleBookmark,
  preSelectedCharacter = "",
  isUpdating = false,
  isLibraryContext = false,
  onThumbnailChange,
}) {
  const popPage = useAppStore(state => state.popPage);
  const pushPage = useAppStore(state => state.pushPage);
  
  const [selectedFile, setSelectedFile] = useState(mod._aFiles?.[0] || null);
  const [selectedCharacter, setSelectedCharacter] = useState(
    preSelectedCharacter || "",
  );
  const [currentImgIndex, setCurrentImgIndex] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [revealedDetail, setRevealedDetail] = useState(false);
  const [isAddingThumbUrl, setIsAddingThumbUrl] = useState(false);
  const [customThumbUrl, setCustomThumbUrl] = useState("");
  const [showLightbox, setShowLightbox] = useState(false);
  const [localBookmarked, setLocalBookmarked] = useState(isBookmarked);

  useEffect(() => {
    setLocalBookmarked(isBookmarked);
  }, [isBookmarked]);

  const downloadJob = useAppStore(
    useCallback((state) => state.downloads.find((d) => d.id === mod._idRow), [mod._idRow])
  );
  const isDownloading = downloadJob?.status === "downloading" || downloadJob?.status === "extracting";
  const nsfwMode = useAppStore((state) => state.nsfwMode);

  const isNsfw = !!mod._bHasContentRatings;
  const blurHero = isNsfw && nsfwMode === "blur" && !revealedDetail;

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

  const formatDate = (unixSeconds) => {
    if (!unixSeconds) return "Unknown";
    return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  useEffect(() => {
    // We do NOT disable body scroll anymore because this IS the page, and we want it to scroll.
    // However, if the parent (App.jsx) has overflow hidden, we ensure this div scrolls.
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
      await onInstall({
        characterName: effectiveSelectedCharacter,
        gbModId: mod._idRow,
        fileUrl: selectedFile._sDownloadUrl,
        fileName: selectedFile._sFile,
        gbFileId: selectedFile._idRow,
        fileAddedAt: selectedFile._tsDateAdded,
        modVersion: mod._sVersion,
        modName: mod._sName,
        category:
          mod._aRootCategory?._sName || mod._aCategory?._sName || "Unknown",
      });
      // Optionally close the page after install, but keeping it open is fine for a store page.
      // onClose();
    } catch (err) {
      setError(err.message || "Installation failed.");
    }
  };

  const handleSetThumbnailUrl = async (url) => {
    if (
      !mod.localMod ||
      !game ||
      !window.electronConfig ||
      !window.electronMods ||
      !url
    )
      return;
    try {
      const config = await window.electronConfig.getConfig();
      const importerPath = config[game.id];
      if (!importerPath) return;

      const result = await window.electronMods.setCustomThumbnail({
        importerPath,
        originalFolderName: mod.localMod.originalFolderName,
        thumbnailUrl: url,
      });

      if (result.success && onThumbnailChange) {
        onThumbnailChange(url);
      }
      setIsAddingThumbUrl(false);
      setCustomThumbUrl("");
    } catch (err) {
      console.error("Failed to set custom thumbnail", err);
    }
  };

  const handleSetThumbnail = () => handleSetThumbnailUrl(images[currentImgIndex]);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="fixed top-0 bottom-0 right-0 left-72 z-50 bg-background overflow-y-auto custom-scrollbar flex flex-col"
    >
      {/* Back Button */}
      <button
        onClick={popPage}
        className="absolute top-6 left-6 z-50 flex items-center gap-2 px-4 py-2 rounded-full bg-black/50 border border-white/10 hover:bg-black/80 text-white backdrop-blur-md transition-all shadow-lg group"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        <span className="font-bold tracking-wider uppercase text-[11px]">Back</span>
      </button>

      {/* 1. Hero Image Grid */}
      <div className="w-full max-w-[1400px] mx-auto px-6 lg:px-12 pt-20">
        <div className="relative w-full h-[50vh] min-h-[400px] max-h-[600px] rounded-[2rem] overflow-hidden bg-black/20 shadow-2xl border border-white/5">
          {images.length > 0 ? (
            <>
              {blurHero ? (
                <>
                  <div 
                    className="absolute inset-0 bg-cover bg-center blur-3xl opacity-30 transform scale-110"
                    style={{ backgroundImage: `url(${images[0]})` }}
                  />
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-sm">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20 border border-red-500/30">
                      <EyeOff size={32} className="text-red-400" />
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-black uppercase tracking-widest text-red-500">Classified</p>
                      <p className="mt-2 text-sm text-white/50">This mod contains potentially explicit content.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRevealedDetail(true)}
                      className="mt-4 flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-8 py-3 text-sm font-bold text-red-100 transition-colors hover:bg-red-500/20 shadow-[0_0_20px_rgba(239,68,68,0.2)]"
                    >
                      <Eye size={16} /> Reveal Content
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {(() => {
                    const gridImages = images.slice(0, 5);
                    const handleImageClick = (idx) => {
                      setCurrentImgIndex(idx);
                      setShowLightbox(true);
                    };

                    const renderImg = (src, idx, extraClass = "") => (
                      <div 
                        key={idx}
                        className={cn("relative overflow-hidden group cursor-pointer bg-[#0a0a0a]", extraClass)}
                        onClick={() => handleImageClick(idx)}
                      >
                        <img 
                          src={src} 
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />
                      </div>
                    );

                    if (gridImages.length === 1) {
                      return renderImg(gridImages[0], 0, "w-full h-full");
                    }
                    if (gridImages.length === 2) {
                      return (
                        <div className="grid grid-cols-2 gap-2 h-full">
                          {renderImg(gridImages[0], 0)}
                          {renderImg(gridImages[1], 1)}
                        </div>
                      );
                    }
                    if (gridImages.length === 3) {
                      return (
                        <div className="grid grid-cols-3 gap-2 h-full">
                          {renderImg(gridImages[0], 0, "col-span-2")}
                          <div className="flex flex-col gap-2">
                            {renderImg(gridImages[1], 1, "h-1/2")}
                            {renderImg(gridImages[2], 2, "h-1/2")}
                          </div>
                        </div>
                      );
                    }
                    if (gridImages.length === 4) {
                      return (
                        <div className="grid grid-cols-3 grid-rows-2 gap-2 h-full">
                          {renderImg(gridImages[0], 0, "col-span-2 row-span-2")}
                          {renderImg(gridImages[1], 1, "col-span-1 row-span-1")}
                          <div className="grid grid-cols-2 gap-2 col-span-1 row-span-1">
                            {renderImg(gridImages[2], 2)}
                            {renderImg(gridImages[3], 3)}
                          </div>
                        </div>
                      );
                    }
                    
                    return (
                      <div className="grid grid-cols-4 grid-rows-2 gap-2 h-full">
                        {renderImg(gridImages[0], 0, "col-span-2 row-span-2")}
                        {renderImg(gridImages[1], 1, "col-span-1 row-span-1")}
                        {renderImg(gridImages[2], 2, "col-span-1 row-span-1")}
                        {renderImg(gridImages[3], 3, "col-span-1 row-span-1")}
                        {renderImg(gridImages[4], 4, "col-span-1 row-span-1")}
                      </div>
                    );
                  })()}

                  {images.length > 5 && (
                    <button
                      onClick={() => {
                        setCurrentImgIndex(5);
                        setShowLightbox(true);
                      }}
                      className="absolute bottom-6 right-6 z-20 flex items-center gap-2 px-4 py-2.5 bg-black/70 hover:bg-black text-white font-black text-xs uppercase tracking-widest rounded-xl backdrop-blur-md border border-white/10 transition-colors shadow-lg group"
                    >
                      <ImageIcon size={16} />
                      Show all {images.length} photos
                    </button>
                  )}
                </>
              )}

              {/* Custom Cover Controls (Top Right) */}
              {isLibraryContext && mod.localMod && (
                <div className="absolute top-6 right-6 z-20 flex gap-2">
                  {mod.localMod.customThumbnail && (
                    <button
                      onClick={() => handleSetThumbnailUrl(null)}
                      title="Clear custom thumbnail and use default"
                      className="py-2 px-4 rounded-full bg-red-500/80 text-white text-xs font-bold hover:bg-red-600 transition-all border border-red-500/30 flex items-center gap-2 shadow-lg backdrop-blur-md"
                    >
                      <Trash2 size={14} /> Clear
                    </button>
                  )}
                  <button
                    onClick={handleSetThumbnail}
                    title="Use this image as the thumbnail in your library"
                    className="py-2 px-4 rounded-full bg-black/60 text-white text-xs font-bold hover:bg-primary hover:text-black transition-all border border-white/10 flex items-center gap-2 shadow-lg backdrop-blur-md"
                  >
                    <ImageIcon size={14} /> Set as Thumbnail
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full relative flex flex-col items-center justify-center bg-black/20 text-white/20 p-8">
              {/* Custom URL Form overlay if no images */}
              {!isAddingThumbUrl ? (
                 <>
                   <ImageIcon size={48} className="mb-4 opacity-30" />
                   <p className="font-semibold text-lg mb-4">No images available</p>
                   {isLibraryContext && mod.localMod && (
                     <button
                       onClick={() => setIsAddingThumbUrl(true)}
                       className="py-2.5 px-6 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 text-white text-sm font-bold transition-all flex items-center gap-2 shadow-lg"
                     >
                       <ImageIcon size={16} className="opacity-70" /> Add Custom Cover Link
                     </button>
                   )}
                 </>
              ) : (
                <div className="w-full max-w-md flex flex-col gap-3 bg-black/50 p-6 rounded-2xl border border-white/10 backdrop-blur-xl">
                  <p className="text-xs font-black text-white uppercase tracking-widest text-center mb-1">Set Custom Cover Link</p>
                  <input
                    autoFocus
                    type="url"
                    placeholder="Paste image URL (Discord, Imgur, etc)..."
                    value={customThumbUrl}
                    onChange={e => setCustomThumbUrl(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && customThumbUrl.trim()) handleSetThumbnailUrl(customThumbUrl.trim());
                      else if (e.key === "Escape") setIsAddingThumbUrl(false);
                    }}
                    className="w-full px-4 py-3 bg-black/80 border border-white/20 rounded-xl text-sm text-white focus:outline-hidden focus:border-primary/50 shadow-inner"
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <button onClick={() => setIsAddingThumbUrl(false)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold hover:bg-white/5 text-white/50 transition-colors">
                      Cancel
                    </button>
                    <button onClick={() => { if (customThumbUrl.trim()) handleSetThumbnailUrl(customThumbUrl.trim()); }} className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 transition-colors">
                      Save Cover
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 2. Content Grid */}
      <div className="flex-1 w-full max-w-[1400px] mx-auto px-6 lg:px-12 py-10 flex flex-col xl:flex-row gap-12 relative">
        
        {/* LEFT COLUMN: Main Info */}
        <div className="flex-1 flex flex-col min-w-0">
          
          {/* Header Info */}
          <div className="flex flex-col mb-8">
             <div className="mb-4 flex flex-wrap items-center gap-2">
                <div className="rounded-full border border-border bg-background px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-text-muted shadow-sm">
                  {mod._aSubCategory?._sName || mod._aRootCategory?._sName || mod._aCategory?._sName || "Mod"}
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
                <h1 className="text-4xl lg:text-5xl font-black text-white leading-tight tracking-tight drop-shadow-sm" title={mod._sName}>
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
                      onClick={() => window.electronConfig?.openExternal(`https://gamebanana.com/mods/${mod._idRow}`)}
                      className="shrink-0 p-2.5 rounded-full border border-white/10 bg-white/5 text-text-muted hover:text-white hover:bg-white/10 hover:border-white/20 transition-all flex items-center justify-center shadow-sm group"
                      title="View on GameBanana"
                    >
                      <ExternalLink size={16} className="group-hover:scale-110 transition-transform" />
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
                          component: 'CreatorProfile',
                          props: {
                            creator: mod._aSubmitter,
                            game,
                            installedModsInfo: {},
                            bookmarkIds: [],
                            onToggleBookmark,
                          }
                        });
                      }}
                      className="flex items-center gap-3 group/creator transition-colors hover:text-primary rounded-xl px-2 py-1 -ml-2"
                    >
                      <div className="relative w-8 h-8 rounded-full overflow-hidden bg-white/10 border border-white/5 flex items-center justify-center shrink-0 shadow-sm">
                        {(mod._aSubmitter._sHdAvatarUrl || mod._aSubmitter._sAvatarUrl) ? (
                          <img src={mod._aSubmitter._sHdAvatarUrl || mod._aSubmitter._sAvatarUrl} alt="Creator" className="w-full h-full object-cover" />
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
                      <span className="font-semibold text-text-muted text-base">Unknown</span>
                    </div>
                  )}

                  {/* Dates */}
                  <div className="flex items-center gap-4 border-l border-border pl-5">
                    <div className="flex items-center gap-2 text-xs font-medium" title="Date Added">
                      <Calendar size={14} className="opacity-50" />
                      <span>{formatDate(mod._tsDateAdded)}</span>
                    </div>
                    {mod._tsDateUpdated > mod._tsDateAdded && (
                      <div className="flex items-center gap-2 text-xs font-medium text-primary/80" title="Last Updated">
                        <RefreshCw size={14} />
                        <span>{formatDate(mod._tsDateUpdated)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
          </div>

          {/* Description Container */}
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
                      : safeDescriptionHtml 
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
                                component: 'CreatorProfile',
                                props: {
                                  creator: author,
                                  game,
                                  installedModsInfo: {},
                                  bookmarkIds: [],
                                  onToggleBookmark,
                                }
                              });
                            }}
                            className="flex items-center gap-3 rounded-xl border border-white/5 bg-background px-3 py-2.5 text-sm font-semibold text-text-secondary transition-colors hover:border-primary/30 hover:text-primary hover:bg-white/5 shadow-sm"
                          >
                            {(author._sAvatarUrl) ? (
                              <img
                                src={author._sAvatarUrl}
                                alt={author._sName}
                                className="h-8 w-8 rounded-full object-cover border border-white/10"
                              />
                            ) : (
                              <div className="h-8 w-8 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                                <User size={14} className="text-white/30" />
                              </div>
                            )}
                            <div className="flex flex-col items-start min-w-0">
                               <span className="truncate w-full text-left">{author._sName}</span>
                               {author._sRole && (
                                 <span className="opacity-50 text-[10px] uppercase tracking-wider truncate w-full text-left">{author._sRole}</span>
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
        </div>

        {/* RIGHT COLUMN: Sticky Actions */}
        <div className="w-full xl:w-[380px] shrink-0">
          <div className="sticky top-10 flex flex-col gap-6">
             
             {/* Action Card */}
             <div className="bg-surface border border-border rounded-2xl p-6 shadow-xl flex flex-col relative overflow-hidden">
                {/* Subtle background glow */}
                <div className="absolute top-0 right-0 w-full h-32 bg-linear-to-b from-primary/10 to-transparent opacity-50 pointer-events-none" />

                <div className="relative z-10">
                  <h3 className="text-sm font-bold text-text-primary mb-4">Installation</h3>
                  
                  <div className="mb-5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-2 block">Target Folder</label>
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

                  <div className="flex items-center gap-3 w-full mb-6">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setLocalBookmarked(!localBookmarked);
                        onToggleBookmark?.(mod);
                      }}
                      className={cn(
                        "flex shrink-0 items-center justify-center p-4 rounded-xl transition-all border shadow-sm",
                        localBookmarked ? "bg-primary/20 border-primary/50 text-primary" : "bg-white/5 border-white/10 text-white hover:bg-white/10"
                      )}
                      title={localBookmarked ? "Remove Bookmark" : "Save Bookmark"}
                    >
                      <Bookmark size={20} className={cn(localBookmarked && "fill-primary")} />
                    </button>
                    {!mod.isImported && (
                      <button
                        onClick={(e) => {
                          if (isDownloading) e.preventDefault();
                          else handleInstall();
                        }}
                        disabled={!effectiveSelectedCharacter || (isLibraryContext && !isUpdating) || isDownloading}
                        className={cn(
                          "flex-1 relative overflow-hidden flex items-center justify-center gap-2 py-4 rounded-xl font-black text-base transition-all uppercase tracking-wider shadow-lg",
                          isDownloading 
                            ? "bg-primary/20 text-primary border border-primary/30 cursor-not-allowed"
                            : isLibraryContext && !isUpdating
                            ? "bg-white/5 text-gray-600 cursor-not-allowed border border-white/5"
                            : "bg-primary text-black hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                        )}
                      >
                        {isDownloading && (
                          <div 
                            className="absolute inset-y-0 left-0 bg-white/20 transition-all duration-300 ease-linear"
                            style={{ width: `${downloadJob.percent}%` }}
                          />
                        )}

                        <div className="relative z-10 flex items-center gap-2">
                          <Download size={20} className={cn(isDownloading && "animate-bounce")} />
                          {isDownloading 
                            ? (downloadJob.status === "extracting" ? "Extracting..." : `${downloadJob.percent}%`) 
                            : isLibraryContext ? "Update Mod" : "Install Mod"}
                        </div>
                      </button>
                    )}
                  </div>

                  {/* Files Selection */}
                  {!mod.isImported && mod._aFiles?.length > 0 && (
                    <div className="pt-5 border-t border-white/5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-3 block">Available Files ({mod._aFiles.length})</label>
                      <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                        {mod._aFiles.map((file) => {
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
                                "w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left group",
                                selectedFile?._idRow === file._idRow
                                  ? "bg-primary/10 border-primary/50 text-text-primary shadow-inner"
                                  : "bg-background border-border text-text-muted hover:border-white/20 hover:bg-white/5"
                              )}
                            >
                              <div className="flex-1 min-w-0 mr-3">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                  <p className={cn("text-sm font-semibold truncate transition-colors", selectedFile?._idRow === file._idRow ? "text-primary" : "text-text-primary group-hover:text-white")}>{file._sFile}</p>
                                  {isInstalled && (isOutdated ? (
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
                                  <p className="text-[10px] text-text-muted mb-1.5 line-clamp-2 leading-relaxed" 
                                     dangerouslySetInnerHTML={{ __html: sanitizeHtml(file._sDescription) }} />
                                )}
                                <p className="text-[10px] font-mono opacity-60">{(file._nFilesize / 1024 / 1024).toFixed(1)} MB</p>
                              </div>
                              <div className={cn("shrink-0 h-5 w-5 rounded-full border flex items-center justify-center transition-all", selectedFile?._idRow === file._idRow ? "bg-primary border-primary text-black" : "border-white/10 text-transparent")}>
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

             {/* Stats Card */}
             {!mod.isImported && (
               <div className="bg-surface border border-border rounded-2xl p-6 shadow-md">
                  <h3 className="text-sm font-bold text-text-primary mb-4">Statistics</h3>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col items-center justify-center bg-background border border-white/5 rounded-xl p-3">
                      <Heart size={16} className="text-primary mb-1.5" />
                      <span className="text-sm font-bold text-white">{mod._nLikeCount?.toLocaleString() || 0}</span>
                      <span className="text-[9px] uppercase tracking-wider text-text-muted mt-0.5">Likes</span>
                    </div>
                    <div className="flex flex-col items-center justify-center bg-background border border-white/5 rounded-xl p-3">
                      <Download size={16} className="text-blue-400 mb-1.5" />
                      <span className="text-sm font-bold text-white">{mod._nDownloadCount?.toLocaleString() || 0}</span>
                      <span className="text-[9px] uppercase tracking-wider text-text-muted mt-0.5">Downloads</span>
                    </div>
                    <div className="flex flex-col items-center justify-center bg-background border border-white/5 rounded-xl p-3">
                      <Eye size={16} className="text-purple-400 mb-1.5" />
                      <span className="text-sm font-bold text-white">{mod._nViewCount?.toLocaleString() || 0}</span>
                      <span className="text-[9px] uppercase tracking-wider text-text-muted mt-0.5">Views</span>
                    </div>
                  </div>
               </div>
             )}

          </div>
        </div>

      </div>

      {showLightbox && (
        <ImageLightbox
          images={images}
          currentIndex={currentImgIndex}
          onClose={() => setShowLightbox(false)}
          onIndexChange={setCurrentImgIndex}
        />
      )}
    </motion.div>
  );
}
