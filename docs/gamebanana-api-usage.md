# AetherManager and the GameBanana API

This note is for anyone reviewing how our desktop app talks to GameBanana. It’s accurate to the current client implementation; we’re happy to adjust behaviour if you need a specific `User-Agent`, header, or traffic pattern.

## What the app is

AetherManager is an **Electron** mod manager. Each user runs **their own copy** on their own machine. There is **no central server** of ours that proxies GameBanana—every request goes **straight from the user’s PC** to `https://gamebanana.com/apiv11`, same as a browser hitting the public API.

## What we use the API for

Typical use, in plain terms:

- **Browse / search** — `Mod/Index`, `Util/Search/Results`, and related listing flows.
- **Mod details** — `Mod/{id}/ProfilePage`, sometimes `Mod/{id}/Files` for install metadata.
- **Thumbnails and copy** — whatever the normalised responses already expose (we don’t scrape HTML).
- **Featured / discovery** — e.g. `Game/{id}/TopSubs` for the in-app hero strip, where enabled.
- **Optional extras** — suggestions, member profiles, etc., only when the user opens those parts of the UI.

We don’t crawl the full catalogue, don’t run unattended bulk harvest jobs, and don’t ship a separate “headless” scraper alongside the app.

## How we keep traffic under control

All GameBanana HTTP from the app goes through **one client layer** in the main process. Rough parameters (tunable in code):

| Mechanism | What it does |
|-----------|----------------|
| **Global concurrency** | At most **6** live HTTP requests to GameBanana at the same time, app-wide. |
| **Per-endpoint spacing** | Extra delay between calls of the same *kind* (browse vs profile vs search, etc.), on the order of **~85–220 ms** depending on the bucket—so we don’t hammer one URL shape in a tight loop. |
| **In-memory cache** | Responses are cached with **TTLs** in the **30–90 s** range (varies by endpoint). Repeat views hit RAM instead of the network when the entry is still fresh. |
| **In-flight dedupe** | If two parts of the UI ask for the **same URL** while a request is already running, they share **one** network call. |
| **429 / rate-limit handling** | On HTTP 429 (and GameBanana’s 1015-style responses), we **back off**: respect `Retry-After` when present, apply a **capped** client cooldown (we don’t block the user for multi-hour spans from bad headers), and **stop** issuing new calls until the cooldown clears. |
| **Priorities** | Browse/search-style work can be marked **high** priority in the queue; background refresh (e.g. batch thumbnails) uses **low** priority and lower concurrency so it doesn’t starve the main grid. |

Batch operations (e.g. resolving thumbnails for a list of mod IDs) run with **deduplicated IDs**, **low priority**, and typically **at most 2** concurrent mods in the batch worker, with **Profile** and **Files** for a given mod done **one after the other**, not doubled up in parallel.

## Identification

Every request sends:

`User-Agent: AetherManager/1.0.0`

If you want a different string (project URL, contact token, etc.), say the word and we’ll align with your preference.

## Rough “how much” in practice

Exact numbers depend on what the user is doing; these are **order-of-magnitude** guides:

- **Opening browse** for a game: usually **one** primary listing request, then optional follow-ups only if the UI needs extra hydration (we’ve reduced redundant follow-ups on purpose).
- **Opening a mod** for install/details: on the order of **1–2** requests per mod (profile + files when needed), subject to cache and dedupe.
- **Background thumbnail batches**: chunked and throttled as above—not “dozens of parallel connections” from a single user session.

We don’t have a fixed “requests per minute” cap written in stone because real usage varies; the **concurrency + throttle + cache** stack is what keeps a single installation polite.

## What we’re *not* doing

- No distributed botnet, no cloud relay of GameBanana traffic from our side.
- No attempt to bypass authentication or paywalls; we use the same public v11 surface your site exposes to clients.

---

**Contact:** *[add your email or project link here]*  

**App:** AetherManager — desktop mod manager (Electron).
