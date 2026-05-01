# Aether Manager File Structure

This document outlines the organization of the React frontend source code (`src/`), reflecting the recent architectural refactoring aimed at separating concerns, improving maintainability, and untangling "junk drawer" component folders.

## High-Level Architecture

The project follows a standard React domain-driven structure, where UI components, business logic, global state, and full-page views are strictly separated.

```text
my-app/src/
├── assets/          # Static assets (images, game icons, global CSS)
├── components/      # Reusable UI components and specific domains
├── hooks/           # Custom React hooks
├── lib/             # Pure Javascript business logic and API helpers
├── store/           # Zustand global state management
├── views/           # Full-page components ("Pages" or "Screens")
├── App.jsx          # Root React component and Router logic
└── main.jsx         # React DOM entry point
```

---

## Directory Breakdown

### `src/views/`
Contains the "Pages" of the application. These components are generally mapped to main navigation items or take up the entire main content area. They consume global state and compose smaller components together.

*   `BrowseView.jsx`: The main GameBanana discovery page.
*   `LibraryView.jsx`: The user's local installed mod collection.
*   `PresetsView.jsx`: Preset management page.
*   `SupportView.jsx`: Support/Help page.
*   `CharacterDetail.jsx`: The drill-down view showing mods for a specific character.
*   **Full-Screen Overlays**:
    *   `ModDetailPage.jsx`: The detailed view for a specific mod.
    *   `CreatorProfilePage.jsx`: The GameBanana creator profile view.
    *   `SettingsPage.jsx`: The application settings page.
*   **`src/views/mod-detail/`**:
    *   Contains the shredded sub-components that make up the massive `ModDetailPage.jsx` (e.g., `ModGallery.jsx`, `ModInstaller.jsx`, `ModHeader.jsx`, `ModDescription.jsx`, `ModStats.jsx`).

### `src/components/`
The home for all React components that are *not* full pages. Recently reorganized into domain-specific subdirectories to prevent clutter.

*   **`components/modals/`**:
    *   All popups and dialogs that break the normal flow of the app.
    *   *Examples:* `InstallModal.jsx`, `CreatePresetModal.jsx`, `ConfirmDialog.jsx`, `ImageLightbox.jsx`, `ApplyPresetModal.jsx`.
*   **`components/character/`**:
    *   Components specifically related to rendering character data.
    *   *Examples:* `CharacterCard.jsx`, `CharacterDetailGrid.jsx`, `CharacterDetailHeader.jsx`.
*   **`components/mod-card/`**:
    *   The various rectangular mod cards used in grids across the app.
    *   *Examples:* `GbModCard.jsx` (for browse), `LibraryModCard.jsx` (for library), `UpdateBadge.jsx`.
*   **`components/layout/`**:
    *   Structural components that define the shell of the application.
    *   *Examples:* `SideBar.jsx`, `TopBar.jsx`, `TitleBar.jsx`.
*   **`components/ui/`**:
    *   Generic, reusable "dumb" components (atoms and molecules).
    *   *Examples:* `Button.jsx`, `StatePanel.jsx`, `Switch.jsx`.
*   **Root Level (`src/components/`)**:
    *   A few highly generic structural components like `PageStackRenderer.jsx` and `SearchableDropdown.jsx`.

### `src/lib/`
Contains pure Javascript files (no JSX) that handle business logic, data transformation, and utility functions. Keeping this separate from React components makes the logic easily testable and reusable.

*   `modUpdateState.js`: The absolute source of truth for detecting if a mod has an update available.
*   `installFlow.js`: Logic for generating download queues and formatting installation data.
*   `presetMatching.js`: Complex logic for diffing, applying, and reconciling mod presets.
*   `portraits.js`: Data structures and mappings for character names and portraits.
*   `utils.js`: Generic utilities (like the `cn` classname merger for Tailwind).
*   `gameConfig.js`: Definitions for supported games (Genshin, ZZZ, WuWa, etc.).

### `src/store/`
*   `useAppStore.js`: The central Zustand store. It manages global state such as the active game, the page navigation stack, the `installedModsMap`, background downloads, and UI theme preferences.

### `src/hooks/`
*   `useGbQuery.js`: Custom hook for fetching data from the GameBanana API with pagination.
*   `useFetchCache.js`: Custom hook for handling memory-cached requests to prevent spamming the API.

---

## Architectural Rules & Best Practices

1.  **Component Hierarchy**: Components in `src/components/ui/` should never import from `src/views/`. Data should flow downwards.
2.  **No "Junk Drawer"**: If you are creating a new component, ask yourself if it belongs in an existing domain folder (`character/`, `mod-card/`, `modals/`). If it's a completely new domain with multiple files, create a new subfolder in `src/components/`.
3.  **State Management**: Complex, shared state (like "is this mod currently downloading?") belongs in `src/store/useAppStore.js`. Local UI state (like "is this dropdown open?") belongs inside the component using `useState`.
4.  **Business Logic Extraction**: If a React component starts getting too large due to complex data manipulation (like the update logic), extract that pure logic into a helper file in `src/lib/`.
