// Ensures a consistent, fully normalized mod object for cache/UI
function normalizeGbModForCache(mod) {
  const normalized = normalizeModRecord(mod) || {};
  return {
    _idRow: normalized._idRow || 0,
    _sName: normalized._sName || "Unknown Mod",
    _sDescription: normalized._sDescription || "",
    _sText: normalized._sText || "",
    _tsDateAdded: normalized._tsDateAdded || 0,
    _tsDateUpdated: normalized._tsDateUpdated || 0,
    _tsDateModified: normalized._tsDateModified || 0,
    _nLikeCount: normalized._nLikeCount || 0,
    _nDownloadCount: normalized._nDownloadCount || 0,
    _nViewCount: normalized._nViewCount || 0,
    _sProfileUrl: normalized._sProfileUrl || "",
    _aPreviewMedia: normalized._aPreviewMedia || { _aImages: [] },
    _aSubmitter: normalized._aSubmitter || null,
    _aGame: normalized._aGame || { _idRow: 0, _sName: "" },
    _aCategory: normalized._aCategory || { _idRow: 0, _sName: "" },
    _aRootCategory: normalized._aRootCategory || { _idRow: 0, _sName: "" },
    _aFiles: Array.isArray(normalized._aFiles) ? normalized._aFiles : [],
    thumbnailUrl: normalized.thumbnailUrl || null,
    heroImageUrl: normalized.heroImageUrl || normalized.thumbnailUrl || null,
    allImages: buildAllImages(normalized._aPreviewMedia),
  };
}
import {
  assertInteger,
  assertIntegerArray,
  assertOptionalString,
  assertPlainObject,
} from "./validation.js";
import { createLogger } from "./logger.js";

const GB_API = "https://gamebanana.com/apiv10";
const GB_PROPERTIES =
  "_idRow,_sName,_sDescription,_sText,_aPreviewMedia,_aFiles,_tsDateUpdated,_nLikeCount,_nDownloadCount,_nViewCount,_aSubmitter,_aGame,_aCategory,_aRootCategory";

const characterCategoryCache = {};
const logger = createLogger("gamebanana");
const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_RETRY_COUNT = 1;
const FEATURED_BUCKETS = [
  { id: "week", label: "Best of This Week", days: 7 },
  { id: "month", label: "Best of This Month", days: 30 },
  { id: "sixMonths", label: "Best of 6 Months", days: 183 },
  { id: "year", label: "Best of This Year", days: 365 },
  { id: "allTime", label: "Best of All Time", days: null },
];
const FEATURED_SOURCE_SPECS = [
  { sort: "Generic_Newest", pageCount: 3, perPage: 20 },
  { sort: "Generic_MostLiked", pageCount: 3, perPage: 20 },
  { sort: "Generic_MostDownloaded", pageCount: 2, perPage: 20 },
  { sort: "Generic_MostViewed", pageCount: 2, perPage: 20 },
];
const FEATURED_ALL_TIME_PER_PAGE = 12;
const DAY_SECONDS = 24 * 60 * 60;

const runtime = {
  fetchImpl: (...args) => fetch(...args),
  sleepImpl: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  timeoutMs: DEFAULT_TIMEOUT_MS,
  retryCount: DEFAULT_RETRY_COUNT,
  nowImpl: () => Date.now(),
};

export function setGameBananaRuntime(overrides = {}) {
  if (typeof overrides.fetchImpl === "function") {
    runtime.fetchImpl = overrides.fetchImpl;
  }
  if (typeof overrides.sleepImpl === "function") {
    runtime.sleepImpl = overrides.sleepImpl;
  }
  if (Number.isFinite(overrides.timeoutMs) && overrides.timeoutMs > 0) {
    runtime.timeoutMs = overrides.timeoutMs;
  }
  if (
    Number.isInteger(overrides.retryCount) &&
    overrides.retryCount >= 0 &&
    overrides.retryCount <= 5
  ) {
    runtime.retryCount = overrides.retryCount;
  }
  if (typeof overrides.nowImpl === "function") {
    runtime.nowImpl = overrides.nowImpl;
  }
}

function toIntegerOr(fallback, value) {
  return Number.isInteger(value) ? value : fallback;
}

function toNumberOr(fallback, value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function toUnixSecondsOr(fallback, value) {
  const numeric = toNumberOr(NaN, value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return numeric > 1e12 ? Math.floor(numeric / 1000) : Math.floor(numeric);
}

function toStringOr(fallback, value) {
  return typeof value === "string" ? value : fallback;
}

function normalizeImage(image) {
  if (!image || typeof image !== "object") {
    return null;
  }

  const baseUrl = toStringOr("", image._sBaseUrl);
  const file530 = toStringOr("", image._sFile530);
  const file220 = toStringOr("", image._sFile220);
  const file = toStringOr("", image._sFile);

  return {
    ...image,
    _sBaseUrl: baseUrl,
    _sFile530: file530,
    _sFile220: file220,
    _sFile: file,
  };
}

function normalizePreviewMedia(previewMedia) {
  const rawImages = Array.isArray(previewMedia?._aImages)
    ? previewMedia._aImages
    : [];
  const images = rawImages.map(normalizeImage).filter(Boolean);
  return {
    ...(previewMedia && typeof previewMedia === "object" ? previewMedia : {}),
    _aImages: images,
  };
}

function normalizeSubmitter(submitter) {
  if (!submitter || typeof submitter !== "object") {
    return null;
  }

  return {
    ...submitter,
    _idRow: toIntegerOr(0, submitter._idRow),
    _sName: toStringOr("Unknown", submitter._sName),
    _sAvatarUrl: toStringOr("", submitter._sAvatarUrl),
    _sProfileUrl: toStringOr("", submitter._sProfileUrl),
  };
}

function normalizeCategory(category) {
  if (!category || typeof category !== "object") {
    return null;
  }

  return {
    ...category,
    _idRow: toIntegerOr(0, category._idRow),
    _sName: toStringOr("", category._sName),
  };
}

function normalizeFileEntry(file) {
  if (!file || typeof file !== "object") {
    return null;
  }

  return {
    ...file,
    _idRow: toIntegerOr(0, file._idRow),
    _sFile: toStringOr("", file._sFile),
    _sDownloadUrl: toStringOr("", file._sDownloadUrl),
    _nFilesize: Number.isFinite(file._nFilesize) ? file._nFilesize : 0,
    _sDescription: toStringOr("", file._sDescription),
  };
}

function buildThumbnailUrl(previewMedia) {
  const images = previewMedia?._aImages;
  if (!images || images.length === 0) return null;
  const firstImage = images[0];
  const fileName =
    firstImage._sFile530 || firstImage._sFile || firstImage._sFile220;
  return fileName ? `${firstImage._sBaseUrl}/${fileName}` : null;
}

// Full-resolution image for large display surfaces (hero banners, etc.)
function buildHeroImageUrl(previewMedia) {
  const images = previewMedia?._aImages;
  if (!images || images.length === 0) return null;
  const firstImage = images[0];
  // Prefer the original file, fall back to the 530px variant
  const fileName =
    firstImage._sFile || firstImage._sFile530 || firstImage._sFile220;
  return fileName ? `${firstImage._sBaseUrl}/${fileName}` : null;
}

function normalizeModRecord(mod) {
  if (!mod || typeof mod !== "object") {
    return null;
  }

  const previewMedia = normalizePreviewMedia(mod._aPreviewMedia);
  const files = Array.isArray(mod._aFiles)
    ? mod._aFiles.map(normalizeFileEntry).filter(Boolean)
    : [];

  return {
    ...mod,
    _idRow: toIntegerOr(0, mod._idRow),
    _sName: toStringOr("Unknown Mod", mod._sName),
    _sDescription: toStringOr("", mod._sDescription),
    _sText: toStringOr("", mod._sText),
    _tsDateAdded: toUnixSecondsOr(0, mod._tsDateAdded),
    _tsDateUpdated: toUnixSecondsOr(0, mod._tsDateUpdated),
    _tsDateModified: toUnixSecondsOr(0, mod._tsDateModified),
    _nLikeCount: toNumberOr(0, mod._nLikeCount),
    _nDownloadCount: toNumberOr(0, mod._nDownloadCount),
    _nViewCount: toNumberOr(0, mod._nViewCount),
    _sProfileUrl: toStringOr("", mod._sProfileUrl),
    _aPreviewMedia: previewMedia,
    _aSubmitter: normalizeSubmitter(mod._aSubmitter),
    _aGame: normalizeCategory(mod._aGame),
    _aCategory: normalizeCategory(mod._aCategory),
    _aRootCategory: normalizeCategory(mod._aRootCategory),
    _aFiles: files,
    thumbnailUrl: buildThumbnailUrl(previewMedia),
    heroImageUrl: buildHeroImageUrl(previewMedia),
  };
}

function buildAllImages(previewMedia) {
  const images = previewMedia?._aImages || [];
  return images
    .map((img) => {
      // Prefer the original full-resolution file; fall back to 530px variant
      const fileName = img._sFile || img._sFile530 || img._sFile220;
      return fileName ? `${img._sBaseUrl}/${fileName}` : null;
    })
    .filter(Boolean);
}

function shouldRetryRequest(error, status) {
  if (status === 408 || status === 429) {
    return true;
  }
  if (status >= 500) {
    return true;
  }
  return (
    error?.name === "AbortError" ||
    error?.code === "ETIMEDOUT" ||
    error?.code === "ECONNRESET" ||
    error?.code === "ENOTFOUND"
  );
}

function withThumbnail(mod) {
  const normalized = normalizeModRecord(mod);
  return normalized;
}

function mergeNormalizedModRecords(baseRecord, summaryRecord) {
  if (!baseRecord) {
    return summaryRecord;
  }
  if (!summaryRecord) {
    return baseRecord;
  }

  return {
    ...baseRecord,
    ...summaryRecord,
    _aPreviewMedia:
      summaryRecord._aPreviewMedia?._aImages?.length > 0
        ? summaryRecord._aPreviewMedia
        : baseRecord._aPreviewMedia,
    _aSubmitter: summaryRecord._aSubmitter || baseRecord._aSubmitter,
    thumbnailUrl: summaryRecord.thumbnailUrl || baseRecord.thumbnailUrl,
  };
}

function getFeaturedTimestamp(record) {
  return (
    record?._tsDateAdded ||
    record?._tsDateUpdated ||
    record?._tsDateModified ||
    0
  );
}

function compareFeaturedCandidates(a, b) {
  return (
    b._nLikeCount - a._nLikeCount ||
    b._nDownloadCount - a._nDownloadCount ||
    b._nViewCount - a._nViewCount ||
    getFeaturedTimestamp(b) - getFeaturedTimestamp(a) ||
    b._idRow - a._idRow
  );
}

function getFeaturedAgeDays(record, nowSeconds) {
  const timestamp = getFeaturedTimestamp(record);
  if (!timestamp || !nowSeconds || timestamp > nowSeconds) {
    return 0;
  }
  return (nowSeconds - timestamp) / DAY_SECONDS;
}

function computeFeaturedScore(record, bucketDays, nowSeconds) {
  const likeCount = record?._nLikeCount || 0;
  const downloadCount = record?._nDownloadCount || 0;
  const viewCount = record?._nViewCount || 0;
  const ageDays = getFeaturedAgeDays(record, nowSeconds);

  const engagementScore =
    likeCount * 10 + Math.log1p(downloadCount) * 16 + Math.log1p(viewCount) * 6;

  if (!bucketDays) {
    return engagementScore;
  }

  const ageRatio = Math.min(1, ageDays / bucketDays);
  const freshnessWeight = 0.55 + 0.45 * Math.exp(-1.25 * ageRatio);
  const momentumScore =
    (likeCount * 6 + Math.log1p(downloadCount) * 12) /
    Math.max(1.5, ageDays + 0.75);

  return engagementScore * freshnessWeight + momentumScore * 12;
}

async function fetchBrowseRecords(
  url,
  { hydrateZeroDownloadCounts = true } = {},
) {
  const data = await fetchFromGB(url);
  let records = Array.isArray(data._aRecords)
    ? data._aRecords.map(withThumbnail).filter((item) => item?._idRow > 0)
    : [];

  const shouldHydrateSummaries =
    hydrateZeroDownloadCounts &&
    records.length > 0 &&
    records.every((record) => record._nDownloadCount === 0);

  if (shouldHydrateSummaries) {
    const summaryRecords = await fetchGbModsSummaries(
      records.map((record) => record._idRow),
    );
    const summaryMap = new Map(
      summaryRecords.map((record) => [record._idRow, record]),
    );

    records = records.map((record) =>
      mergeNormalizedModRecords(record, summaryMap.get(record._idRow)),
    );
  }

  return {
    records,
    total: Number.isFinite(data._aMetadata?._nRecordCount)
      ? data._aMetadata._nRecordCount
      : records.length,
  };
}

async function fetchFeaturedCandidates(gbGameId, browseFields) {
  const requests = FEATURED_SOURCE_SPECS.flatMap((source) =>
    Array.from({ length: source.pageCount }, (_, index) => {
      const page = index + 1;
      const url =
        `${GB_API}/Mod/Index?_aFilters[Generic_Game]=${gbGameId}` +
        `&_nPage=${page}&_nPerpage=${source.perPage}` +
        `&_sSort=${source.sort}` +
        `&_csvFields=${encodeURIComponent(browseFields)}`;

      return fetchBrowseRecords(url, { hydrateZeroDownloadCounts: false })
        .then((result) => result.records)
        .catch((error) => {
          logger.warn(
            `Featured source fetch failed for ${source.sort} page ${page}`,
            error.message,
          );
          return [];
        });
    }),
  );

  const results = await Promise.all(requests);
  const uniqueCandidates = new Map();

  for (const records of results) {
    for (const record of records) {
      const existing = uniqueCandidates.get(record._idRow);
      uniqueCandidates.set(
        record._idRow,
        existing ? mergeNormalizedModRecords(existing, record) : record,
      );
    }
  }

  return [...uniqueCandidates.values()];
}

function pickFeaturedBucketWinner(
  candidates,
  usedIds,
  cutoffTimestamp,
  bucketDays,
  nowSeconds,
) {
  const eligible = candidates
    .filter((record) => {
      if (usedIds.has(record._idRow)) {
        return false;
      }
      if (cutoffTimestamp == null) {
        return true;
      }
      return getFeaturedTimestamp(record) >= cutoffTimestamp;
    })
    .sort((a, b) => {
      const scoreDifference =
        computeFeaturedScore(b, bucketDays, nowSeconds) -
        computeFeaturedScore(a, bucketDays, nowSeconds);

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      return compareFeaturedCandidates(a, b);
    });

  return eligible[0] || null;
}

export async function fetchGbFeaturedMods(gbGameId) {
  const validGameId = assertInteger(gbGameId, "gbGameId", { min: 1 });
  const browseFields =
    "name,_aPreviewMedia,_aSubmitter,_nLikeCount,_nDownloadCount,_nViewCount,_tsDateAdded,_tsDateUpdated,_tsDateModified,_sProfileUrl";
  const now = toUnixSecondsOr(0, runtime.nowImpl());

  const [candidates, allTimeResult] = await Promise.all([
    fetchFeaturedCandidates(validGameId, browseFields),
    browseGbMods({
      gbGameId: validGameId,
      page: 1,
      perPage: FEATURED_ALL_TIME_PER_PAGE,
      sort: "likes",
    }),
  ]);

  const usedIds = new Set();
  const selectedEntries = [];

  for (const bucket of FEATURED_BUCKETS) {
    const cutoffTimestamp =
      bucket.days == null ? null : now - bucket.days * DAY_SECONDS;
    const sourcePool =
      bucket.id === "allTime" ? allTimeResult.records || [] : candidates;
    const winner = pickFeaturedBucketWinner(
      sourcePool,
      usedIds,
      cutoffTimestamp,
      bucket.days,
      now,
    );

    if (!winner) {
      continue;
    }

    usedIds.add(winner._idRow);
    selectedEntries.push({
      id: bucket.id,
      label: bucket.label,
      modId: winner._idRow,
      mod: winner,
    });
  }

  const hydratedSummaries = await fetchGbModsSummaries(
    selectedEntries.map((entry) => entry.modId),
  );
  const summaryMap = new Map(
    hydratedSummaries.map((record) => [record._idRow, record]),
  );

  return selectedEntries.map((entry) => ({
    id: entry.id,
    label: entry.label,
    mod: mergeNormalizedModRecords(entry.mod, summaryMap.get(entry.modId)),
  }));
}

export async function fetchFromGB(url) {
  let lastError = null;

  for (let attempt = 0; attempt <= runtime.retryCount; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), runtime.timeoutMs);

    try {
      const res = await runtime.fetchImpl(url, {
        headers: { "User-Agent": "AetherManager/1.0.0" },
        signal: controller.signal,
      });

      if (!res.ok) {
        const error = new Error(`GB API error: ${res.status}`);
        error.status = res.status;
        throw error;
      }

      const data = await res.json();
      if (!data || typeof data !== "object") {
        throw new Error("GB API returned an invalid response payload.");
      }
      return data;
    } catch (error) {
      lastError = error;
      if (
        attempt >= runtime.retryCount ||
        !shouldRetryRequest(error, error.status)
      ) {
        throw error;
      }
      await runtime.sleepImpl(250 * (attempt + 1));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error("GB API request failed.");
}

export async function fetchGbMod(gamebananaId) {
  const id = assertInteger(gamebananaId, "gamebananaId", { min: 1 });
  const rawData = await fetchFromGB(
    `${GB_API}/Mod/${id}?_csvProperties=${encodeURIComponent(GB_PROPERTIES)}`,
  );
  return normalizeGbModForCache(rawData);
}

export async function fetchGbModsBatch(ids) {
  if (!ids || ids.length === 0) return [];
  const validIds = assertIntegerArray(ids, "ids");

  const results = await Promise.all(
    validIds.map(async (id) => {
      try {
        const data = await fetchFromGB(
          `${GB_API}/Mod/${id}?_csvProperties=${encodeURIComponent(GB_PROPERTIES)}`,
        );
        return normalizeGbModForCache(data);
      } catch (error) {
        logger.warn(`Batch update fetch failed for mod ${id}`, error.message);
        return null;
      }
    }),
  );

  return results.filter(Boolean);
}

export async function fetchGbModsSummaries(ids) {
  if (!ids || ids.length === 0) return [];
  const validIds = assertIntegerArray(ids, "ids");

  const summaryProperties =
    "_idRow,_sName,_aPreviewMedia,_nLikeCount,_nDownloadCount,_nViewCount,_tsDateUpdated,_aSubmitter,_sProfileUrl";

  const results = await Promise.all(
    validIds.map(async (id) => {
      try {
        const data = await fetchFromGB(
          `${GB_API}/Mod/${id}?_csvProperties=${encodeURIComponent(summaryProperties)}`,
        );
        return normalizeGbModForCache(data);
      } catch (error) {
        logger.warn(
          `Bookmark summary fetch failed for mod ${id}`,
          error.message,
        );
        return null;
      }
    }),
  );

  return results.filter(Boolean);
}

async function resolveCharCategory(gameId, charName) {
  const searchLower = charName.toLowerCase();
  const cacheKey = `${gameId}_${searchLower}`;
  if (characterCategoryCache[cacheKey]) {
    return characterCategoryCache[cacheKey];
  }

  if (searchLower === "ui" || searchLower.includes("interface")) {
    if (gameId === 19567) return 30395;
  }
  if (searchLower === "misc" || searchLower === "miscellaneous") {
    if (gameId === 19567) return 29874;
  }

  try {
    const searchUrl = `${GB_API}/Util/Search/Results?_sModelName=Mod&_idGameRow=${gameId}&_nPage=1&_nPerpage=3&_sSearchString=${encodeURIComponent(charName)}`;
    const searchRes = await fetchFromGB(searchUrl);
    if (!Array.isArray(searchRes._aRecords)) return null;

    for (const mod of searchRes._aRecords) {
      const modData = await fetchFromGB(
        `${GB_API}/Mod/${mod._idRow}?_csvProperties=_aRootCategory,_aCategory`,
      );
      if (!modData._aCategory || !modData._aRootCategory) {
        continue;
      }

      const rootName = (modData._aRootCategory._sName || "").toLowerCase();
      const catName = (modData._aCategory._sName || "").toLowerCase();

      if (rootName.includes("skin") || rootName.includes("character")) {
        const catId = modData._aCategory._idRow;
        characterCategoryCache[cacheKey] = catId;
        return catId;
      }

      if (searchLower.includes("interface") || searchLower === "ui") {
        if (
          rootName.includes("ui") ||
          rootName.includes("gui") ||
          rootName.includes("interface") ||
          catName.includes("ui") ||
          catName.includes("gui") ||
          catName.includes("interface")
        ) {
          const catId = modData._aRootCategory._idRow;
          characterCategoryCache[cacheKey] = catId;
          return catId;
        }
      }

      if (searchLower.includes("misc")) {
        if (
          rootName.includes("misc") ||
          rootName.includes("other") ||
          catName.includes("misc") ||
          catName.includes("other")
        ) {
          const catId = modData._aRootCategory._idRow;
          characterCategoryCache[cacheKey] = catId;
          return catId;
        }
      }
    }
  } catch (error) {
    logger.warn("Failed to auto-discover category ID", error.message);
  }

  return null;
}

export async function browseGbMods(args = {}) {
  assertPlainObject(args, "browseArgs");
  const gbGameId = assertInteger(args.gbGameId, "gbGameId", { min: 1 });
  const page = assertInteger(args.page ?? 1, "page", { min: 1, max: 1000 });
  const perPage = assertInteger(args.perPage ?? 20, "perPage", {
    min: 1,
    max: 100,
  });
  const sort =
    assertOptionalString(args.sort ?? "", "sort", {
      allowEmpty: true,
      maxLength: 32,
    }) || "";
  const context =
    assertOptionalString(args.context ?? "", "context", {
      allowEmpty: true,
      maxLength: 120,
    }) || "";
  const search =
    assertOptionalString(args.search ?? "", "search", {
      allowEmpty: true,
      maxLength: 240,
    }) || "";
  const submitterId =
    args.submitterId == null
      ? null
      : assertInteger(args.submitterId, "submitterId", { min: 1 });

  const browseFields =
    "name,_aPreviewMedia,_aSubmitter,_nLikeCount,_nDownloadCount,_nViewCount,_tsDateUpdated,_sProfileUrl";
  const sortAliases = {
    likes: "Generic_MostLiked",
    downloads: "Generic_MostDownloaded",
    views: "Generic_MostViewed",
  };
  const sortStr =
    sort && sortAliases[sort] ? `&_sSort=${sortAliases[sort]}` : "";
  const hasManualSearch = search && search.trim().length >= 1;
  const hasCategoryContext = context && context.trim().length >= 1;

  let url;

  if (submitterId) {
    url = `${GB_API}/Mod/Index?_aFilters[Generic_Game]=${gbGameId}&_aFilters[Generic_Submitter]=${submitterId}&_nPage=${page}&_nPerpage=${perPage}${sortStr}&_csvFields=${encodeURIComponent(browseFields)}`;
  } else if (hasManualSearch) {
    const combinedQuery = [context, search].filter(Boolean).join(" ");
    url = `${GB_API}/Util/Search/Results?_sModelName=Mod&_idGameRow=${gbGameId}&_sSearchString=${encodeURIComponent(combinedQuery)}&_nPage=${page}&_nPerpage=${perPage}${sortStr}&_csvProperties=${encodeURIComponent(browseFields)}`;
  } else if (hasCategoryContext) {
    const charName = context.trim();
    const catId = await resolveCharCategory(gbGameId, charName);

    if (catId) {
      url = `${GB_API}/Mod/Index?_aFilters[Generic_Category]=${catId}&_nPage=${page}&_nPerpage=${perPage}${sortStr}&_csvFields=${encodeURIComponent(browseFields)}`;
    } else {
      url = `${GB_API}/Util/Search/Results?_sModelName=Mod&_idGameRow=${gbGameId}&_sSearchString=${encodeURIComponent(charName)}&_nPage=${page}&_nPerpage=${perPage}${sortStr}&_csvProperties=${encodeURIComponent(browseFields)}`;
    }
  } else {
    url = `${GB_API}/Mod/Index?_aFilters[Generic_Game]=${gbGameId}&_nPage=${page}&_nPerpage=${perPage}${sortStr}&_csvFields=${encodeURIComponent(browseFields)}`;
  }

  logger.debug("GB API request", url);
  const { records, total } = await fetchBrowseRecords(url, {
    hydrateZeroDownloadCounts: true,
  });

  return {
    records,
    total,
  };
}
