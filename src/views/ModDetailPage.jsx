import { useState, useEffect, useMemo, useCallback } from "react";
import { ImageIcon, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { useAppStore } from "../store/useAppStore";
import { getAllCharacterNames } from "../lib/portraits";
import ImageLightbox from '../components/modals/ImageLightbox';
import ConfirmDialog from '../components/modals/ConfirmDialog';
import { createGbInstallSelection } from "../lib/installFlow";
import { useFetchCache } from "../hooks/useFetchCache";

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
  mod: initialMod,
  game,
  onInstall,
  isBookmarked = false,
  onToggleBookmark,
  preSelectedCharacter = "",
  isUpdating = false,
  isLibraryContext = false,
  onThumbnailChange,
  onAssign,
}) {
  const popPage = useAppStore(state => state.popPage);
  const pushPage = useAppStore(state => state.pushPage);
  const { fetchMod } = useFetchCache();

  const [mod, setMod] = useState(initialMod);
  const [isLoadingFull, setIsLoadingFull] = useState(!initialMod._sText && !initialMod.isImported && !!initialMod._idRow);
  const [selectedFile, setSelectedFile] = useState(initialMod._aFiles?.[0] || null);

  useEffect(() => {
    let mounted = true;
    if (!initialMod._sText && !initialMod.isImported && initialMod._idRow) {
      fetchMod(initialMod._idRow).then((res) => {
        if (!mounted) return;
        if (res?.success && res.data) {
          setMod(res.data);
          setSelectedFile(res.data._aFiles?.[0] || null);
        }
        setIsLoadingFull(false);
      });
    } else {
      setIsLoadingFull(false);
    }
    return () => { mounted = false; };
  }, [initialMod, fetchMod]);

  const [selectedCharacter, setSelectedCharacter] = useState(
    preSelectedCharacter || "",
  );
  const [currentImgIndex, setCurrentImgIndex] = useState(0);
  const [error, setError] = useState(null);
  const [revealedDetail, setRevealedDetail] = useState(false);
  const [isAddingThumbUrl, setIsAddingThumbUrl] = useState(false);
  const [customThumbUrl, setCustomThumbUrl] = useState("");
  const [showLightbox, setShowLightbox] = useState(false);
  const [localBookmarked, setLocalBookmarked] = useState(isBookmarked);
  const [showReinstallConfirm, setShowReinstallConfirm] = useState(false);
  const [reinstallError, setReinstallError] = useState(null);

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
    // Optionally reset state on image change
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

  /**
   * Reinstall flow — handles both Browse context (selectedFile is set from GB API)
   * and Library context (local mod with no _aFiles, must fetch from GB).
   */
  const handleReinstall = async () => {
    setReinstallError(null);

    // If we already have a selected file (Browse context), just install it
    if (selectedFile) {
      return handleInstall();
    }

    // Library context: mod is a local record, need to fetch from GB
    const gbId = mod.gamebananaId || mod._idRow;
    if (!gbId) {
      setReinstallError("This mod has no GameBanana ID — cannot re-download.");
      return;
    }

    try {
      const result = await fetchMod(gbId);
      if (!result.success || !result.data?._aFiles?.length) {
        setReinstallError("Could not fetch mod files from GameBanana.");
        return;
      }

      // Find the exact file version that was originally installed
      const files = result.data._aFiles;
      const installedFileId = installedFileInfo?.installedFiles?.[0]?.gbFileId;
      let fileToInstall = installedFileId
        ? files.find(f => Number(f._idRow) === Number(installedFileId))
        : null;

      // Fall back to newest file if original version not found
      if (!fileToInstall) {
        fileToInstall = [...files].sort((a, b) => (b._tsDateAdded || 0) - (a._tsDateAdded || 0))[0];
      }

      await onInstall(
        createGbInstallSelection({
          characterName: effectiveSelectedCharacter,
          mod: result.data,
          file: fileToInstall,
          category: result.data._aRootCategory?._sName || result.data._aCategory?._sName || "Unknown",
        }),
      );
    } catch (err) {
      setReinstallError(err.message || "Reinstall failed.");
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
    <motion.div className="w-full h-full bg-background flex flex-col relative overflow-hidden">

      <div className="flex-1 w-full overflow-y-auto custom-scrollbar flex flex-col">
        <ModGallery
          images={images}
          blurHero={blurHero}
          setRevealedDetail={setRevealedDetail}
          setCurrentImgIndex={setCurrentImgIndex}
          setShowLightbox={setShowLightbox}
          isLibraryContext={isLibraryContext}
          mod={mod}
          handleSetThumbnailUrl={handleSetThumbnailUrl}
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
              onInstall={onInstall}
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
                isLoadingFull={isLoadingFull}
                onAssign={async (modToAssign, newChar) => {
                  if (onAssign) {
                    const success = await onAssign(modToAssign, newChar);
                    if (success) {
                      popPage();
                    }
                  }
                }}
              />

              <ModStats mod={mod} />
            </div>
          </div>
        </div>
      </div>

      {showLightbox && (
        <ImageLightbox
          images={images}
          currentIndex={currentImgIndex}
          onClose={() => setShowLightbox(false)}
          onIndexChange={setCurrentImgIndex}
          customControls={
            isLibraryContext && mod.localMod ? (
              <>
                {mod.localMod.customThumbnail && (
                  <button
                    onClick={() => handleSetThumbnailUrl(null)}
                    title="Clear custom thumbnail and use default"
                    className="py-2 px-4 rounded-full bg-red-500/80 text-white text-xs font-bold hover:bg-red-600 transition-all border border-red-500/30 flex items-center gap-2 shadow-lg backdrop-blur-md"
                  >
                    <Trash2 size={14} /> Clear Cover
                  </button>
                )}
                <button
                  onClick={handleSetThumbnail}
                  title="Use this image as the thumbnail in your library"
                  className="py-2 px-4 rounded-full bg-black/60 text-white text-xs font-bold hover:bg-primary hover:text-black transition-all border border-white/10 flex items-center gap-2 shadow-lg backdrop-blur-md"
                >
                  <ImageIcon size={14} /> Set as Thumbnail
                </button>
              </>
            ) : null
          }
        />
      )}

      <ConfirmDialog
        isOpen={showReinstallConfirm}
        title="Reinstall Mod"
        message={`Are you sure you want to download and overwrite the files for "${mod._sName || mod.name}"?`}
        confirmText="Reinstall"
        cancelText="Cancel"
        onConfirm={() => {
          setShowReinstallConfirm(false);
          setReinstallError(null);
          handleReinstall();
        }}
        onCancel={() => {
          setShowReinstallConfirm(false);
          setReinstallError(null);
        }}
      >        
        {reinstallError && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
            {reinstallError}
          </div>
        )}
      </ConfirmDialog>
    </motion.div>
  );
}
