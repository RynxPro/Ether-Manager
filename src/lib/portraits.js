// Keep portrait metadata synchronous, but defer the asset URL import until needed.
const zzzPortraits = import.meta.glob(
  "../assets/character-portraits/*.{png,jpg,jpeg,webp}",
  { import: "default" },
);

const wwPortraits = import.meta.glob(
  "../assets/ww-characters/*.{png,jpg,jpeg,webp}",
  { import: "default" },
);

const genshinPortraits = import.meta.glob(
  "../assets/Genshin Splash Art/*.{png,jpg,jpeg,webp}",
  { import: "default" },
);

const portraits = {
  zzmi: {},
  wwmi: {},
  gimi: {},
  srmi: {},
  himi: {},
};

export const GLOBAL_CATEGORIES = ["User Interface", "Miscellaneous"];

export function isGlobalCategory(name) {
  return GLOBAL_CATEGORIES.some(cat => cat.toLowerCase() === (name || "").toLowerCase());
}

export function getGlobalCategories() {
  return GLOBAL_CATEGORIES;
}

function normalizePortraitName(name) {
  return (name || "")
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const processPortraits = (
  modules,
  gameId,
  prefixToRemove = "",
  suffixesToRemove = [],
) => {
  for (const path in modules) {
    const filename = path.split("/").pop();
    
    // Clean up filename to get a recognizable character name
    let cleanName = filename;
    
    // Remove prefix
    if (prefixToRemove) {
      cleanName = cleanName.replace(new RegExp(`^${prefixToRemove}`, "i"), "");
    }
    
    // Remove the first matching suffix from the list
    for (const suffix of suffixesToRemove) {
      const regex = new RegExp(`${suffix}\\.(webp|png|jpg|jpeg)$`, "i");
      if (regex.test(cleanName)) {
        cleanName = cleanName.replace(regex, "");
        break; 
      }
    }
    
    // Final cleanup of extension and formatting
    cleanName = cleanName
      .replace(/\.(webp|png|jpg|jpeg)$/i, "");

    // If name contains " - ", it's usually flavor text (e.g. "Amber - 5-Star Outrider")
    // Keep only the part before the dash for cleaner cards
    if (cleanName.includes(" - ")) {
      cleanName = cleanName.split(" - ")[0];
    }

    cleanName = cleanName
      .replace(/[-_]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const entryName = cleanName.toLowerCase();

    portraits[gameId][entryName] = {
      displayName: cleanName,
      loader: modules[path],
      url: null,
    };
  }
};

processPortraits(zzzPortraits, "zzmi", "Agent_", ["_Portrait"]);
processPortraits(wwPortraits, "wwmi", "", ["_Full_Sprite", "_Model"]);
processPortraits(genshinPortraits, "gimi", "", []);

export function getAllCharacterNames(gameId) {
  const gId = (gameId || "").toLowerCase();
  const gamePortraits = portraits[gId] || {};
  return Object.values(gamePortraits).map(p => p.displayName).sort((a, b) => a.localeCompare(b));
}

export function getPortraitCatalogStats(gameId) {
  const gId = (gameId || "").toLowerCase();
  const gamePortraits = portraits[gId] || {};
  const count = Object.keys(gamePortraits).length;

  return {
    count,
    hasCatalog: count > 0,
  };
}

function findCharacterPortraitEntry(characterName, gameId) {
  if (!characterName) return null;
  const normalized = normalizePortraitName(characterName);
  const gId = (gameId || "").toLowerCase();

  // If gameId is provided, look only in that game
  if (gId && portraits[gId]) {
    const gamePortraits = portraits[gId];
    if (gamePortraits[normalized]) return gamePortraits[normalized];

    for (const [key, data] of Object.entries(gamePortraits)) {
      if (key.includes(normalized) || normalized.includes(key)) {
        return data;
      }
    }
    return null;
  }

  // Fallback: search all games (useful if gameId is unknown)
  for (const groupKey in portraits) {
    const gamePortraits = portraits[groupKey];
    if (gamePortraits[normalized]) return gamePortraits[normalized];
    for (const [key, data] of Object.entries(gamePortraits)) {
      if (key.includes(normalized) || normalized.includes(key)) {
        return data;
      }
    }
  }

  return null;
}

export function getCharacterPortrait(characterName, gameId) {
  return findCharacterPortraitEntry(characterName, gameId)?.url || null;
}

export async function loadCharacterPortrait(characterName, gameId) {
  const entry = findCharacterPortraitEntry(characterName, gameId);
  if (!entry) return null;
  if (entry.url) return entry.url;

  const url = await entry.loader();
  entry.url = url;
  return url;
}
