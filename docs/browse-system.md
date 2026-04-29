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

## Invariants

- All browse listing params should map through shared helpers, not be rebuilt ad
  hoc in multiple callbacks.
- Typing should not directly trigger full browse result fetches.
- Saved mode should stay separate from remote browse-list semantics.
- Browse should consume installed state, not recreate install/update rules.
