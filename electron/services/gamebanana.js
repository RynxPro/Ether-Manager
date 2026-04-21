import {
  assertInteger,
  assertIntegerArray,
  assertOptionalString,
  assertPlainObject,
} from "./validation.js";
import { createLogger } from "./logger.js";

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

const GB_API = "https://gamebanana.com/apiv11";

const characterCategoryCache = {};
const characterCategoryLookups = new Map();

// Root "Character Skins" category IDs per GB game ID — scopes the Characters tab
// when no specific character sub-category is selected.
const CHARACTER_SKINS_ROOT_CATS = {
  8552: 17510, // Genshin Impact       -> Skins
  20357: 29524, // Wuthering Waves      -> Skins
  19567: 30305, // Zenless Zone Zero    -> Character Skins
  18366: 22633, // Honkai: Star Rail    -> Skins
};
const logger = createLogger("gamebanana");
const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_RETRY_COUNT = 1;
const DEFAULT_MAX_CONCURRENT_REQUESTS = 6;
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 5000;
const MAX_RATE_LIMIT_COOLDOWN_MS = 60000;
/** Never block the client longer than this (ms). Servers may send Retry-After in tens of hours. */
const MAX_CLIENT_COOLDOWN_MS = 15 * 60 * 1000;

class RateLimitError extends Error {
  constructor(message, { retryAfterMs = DEFAULT_RATE_LIMIT_COOLDOWN_MS } = {}) {
    super(message);
    this.name = "RateLimitError";
    this.code = "RATE_LIMITED";
    this.retryAfterMs = retryAfterMs;
  }
}

const requestState = {
  inFlight: new Map(),
  cache: new Map(),
  bucketTail: new Map(),
  bucketLastStart: new Map(),
  cooldownUntil: 0,
  rateLimitStrikeCount: 0,
  activeCount: 0,
  waiters: {
    high: [],
    medium: [],
    low: [],
  },
  bucketCircuits: new Map(), // bucket -> { failures: 0, lastFailure: 0, state: 'closed' | 'open' }
};

const requestStats = {
  totalCalls: 0,
  networkCalls: 0,
  cacheHits: 0,
  dedupeHits: 0,
  cooldownBlocks: 0,
  rateLimitResponses: 0,
  throttleWaitMs: 0,
  circuitBlocks: 0,
  latency: {
    totalMs: 0,
    count: 0,
    avgMs: 0,
  },
};

const runtime = {
  fetchImpl: (...args) => fetch(...args),
  sleepImpl: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  timeoutMs: DEFAULT_TIMEOUT_MS,
  retryCount: DEFAULT_RETRY_COUNT,
  maxConcurrentRequests: DEFAULT_MAX_CONCURRENT_REQUESTS,
  rateLimitCooldownMs: DEFAULT_RATE_LIMIT_COOLDOWN_MS,
  nowImpl: () => Date.now(),
};

export function resetGameBananaRequestState() {
  requestState.inFlight.clear();
  requestState.cache.clear();
  requestState.bucketTail.clear();
  requestState.bucketLastStart.clear();
  requestState.cooldownUntil = 0;
  requestState.rateLimitStrikeCount = 0;
  requestState.activeCount = 0;
  requestState.waiters = {
    high: [],
    medium: [],
    low: [],
  };
  characterCategoryLookups.clear();
  for (const key of Object.keys(characterCategoryCache)) {
    delete characterCategoryCache[key];
  }
  requestStats.totalCalls = 0;
  requestStats.networkCalls = 0;
  requestStats.cacheHits = 0;
  requestStats.dedupeHits = 0;
  requestStats.cooldownBlocks = 0;
  requestStats.rateLimitResponses = 0;
  requestStats.throttleWaitMs = 0;
  requestStats.circuitBlocks = 0;
  requestStats.latency = { totalMs: 0, count: 0, avgMs: 0 };
}

const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_RESET_TIMEOUT_MS = 30000;
const CIRCUIT_HALF_OPEN_TIMEOUT_MS = 60000; // Time before half-open can retry after open

function isBucketCircuitOpen(bucket) {
  const circuit = requestState.bucketCircuits.get(bucket);
  if (!circuit || circuit.state === "closed") return false;

  const now = runtime.nowImpl();
  const timeSinceLastFailure = now - circuit.lastFailure;

  if (circuit.state === "open") {
    // Allow half-open test after CIRCUIT_RESET_TIMEOUT_MS
    // Mark as "half-open" to allow one test request
    if (timeSinceLastFailure > CIRCUIT_RESET_TIMEOUT_MS) {
      circuit.state = "half-open";
      circuit.testInProgress = false;
      logger.info(
        `Circuit breaker HALF-OPEN for bucket: ${bucket} (allowing test request)`,
      );
      return false; // Allow the request to proceed as a test
    }
    return true; // Still open, reject
  }

  if (circuit.state === "half-open") {
    // Allow one test request, then wait for result
    if (
      !circuit.testInProgress &&
      timeSinceLastFailure > CIRCUIT_HALF_OPEN_TIMEOUT_MS
    ) {
      // Test period expired without success, reopen
      circuit.state = "open";
      circuit.failures = 0; // Reset for next test
      logger.warn(
        `Circuit breaker RE-OPENED for bucket: ${bucket} (test timeout)`,
      );
      return true;
    }

    // If test in progress, wait
    if (circuit.testInProgress) {
      return true;
    }

    // First test request
    circuit.testInProgress = true;
    return false;
  }

  return false;
}

function recordBucketFailure(bucket) {
  let circuit = requestState.bucketCircuits.get(bucket);
  if (!circuit) {
    circuit = {
      failures: 0,
      lastFailure: 0,
      state: "closed",
      testInProgress: false,
    };
    requestState.bucketCircuits.set(bucket, circuit);
  }
  circuit.failures += 1;
  circuit.lastFailure = runtime.nowImpl();
  circuit.testInProgress = false;

  if (circuit.failures >= CIRCUIT_FAILURE_THRESHOLD) {
    circuit.state = "open";
    logger.warn(
      `Circuit breaker OPEN for bucket: ${bucket} (${circuit.failures} failures)`,
    );
  }
}

function recordBucketSuccess(bucket) {
  const circuit = requestState.bucketCircuits.get(bucket);
  if (circuit) {
    circuit.failures = 0;
    circuit.state = "closed";
    circuit.testInProgress = false;
    if (circuit.state === "half-open") {
      logger.info(
        `Circuit breaker CLOSED for bucket: ${bucket} (recovery successful)`,
      );
    }
  }
}

function getRequestPolicy(url) {
  if (url.includes("/Util/Search/Suggestions")) {
    return {
      bucket: "suggestions",
      throttleMs: 220,
      ttlMs: 20000,
      priority: "high",
    };
  }
  if (url.includes("/Game/") && url.includes("/TopSubs")) {
    return {
      bucket: "featured",
      throttleMs: 180,
      ttlMs: 60000,
      priority: "medium",
    };
  }
  if (url.includes("/Game/") && url.includes("/Subfeed")) {
    return {
      bucket: "subfeed",
      throttleMs: 180,
      ttlMs: 35000,
      priority: "medium",
    };
  }
  if (url.includes("/Util/Search/Results")) {
    return { bucket: "search", throttleMs: 85, ttlMs: 45000, priority: "high" };
  }
  if (url.includes("/Mod/Index")) {
    return { bucket: "browse", throttleMs: 85, ttlMs: 45000, priority: "high" };
  }
  if (url.includes("/ProfilePage")) {
    return {
      bucket: "profile",
      throttleMs: 100,
      ttlMs: 90000,
      priority: "medium",
    };
  }
  if (url.includes("/Files")) {
    return {
      bucket: "files",
      throttleMs: 100,
      ttlMs: 90000,
      priority: "medium",
    };
  }
  return {
    bucket: "default",
    throttleMs: 140,
    ttlMs: 45000,
    priority: "medium",
  };
}

function makeCacheKey(url) {
  return url;
}

async function readFromCache(cacheKey, bucket) {
  // In-memory cache only (survives session)
  const cached = requestState.cache.get(cacheKey);
  if (!cached) return null;
  if (runtime.nowImpl() >= cached.expiresAt) {
    requestState.cache.delete(cacheKey);
    return null;
  }
  requestStats.cacheHits += 1;
  return cached.value;
}

async function writeToCache(cacheKey, value, ttlMs, bucket) {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) return;
  requestState.cache.set(cacheKey, {
    value,
    expiresAt: runtime.nowImpl() + ttlMs,
  });
}

function resolvePriority(priority) {
  if (priority === "high" || priority === "medium" || priority === "low") {
    return priority;
  }
  return "medium";
}

async function acquireNetworkSlot(priority = "medium") {
  if (requestState.activeCount < runtime.maxConcurrentRequests) {
    requestState.activeCount += 1;
    return;
  }
  const queue = requestState.waiters[resolvePriority(priority)];
  await new Promise((resolve) => queue.push(resolve));
  requestState.activeCount += 1;
}

function releaseNetworkSlot() {
  requestState.activeCount = Math.max(0, requestState.activeCount - 1);
  const waiter =
    requestState.waiters.high.shift() ||
    requestState.waiters.medium.shift() ||
    requestState.waiters.low.shift();
  if (waiter) waiter();
}

async function throttleBucket(bucket, throttleMs) {
  const previous = requestState.bucketTail.get(bucket) || Promise.resolve();
  let releaseCurrent;
  const current = new Promise((resolve) => {
    releaseCurrent = resolve;
  });

  requestState.bucketTail.set(
    bucket,
    previous.catch(() => undefined).then(() => current),
  );

  await previous.catch(() => undefined);

  try {
    if (Number.isFinite(throttleMs) && throttleMs > 0) {
      const now = runtime.nowImpl();
      const earliestStart =
        (requestState.bucketLastStart.get(bucket) || 0) + throttleMs;

      // Add Jitter (0 to 15% of throttle time) to prevent thundering herd
      const jitter = Math.random() * (throttleMs * 0.15);
      const waitMs = earliestStart - now + jitter;

      if (waitMs > 0) {
        requestStats.throttleWaitMs += waitMs;
        await runtime.sleepImpl(waitMs);
      }
    }
    requestState.bucketLastStart.set(bucket, runtime.nowImpl());
  } finally {
    releaseCurrent();
    if (requestState.bucketTail.get(bucket) === current) {
      requestState.bucketTail.delete(bucket);
    }
  }
}

function getCooldownRemainingMs() {
  const now = runtime.nowImpl();
  let remaining = requestState.cooldownUntil - now;
  if (remaining <= 0) return 0;
  if (remaining > MAX_CLIENT_COOLDOWN_MS) {
    requestState.cooldownUntil = now + MAX_CLIENT_COOLDOWN_MS;
    return MAX_CLIENT_COOLDOWN_MS;
  }
  return remaining;
}

/**
 * RFC 7231 Retry-After: delay-seconds OR HTTP-date.
 * Numeric headers must not be interpreted as ms; cap absurd multi-hour delays for UX.
 */
function parseRetryAfterToMs(rawHeader) {
  if (rawHeader == null || rawHeader === "") return 0;
  const trimmed = String(rawHeader).trim();
  if (!trimmed) return 0;

  if (/^\d+$/.test(trimmed)) {
    const sec = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(sec) || sec <= 0) return 0;
    const cappedSec = Math.min(sec, Math.floor(MAX_CLIENT_COOLDOWN_MS / 1000));
    return cappedSec * 1000;
  }

  const targetMs = Date.parse(trimmed);
  if (Number.isFinite(targetMs)) {
    const delta = targetMs - runtime.nowImpl();
    const ms = Math.max(0, delta);
    return Math.min(ms, MAX_CLIENT_COOLDOWN_MS);
  }

  return 0;
}

function bumpRateLimitCooldown(retryAfterHeader) {
  const headerValue =
    typeof retryAfterHeader === "function"
      ? retryAfterHeader()
      : retryAfterHeader;
  const retryAfterMs = parseRetryAfterToMs(headerValue);
  const strikeMs = Math.min(
    MAX_RATE_LIMIT_COOLDOWN_MS,
    runtime.rateLimitCooldownMs * 2 ** requestState.rateLimitStrikeCount,
  );
  requestState.rateLimitStrikeCount = Math.min(
    requestState.rateLimitStrikeCount + 1,
    8,
  );
  const cooldownMs = Math.min(
    MAX_CLIENT_COOLDOWN_MS,
    Math.max(strikeMs, retryAfterMs),
  );
  const now = runtime.nowImpl();
  requestState.cooldownUntil = Math.max(
    requestState.cooldownUntil,
    now + cooldownMs,
  );
  return cooldownMs;
}

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
  if (
    Number.isInteger(overrides.maxConcurrentRequests) &&
    overrides.maxConcurrentRequests >= 1 &&
    overrides.maxConcurrentRequests <= 16
  ) {
    runtime.maxConcurrentRequests = overrides.maxConcurrentRequests;
  }
  if (
    Number.isFinite(overrides.rateLimitCooldownMs) &&
    overrides.rateLimitCooldownMs >= 500 &&
    overrides.rateLimitCooldownMs <= MAX_RATE_LIMIT_COOLDOWN_MS
  ) {
    runtime.rateLimitCooldownMs = overrides.rateLimitCooldownMs;
  }
  if (typeof overrides.nowImpl === "function") {
    runtime.nowImpl = overrides.nowImpl;
  }
  if (overrides.resetState) {
    resetGameBananaRequestState();
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
    _sHdAvatarUrl: toStringOr("", submitter._sHdAvatarUrl),
    _bIsOnline: !!submitter._bIsOnline,
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
    _tsDateAdded: toIntegerOr(0, file._tsDateAdded),
    _sMd5Checksum: toStringOr("", file._sMd5Checksum),
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
    _sVersion: toStringOr("", mod._sVersion),
    _bWasFeatured: !!mod._bWasFeatured,
    _bHasContentRatings: !!mod._bHasContentRatings,
    _aTags: Array.isArray(mod._aTags) ? mod._aTags : [],
    _aPreviewMedia: previewMedia,
    _aSubmitter: normalizeSubmitter(mod._aSubmitter),
    _aCredits: Array.isArray(mod._aCredits) ? mod._aCredits : [],
    _aGame: normalizeCategory(mod._aGame),
    _aCategory: normalizeCategory(mod._aCategory),
    _aRootCategory: normalizeCategory(mod._aRootCategory),
    _aSubCategory: normalizeCategory(mod._aSubCategory),
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

// Maps the v11 TopSubs _sPeriod values to our banner bucket labels
const TOP_SUBS_PERIOD_MAP = {
  today: { id: "today", label: "Best of Today" },
  week: { id: "week", label: "Best of This Week" },
  month: { id: "month", label: "Best of This Month" },
  "3month": { id: "threeMonths", label: "Best of 3 Months" },
  "6month": { id: "sixMonths", label: "Best of 6 Months" },
  year: { id: "year", label: "Best of This Year" },
  alltime: { id: "allTime", label: "Best of All Time" },
};

// Normalize a TopSubs record into our standard mod shape
function normalizeTopSubRecord(record) {
  if (!record || typeof record !== "object") return null;
  // Build a standard _aPreviewMedia shape from the flat image URLs
  const previewMedia = {
    _aImages: [
      {
        _sBaseUrl: "",
        _sFile: record._sImageUrl || "",
        _sFile530: record._sImageUrl || "",
        _sFile220: record._sThumbnailUrl || "",
      },
    ],
  };
  return {
    _idRow: toIntegerOr(0, record._idRow),
    _sName: toStringOr("Unknown Mod", record._sName),
    _sDescription: toStringOr("", record._sDescription),
    _sText: "",
    _sProfileUrl: toStringOr("", record._sProfileUrl),
    _nLikeCount: toNumberOr(0, record._nLikeCount),
    _nDownloadCount: 0,
    _nViewCount: 0,
    _tsDateAdded: 0,
    _tsDateUpdated: 0,
    _aPreviewMedia: previewMedia,
    thumbnailUrl: record._sThumbnailUrl || null,
    heroImageUrl: record._sImageUrl || null,
    _aSubmitter: normalizeSubmitter(record._aSubmitter),
    _aFiles: [],
    _aCredits: [],
    _aGame: null,
    _aCategory: null,
    _aRootCategory: normalizeCategory(record._aRootCategory),
    _sPeriod: record._sPeriod || null,
  };
}

export async function fetchGbFeaturedMods(gbGameId) {
  const validGameId = assertInteger(gbGameId, "gbGameId", { min: 1 });

  // Single v11 API call replaces our previous ~14 parallel requests + scoring algorithm
  const topSubsData = await fetchFromGB(
    `${GB_API}/Game/${validGameId}/TopSubs?_nPage=1&_nPerpage=50`,
  );

  if (!Array.isArray(topSubsData) || topSubsData.length === 0) {
    return [];
  }

  // Group by period, keeping only the top (first) entry per period
  const bucketMap = new Map();
  for (const record of topSubsData) {
    const period = record._sPeriod;
    if (!period || bucketMap.has(period)) continue;
    const bucketMeta = TOP_SUBS_PERIOD_MAP[period];
    if (!bucketMeta) continue;
    bucketMap.set(period, { meta: bucketMeta, record });
  }

  if (bucketMap.size === 0) return [];

  // Hydrate each winner with full ProfilePage data (parallel)
  const entries = [...bucketMap.values()];
  const modIds = entries
    .map((e) => toIntegerOr(0, e.record._idRow))
    .filter(Boolean);

  // Cap parallel ProfilePage calls: uncapped Promise.all + Subfeed was a common 429 burst on game switch.
  const hydrated = await runWithConcurrencyLimit(modIds, 2, async (id) =>
    fetchFromGB(`${GB_API}/Mod/${id}/ProfilePage`).catch(() => null),
  );

  const profileMap = new Map();
  for (const profile of hydrated) {
    if (profile?._idRow) profileMap.set(profile._idRow, profile);
  }

  return entries.map(({ meta, record }) => {
    const id = toIntegerOr(0, record._idRow);
    const topSubNorm = normalizeTopSubRecord(record);
    const profile = profileMap.get(id);
    const fullMod = profile ? normalizeGbModForCache(profile) : topSubNorm;
    // Preserve the high-quality hero image from TopSubs which is pre-sized
    if (topSubNorm.heroImageUrl && !fullMod.heroImageUrl) {
      fullMod.heroImageUrl = topSubNorm.heroImageUrl;
    }
    return {
      id: meta.id,
      label: meta.label,
      mod: fullMod,
    };
  });
}

async function fetchBrowseRecords(
  url,
  { hydrateZeroDownloadCounts = true } = {},
) {
  const data = await fetchFromGB(url);
  let records = Array.isArray(data._aRecords)
    ? data._aRecords.map(withThumbnail).filter((item) => item?._idRow > 0)
    : [];

  // Selective hydration: only hydrate rows missing critical fields
  // Critical fields: _aFiles (needed for version info and file structure)
  const rowsNeedingHydration = records
    .map((record, idx) => ({
      record,
      idx,
      needsHydration: (record._aFiles?.length ?? 0) === 0,
    }))
    .filter((item) => item.needsHydration && hydrateZeroDownloadCounts);

  if (rowsNeedingHydration.length > 0) {
    // Hydrate top 8 immediately in parallel, mark rest as "cached" for later
    const BROWSE_IMMEDIATE_HYDRATE_COUNT = 8;
    const rowsToHydrateImmediately = rowsNeedingHydration.slice(
      0,
      BROWSE_IMMEDIATE_HYDRATE_COUNT,
    );

    if (rowsToHydrateImmediately.length > 0) {
      const summaryRecords = await fetchGbModsSummaries(
        rowsToHydrateImmediately.map((item) => item.record._idRow),
        { concurrency: 4 },
      );
      const summaryMap = new Map(
        summaryRecords.map((record) => [record._idRow, record]),
      );

      // Update only the immediately hydrated rows
      rowsToHydrateImmediately.forEach((item) => {
        records[item.idx] = mergeNormalizedModRecords(
          item.record,
          summaryMap.get(item.record._idRow),
        );
      });
    }

    // Mark rows not yet hydrated so UI can show "(cached)" label
    const hydratedIds = new Set(
      rowsToHydrateImmediately.map((item) => item.record._idRow),
    );
    records = records.map((record) => ({
      ...record,
      _isHydrated: hydratedIds.has(record._idRow),
    }));
  } else {
    // No hydration needed, mark all as hydrated
    records = records.map((record) => ({ ...record, _isHydrated: true }));
  }

  return {
    records,
    total: Number.isFinite(data._aMetadata?._nRecordCount)
      ? data._aMetadata._nRecordCount
      : records.length,
  };
}

export async function fetchFromGB(url, options = {}) {
  requestStats.totalCalls += 1;
  const policy = getRequestPolicy(url);
  const priority = resolvePriority(options.priority || policy.priority);
  const cacheKey = options.cacheKey || makeCacheKey(url);
  const bypassCache = options.bypassCache === true;
  const dedupeKey = options.dedupeKey || cacheKey;

  const cooldownRemainingMs = getCooldownRemainingMs();
  if (cooldownRemainingMs > 0) {
    requestStats.cooldownBlocks += 1;
    throw new RateLimitError(
      `Rate limit cooldown active. Please retry in ${Math.ceil(cooldownRemainingMs / 1000)}s.`,
      { retryAfterMs: cooldownRemainingMs },
    );
  }

  if (isBucketCircuitOpen(policy.bucket)) {
    requestStats.circuitBlocks += 1;
    throw new Error(
      `Service temporarily unavailable (circuit breaker open for ${policy.bucket}). Please try again in 30s.`,
    );
  }

  if (!bypassCache) {
    const cached = await readFromCache(cacheKey, policy.bucket);
    if (cached != null) {
      return cached;
    }
  }

  const inFlight = requestState.inFlight.get(dedupeKey);
  if (inFlight) {
    requestStats.dedupeHits += 1;
    return inFlight;
  }

  const fetchPromise = (async () => {
    await throttleBucket(policy.bucket, policy.throttleMs);
    await acquireNetworkSlot(priority);

    try {
      let lastError = null;

      for (let attempt = 0; attempt <= runtime.retryCount; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), runtime.timeoutMs);
        const startTime = runtime.nowImpl();

        try {
          requestStats.networkCalls += 1;
          const res = await runtime.fetchImpl(url, {
            headers: { "User-Agent": "AetherManager/1.0.0" },
            signal: controller.signal,
          });

          const latency = runtime.nowImpl() - startTime;
          requestStats.latency.totalMs += latency;
          requestStats.latency.count += 1;
          requestStats.latency.avgMs = Math.round(
            requestStats.latency.totalMs / requestStats.latency.count,
          );

          if (!res.ok) {
            if (res.status === 429 || res.status === 1015) {
              requestStats.rateLimitResponses += 1;
              const cooldownMs = bumpRateLimitCooldown(
                typeof res.headers?.get === "function"
                  ? res.headers.get("retry-after")
                  : null,
              );
              throw new RateLimitError("GameBanana rate limit reached.", {
                retryAfterMs: cooldownMs,
              });
            }

            const error = new Error(`GB API error: ${res.status}`);
            error.status = res.status;
            throw error;
          }

          recordBucketSuccess(policy.bucket);
          requestState.rateLimitStrikeCount = 0;
          const data = await res.json();
          if (!data || typeof data !== "object") {
            throw new Error("GB API returned an invalid response payload.");
          }
          await writeToCache(cacheKey, data, policy.ttlMs, policy.bucket);
          return data;
        } catch (error) {
          lastError = error;
          if (error instanceof RateLimitError) {
            throw error;
          }

          // Non-rate-limit errors count towards circuit failure
          recordBucketFailure(policy.bucket);

          if (
            attempt >= runtime.retryCount ||
            !shouldRetryRequest(error, error.status)
          ) {
            throw error;
          }

          // Exponential backoff with Jitter
          const baseDelay = 300 * (attempt + 1);
          const jitter = Math.random() * 200;
          await runtime.sleepImpl(baseDelay + jitter);
        } finally {
          clearTimeout(timeout);
        }
      }

      throw lastError || new Error("GB API request failed.");
    } finally {
      releaseNetworkSlot();
    }
  })();

  requestState.inFlight.set(dedupeKey, fetchPromise);

  try {
    return await fetchPromise;
  } finally {
    if (requestState.inFlight.get(dedupeKey) === fetchPromise) {
      requestState.inFlight.delete(dedupeKey);
    }
  }
}

export function getGameBananaRequestStats() {
  return {
    ...requestStats,
    inFlight: requestState.inFlight.size,
    cacheEntries: requestState.cache.size,
    cooldownRemainingMs: getCooldownRemainingMs(),
    maxConcurrentRequests: runtime.maxConcurrentRequests,
    queuedHigh: requestState.waiters.high.length,
    queuedMedium: requestState.waiters.medium.length,
    queuedLow: requestState.waiters.low.length,
    rateLimitStrikeCount: requestState.rateLimitStrikeCount,
  };
}

/**
 * Dev/testing: clear client-side rate-limit cooldown and exponential strike counter.
 * Does not clear the response cache or cancel in-flight requests.
 */
export function resetGameBananaRateLimitState() {
  requestState.cooldownUntil = 0;
  requestState.rateLimitStrikeCount = 0;
}

async function runWithConcurrencyLimit(items, maxConcurrent, worker) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const results = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({
    length: Math.max(1, Math.min(maxConcurrent, items.length)),
  }).map(async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

export async function fetchGbMod(gamebananaId) {
  const id = assertInteger(gamebananaId, "gamebananaId", { min: 1 });
  const [profileData, filesData] = await Promise.all([
    fetchFromGB(`${GB_API}/Mod/${id}/ProfilePage`, { priority: "high" }),
    fetchFromGB(`${GB_API}/Mod/${id}/Files`, { priority: "high" }).catch(
      (err) => {
        logger.warn(`Failed to fetch files for mod ${id}`, err.message);
        return [];
      },
    ),
  ]);

  if (!profileData) {
    throw new Error(`Profile data missing for mod ${id}`);
  }

  const rawData = {
    ...profileData,
    _aFiles: Array.isArray(filesData) ? filesData : [],
  };

  return normalizeGbModForCache(rawData);
}

export async function fetchGbModsBatch(ids, options = {}) {
  if (!ids || ids.length === 0) return [];
  const validIds = assertIntegerArray(ids, "ids");
  const uniqueIds = [...new Set(validIds)];
  const priority = resolvePriority(options.priority || "low");
  const perItemConcurrency = Number.isInteger(options.concurrency)
    ? Math.max(1, Math.min(8, options.concurrency))
    : 2;

  // Per-item fetch with automatic retry on timeout/failure
  async function fetchModWithRetry(id, maxRetries = 2) {
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Sequential Profile then Files keeps peak concurrency low (parallel per mod was 2× fan-out).
        const profileData = await fetchFromGB(
          `${GB_API}/Mod/${id}/ProfilePage`,
          {
            priority,
            timeoutMs: 8000, // Per-item timeout (shorter than global 12s)
          },
        );
        const filesData = await fetchFromGB(`${GB_API}/Mod/${id}/Files`, {
          priority,
          timeoutMs: 8000,
        }).catch(() => []);

        if (!profileData) return null;

        const rawData = {
          ...profileData,
          _aFiles: Array.isArray(filesData) ? filesData : [],
        };
        return normalizeGbModForCache(rawData);
      } catch (error) {
        lastError = error;

        // Don't retry on rate limits or circuit breaker
        if (
          error instanceof RateLimitError ||
          error.message?.includes("circuit breaker")
        ) {
          throw error;
        }

        // Timeout or network errors: retry with exponential backoff
        if (attempt < maxRetries) {
          const delayMs = 300 * (attempt + 1) + Math.random() * 200;
          await runtime.sleepImpl(delayMs);
          continue;
        }

        // Max retries exceeded
        logger.warn(
          `Batch update fetch failed for mod ${id} after ${maxRetries + 1} attempts:`,
          error.message,
        );
        return null;
      }
    }

    return null;
  }

  const results = await runWithConcurrencyLimit(
    uniqueIds,
    perItemConcurrency,
    (id) => fetchModWithRetry(id, 2),
  );

  return results.filter(Boolean);
}

export async function fetchGbModsSummaries(ids, options = {}) {
  if (!ids || ids.length === 0) return [];
  const validIds = assertIntegerArray(ids, "ids");
  const priority = resolvePriority(options.priority || "medium");
  const perItemConcurrency = Number.isInteger(options.concurrency)
    ? Math.max(1, Math.min(8, options.concurrency))
    : 6;

  const results = await runWithConcurrencyLimit(
    validIds,
    perItemConcurrency,
    async (id) => {
      try {
        // Use the v11 dedicated ProfilePage endpoint
        const data = await fetchFromGB(`${GB_API}/Mod/${id}/ProfilePage`, {
          priority,
        });
        return normalizeGbModForCache(data);
      } catch (error) {
        logger.warn(
          `Bookmark summary fetch failed for mod ${id}`,
          error.message,
        );
        return null;
      }
    },
  );

  return results.filter(Boolean);
}

async function resolveCharCategory(gameId, charName) {
  const searchLower = charName.toLowerCase();
  const cacheKey = `${gameId}_${searchLower}`;
  if (Object.prototype.hasOwnProperty.call(characterCategoryCache, cacheKey)) {
    return characterCategoryCache[cacheKey];
  }
  const inFlightLookup = characterCategoryLookups.get(cacheKey);
  if (inFlightLookup) {
    return inFlightLookup;
  }

  const lookupPromise = (async () => {
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
        // Use v11 ProfilePage endpoint for the full category data
        const modData = await fetchFromGB(
          `${GB_API}/Mod/${mod._idRow}/ProfilePage`,
        );
        if (!modData._aCategory || !modData._aSuperCategory) {
          continue;
        }

        const rootName = (
          modData._aSuperCategory?._sName ||
          modData._aRootCategory?._sName ||
          ""
        ).toLowerCase();
        const catName = (modData._aCategory._sName || "").toLowerCase();

        if (rootName.includes("skin") || rootName.includes("character")) {
          return modData._aCategory._idRow;
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
            return modData._aCategory._idRow;
          }
        }

        if (searchLower.includes("misc")) {
          if (
            rootName.includes("misc") ||
            rootName.includes("other") ||
            catName.includes("misc") ||
            catName.includes("other")
          ) {
            return modData._aCategory._idRow;
          }
        }
      }
    } catch (error) {
      logger.warn("Failed to auto-discover category ID", error.message);
    }

    return null;
  })();

  characterCategoryLookups.set(cacheKey, lookupPromise);

  try {
    const resolvedCategoryId = await lookupPromise;
    characterCategoryCache[cacheKey] = resolvedCategoryId;
    return resolvedCategoryId;
  } finally {
    characterCategoryLookups.delete(cacheKey);
  }
}

/**
 * Fetch live search autocomplete suggestions from the v11 API.
 * Returns an array of suggestion strings (e.g. ["keqing skin", "keqing casual", ...]).
 * Requires at least 2 characters to return results.
 */
export async function searchGbModSuggestions(args = {}) {
  assertPlainObject(args, "suggestArgs");
  const query = assertOptionalString(args.query ?? "", "query", {
    allowEmpty: true,
    maxLength: 240,
  });
  const gbGameId =
    args.gbGameId != null
      ? assertInteger(args.gbGameId, "gbGameId", { min: 1 })
      : null;

  if (!query || query.trim().length < 2) return [];

  let url = `${GB_API}/Util/Search/Suggestions?_sSearchString=${encodeURIComponent(query.trim())}&_sModelName=Mod`;
  if (gbGameId) {
    url += `&_idGameRow=${gbGameId}`;
  }

  try {
    const data = await fetchFromGB(url);
    return Array.isArray(data) ? data.slice(0, 8) : [];
  } catch {
    return [];
  }
}

/**
 * Fetch a full member/creator profile from the v11 /Member/{id}/ProfilePage endpoint.
 * Returns rich stats (subscribers, submissions, points, medals, donation links).
 */
export async function fetchGbMemberProfile(memberId) {
  const id = assertInteger(memberId, "memberId", { min: 1 });
  const data = await fetchFromGB(`${GB_API}/Member/${id}/ProfilePage`);
  if (!data || typeof data !== "object") return null;

  const coreStats = data._aCoreStats ?? {};

  return {
    _idRow: toIntegerOr(0, data._idRow),
    _sName: toStringOr("", data._sName),
    _sUserTitle: toStringOr("", data._sUserTitle),
    _sAvatarUrl: toStringOr("", data._sAvatarUrl),
    _sHdAvatarUrl: toStringOr("", data._sHdAvatarUrl),
    _sUpicUrl: toStringOr("", data._sUpicUrl),
    _sProfileUrl: toStringOr("", data._sProfileUrl),
    _bIsOnline: !!data._bIsOnline,
    _tsJoinDate: toIntegerOr(0, data._tsJoinDate),
    _nPoints: toNumberOr(0, coreStats._nPoints ?? data._nPoints),
    _nPointsRank: toNumberOr(0, data._nPointsRank),
    _nSubscriberCount: toNumberOr(
      0,
      coreStats._nCurrentSubscribers ?? data._nSubscriberCount,
    ),
    _nSubmissionsCount: toNumberOr(0, coreStats._nCurrentSubmissions),
    _nThanksReceived: toNumberOr(0, coreStats._nThanksReceived),
    _nFeaturedCount: toNumberOr(0, coreStats._nSubmissionsFeatured),
    _nMedalsCount: toNumberOr(0, coreStats._nMedalsCount),
    _sAccountAge: toStringOr("", coreStats._sAccountAge),
    _aNormalMedals: Array.isArray(data._aNormalMedals)
      ? data._aNormalMedals
      : [],
    _aRareMedals: Array.isArray(data._aRareMedals) ? data._aRareMedals : [],
    _aLegendaryMedals: Array.isArray(data._aLegendaryMedals)
      ? data._aLegendaryMedals
      : [],
    _aDonationMethods: Array.isArray(data._aDonationMethods)
      ? data._aDonationMethods
      : [],
  };
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
      maxLength: 48,
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
  const featuredOnly = !!args.featuredOnly;
  const characterSkins = !!args.characterSkins;
  const hideNsfw = !!args.hideNsfw;
  /** When false, skip N× ProfilePage fixups if Index returns all zero downloads (much faster; counts rely on Index). */
  const hydrateZeroDownloadCounts = args.hydrateZeroDownloadCounts !== false;

  const browseFields =
    "name,_aPreviewMedia,_aSubmitter,_nLikeCount,_nDownloadCount,_nViewCount,_tsDateAdded,_tsDateUpdated,_tsDateModified,_sProfileUrl,_bWasFeatured,_aTags,_sVersion,_aSubCategory,_bHasContentRatings";

  // v11 Search endpoint can be picky about certain fields (like content ratings or subcategories)
  // causing 400 errors if they aren't part of the search index metadata.
  const searchFields =
    "name,_aPreviewMedia,_aSubmitter,_nLikeCount,_nDownloadCount,_nViewCount,_tsDateAdded,_tsDateUpdated,_tsDateModified,_sProfileUrl,_bWasFeatured,_aTags,_sVersion";

  // Accept full Generic_* aliases directly OR legacy shorthand keys
  const sortAliasMap = {
    likes: "Generic_MostLiked",
    downloads: "Generic_MostDownloaded",
    views: "Generic_MostViewed",
  };
  const VALID_SORT_ALIASES = new Set([
    "Generic_Newest",
    "Generic_Oldest",
    "Generic_LatestModified",
    "Generic_NewAndUpdated",
    "Generic_LatestUpdated",
    "Generic_Alphabetically",
    "Generic_ReverseAlphabetically",
    "Generic_MostLiked",
    "Generic_MostViewed",
    "Generic_MostCommented",
    "Generic_LatestComment",
    "Generic_MostDownloaded",
  ]);
  const resolvedSort =
    sortAliasMap[sort] || (VALID_SORT_ALIASES.has(sort) ? sort : "");
  const sortStr = resolvedSort ? `&_sSort=${resolvedSort}` : "";
  const featuredFilter = featuredOnly
    ? "&_aFilters[Generic_WasFeatured]=true"
    : "";
  // _aFilters[Generic_ContentRatings]=- means "Unrated only" — effectively hides all NSFW-flagged mods
  const contentRatingsFilter = hideNsfw
    ? "&_aFilters[Generic_ContentRatings]=-"
    : "";

  const hasManualSearch = search && search.trim().length >= 1;
  const hasCategoryContext = context && context.trim().length >= 1;

  let url;

  if (submitterId) {
    url = `${GB_API}/Mod/Index?_aFilters[Generic_Game]=${gbGameId}&_aFilters[Generic_Submitter]=${submitterId}&_nPage=${page}&_nPerpage=${perPage}${sortStr}${featuredFilter}${contentRatingsFilter}&_csvFields=${encodeURIComponent(browseFields)}`;
  } else if (hasManualSearch) {
    const combinedQuery = [context, search].filter(Boolean).join(" ");
    url = `${GB_API}/Util/Search/Results?_sModelName=Mod&_idGameRow=${gbGameId}&_sSearchString=${encodeURIComponent(combinedQuery)}&_nPage=${page}&_nPerpage=${perPage}${sortStr}&_csvFields=${encodeURIComponent(searchFields)}`;
  } else if (hasCategoryContext) {
    const charName = context.trim();
    const catId = await resolveCharCategory(gbGameId, charName);

    if (catId) {
      url = `${GB_API}/Mod/Index?_aFilters[Generic_Category]=${catId}&_nPage=${page}&_nPerpage=${perPage}${sortStr}${featuredFilter}${contentRatingsFilter}&_csvFields=${encodeURIComponent(browseFields)}`;
    } else {
      url = `${GB_API}/Util/Search/Results?_sModelName=Mod&_idGameRow=${gbGameId}&_sSearchString=${encodeURIComponent(charName)}&_nPage=${page}&_nPerpage=${perPage}${sortStr}&_csvFields=${encodeURIComponent(searchFields)}`;
    }
  } else {
    // Characters tab with no specific character selected: scope to the root
    // Character Skins category so UI/Misc mods don't leak through.
    const rootCatId = characterSkins
      ? CHARACTER_SKINS_ROOT_CATS[gbGameId]
      : null;
    if (rootCatId) {
      url = `${GB_API}/Mod/Index?_aFilters[Generic_Category]=${rootCatId}&_nPage=${page}&_nPerpage=${perPage}${sortStr}${featuredFilter}${contentRatingsFilter}&_csvFields=${encodeURIComponent(browseFields)}`;
    } else {
      url = `${GB_API}/Mod/Index?_aFilters[Generic_Game]=${gbGameId}&_nPage=${page}&_nPerpage=${perPage}${sortStr}${featuredFilter}${contentRatingsFilter}&_csvFields=${encodeURIComponent(browseFields)}`;
    }
  }

  logger.debug("GB API request", url);
  const { records, total } = await fetchBrowseRecords(url, {
    hydrateZeroDownloadCounts,
  });

  return { records, total };
}

/**
 * Fetch the game activity subfeed — new uploads, updates, and recently active mods.
 * Uses the official v11 /Game/{id}/Subfeed endpoint.
 * Returns richer data than /Mod/Index: _aTags, _sVersion, _bWasFeatured, _aSubCategory.
 */
export async function fetchGbSubfeed(args = {}) {
  assertPlainObject(args, "subfeedArgs");
  const gbGameId = assertInteger(args.gbGameId, "gbGameId", { min: 1 });
  const page = assertInteger(args.page ?? 1, "page", { min: 1, max: 1000 });
  const perPage = assertInteger(args.perPage ?? 20, "perPage", {
    min: 1,
    max: 50,
  });

  const url = `${GB_API}/Game/${gbGameId}/Subfeed?_nPage=${page}&_nPerpage=${perPage}`;
  logger.debug("GB Subfeed request", url);

  const data = await fetchFromGB(url);
  const rawRecords = Array.isArray(data._aRecords) ? data._aRecords : [];

  const records = rawRecords
    .map((item) => ({
      ...withThumbnail(item),
      _aSubmitter: normalizeSubmitter(item._aSubmitter),
      _aRootCategory: normalizeCategory(item._aRootCategory),
      _aSubCategory: item._aSubCategory ?? null,
      _aTags: Array.isArray(item._aTags) ? item._aTags : [],
      _bWasFeatured: !!item._bWasFeatured,
      _sVersion: toStringOr("", item._sVersion),
      _nLikeCount: toNumberOr(0, item._nLikeCount),
      _nViewCount: toNumberOr(0, item._nViewCount),
      _tsDateAdded: toIntegerOr(0, item._tsDateAdded),
      _tsDateUpdated: toIntegerOr(
        0,
        item._tsDateUpdated ?? item._tsDateModified,
      ),
    }))
    .filter((item) => item?._idRow > 0);

  const total = Number.isFinite(data._aMetadata?._nRecordCount)
    ? data._aMetadata._nRecordCount
    : records.length;

  return { records, total };
}
