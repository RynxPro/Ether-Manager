// Load all images from the character-portraits folder
const portraitModules = import.meta.glob(
  "../assets/character-portraits/*.{png,jpg,jpeg,webp}",
  { eager: true, import: "default" },
);

const portraits = {};

for (const path in portraitModules) {
  const filename = path.split("/").pop();

  // Clean up filename to get a recognizable character name
  // Handles ZZZ format: "Agent_Name_Portrait.webp" -> "name"
  let name = filename
    .replace(/^Agent_/, "")
    .replace(/_Portrait\.(webp|png|jpg|jpeg)$/, "")
    .replace(/\.(webp|png|jpg|jpeg)$/, "")
    .replace(/_/g, " ")
    .toLowerCase();

  portraits[name] = {
    url: portraitModules[path],
    displayName: filename
      .replace(/^Agent_/, "")
      .replace(/_Portrait\.(webp|png|jpg|jpeg)$/, "")
      .replace(/\.(webp|png|jpg|jpeg)$/, "")
      .replace(/_/g, " ")
  };
}

export function getAllCharacterNames() {
  return Object.values(portraits).map(p => p.displayName).sort((a, b) => a.localeCompare(b));
}

export function getCharacterPortrait(characterName) {
  if (!characterName) return null;
  const normalized = characterName.toLowerCase().replace(/[-_]/g, " ");

  // 1. Exact match
  if (portraits[normalized]) return portraits[normalized].url;

  // 2. Contains match (e.g. "anby" matches "anby demara")
  for (const [key, data] of Object.entries(portraits)) {
    // If the image name contains the mod's character name
    if (key.includes(normalized)) {
      return data.url;
    }
    // If the mod's character name contains the image name
    if (normalized.includes(key)) {
      return data.url;
    }
  }

  return null;
}
