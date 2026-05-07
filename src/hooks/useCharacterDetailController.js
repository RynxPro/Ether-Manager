import { useState } from "react";

import { useAppStore } from "../store/useAppStore";
import { useCharacterCollectionData } from "./useCharacterCollectionData";
import { useCharacterCollectionActions } from "./useCharacterCollectionActions";

export function useCharacterDetailController({
  character,
  hideHeader = false,
  searchQuery = "",
}) {
  const game = useAppStore((state) => state.activeGame);
  const [localSearchQuery, setLocalSearchQuery] = useState("");
  const {
    mods,
    gbDataMap,
    installedModsInfo,
    reloadAllMods,
    setAllMods,
  } = useCharacterCollectionData({
    gameId: game.id,
    characterName: character.name,
  });
  const {
    modToDelete,
    disablingAll,
    showDeleteConfirm,
    handleToggle,
    handleDisableAll,
    handleOpenFolder,
    handleImport,
    handleInstallUpdate,
    handleAssign,
    handleDelete,
    confirmDelete,
    closeDeleteConfirm,
  } = useCharacterCollectionActions({
    game,
    characterName: character.name,
    mods,
    setAllMods,
    reloadAllMods,
  });

  const enabledCount = mods.filter((mod) => mod.isEnabled).length;
  const disabledCount = mods.length - enabledCount;
  const effectiveSearchQuery = hideHeader ? searchQuery : localSearchQuery;

  return {
    game,
    mods,
    gbDataMap,
    installedModsInfo,
    disablingAll,
    modToDelete,
    showDeleteConfirm,
    localSearchQuery,
    setLocalSearchQuery,
    enabledCount,
    disabledCount,
    effectiveSearchQuery,
    handleToggle,
    handleDisableAll,
    handleOpenFolder,
    handleImport,
    handleInstallUpdate,
    handleAssign,
    handleDelete,
    confirmDelete,
    closeDeleteConfirm,
    reloadAllMods,
  };
}
