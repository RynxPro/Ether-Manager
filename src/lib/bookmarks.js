function extractBookmarkId(value) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    Number.isInteger(value._idRow) &&
    value._idRow > 0
  ) {
    return value._idRow;
  }

  return null;
}

export function normalizeBookmarkConfig(rawBookmarks) {
  const source =
    rawBookmarks && typeof rawBookmarks === "object" ? rawBookmarks : {};
  const normalized = {};
  let migrated = false;

  for (const [gameId, entries] of Object.entries(source)) {
    const seen = new Set();
    const ids = [];

    if (!Array.isArray(entries)) {
      migrated = true;
      normalized[gameId] = ids;
      continue;
    }

    for (const entry of entries) {
      const id = extractBookmarkId(entry);
      if (!id || seen.has(id)) {
        if (entry != null) migrated = true;
        continue;
      }

      if (typeof entry !== "number") {
        migrated = true;
      }

      seen.add(id);
      ids.push(id);
    }

    normalized[gameId] = ids;
  }

  return { bookmarks: normalized, migrated };
}

export function createUnavailableBookmarkPlaceholder(id) {
  return {
    _idRow: id,
    _sName: `Unavailable Mod #${id}`,
    _aSubmitter: null,
    _nLikeCount: 0,
    _nDownloadCount: 0,
    _nViewCount: 0,
    _tsDateUpdated: 0,
    thumbnailUrl: null,
    _bookmarkUnavailable: true,
  };
}
