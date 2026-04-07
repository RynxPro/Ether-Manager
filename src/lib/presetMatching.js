function normalizeFolderName(value) {
  return String(value || "").replace(/^DISABLED_/, "").trim();
}

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
