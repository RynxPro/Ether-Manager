/**
 * Browse-domain helpers.
 *
 * Browse is mostly request/state orchestration rather than pure business rules,
 * so this module intentionally stays small. Its job is to centralize how tabs
 * map to GameBanana query params and how the view derives user-facing browse
 * context from those params.
 */

export function getBrowseCategoryTarget(activeTab, characterFilter) {
  if (activeTab === "all" || activeTab === "saved") return "";
  if (activeTab === "ui") return "UI";
  if (activeTab === "misc") return "Misc";
  return characterFilter || "";
}

export function buildBrowseIdentityKey({
  gbGameId,
  activeTab,
  submittedSearchQuery,
  characterFilter,
  featuredOnly,
  nsfwMode,
  sort,
}) {
  return [
    gbGameId,
    activeTab,
    submittedSearchQuery,
    characterFilter,
    String(featuredOnly),
    nsfwMode,
    sort,
  ].join("|");
}

export function getBrowseViewModel({
  activeTab,
  submittedSearchQuery,
  searchQuery,
  characterFilter,
  featuredOnly,
  sort,
  total,
  loading,
  gameName,
}) {
  const isSavedView = activeTab === "saved";
  const isFiltering =
    activeTab !== "all" || !!submittedSearchQuery || !!sort || featuredOnly;
  const showFeaturedHero =
    activeTab === "all" && !submittedSearchQuery && !featuredOnly;
  const showCharacterFilter = activeTab === "characters";
  const showSortControl = activeTab !== "saved";
  const showFeaturedToggle = activeTab !== "saved";
  const hasActiveRefinements =
    !!searchQuery ||
    !!characterFilter ||
    !!sort ||
    featuredOnly ||
    activeTab !== "all";

  const activeSearchLabel = [
    activeTab === "ui"
      ? "User Interface"
      : activeTab === "misc"
        ? "Miscellaneous"
        : characterFilter,
    submittedSearchQuery,
  ]
    .filter(Boolean)
    .join(" + ");

  const title =
    activeTab === "all"
      ? "Browse"
      : activeTab === "characters"
        ? characterFilter
          ? `${characterFilter} Mods`
          : "Characters"
        : activeTab === "ui"
          ? "Interface"
          : activeTab === "saved"
            ? "Saved"
            : "Misc";

  const description = loading
    ? "Loading mods."
    : activeTab === "saved"
      ? `${Math.max(0, total).toLocaleString()} saved mod${total !== 1 ? "s" : ""} for ${gameName}.`
      : isFiltering
        ? `${Math.max(0, total).toLocaleString()} result${total !== 1 ? "s" : ""} for ${activeSearchLabel || gameName}.`
        : `${Math.max(0, total).toLocaleString()} GameBanana listing${total !== 1 ? "s" : ""} for ${gameName}.`;

  const searchPlaceholder = isSavedView
    ? "Search saved mods and press Enter..."
    : activeTab === "characters"
      ? "Search character mods and press Enter..."
      : activeTab === "ui"
        ? "Search UI mods and press Enter..."
        : activeTab === "misc"
          ? "Search miscellaneous mods and press Enter..."
          : "Search GameBanana and press Enter...";

  return {
    isSavedView,
    isFiltering,
    showFeaturedHero,
    showCharacterFilter,
    showSortControl,
    showFeaturedToggle,
    hasActiveRefinements,
    activeSearchLabel,
    title,
    description,
    searchPlaceholder,
  };
}
