import { useState, useEffect, useMemo, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { useAppStore } from "../store/useAppStore";
import { getAllCharacterNames } from "../lib/portraits";
import ImageLightbox from '../components/modals/ImageLightbox';
import ConfirmDialog from '../components/modals/ConfirmDialog';
import { createGbInstallSelection } from "../lib/installFlow";

import ModGallery from "./mod-detail/ModGallery";
import ModHeader from "./mod-detail/ModHeader";
import ModDescription from "./mod-detail/ModDescription";
import ModInstaller from "./mod-detail/ModInstaller";
import ModStats from "./mod-detail/ModStats";

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
  const [showReinstallConfirm, setShowReinstallConfirm] = useState(false);

  useEffect(() => {
    setLocalBookmarked(isBookmarked);
  }, [isBookmarked]);

  const downloadJob = useAppStore(
    useCallback((state) => state.downloads.find((d) => d.id === mod._idRow), [mod._idRow])
  );
  const isDownloading = downloadJob?.status === "downloading" || downloadJob?.status === "extracting";
  const nsfwMode = useAppStore((state) => state.nsfwMode);

  // Read live installed state directly from the global store
  const installedFileInfo = useAppStore(
    (state) => state.installedModsMap[game.id]?.[mod._idRow] ?? null
  );

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
  const effectiveSelectedCharacter = selectedCharacter || defaultSelectedCharacter;

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
      await onInstall(
        createGbInstallSelection({
          characterName: effectiveSelectedCharacter,
          mod,
          file: selectedFile,
          category: mod._aRootCategory?._sName || mod._aCategory?._sName || "Unknown",
        }),
      );
    } catch (err) {
      setError(err.message || "Installation failed.");
    }
  };

  const handleSetThumbnailUrl = async (url) => {
    if (!mod.localMod || !game || !window.electronConfig || !window.electronMods || !url) return;
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
    <motion.div className="w-full h-full bg-background overflow-y-auto custom-scrollbar flex flex-col">
      <button
        onClick={popPage}
        className="absolute top-6 left-6 z-50 flex items-center gap-2 px-4 py-2 rounded-full bg-black/50 border border-white/10 hover:bg-black/80 text-white backdrop-blur-md transition-all shadow-lg group"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        <span className="font-bold tracking-wider uppercase text-[11px]">Back</span>
      </button>

      <ModGallery
        images={images}
        blurHero={blurHero}
        setRevealedDetail={setRevealedDetail}
        setCurrentImgIndex={setCurrentImgIndex}
        setShowLightbox={setShowLightbox}
        isLibraryContext={isLibraryContext}
        mod={mod}
        handleSetThumbnailUrl={handleSetThumbnailUrl}
        handleSetThumbnail={handleSetThumbnail}
        isAddingThumbUrl={isAddingThumbUrl}
        setIsAddingThumbUrl={setIsAddingThumbUrl}
        customThumbUrl={customThumbUrl}
        setCustomThumbUrl={setCustomThumbUrl}
      />

      <div className="flex-1 w-full max-w-[1400px] mx-auto px-6 lg:px-12 py-10 flex flex-col xl:flex-row gap-12 relative">
        <div className="flex-1 flex flex-col min-w-0">
          <ModHeader
            mod={mod}
            game={game}
            isNsfw={isNsfw}
            localBookmarked={localBookmarked}
            installedFileInfo={installedFileInfo}
            pushPage={pushPage}
            onToggleBookmark={onToggleBookmark}
          />

          <ModDescription
            mod={mod}
            game={game}
            pushPage={pushPage}
            onToggleBookmark={onToggleBookmark}
          />
        </div>

        <div className="w-full xl:w-[380px] shrink-0">
          <div className="sticky top-10 flex flex-col gap-6">
            <ModInstaller
              mod={mod}
              game={game}
              characters={characters}
              effectiveSelectedCharacter={effectiveSelectedCharacter}
              setSelectedCharacter={setSelectedCharacter}
              error={error}
              localBookmarked={localBookmarked}
              setLocalBookmarked={setLocalBookmarked}
              onToggleBookmark={onToggleBookmark}
              isDownloading={isDownloading}
              downloadJob={downloadJob}
              installedFileInfo={installedFileInfo}
              handleInstall={handleInstall}
              isLibraryContext={isLibraryContext}
              isUpdating={isUpdating}
              setShowReinstallConfirm={setShowReinstallConfirm}
              selectedFile={selectedFile}
              setSelectedFile={setSelectedFile}
            />

            <ModStats mod={mod} />
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

      {showReinstallConfirm && (
        <ConfirmDialog
          title="Reinstall Mod"
          message={`Are you sure you want to download and overwrite the files for "${mod._sName}"?`}
          confirmText="Reinstall"
          cancelText="Cancel"
          onConfirm={() => {
            setShowReinstallConfirm(false);
            handleInstall();
          }}
          onCancel={() => setShowReinstallConfirm(false)}
        />
      )}
    </motion.div>
  );
}
