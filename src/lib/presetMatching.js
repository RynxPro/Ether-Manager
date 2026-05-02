function normalizeFolderName(value) {
  return String(value || "").replace(/^DISABLED_/, "").trim();
}

/**
 * Preset-domain helpers.
 *
 * This module is the renderer-side source of truth for:
 * - how library mods are serialized into preset entries
 * - how preset mods match library mods
 * - how apply/review diffs are computed
 *
 * The Electron preset service remains the source of truth for on-disk apply
 * semantics and transactional renames.
 */

function buildPresetModKeys(presetMod) {
  return new Set(
    [presetMod?.modId, presetMod?.originalFolderName]
      .map(normalizeFolderName)
      .filter(Boolean),
  );
}

function buildLibraryModKeys(libraryMod) {
  return new Set(
    [libraryMod?.id, libraryMod?.originalFolderName]
      .map(normalizeFolderName)
      .filter(Boolean),
  );
}

export function matchesPresetMod(libraryMod, presetMod) {
  const presetKeys = buildPresetModKeys(presetMod);
  if (presetKeys.size === 0) {
    return false;
  }

  const libraryKeys = buildLibraryModKeys(libraryMod);
  for (const key of presetKeys) {
    if (libraryKeys.has(key)) {
      return true;
    }
  }

  return false;
}

export function findMatchingLibraryMod(libraryMods, presetMod) {
  return (libraryMods || []).find((libraryMod) =>
    matchesPresetMod(libraryMod, presetMod),
  );
}

export function getMissingPresetMods(presetMods, libraryMods) {
  return (presetMods || []).filter(
    (presetMod) => !findMatchingLibraryMod(libraryMods, presetMod),
  );
}

export function createPresetModFromLibraryMod(libraryMod, getDisplayCharacter) {
  return {
    modId: libraryMod.id,
    originalFolderName: libraryMod.originalFolderName,
    character: getDisplayCharacter(libraryMod),
    category: libraryMod.category || null,
    name: libraryMod.name,
    gamebananaId: libraryMod.gamebananaId || null,
    gbFileId: libraryMod.gbFileId || null,
    customThumbnail: libraryMod.customThumbnail || null,
  };
}

export function reconcilePresetModsWithLibrary(
  presetMods,
  libraryMods,
  getDisplayCharacter,
) {
  let changed = false;

  const reconciled = (presetMods || []).map((presetMod) => {
    const libraryMod = findMatchingLibraryMod(libraryMods, presetMod);
    if (!libraryMod) {
      return presetMod;
    }

    const nextPresetMod = {
      ...presetMod,
      originalFolderName:
        libraryMod.originalFolderName || presetMod.originalFolderName,
      name: libraryMod.name || presetMod.name,
      category: libraryMod.category || presetMod.category || null,
      character: getDisplayCharacter(libraryMod),
      gamebananaId: libraryMod.gamebananaId || presetMod.gamebananaId || null,
      customThumbnail:
        libraryMod.customThumbnail || presetMod.customThumbnail || null,
    };

    if (JSON.stringify(nextPresetMod) !== JSON.stringify(presetMod)) {
      changed = true;
    }

    return nextPresetMod;
  });

  return {
    changed,
    mods: reconciled,
  };
}

export function buildPresetDiff(presetMods, libraryMods, scope = "scoped") {
  const affectedCharacters = new Set((presetMods || []).map((mod) => mod.character));
  const willEnable = [];
  const willDisable = [];
  const notFound = [];

  for (const presetMod of presetMods || []) {
    const existingMod = findMatchingLibraryMod(libraryMods, presetMod);
    if (!existingMod) {
      notFound.push(presetMod);
    } else if (!existingMod.isEnabled) {
      willEnable.push(existingMod);
    }
  }

  for (const libraryMod of libraryMods || []) {
    if (!libraryMod.isEnabled) {
      continue;
    }

    if (scope === "scoped" && !affectedCharacters.has(libraryMod.character)) {
      continue;
    }
    if (scope === "layered") {
      continue; // Layered disables nothing
    }

    const isPartOfPreset = (presetMods || []).some((presetMod) =>
      matchesPresetMod(libraryMod, presetMod),
    );
    if (!isPartOfPreset) {
      willDisable.push(libraryMod);
    }
  }

  return { willEnable, willDisable, notFound };
}
