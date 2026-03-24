const UI_CATEGORIES = new Set(["user interface", "ui"]);
const MISC_CATEGORIES = new Set([
  "other/misc",
  "audio",
  "miscellaneous",
  "misc",
]);

function normalizeValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function getModClassification(mod) {
  const character = String(mod?.character || "Unassigned").trim() || "Unassigned";
  const normalizedCharacter = normalizeValue(character);
  const normalizedCategory = normalizeValue(mod?.category);
  const isUnassigned = normalizedCharacter === "unassigned";

  if (
    normalizedCharacter === "user interface" ||
    (isUnassigned && UI_CATEGORIES.has(normalizedCategory))
  ) {
    return { bucket: "ui", label: "User Interface" };
  }

  if (
    normalizedCharacter === "miscellaneous" ||
    (isUnassigned && MISC_CATEGORIES.has(normalizedCategory))
  ) {
    return { bucket: "misc", label: "Miscellaneous" };
  }

  if (isUnassigned) {
    return { bucket: "unassigned", label: "Unassigned" };
  }

  return { bucket: "character", label: character };
}

export function getModDisplayCharacter(mod) {
  return getModClassification(mod).label;
}

export function isModInCollection(mod, collectionName) {
  return (
    normalizeValue(getModDisplayCharacter(mod)) === normalizeValue(collectionName)
  );
}
