import { getCharacterPortrait } from "../lib/portraits";

export function useCharacterPortrait(characterName, gameId, enabled = true) {
  if (!enabled || !characterName) return null;
  return getCharacterPortrait(characterName, gameId) || null;
}
