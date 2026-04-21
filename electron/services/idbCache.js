/**
 * Cache layer for GameBanana API responses (Electron main process)
 * 
 * NOTE: Electron main process (Node.js) doesn't have IndexedDB.
 * This module provides memory-only caching with graceful degradation.
 * For persistent caching, we could use better-sqlite3 or LevelDB in the future.
 * 
 * Current: Memory cache only (survives for session duration)
 * Future: Could migrate to better-sqlite3 for true persistence
 */

import { createLogger } from "./logger.js";

const logger = createLogger("cache");

// Memory cache implementation (session-only)
const memoryCache = new Map();

/**
 * Initialize cache (no-op for memory cache)
 */
async function initDB() {
  logger.debug("Cache initialized (memory-only in Electron main process)");
  return true;
}

/**
 * Get cached entry from memory
 * Returns: { data, source } or null if not found/expired
 */
async function getCached(url) {
  if (!memoryCache.has(url)) {
    return null;
  }

  const entry = memoryCache.get(url);
  if (isEntryExpired(entry)) {
    memoryCache.delete(url);
    return null;
  }

  return { data: entry.data, source: "memory" };
}

/**
 * Store entry in memory cache
 * bucket: "suggestions", "search", "profilePage", etc.
 * ttlMs: override TTL (default 1 week)
 */
async function setCached(url, bucket, data, ttlMs = 7 * 24 * 60 * 60 * 1000) {
  const entry = {
    url,
    bucket,
    data,
    timestamp: Date.now(),
    ttlMs,
  };

  memoryCache.set(url, entry);
  return true;
}

/**
 * Check if entry has expired
 */
function isEntryExpired(entry) {
  if (!entry || !entry.timestamp || !entry.ttlMs) {
    return true;
  }
  const ageMs = Date.now() - entry.timestamp;
  return ageMs > entry.ttlMs;
}

/**
 * Clear all cached entries
 */
async function clearCache() {
  memoryCache.clear();
  logger.info("Cache cleared");
  return true;
}

/**
 * Get cache statistics
 */
function getCacheStats() {
  return {
    memorySize: memoryCache.size,
    idbReady: false,
    totalMemoryEntries: memoryCache.size,
    cacheType: "memory-only (session)",
  };
}

/**
 * Cleanup expired entries periodically
 * Called every 30 minutes
 */
async function cleanupExpiredEntries() {
  let cleanedCount = 0;
  for (const [url, entry] of memoryCache.entries()) {
    if (isEntryExpired(entry)) {
      memoryCache.delete(url);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    logger.info(`Cleaned ${cleanedCount} expired cache entries`);
  }
}

// Schedule cleanup every 30 minutes
setInterval(cleanupExpiredEntries, 30 * 60 * 1000);

export {
  initDB,
  getCached,
  setCached,
  clearCache,
  getCacheStats,
  cleanupExpiredEntries,
};
