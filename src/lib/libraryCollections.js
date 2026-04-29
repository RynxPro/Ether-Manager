import { getAllCharacterNames } from "./portraits";
import { getModClassification } from "./modClassification";

/**
 * Library-domain helpers.
 *
 * The library is not just "a list of mods". It is a set of local collections
 * built from classification rules plus local enable/disable state. This module
 * centralizes how those collections are grouped and filtered.
 */

export function buildLibraryCollections(mods, gameId) {
  const charactersMap = new Map();
  const globalMods = {
    ui: { name: "User Interface", totalMods: 0, enabledMods: 0, mods: [] },
    misc: { name: "Miscellaneous", totalMods: 0, enabledMods: 0, mods: [] },
  };

  getAllCharacterNames(gameId).forEach((name) => {
    charactersMap.set(name, {
      name,
      totalMods: 0,
      enabledMods: 0,
      mods: [],
    });
  });

  (mods || []).forEach((mod) => {
    const classification = getModClassification(mod);

    if (classification.bucket === "ui") {
      globalMods.ui.totalMods++;
      globalMods.ui.mods.push(mod);
      if (mod.isEnabled) globalMods.ui.enabledMods++;
      return;
    }

    if (classification.bucket === "misc") {
      globalMods.misc.totalMods++;
      globalMods.misc.mods.push(mod);
      if (mod.isEnabled) globalMods.misc.enabledMods++;
      return;
    }

    if (!charactersMap.has(classification.label)) {
      charactersMap.set(classification.label, {
        name: classification.label,
        totalMods: 0,
        enabledMods: 0,
        mods: [],
      });
    }

    const charData = charactersMap.get(classification.label);
    charData.totalMods++;
    charData.mods.push(mod);
    if (mod.isEnabled) charData.enabledMods++;
  });

  return {
    characters: Array.from(charactersMap.values())
      .filter((c) => c.name !== "Unassigned" || c.totalMods > 0)
      .sort((a, b) => {
        if (a.name === "Unassigned") return -1;
        if (b.name === "Unassigned") return 1;
        return a.name.localeCompare(b.name);
      }),
    ui: globalMods.ui.totalMods > 0 ? [globalMods.ui] : [],
    misc: globalMods.misc.totalMods > 0 ? [globalMods.misc] : [],
    counts: {
      characters: Array.from(charactersMap.values()).reduce(
        (acc, c) => acc + c.totalMods,
        0,
      ),
      ui: globalMods.ui.totalMods,
      misc: globalMods.misc.totalMods,
    },
  };
}

export function filterLibraryCollections(items, searchQuery) {
  const normalizedQuery = String(searchQuery || "").toLowerCase();
  if (!normalizedQuery) return items;

  return (items || []).filter((item) =>
    item.name.toLowerCase().includes(normalizedQuery),
  );
}
