import test from "node:test";
import assert from "node:assert/strict";
import {
  browseGbMods,
  fetchGbFeaturedMods,
  fetchGbMod,
  fetchGbModsSummaries,
  setGameBananaRuntime,
} from "./gamebanana.js";

function createJsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
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
    nowImpl: () => Date.now(),
  });
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

      if (url.includes("/Mod/101?")) {
        return createJsonResponse({
          _idRow: 101,
          _sName: "First Mod",
          _nDownloadCount: 4567,
        });
      }

      if (url.includes("/Mod/102?")) {
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
  assert.ok(requestedUrls.some((url) => url.includes("/Mod/101?")));
  assert.ok(requestedUrls.some((url) => url.includes("/Mod/102?")));
});

test("fetchGbFeaturedMods returns bucketed best-of winners in timeframe order", async () => {
  const now = Date.UTC(2026, 3, 7);
  const day = 24 * 60 * 60 * 1000;
  const candidatePages = new Map([
    [
      "Generic_Newest:1",
      [
        {
          _idRow: 201,
          _sName: "Week Winner",
          _tsDateAdded: now - 2 * day,
          _nLikeCount: 100,
          _nDownloadCount: 0,
        },
        {
          _idRow: 202,
          _sName: "Month Winner",
          _tsDateAdded: now - 20 * day,
          _nLikeCount: 95,
          _nDownloadCount: 0,
        },
        {
          _idRow: 203,
          _sName: "Six Month Winner",
          _tsDateAdded: now - 120 * day,
          _nLikeCount: 90,
          _nDownloadCount: 0,
        },
        {
          _idRow: 204,
          _sName: "Year Winner",
          _tsDateAdded: now - 300 * day,
          _nLikeCount: 85,
          _nDownloadCount: 0,
        },
      ],
    ],
    [
      "Generic_Newest:2",
      [],
    ],
    [
      "Generic_MostLiked:1",
      [
        {
          _idRow: 204,
          _sName: "Year Winner",
          _tsDateAdded: now - 300 * day,
          _nLikeCount: 85,
          _nDownloadCount: 0,
          _nViewCount: 1200,
        },
        {
          _idRow: 203,
          _sName: "Six Month Winner",
          _tsDateAdded: now - 120 * day,
          _nLikeCount: 90,
          _nDownloadCount: 0,
          _nViewCount: 900,
        },
      ],
    ],
    ["Generic_MostLiked:2", []],
    [
      "Generic_MostDownloaded:1",
      [
        {
          _idRow: 202,
          _sName: "Month Winner",
          _tsDateAdded: now - 20 * day,
          _nLikeCount: 95,
          _nDownloadCount: 0,
          _nViewCount: 800,
        },
      ],
    ],
    ["Generic_MostDownloaded:2", []],
    [
      "Generic_MostViewed:1",
      [
        {
          _idRow: 201,
          _sName: "Week Winner",
          _tsDateAdded: now - 2 * day,
          _nLikeCount: 100,
          _nDownloadCount: 0,
          _nViewCount: 1500,
        },
      ],
    ],
    ["Generic_MostViewed:2", []],
  ]);
  const detailById = new Map([
    [201, { _tsDateAdded: now - 2 * day, _nLikeCount: 100 }],
    [202, { _tsDateAdded: now - 20 * day, _nLikeCount: 95 }],
    [203, { _tsDateAdded: now - 120 * day, _nLikeCount: 90 }],
    [204, { _tsDateAdded: now - 300 * day, _nLikeCount: 85 }],
    [205, { _tsDateAdded: now - 500 * day, _nLikeCount: 999 }],
  ]);

  setGameBananaRuntime({
    retryCount: 0,
    nowImpl: () => now,
    fetchImpl: async (url) => {
      if (
        url.includes("/Mod/Index?") &&
        url.includes("Generic_MostLiked") &&
        url.includes("_nPerpage=12")
      ) {
        return createJsonResponse({
          _aRecords: [
            {
              _idRow: 205,
              _sName: "All Time Winner",
              _nLikeCount: 999,
              _nDownloadCount: 0,
            },
          ],
          _aMetadata: { _nRecordCount: 1 },
        });
      }

      if (url.includes("/Mod/Index?") && url.includes("Generic_Game")) {
        const pageMatch = url.match(/_nPage=(\d+)/);
        const page = Number(pageMatch?.[1] || 1);
        const sortMatch = url.match(/_sSort=([^&]+)/);
        const sort = sortMatch?.[1] || "Generic_Newest";
        return createJsonResponse({
          _aRecords: candidatePages.get(`${sort}:${page}`) || [],
          _aMetadata: { _nRecordCount: 4 },
        });
      }

      const modMatch = url.match(/\/Mod\/(\d+)\?/);
      if (modMatch) {
        const id = Number(modMatch[1]);
        const detail = detailById.get(id) || {};
        return createJsonResponse({
          _idRow: id,
          _sName: `Hydrated ${id}`,
          _tsDateAdded: detail._tsDateAdded,
          _nLikeCount: detail._nLikeCount,
          _nDownloadCount: id * 10,
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    },
  });

  const result = await fetchGbFeaturedMods(1);

  assert.deepEqual(
    result.map((entry) => entry.id),
    ["week", "month", "sixMonths", "year", "allTime"],
  );
  assert.deepEqual(
    result.map((entry) => entry.mod._idRow),
    [201, 202, 203, 204, 205],
  );
  assert.equal(result[0].label, "Best of This Week");
  assert.equal(result[4].label, "Best of All Time");
  assert.equal(result[0].mod._nDownloadCount, 2010);
});
