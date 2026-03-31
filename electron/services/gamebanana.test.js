import test from "node:test";
import assert from "node:assert/strict";
import {
  browseGbMods,
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
