# Browse System

Browse is the app's remote-discovery surface. Unlike presets or updates, its
main complexity is **request orchestration** rather than pure local rules.

## Source Of Truth

Browse has three layers:

- Electron GameBanana service:
  - rate limiting
  - retries
  - cooldown / circuit behavior
  - HTTP normalization
- Renderer fetch/cache layer:
  - dedupes logical queries across remounts
  - caches browse, summary, featured, profile, and suggestions queries
- Browse view state:
  - tabs
  - submitted search
  - sort / featured filters
  - saved-bookmark mode

Shared browse-state helpers live in:

- `src/lib/browseState.js`

Browse surface components are split into:

- `src/components/browse/BrowseControls.jsx`
- `src/components/browse/BrowseFeaturedHero.jsx`
- `src/components/browse/SavedCreatorsStrip.jsx`

Request helpers live in:

- `src/hooks/useFetchCache.js`
- `electron/services/gamebanana.js`

## Tabs

Browse has two kinds of tabs:

- Remote listing tabs:
  - `all`
  - `characters`
  - `ui`
  - `misc`
- Local saved mode:
  - `saved`

`saved` is intentionally different. It does not use the main browse listing
endpoint. It hydrates bookmarked mod IDs and bookmarked creators instead.

## Component Boundaries

`BrowseView.jsx` remains the orchestrator, but it should not own every visual
surface inline.

Current split:

- `BrowseControls`:
  - tabs
  - search box
  - suggestions
  - sort / character / featured controls
  - active refinement badges
- `BrowseFeaturedHero`:
  - hero loading shell
  - hero carousel rendering
  - hero navigation
- `SavedCreatorsStrip`:
  - saved creator hydration display
  - creator quick entry cards

This keeps the page-level component focused on request timing and state
transitions instead of carrying several hundred lines of independent UI markup.

## Search Model

Search input and search execution are intentionally separate:

- `searchQuery`:
  - current typed text
  - drives suggestions
- `submittedSearchQuery`:
  - committed query
  - drives actual results

This prevents Browse from issuing a real GameBanana search request on every
keystroke.

## Featured Model

Featured content is intentionally delayed behind the main browse grid:

1. main grid query runs first
2. once the grid is ready, the featured request is allowed
3. the hero stays disabled in contexts where it does not help, such as saved
   results or committed filtered views

This keeps the hero from competing with the primary listing request.

## Installed State In Browse

Browse does not scan disk itself. It reads installed state from:

- `installedModsMap` in the app store

That map is produced by the shared library scan flow. Browse only derives
installed/update badges from the already-normalized installed state.

## Saved Mode

Saved mode has two local collections:

- bookmarked mod IDs
- bookmarked creators

The mod list is hydrated in two phases:

1. visible-page bookmark IDs first
2. deferred bookmark IDs after that

Creator hydration is also batched to avoid request bursts.

## Improvement Targets

Browse is still the largest orchestration surface in the renderer.

The next worthwhile split is not more visual components. It is moving the
remaining request/state coordination into dedicated hooks, for example:

- `useBrowseListing`
- `useBrowseSavedCatalog`
- `useBrowseFeaturedHero`

That would reduce the amount of fetch lifecycle code still living directly in
`BrowseView.jsx`.

## Invariants

- All browse listing params should map through shared helpers, not be rebuilt ad
  hoc in multiple callbacks.
- Typing should not directly trigger full browse result fetches.
- Saved mode should stay separate from remote browse-list semantics.
- Browse should consume installed state, not recreate install/update rules.

## Hydration & Streaming Constraints

The GameBanana API does not return deep file data (`_aFiles`) on bulk index/search endpoints. This data is critical for accurate Update detection and Quick Install workflows. 

To manage this safely:
1. **Browse & Creator Pages:** These pages bypass server-side hydration entirely by passing `hydrateZeroDownloadCounts: false`. Because `modUpdateState.js` handles unhydrated mods gracefully (suppressing false update badges), there is no need to hammer the API for file data until the user explicitly opens a mod.
2. **Saved Tab (Streaming):** Bookmarks *do* require full Profile fetches because we only store their IDs locally. Because GameBanana lacks a bulk ID endpoint, the Saved tab must make $N$ individual Profile requests.
3. **Optimistic Rendering:** To prevent UI thread locking or long loading screens, the Saved tab instantly renders placeholder cards for all known bookmark IDs. As individual `fetchMod()` network requests finish, the results are injected into the global `savedModsCatalog`, and a React `useEffect` dynamically syncs the grid state (`mods`), visually cascading the cards into the screen.
4. **No (cached) Tags:** Previously, the app attempted to expose the difference between hydrated and unhydrated mods to the user via a `(cached)` visual badge. This proved technically brittle and confusing to users. **Do not reintroduce technical state indicators like `(cached)` to the UI.** If a mod is unhydrated, the "Install" button simply delegates to opening the detail page.
