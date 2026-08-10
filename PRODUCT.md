# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

> Taxonomy note: `web` is one of this schema's four allowed values (`web` / `ios` / `android` /
> `adaptive`) and records only that **no native mobile design language applies** — Ether Manager
> renders HTML/CSS in WebView2, so neither Apple HIG nor Material governs it. It is **not** a
> claim that this is a website. Ether Manager is a **Windows desktop application** (Tauri v2),
> and every design decision follows from that: see Operating Context below.

## Users

ZZZ (Zenless Zone Zero) players who mod their game with XXMI/ZZMI (the 3dmigoto-based
injector). Windows only — ZZZ modding is a Windows activity.

Shipped as a **public release** to the ZZZ modding community: strangers install it cold, so
onboarding, error recovery, and self-explanation have to carry their own weight. v1 assumes the
user already has XXMI installed and knows what a mods folder is; it does not assume they know
any of Ether Manager's own conventions (variants, slots, disable-vs-delete).

The app is opened at **any point in the session**, explicitly including alt-tabbed out of a
running game to swap one mod and tab straight back. It is also used before launching (setting up
a look), as leisure browsing on GameBanana, and for library maintenance. No single one of these
is the dominant scene — the interface has to survive being both an interruption and a
destination.

## Product Purpose

Replaces two manual chores that XXMI leaves to the user:

1. **Swapping looks.** XXMI reliably runs one active mod at a time per look, so users drag mod
   folders in and out of an ad-hoc desktop "backup" folder. Ether Manager keeps every downloaded
   variant filed and switchable with a toggle — no re-downloading to go back to a mod you had
   last week.
2. **Staying current.** Users otherwise revisit each mod's GameBanana page by hand to see if it
   changed. Ether Manager checks automatically on launch and per-mod on demand.

Success is a user who accumulates a large collection of variants and moves between them freely,
without ever touching the filesystem or a browser tab.

## Positioning

A **variant library**, not a mod installer. The differentiating mechanism is that installing is
cheap and reversible: many stored variants per character and slot, one enabled at a time,
switching costs a click and no network. Browse and install exist to feed the library; the
library is the product.

Structurally this rests on three things a neighboring tool would have to reproduce deliberately:
an app-owned local database as source of truth (never reconstructed from fragile folder names),
the XXMI leaf-folder `DISABLED_` rename convention for enable/disable, and MD5/file-id
comparison against GameBanana for update detection (GameBanana's own version field is frequently
blank and cannot be relied on).

## Operating Context

**It is a desktop application, and this governs the interface.**

- **Windows desktop app**, Tauri v2 on WebView2. Ships as an installed `.exe`, launched from the
  Start menu or a desktop shortcut, appearing in the taskbar and alt-tab order like any other
  native program.
- **A window, not a viewport.** Default 1200×800, freely resizable and maximizable by the user.
  Layout adapts to a resizable desktop window across roughly 900–1920px — it does **not** need
  phone or tablet breakpoints, and no mobile layout will ever be shown.
- **Mouse and keyboard only.** No touch, no gestures, no thumb-reach considerations. Hover is a
  reliable, always-available state. Pointer precision is high, so compact targets are legitimate
  in a way they would not be on touch.
- **Desktop interaction conventions are available and expected:** keyboard shortcuts, focus
  traversal, right-click affordances, drag-and-drop, native file pickers, multi-select.
- **Runs alongside a fullscreen game.** Alt-tab is a first-class entry path — the app is
  frequently summoned for one action and dismissed, so its at-rest state must be immediately
  actionable rather than requiring re-orientation.
- **Offline-capable core.** The library, toggles, and filesystem operations are entirely local;
  only Browse, install, and update checks require network. Network failure degrades Browse, never
  the library.

**Domain context**

- **XXMI/ZZMI must already be installed.** Ether Manager does not install or manage it in v1.
- **On-disk layout** mirrors the in-app hierarchy 1:1: `Mods/Characters/<Character>/<Slot>/<ModVariant>/`.
- **Disable** renames the variant's own leaf folder to `DISABLED_<name>` (prefix, never suffix;
  leaf folder only, never a parent). **Delete** removes it from disk. These are different
  actions with very different consequences.
- **Mod folders can vanish** underneath the app — users move or delete them outside it. This is a
  routine state, not an exceptional one, and has a dedicated recovery path.
- **GameBanana API v1.1**, unauthenticated. All content — names, descriptions, screenshots,
  showcase videos, submitter identities, counts — is third-party and untrusted.
- **Library scale: 200+ mods** across many characters with multiple variants each, after a few
  months of real use. Nothing may be designed that only works at a dozen items.

## Capabilities and Constraints

**Roster and categories**

- 60 real ZZZ characters, bundled statically at compile time.
- **7 characters have no portrait asset** (Promeia, Starlight Billy, Norma Hollowell, Velina
  Airgid, Pyrois, Remielle Dan, Sigrid de L'Azur). A missing portrait is a permanent, expected
  state, not a loading failure.
- Two library-wide pseudo-categories, `ui` and `misc`, shaped like characters for wire
  compatibility but rendered as page-level sections rather than cards — each is one flat list
  with no identity worth drilling into.
- Slots: `CharacterSkin` (scoped to a real character), `Ui`, `Misc` (global). There is
  deliberately no per-character UI slot — GameBanana does not distinguish character-specific
  from general UI mods either, so the split would be an unresolvable manual decision.

**Library**

- All characters are shown from the start, including ones with zero mods.
- One enabled mod per slot (a deliberate v1 simplification; multi-enable with a caution
  indicator is deferred to v2).
- Per-mod update button; automatic check on launch; manual global "Check for updates".

**Browse**

- Free-text search, category filter, sort, featured banner, local-only bookmarks (not tied to
  any GameBanana account).
- **GameBanana ignores sort entirely while a text query is active** — confirmed live. Sort
  controls are inert during search and must not imply otherwise.
- Mod detail mirrors the GameBanana mod page: screenshots, YouTube showcase videos, description,
  file list, like/view/download counts, submitter.

**Install**

- Download → extract (`.zip`, `.7z`, `.rar`, all pure-Rust, no external binary) → file into the
  chosen character and slot. Character/slot/display name are always user-confirmed; the app
  never assigns a slot silently.
- Streams download progress and is cancelable.

**Content safety**

- Mature-content visibility is a three-way preference: Show / Blur / Hide. **Default is Blur**,
  including for any pre-existing install with no stored value.
- Mod descriptions are arbitrary third-party HTML, sanitized with DOMPurify before render. This
  is a security boundary.
- A corrupted stored preference must never make the settings surface unusable — it is the
  recovery path for its own bad state.

**Technical**

- **Tauri v2 only.** Never mix in Tauri v1 patterns, config shapes, or updater setup. This
  specifically broke a prior attempt at this stack and is treated as a hard constraint.
- React 19 + TypeScript + Vite, TanStack Query for server state, Tailwind v4 + shadcn-derived
  components (owned code, not a themed library — chosen for full visual control).
- Rust backend: `rusqlite`, `reqwest`. 103 tests passing; `eslint-plugin-jsx-a11y` configured.
- **No frontend test suite exists.** Frontend regression detection is manual and visual.

**Terminology** (use consistently; these are the product's words)

mod / variant / slot / character / library / browse / bookmark / enable vs disable vs delete /
mods folder.

**Explicitly undecided**

- App packaging and the auto-updater pipeline (signing keys, CI, release artifacts) are
  specified but unbuilt.
- v2 candidates, not committed: mods-folder auto-detect, multi-enable per slot, global "Update
  All", GameBanana login/favorites, multi-game support.

## Brand Commitments

- Name: **Ether Manager**. "Ether" is ZZZ's own in-fiction terminology.
- **No logo or wordmark exists.** The bundled app icon is still the default Tauri placeholder
  (`src-tauri/icons/`) — unclaimed, not a commitment.
- No voice guide, color, or type commitment has been established.

## Evidence on Hand

- `public/characters/*.webp` — 53 real ZZZ character portraits (of 60 characters; see gap above).
- `src-tauri/data/zzz_characters.json` — the full 60-character roster with GameBanana category
  ids.
- `postman/gb-api-v11.postman_collection.json` — the authoritative GameBanana API reference for
  this project. Treat it as the source of truth over web search.
- Live GameBanana content at runtime: mod thumbnails and screenshots, YouTube showcase videos,
  like/view/download counts, submitter names and avatars.
- **Absent, and must not be fabricated:** user counts, testimonials, reviews, press, download
  numbers for Ether Manager itself, benchmarks, pricing, or any claim about how many people use
  it. There is no public XXMI/ZZMI documentation either — folder-structure and `DISABLED_` facts
  came directly from an XXMI developer and are authoritative as recorded here.

## Product Principles

1. **The library is the product.** Browse and install exist to feed it. When the two compete for
   prominence or effort, the library wins.
2. **Legible at 200+ mods.** Any pattern that only reads well at a dozen items is wrong here.
   Scale is the default case, not the stress case.
3. **Survive the interruption.** A user may be tabbed out of a running game to do exactly one
   thing. The path to a single mod swap stays short no matter how much else the app can do.
4. **Reversible and destructive must never look alike.** Disable, delete, and update overwrite
   carry very different costs; the interface must make that difference obvious before the click,
   not after.
5. **Behave like a desktop program, not a page.** Windowed, keyboard-reachable, hover-rich,
   offline-capable for everything local. Never borrow web-page conventions — mobile breakpoints,
   scroll-driven reveals, page-load spinners for local data — that a native app would not have.
6. **Third-party content is untrusted content.** GameBanana supplies the imagery, HTML, and
   maturity signals. Honor the user's stated content preference everywhere, degrade gracefully
   when data is missing, and never present external content as if the app vouched for it.

## Accessibility & Inclusion

No user-specific accessibility requirement has been established. What is factual: the project
lints with `eslint-plugin-jsx-a11y`, and the mature-content Show/Blur/Hide preference is an
existing inclusion affordance that must be honored on every surface that renders GameBanana
imagery.
