import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useFetchCache } from "./useFetchCache";
import { useNetworkStatus } from "./useNetworkStatus";
import { buildBrowseIdentityKey, getBrowseCategoryTarget } from "../lib/browseState";

const PER_PAGE = 25;

function formatGbApiError(errorLike, fallback = "Request failed.") {
  const code = errorLike?.code;
  const retryAfterMs = Number(errorLike?.retryAfterMs);
  if (code === "RATE_LIMITED") {
    const seconds = Math.max(
      1,
      Math.ceil((Number.isFinite(retryAfterMs) ? retryAfterMs : 5000) / 1000),
    );
    return `GameBanana is rate-limiting requests. Cooling down for about ${seconds}s before retrying.`;
  }
  return errorLike?.error || errorLike?.message || fallback;
}

export function useBrowseListing({
  game,
  isActive = false,
  activeTab,
  page,
  sort,
  featuredOnly,
  nsfwMode,
  characterFilter,
  submittedSearchQuery,
}) {
  const isOnline = useNetworkStatus();
  const { browseMods } = useFetchCache();
  const [mods, setMods] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [browseGridReadyForFeatured, setBrowseGridReadyForFeatured] =
    useState(false);
  const browseFetchIdRef = useRef(0);
  const prevBrowseTabRef = useRef(null);

  const browseIdentityKey = useMemo(
    () =>
      buildBrowseIdentityKey({
        gbGameId: game.gbGameId,
        activeTab,
        submittedSearchQuery,
        characterFilter,
        featuredOnly,
        nsfwMode,
        sort,
      }),
    [
      game.gbGameId,
      activeTab,
      submittedSearchQuery,
      characterFilter,
      featuredOnly,
      nsfwMode,
      sort,
    ],
  );

  useEffect(() => {
    setBrowseGridReadyForFeatured(false);
  }, [game.gbGameId]);

  useEffect(() => {
    setMods([]);
    setTotal(0);
  }, [game.gbGameId]);

  useEffect(() => {
    const prev = prevBrowseTabRef.current;
    prevBrowseTabRef.current = activeTab;
    if (prev === null || prev === activeTab) return;
    setMods([]);
    setTotal(0);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "saved" && game.gbGameId) {
      setBrowseGridReadyForFeatured(true);
    }
  }, [activeTab, game.gbGameId]);

  const fetchMods = useCallback(async () => {
    if (!isActive) {
      setLoading(false);
      return;
    }

    if (activeTab === "saved") return;
    if (!isOnline) {
      setLoading(false);
      return;
    }

    if (!game.gbGameId) {
      setError("GameBanana integration is not yet available for this game.");
      return;
    }

    const fetchId = ++browseFetchIdRef.current;
    setLoading(true);
    setError(null);

    const categoryTarget = getBrowseCategoryTarget(activeTab, characterFilter);

    try {
      const result = await browseMods({
        gbGameId: game.gbGameId,
        page,
        perPage: PER_PAGE,
        sort,
        context: categoryTarget,
        search: submittedSearchQuery,
        featuredOnly,
        characterSkins: activeTab === "characters",
        hideNsfw: nsfwMode === "hide",
        hydrateZeroDownloadCounts: false,
      });

      if (fetchId !== browseFetchIdRef.current) return;

      if (result.success) {
        setMods(result.records);
        setTotal(result.total);
      } else {
        setError(
          formatGbApiError(result, "Failed to load mods from GameBanana."),
        );
      }
    } catch (err) {
      if (fetchId !== browseFetchIdRef.current) return;
      setError(formatGbApiError(err, "Network error."));
    } finally {
      if (fetchId === browseFetchIdRef.current) {
        setLoading(false);
        setBrowseGridReadyForFeatured(true);
      }
    }
  }, [
    activeTab,
    browseMods,
    characterFilter,
    featuredOnly,
    game.gbGameId,
    isActive,
    isOnline,
    nsfwMode,
    page,
    sort,
    submittedSearchQuery,
  ]);

  useEffect(() => {
    if (!isActive) {
      browseFetchIdRef.current += 1;
      setLoading(false);
      return;
    }

    if (activeTab !== "saved") {
      fetchMods();
    } else {
      setError(null);
    }
  }, [activeTab, fetchMods, isActive]);

  return {
    mods,
    setMods,
    total,
    setTotal,
    loading,
    setLoading,
    error,
    setError,
    browseGridReadyForFeatured,
    fetchMods,
    browseIdentityKey,
    perPage: PER_PAGE,
  };
}
