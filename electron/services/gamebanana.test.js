import test from "node:test";
import assert from "node:assert/strict";
import {
  browseGbMods,
  fetchFromGB,
  fetchGbFeaturedMods,
  fetchGbMod,
  fetchGbModsSummaries,
  getGameBananaRequestStats,
  resetGameBananaRateLimitState,
  setGameBananaRuntime,
} from "./gamebanana.js";

function createJsonResponse(payload, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        const key = String(name || "").toLowerCase();
        return headers[key] ?? null;
      },
    },
    async json() {
      return payload;
    },
  };
}

test.afterEach(() => {
  setGameBananaRuntime({
    fetchImpl: (...args) => fetch(...args),
    sleepImpl: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    timeoutMs: 12000,
    retryCount: 1,
    maxConcurrentRequests: 4,
    rateLimitCooldownMs: 5000,
    nowImpl: () => Date.now(),
    resetState: true,
  });
});

test("fetchFromGB deduplicates concurrent identical requests", async () => {
  let callCount = 0;

  setGameBananaRuntime({
    retryCount: 0,
    fetchImpl: async () => {
      callCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return createJsonResponse({ _idRow: 1, _sName: "Dedupe" });
    },
  });

  const first = fetchFromGB("https://gamebanana.com/apiv11/Mod/1/ProfilePage");
  const second = fetchFromGB("https://gamebanana.com/apiv11/Mod/1/ProfilePage");

  const [resultA, resultB] = await Promise.all([first, second]);

  assert.equal(callCount, 1);
  assert.equal(resultA._idRow, 1);
  assert.equal(resultB._idRow, 1);
});

test("fetchFromGB reuses cached response within TTL", async () => {
  let now = 1_000_000;
  let callCount = 0;

  setGameBananaRuntime({
    retryCount: 0,
    nowImpl: () => now,
    fetchImpl: async () => {
      callCount += 1;
      return createJsonResponse({
        _aRecords: [{ _idRow: callCount }],
        _aMetadata: { _nRecordCount: 1 },
      });
    },
    resetState: true,
  });

  const url =
    "https://gamebanana.com/apiv11/Mod/Index?_aFilters[Generic_Game]=1&_nPage=1&_nPerpage=20";
  const first = await fetchFromGB(url);
  now += 10_000;
  const second = await fetchFromGB(url);

  assert.equal(callCount, 1);
  assert.equal(first._aRecords[0]._idRow, 1);
  assert.equal(second._aRecords[0]._idRow, 1);
});

test("fetchFromGB enforces cooldown after 429 and returns rate limit metadata", async () => {
  let callCount = 0;

  setGameBananaRuntime({
    retryCount: 0,
    rateLimitCooldownMs: 1000,
    fetchImpl: async () => {
      callCount += 1;
      return createJsonResponse({ error: "rate limited" }, 429, {
        "retry-after": "1",
      });
    },
    resetState: true,
  });

  await assert.rejects(
    () => fetchFromGB("https://gamebanana.com/apiv11/Mod/2/ProfilePage"),
    (error) =>
      error?.code === "RATE_LIMITED" && Number.isFinite(error?.retryAfterMs),
  );

  await assert.rejects(
    () => fetchFromGB("https://gamebanana.com/apiv11/Mod/3/ProfilePage"),
    (error) => error?.code === "RATE_LIMITED",
  );

  assert.equal(callCount, 1);
});

test("resetGameBananaRateLimitState clears cooldown for testing", async () => {
  setGameBananaRuntime({
    retryCount: 0,
    rateLimitCooldownMs: 1000,
    fetchImpl: async () =>
      createJsonResponse({ error: "rate limited" }, 429, {
        "retry-after": "120",
      }),
    resetState: true,
  });

  await assert.rejects(() =>
    fetchFromGB("https://gamebanana.com/apiv11/Mod/9/ProfilePage"),
  );

  assert.ok(getGameBananaRequestStats().cooldownRemainingMs > 0);

  resetGameBananaRateLimitState();

  assert.equal(getGameBananaRequestStats().cooldownRemainingMs, 0);
});

test("429 with huge Retry-After seconds is capped so cooldown is not multi-hour", async () => {
  const MAX_MS = 15 * 60 * 1000;

  setGameBananaRuntime({
    retryCount: 0,
    rateLimitCooldownMs: 1000,
    fetchImpl: async () =>
      createJsonResponse({ error: "rate limited" }, 429, {
        "retry-after": "66120",
      }),
    resetState: true,
  });

  let err;
  try {
    await fetchFromGB("https://gamebanana.com/apiv11/Mod/1/ProfilePage");
  } catch (e) {
    err = e;
  }
  assert.equal(err?.code, "RATE_LIMITED");
  assert.ok(
    err?.retryAfterMs <= MAX_MS,
    `retryAfterMs should be capped, got ${err?.retryAfterMs}`,
  );

  const stats = getGameBananaRequestStats();
  assert.ok(stats.cooldownRemainingMs <= MAX_MS);
});

test("getGameBananaRequestStats tracks cache, dedupe, and network usage", async () => {
  let callCount = 0;

  setGameBananaRuntime({
    retryCount: 0,
    fetchImpl: async () => {
      callCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return createJsonResponse({ _idRow: 1 });
    },
    resetState: true,
  });

  const url = "https://gamebanana.com/apiv11/Mod/1/ProfilePage";
  const first = fetchFromGB(url);
  const second = fetchFromGB(url);
  await Promise.all([first, second]);
  await fetchFromGB(url);

  const stats = getGameBananaRequestStats();
  assert.equal(callCount, 1);
  assert.equal(stats.networkCalls, 1);
  assert.equal(stats.dedupeHits, 1);
  assert.equal(stats.cacheHits, 1);
  assert.equal(stats.totalCalls, 3);
});

test("fetchGbMod normalizes missing fields into stable defaults", async () => {
  setGameBananaRuntime({
    retryCount: 0,
    fetchImpl: async () =>
      createJsonResponse({
        _idRow: 123,
        _sName: "Sample Mod",
        _aPreviewMedia: {
          _aImages: [{ _sBaseUrl: "https://cdn.example.com", _sFile: "thumb.png" }],
        },
      }),
  });

  const mod = await fetchGbMod(123);

  assert.equal(mod._idRow, 123);
  assert.equal(mod._sName, "Sample Mod");
  assert.equal(mod.thumbnailUrl, "https://cdn.example.com/thumb.png");
  assert.deepEqual(mod.allImages, ["https://cdn.example.com/thumb.png"]);
  assert.equal(mod._nLikeCount, 0);
  assert.equal(mod._nDownloadCount, 0);
  assert.equal(mod._nViewCount, 0);
  assert.equal(mod._sDescription, "");
  assert.equal(mod._sText, "");
  assert.deepEqual(mod._aFiles, []);
  assert.equal(mod._aSubmitter, null);
});

test("fetchGbModsSummaries filters invalid records and preserves normalized shape", async () => {
  let callIndex = 0;
  setGameBananaRuntime({
    retryCount: 0,
    fetchImpl: async () => {
      callIndex += 1;
      if (callIndex === 1) {
        return createJsonResponse({
          _idRow: 10,
          _sName: "One",
          _aPreviewMedia: {
            _aImages: [{ _sBaseUrl: "https://img.example", _sFile220: "one.jpg" }],
          },
          _aSubmitter: { _idRow: 7, _sName: "Creator" },
        });
      }
      return createJsonResponse({
        _idRow: 11,
      });
    },
  });

  const result = await fetchGbModsSummaries([10, 11]);

  assert.equal(result.length, 2);
  assert.equal(result[0].thumbnailUrl, "https://img.example/one.jpg");
  assert.equal(result[0]._aSubmitter._sName, "Creator");
  assert.equal(result[1]._sName, "Unknown Mod");
  assert.equal(result[1].thumbnailUrl, null);
});

test("browseGbMods retries transient upstream failures before succeeding", async () => {
  const attemptedUrls = [];
  let attempts = 0;

  setGameBananaRuntime({
    retryCount: 1,
    sleepImpl: async () => {},
    fetchImpl: async (url) => {
      attemptedUrls.push(url);
      attempts += 1;
      if (attempts === 1) {
        return createJsonResponse({ message: "busy" }, 503);
      }
      return createJsonResponse({
        _aRecords: [
          {
            _idRow: 42,
            _sName: "Recovered Mod",
            _nDownloadCount: 12,
            _aPreviewMedia: {
              _aImages: [
                {
                  _sBaseUrl: "https://cdn.example.com",
                  _sFile530: "recovered.webp",
                },
              ],
            },
          },
        ],
        _aMetadata: { _nRecordCount: 99 },
      });
    },
  });

  const result = await browseGbMods({
    gbGameId: 1,
    page: 1,
    perPage: 20,
  });

  assert.equal(attempts, 2);
  assert.equal(attemptedUrls.length, 2);
  assert.equal(result.total, 99);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].thumbnailUrl, "https://cdn.example.com/recovered.webp");
});

test("browseGbMods normalizes numeric string counters from upstream records", async () => {
  setGameBananaRuntime({
    retryCount: 0,
    fetchImpl: async () =>
      createJsonResponse({
        _aRecords: [
          {
            _idRow: 77,
            _sName: "Counted Mod",
            _nLikeCount: "18",
            _nDownloadCount: "2456",
            _nViewCount: "9001",
          },
        ],
        _aMetadata: { _nRecordCount: 1 },
      }),
  });

  const result = await browseGbMods({
    gbGameId: 1,
    page: 1,
    perPage: 20,
  });

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0]._nLikeCount, 18);
  assert.equal(result.records[0]._nDownloadCount, 2456);
  assert.equal(result.records[0]._nViewCount, 9001);
});

test("browseGbMods hydrates summaries when browse records return zero download counts", async () => {
  const requestedUrls = [];

  setGameBananaRuntime({
    retryCount: 0,
    fetchImpl: async (url) => {
      requestedUrls.push(url);

      if (url.includes("/Mod/Index?")) {
        return createJsonResponse({
          _aRecords: [
            { _idRow: 101, _sName: "First Mod", _nLikeCount: 23, _nDownloadCount: 0 },
            { _idRow: 102, _sName: "Second Mod", _nLikeCount: 11, _nDownloadCount: 0 },
          ],
          _aMetadata: { _nRecordCount: 2 },
        });
      }

      if (url.includes("/Mod/101/ProfilePage")) {
        return createJsonResponse({
          _idRow: 101,
          _sName: "First Mod",
          _nDownloadCount: 4567,
        });
      }

      if (url.includes("/Mod/102/ProfilePage")) {
        return createJsonResponse({
          _idRow: 102,
          _sName: "Second Mod",
          _nDownloadCount: 8901,
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    },
  });

  const result = await browseGbMods({
    gbGameId: 1,
    page: 1,
    perPage: 20,
  });

  assert.equal(result.records[0]._nDownloadCount, 4567);
  assert.equal(result.records[1]._nDownloadCount, 8901);
  assert.ok(requestedUrls.some((url) => url.includes("/Mod/101/ProfilePage")));
  assert.ok(requestedUrls.some((url) => url.includes("/Mod/102/ProfilePage")));
});

test("fetchGbFeaturedMods returns bucketed best-of winners in timeframe order", async () => {
  setGameBananaRuntime({
    retryCount: 0,
    fetchImpl: async (url) => {
      if (url.includes("/Game/1/TopSubs")) {
        return createJsonResponse([
          {
            _idRow: 201,
            _sName: "Week Winner",
            _sPeriod: "week",
            _sImageUrl: "https://img/week.jpg",
            _sThumbnailUrl: "https://img/week-thumb.jpg",
          },
          {
            _idRow: 202,
            _sName: "Month Winner",
            _sPeriod: "month",
            _sImageUrl: "https://img/month.jpg",
            _sThumbnailUrl: "https://img/month-thumb.jpg",
          },
          {
            _idRow: 203,
            _sName: "All Time Winner",
            _sPeriod: "alltime",
            _sImageUrl: "https://img/alltime.jpg",
            _sThumbnailUrl: "https://img/alltime-thumb.jpg",
          },
        ]);
      }

      const modMatch = url.match(/\/Mod\/(\d+)\/ProfilePage/);
      if (modMatch) {
        const id = Number(modMatch[1]);
        return createJsonResponse({
          _idRow: id,
          _sName: `Hydrated ${id}`,
          _nDownloadCount: id * 10,
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    },
  });

  const result = await fetchGbFeaturedMods(1);

  assert.deepEqual(
    result.map((entry) => entry.id),
    ["week", "month", "allTime"],
  );
  assert.deepEqual(
    result.map((entry) => entry.mod._idRow),
    [201, 202, 203],
  );
  assert.equal(result[0].label, "Best of This Week");
  assert.equal(result[2].label, "Best of All Time");
  assert.equal(result[0].mod._nDownloadCount, 2010);
});
