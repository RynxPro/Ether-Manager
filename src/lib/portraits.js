// Load all images from the character-portraits (ZZZ) and ww-characters (WW) folders
const zzzPortraits = import.meta.glob(
  "../assets/character-portraits/*.{png,jpg,jpeg,webp}",
  { eager: true, import: "default" },
);

const wwPortraits = import.meta.glob(
  "../assets/ww-characters/*.{png,jpg,jpeg,webp}",
  { eager: true, import: "default" },
);

const portraits = {
  zzmi: {},
  wwmi: {}
};

const processPortraits = (modules, gameId, prefixToRemove = "", suffixesToRemove = []) => {
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
      .replace(/\.(webp|png|jpg|jpeg)$/i, "")
      .replace(/[-_]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const entryName = cleanName.toLowerCase();
    
    portraits[gameId][entryName] = {
      url: modules[path],
      displayName: cleanName
    };
  }
};

processPortraits(zzzPortraits, "zzmi", "Agent_", ["_Portrait"]);
processPortraits(wwPortraits, "wwmi", "", ["_Full_Sprite", "_Model"]);

export function getAllCharacterNames(gameId) {
  const gId = (gameId || "").toLowerCase();
  const gamePortraits = portraits[gId] || {};
  return Object.values(gamePortraits).map(p => p.displayName).sort((a, b) => a.localeCompare(b));
}

export function getCharacterPortrait(characterName, gameId) {
  if (!characterName) return null;
  const normalized = characterName.toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const gId = (gameId || "").toLowerCase();

  // If gameId is provided, look only in that game
  if (gId && portraits[gId]) {
    const gamePortraits = portraits[gId];
    if (gamePortraits[normalized]) return gamePortraits[normalized].url;

    for (const [key, data] of Object.entries(gamePortraits)) {
      if (key.includes(normalized) || normalized.includes(key)) {
        return data.url;
      }
    }
    return null;
  }

  // Fallback: search all games (useful if gameId is unknown)
  for (const groupKey in portraits) {
    const gamePortraits = portraits[groupKey];
    if (gamePortraits[normalized]) return gamePortraits[normalized].url;
    for (const [key, data] of Object.entries(gamePortraits)) {
      if (key.includes(normalized) || normalized.includes(key)) {
        return data.url;
      }
    }
  }

  return null;
}
