/**
 * GameBanana Fetch Cache Utility
 * Caches API responses with timestamps to avoid redundant requests
 * Cache expires after 5 minutes (configurable)
 */

const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const modCache = new Map();
const batchCache = new Map();

/**
 * Get cached mod data if available and not expired
 * @param {number} modId - GameBanana mod ID
 * @param {number} maxAge - Maximum age in milliseconds (default 5 min)
 * @returns {Object|null} Cached mod data or null if expired/not found
 */
export function getCachedMod(modId, maxAge = CACHE_EXPIRY_MS) {
  const cached = modCache.get(modId);
  if (!cached) return null;

  const age = Date.now() - cached.timestamp;
  if (age > maxAge) {
    modCache.delete(modId);
    return null;
  }

  return cached.data;
}

/**
 * Store mod data in cache
 * @param {number} modId - GameBanana mod ID
 * @param {Object} data - Mod data to cache
 */
export function setCachedMod(modId, data) {
  modCache.set(modId, {
    data,
    timestamp: Date.now(),
  });
}

/**
 * Get cached batch request if available and not expired
 * @param {string} cacheKey - Unique cache key for the batch request
 * @param {number} maxAge - Maximum age in milliseconds (default 5 min)
 * @returns {Object|null} Cached batch data or null if expired/not found
 */
export function getCachedBatch(cacheKey, maxAge = CACHE_EXPIRY_MS) {
  const cached = batchCache.get(cacheKey);
  if (!cached) return null;

  const age = Date.now() - cached.timestamp;
  if (age > maxAge) {
    batchCache.delete(cacheKey);
    return null;
  }

  return cached.data;
}

/**
 * Store batch request data in cache
 * @param {string} cacheKey - Unique cache key for the batch request
 * @param {Object} data - Batch data to cache
 */
export function setCachedBatch(cacheKey, data) {
  batchCache.set(cacheKey, {
    data,
    timestamp: Date.now(),
  });
}

/**
 * Generate a cache key for batch requests based on parameters
 * @param {string} gameId - GameBanana game ID
 * @param {string} sort - Sort preference
 * @param {string} context - Search context/character
 * @param {string} search - Search query
 * @returns {string} Cache key
 */
export function generateBatchCacheKey(gameId, sort, context, search) {
  return `${gameId}_${sort}_${context}_${search}`;
}

/**
 * Clear entire mod cache
 */
export function clearModCache() {
  modCache.clear();
}

/**
 * Clear entire batch cache
 */
export function clearBatchCache() {
  batchCache.clear();
}

/**
 * Clear all caches
 */
export function clearAllCaches() {
  modCache.clear();
  batchCache.clear();
}

/**
 * Get cache statistics for debugging
 */
export function getCacheStats() {
  return {
    modCacheSize: modCache.size,
    batchCacheSize: batchCache.size,
    totalCachedItems: modCache.size + batchCache.size,
  };
}
