import {
  Search,
  User,
  Monitor,
  Box,
  LayoutGrid,
  Bookmark,
  Star,
  Sparkles,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import SearchableDropdown from "../SearchableDropdown";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { cn } from "../../lib/utils";

const TAB_ICONS = {
  all: LayoutGrid,
  characters: User,
  ui: Monitor,
  misc: Box,
  saved: Bookmark,
};

export default function BrowseControls({
  tabs,
  activeTab,
  onTabChange,
  hasActiveRefinements,
  onResetFilters,
  searchContainerRef,
  searchPlaceholder,
  searchQuery,
  onSearchChange,
  onSearchFocus,
  onSearchKeyDown,
  showSuggestions,
  suggestions,
  activeSuggestionIdx,
  onSuggestionHover,
  onSuggestionPick,
  showCharacterFilter,
  characterFilter,
  characterItems,
  onCharacterChange,
  gameId,
  showSortControl,
  sort,
  sortOptions,
  onSortChange,
  showFeaturedToggle,
  featuredOnly,
  onFeaturedToggle,
  showSavedIndicator,
  showCharacterIndicator,
  showSortIndicator,
}) {
  return (
    <section className="ui-panel mb-4 p-4 sm:p-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <nav className="flex flex-wrap items-center gap-2">
            {tabs.map((tab) => {
              const Icon = TAB_ICONS[tab.id];
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={cn(
                    "ui-focus-ring inline-flex items-center gap-2 rounded-[var(--radius-md)] border px-4 py-2.5 transition-all",
                    isActive
                      ? "border-primary/30 bg-primary/10 text-primary shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-primary),transparent_75%)]"
                      : "border-transparent bg-transparent text-text-muted hover:border-border hover:bg-white/4 hover:text-text-primary",
                  )}
                >
                  <Icon
                    size={16}
                    className={cn(
                      isActive && "drop-shadow-[0_0_8px_var(--color-primary)]",
                    )}
                  />
                  <span className="text-[12px] font-black uppercase tracking-[0.15em]">
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </nav>

          {hasActiveRefinements && (
            <Button variant="ghost" onClick={onResetFilters}>
              Reset
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div
            className="relative w-full xl:max-w-xl 2xl:max-w-2xl"
            ref={searchContainerRef}
          >
            <Input
              icon={Search}
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={onSearchChange}
              onFocus={onSearchFocus}
              onKeyDown={onSearchKeyDown}
              className="rounded-2xl shadow-inner"
            />

            <AnimatePresence>
              {showSuggestions && suggestions.length > 0 && (
                <motion.div
                  key="suggestions"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full left-0 right-0 mt-1.5 z-50 rounded-xl border border-border bg-surface/95 backdrop-blur-lg shadow-2xl overflow-hidden"
                >
                  <div className="px-2 py-1.5 border-b border-border flex items-center gap-1.5">
                    <Sparkles size={10} className="text-primary opacity-60" />
                    <span className="text-[10px] text-text-muted uppercase tracking-widest font-semibold">
                      Suggestions
                    </span>
                  </div>
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={suggestion}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
                        index === activeSuggestionIdx
                          ? "bg-primary/15 text-white"
                          : "text-text-secondary hover:bg-white/5 hover:text-white",
                      )}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onSuggestionPick(suggestion);
                      }}
                      onMouseEnter={() => onSuggestionHover(index)}
                    >
                      <Search size={12} className="opacity-40 shrink-0" />
                      {suggestion}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex flex-wrap items-center gap-3 xl:justify-end">
            {showCharacterFilter && (
              <div className="w-full shrink-0 sm:w-64">
                <SearchableDropdown
                  items={characterItems}
                  value={characterFilter || "All Characters"}
                  onChange={onCharacterChange}
                  placeholder="All Characters"
                  gameId={gameId}
                />
              </div>
            )}

            {showSortControl && (
              <div className="w-full shrink-0 sm:w-52">
                <SearchableDropdown
                  items={sortOptions}
                  value={sort}
                  onChange={onSortChange}
                  placeholder="Sort by..."
                />
              </div>
            )}

            {showFeaturedToggle && (
              <button
                type="button"
                onClick={onFeaturedToggle}
                className={cn(
                  "ui-focus-ring inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-[11px] font-black uppercase tracking-[0.18em] transition-all",
                  featuredOnly
                    ? "border-yellow-500/40 bg-yellow-500/15 text-yellow-400"
                    : "border-white/10 bg-white/5 text-text-muted hover:border-white/20 hover:text-text-primary",
                )}
                title="Show only GameBanana staff-featured mods"
              >
                <Star
                  size={13}
                  className={cn(featuredOnly && "fill-yellow-400")}
                />
                Featured
              </button>
            )}
          </div>
        </div>

        {(showSavedIndicator || showCharacterIndicator || showSortIndicator) && (
          <div className="flex flex-wrap items-center gap-2 border-t border-white/6 pt-3">
            {showSavedIndicator && (
              <div className="rounded-full border border-border bg-background px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-text-muted">
                Saved Collection
              </div>
            )}
            {showCharacterIndicator && (
              <div className="rounded-full border border-border bg-background px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-text-muted">
                {characterFilter}
              </div>
            )}
            {showSortIndicator && (
              <div className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-primary">
                {sortOptions.find((option) => option.value === sort)?.label ||
                  "Latest"}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
