import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchGbCachedQuery, makeGbQueryKey } from "../lib/gbQueryCache";

function getSuccessData(result) {
  if (result == null) return null;
  if (typeof result === "object" && "success" in result) {
    if (!result.success) return null;
    return "data" in result ? result.data : result;
  }
  return result;
}

function getErrorMessage(result, fallback) {
  if (result && typeof result === "object" && "error" in result && result.error) {
    return result.error;
  }
  return fallback;
}

export function useGbQuery({
  enabled = true,
  queryKey,
  queryFn,
  ttlMs,
  keepPreviousData = true,
  initialData = null,
}) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);
  const resolvedKey = useMemo(() => makeGbQueryKey(queryKey), [queryKey]);

  const runQuery = useCallback(
    async ({ force = false } = {}) => {
      if (!enabled) {
        setLoading(false);
        return null;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      if (!keepPreviousData) {
        setData(initialData);
      }
      setLoading(true);
      setError(null);

      try {
        const result = await fetchGbCachedQuery(resolvedKey, queryFn, {
          ttlMs,
          force,
        });
        if (requestId !== requestIdRef.current) return null;

        if (result && typeof result === "object" && "success" in result && !result.success) {
          setError(getErrorMessage(result, "Request failed."));
          return result;
        }

        setData(getSuccessData(result));
        return result;
      } catch (queryError) {
        if (requestId === requestIdRef.current) {
          setError(queryError?.message || "Request failed.");
        }
        return null;
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [enabled, initialData, keepPreviousData, queryFn, resolvedKey, ttlMs],
  );

  useEffect(() => {
    if (!enabled) {
      requestIdRef.current += 1;
      setLoading(false);
      if (!keepPreviousData) {
        setData(initialData);
      }
      setError(null);
      return;
    }

    void runQuery();
  }, [enabled, initialData, keepPreviousData, resolvedKey, runQuery]);

  return {
    data,
    loading,
    error,
    refetch: (options) => runQuery({ force: true, ...options }),
  };
}
