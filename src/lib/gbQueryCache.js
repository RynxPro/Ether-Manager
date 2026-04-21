const DEFAULT_TTL_MS = 60 * 1000;

const cachedResults = new Map();
const inFlightRequests = new Map();

export function makeGbQueryKey(parts) {
  if (Array.isArray(parts)) {
    return JSON.stringify(parts);
  }
  return String(parts);
}

export function getCachedGbQuery(queryKey, ttlMs = DEFAULT_TTL_MS) {
  const key = makeGbQueryKey(queryKey);
  const cached = cachedResults.get(key);
  if (!cached) return null;

  if (Date.now() - cached.timestamp > ttlMs) {
    cachedResults.delete(key);
    return null;
  }

  return cached.value;
}

export function primeGbQuery(queryKey, value) {
  cachedResults.set(makeGbQueryKey(queryKey), {
    value,
    timestamp: Date.now(),
  });
}

export async function fetchGbCachedQuery(
  queryKey,
  fetcher,
  { ttlMs = DEFAULT_TTL_MS, force = false } = {},
) {
  const key = makeGbQueryKey(queryKey);

  if (!force) {
    const cached = getCachedGbQuery(key, ttlMs);
    if (cached != null) {
      return cached;
    }

    const existingRequest = inFlightRequests.get(key);
    if (existingRequest) {
      return existingRequest;
    }
  }

  const request = (async () => {
    const result = await fetcher();
    if (result?.success) {
      primeGbQuery(key, result);
    }
    return result;
  })();

  inFlightRequests.set(key, request);

  try {
    return await request;
  } finally {
    if (inFlightRequests.get(key) === request) {
      inFlightRequests.delete(key);
    }
  }
}

export function clearGbQueryCache() {
  cachedResults.clear();
  inFlightRequests.clear();
}
