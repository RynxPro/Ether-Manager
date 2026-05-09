# Navigation Rework Plan

## Objective
Unify the application's navigation system to eliminate redundant "Back" and "Close (X)" buttons within individual pages. The global `TopBar` will become the sole source of truth for backward and forward navigation, providing a cohesive, native app feel.

## Current State & Issues
Currently, the app uses two fragmented navigation systems:
1. **Global Page Stack (`pageStack`)**: Used for deep links (`ModDetailPage`, `CreatorProfilePage`, `SettingsPage`, etc.). Navigating pushes a page object.
2. **Sub-view State (`selectedCharacter`)**: Used exclusively in `LibraryView`. Clicking a character toggles this state variable, which conditionally renders `CharacterDetail` directly in `App.jsx`. 

Because of this split:
- The `TopBar` back button uses `window.history.back()`, which fails to close `CharacterDetail` because it's not in the history stack.
- Individual pages (`ModDetailPage`, `PresetDetailPage`, etc.) have their own floating `<ArrowLeft>` and `<X>` buttons cluttering the UI and duplicating TopBar functionality.

## Action Plan

### 1. Unify All Overlays into the Global Page Stack
We will eliminate the standalone `selectedCharacter` overlay logic and migrate `CharacterDetail` to use the standard `pushPage` method.

- **`PageStackRenderer.jsx`**: 
  - Import `CharacterDetail` and add it to the `PAGE_COMPONENTS` map.
- **`LibraryView.jsx` & `CharacterCard.jsx`**: 
  - Change the `onSelectCharacter` action from `setSelectedCharacter(item)` to `pushPage({ id: 'char-detail', component: 'CharacterDetail', props: { character: item } })`.
- **`App.jsx`**: 
  - Remove the dedicated `AnimatePresence` block for `selectedCharacter`. 

### 2. Fix TopBar Navigation Handling
- The `TopBar` buttons currently call `window.history.back()`. This actually works perfectly **if** everything is in the `pageStack` because the `useAppStore` listens to the browser's native `popstate` event to sync the stack.
- By moving `CharacterDetail` to the stack, native mouse buttons (Mouse 4/Mouse 5) and the TopBar back button will universally work to dismiss any open view.
- Update `getTitle()` in `TopBar.jsx` to dynamically read the name of the `CharacterDetail` if it's the top page.

### 3. Remove Redundant UI Buttons
We will strip all internal back and close buttons from the page components. The user will rely entirely on the `TopBar` to exit.

Target files to clean up:
- `src/views/ModDetailPage.jsx`: Remove `<ArrowLeft>` and `<X>` from the top header overlay.
- `src/views/CreatorProfilePage.jsx`: Remove `<ArrowLeft>` and `<X>`.
- `src/views/CreatePresetPage.jsx`: Remove `<ArrowLeft>` and `<X>`.
- `src/views/PresetDetailPage.jsx`: Remove `<ArrowLeft>` and `<X>` from the header.
- `src/views/CharacterDetail.jsx`: Ensure no internal back buttons exist.

### 4. Adjust Layout and Padding
Since pages will no longer render their own back/close buttons in the top right/left corners, we need to ensure the top padding of these pages feels natural below the new persistent `TopBar`. 
- Ensure `PageStackRenderer` and the components it mounts do not have empty gaps where the buttons used to be.

## Execution Order
1. Implement the unification of `CharacterDetail` into `pageStack`.
2. Clean up `App.jsx` and `useAppStore.js` to remove deprecated state if applicable.
3. Remove all redundant back/close UI elements from the 4-5 target views.
4. Test native back/forward (mouse side buttons) and TopBar buttons to ensure perfect history syncing.
