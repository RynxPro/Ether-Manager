/**
 * Thumbnail URL from a mod returned by fetchGbModsBatch (normalized) or raw GB JSON.
 * Prefer `thumbnailUrl` from the main process; otherwise match `buildThumbnailUrl` in
 * gamebanana.js — many mods only set `_sFile530` / `_sFile220`, not `_sFile`.
 */
export function thumbnailUrlFromGbModItem(item) {
  if (item == null || typeof item !== "object") return null;
  const direct = item.thumbnailUrl;
  if (typeof direct === "string" && direct.trim() !== "") {
    return direct;
  }
  const images = item._aPreviewMedia?._aImages;
  if (!Array.isArray(images) || images.length === 0) return null;
  const img = images[0];
  if (!img || typeof img !== "object") return null;
  const baseRaw = img._sBaseUrl;
  const base =
    baseRaw == null ? "" : String(baseRaw).trim().replace(/\/+$/, "");
  const fileRaw =
    img._sFile530 ?? img._sFile ?? img._sFile220 ?? "";
  const file = String(fileRaw).trim().replace(/^\/+/, "");
  if (!base || !file) return null;
  return `${base}/${file}`;
}

/**
 * Look up a GameBanana thumbnail URL from a map keyed by mod id (_idRow).
 * Keys may be stored as number or string depending on the source.
 */
export function thumbFromGbMap(gbData, gamebananaId) {
  if (gbData == null || gamebananaId == null || gamebananaId === "") return null;
  const n = Number(gamebananaId);
  const entry =
    gbData[gamebananaId] ||
    gbData[n] ||
    (Number.isFinite(n) ? gbData[String(n)] : null);
  return entry?.thumbnailUrl ?? null;
}

/** True if we already fetched or merged an entry for this mod id (even when thumb is null). */
export function isGbThumbResolved(gbData, id) {
  if (gbData == null || id == null) return false;
  return gbData[id] != null || gbData[String(id)] != null;
}
