import { create } from "zustand";

/**
 * API State Store (Zustand)
 *
 * Syncs real-time GameBanana request statistics from the Electron service.
 * Polled every 500ms to keep cooldown countdown, queue depths, and latency current.
 *
 * All components subscribe to this store for consistent API feedback.
 */
export const useApiStore = create((set) => {
  let pollInterval = null;
  let isPolling = false;

  const startPolling = async () => {
    if (isPolling || !window.electronMods?.getGbRequestStats) return;
    isPolling = true;

    const poll = async () => {
      try {
        const res = await window.electronMods.getGbRequestStats();
        if (res?.success && res.data) {
          set((state) => ({
            stats: res.data,
            lastUpdateAt: Date.now(),
            pollError: null,
          }));
        } else if (res?.error) {
          set((state) => ({
            pollError: res.error,
          }));
        }
      } catch (err) {
        console.warn("[API Stats Poll] Failed:", err.message);
        set((state) => ({
          pollError: err.message,
        }));
      }
    };

    // Initial poll
    await poll();

    // Poll every 500ms
    pollInterval = setInterval(poll, 500);
  };

  const stopPolling = () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
      isPolling = false;
    }
  };

  return {
    /**
     * Current GameBanana request statistics from Electron.
     * Updated every 500ms via polling.
     */
    stats: {
      cooldownRemainingMs: 0,
      rateLimitStrikeCount: 0,
      inFlight: 0,
      queuedHigh: 0,
      queuedMedium: 0,
      queuedLow: 0,
      cacheEntries: 0,
      totalCalls: 0,
      networkCalls: 0,
      cacheHits: 0,
      dedupeHits: 0,
      throttleWaitMs: 0,
      rateLimitResponses: 0,
      latency: { totalMs: 0, count: 0, avgMs: 0 },
    },

    /**
     * Timestamp of last successful stats update (ms since epoch).
     */
    lastUpdateAt: 0,

    /**
     * Error message if polling fails (e.g., bridge not available).
     */
    pollError: null,

    /**
     * Start polling for real-time API stats. Call once on app init.
     */
    startStatsPolling: () => startPolling(),

    /**
     * Stop polling. Call on app unmount.
     */
    stopStatsPolling: () => stopPolling(),

    /**
     * Reset local store state (for testing or cleanup).
     */
    resetStats: () =>
      set({
        stats: {
          cooldownRemainingMs: 0,
          rateLimitStrikeCount: 0,
          inFlight: 0,
          queuedHigh: 0,
          queuedMedium: 0,
          queuedLow: 0,
          cacheEntries: 0,
          totalCalls: 0,
          networkCalls: 0,
          cacheHits: 0,
          dedupeHits: 0,
          throttleWaitMs: 0,
          rateLimitResponses: 0,
          latency: { totalMs: 0, count: 0, avgMs: 0 },
        },
        lastUpdateAt: 0,
        pollError: null,
      }),
  };
});

/**
 * Helper hook to get API feedback strings for UI display.
 */
export function useApiStatus() {
  const stats = useApiStore((state) => state.stats);

  return {
    isCoolingDown: stats.cooldownRemainingMs > 0,
    cooldownRemainingMs: stats.cooldownRemainingMs,
    cooldownSecondsRemaining: Math.max(
      1,
      Math.ceil(stats.cooldownRemainingMs / 1000),
    ),
    isQueued:
      (stats.queuedHigh || 0) +
        (stats.queuedMedium || 0) +
        (stats.queuedLow || 0) >
      0,
    queueLength:
      (stats.queuedHigh || 0) +
      (stats.queuedMedium || 0) +
      (stats.queuedLow || 0),
    inFlightCount: stats.inFlight || 0,
    rateLimitStrike: stats.rateLimitStrikeCount || 0,
    cacheHitRate:
      stats.totalCalls > 0
        ? Math.round(
            (((stats.cacheHits || 0) + (stats.dedupeHits || 0)) /
              stats.totalCalls) *
              100,
          )
        : null,
  };
}
