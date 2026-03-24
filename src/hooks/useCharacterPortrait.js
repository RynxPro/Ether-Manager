import { useEffect, useState } from "react";
import {
  getCharacterPortrait,
  loadCharacterPortrait,
} from "../lib/portraits";

export function useCharacterPortrait(characterName, gameId, enabled = true) {
  const portraitKey =
    enabled && characterName ? `${gameId || ""}:${characterName}` : null;
  const cachedPortrait = portraitKey
    ? getCharacterPortrait(characterName, gameId)
    : null;
  const [loadedPortrait, setLoadedPortrait] = useState(() => ({
    key: portraitKey,
    url: cachedPortrait,
  }));

  useEffect(() => {
    if (!portraitKey || cachedPortrait) {
      return undefined;
    }

    let cancelled = false;

    loadCharacterPortrait(characterName, gameId)
      .then((url) => {
        if (!cancelled) {
          setLoadedPortrait({ key: portraitKey, url });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadedPortrait({ key: portraitKey, url: null });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cachedPortrait, characterName, gameId, portraitKey]);

  if (!portraitKey) {
    return null;
  }

  if (cachedPortrait) {
    return cachedPortrait;
  }

  return loadedPortrait.key === portraitKey ? loadedPortrait.url : null;
}
