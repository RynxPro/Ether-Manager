# Phase 3: Feature Enhancement - Integration Guide

This guide shows how to integrate all Phase 3 features into your existing components.

## 1. Multi-Select & Bulk Operations

### CharacterDetail.jsx Integration

```jsx
import { useMultiSelect } from '../hooks/useMultiSelect';
import MultiSelectToolbar from './MultiSelectToolbar';

export default function CharacterDetail({ characterId }) {
  const { mods, loading } = useLoadGameMods(characterId);
  const { selected, toggleSelect, selectAll, deselectAll, isAllSelected, isPartiallySelected } 
    = useMultiSelect();

  const handleToggleSelect = (modId) => {
    toggleSelect(modId);
  };

  const handleSelectAll = () => {
    selectAll(mods.map(m => m.id));
  };

  const handleDeleteSelected = async () => {
    // Implement bulk delete
    for (const modId of selected) {
      await ipcRenderer.invoke('delete-mod', modId);
    }
    deselectAll();
  };

  return (
    <div>
      <MultiSelectToolbar
        selected={selected}
        total={mods.length}
        isAllSelected={isAllSelected}
        isPartiallySelected={isPartiallySelected}
        onToggleSelectAll={() => {
          if (isAllSelected) deselectAll();
          else handleSelectAll();
        }}
        onDelete={handleDeleteSelected}
        onDeselect={deselectAll}
      />
      
      {mods.map((mod) => (
        <ModCard
          key={mod.id}
          mod={mod}
          isSelected={selected.has(mod.id)}
          onToggleSelect={() => handleToggleSelect(mod.id)}
        />
      ))}
    </div>
  );
}
```

## 2. Mod Conflict Detection

### CharacterDetail.jsx - Add Conflict Warnings

```jsx
import { detectModConflicts, categorizeConflicts } from '../lib/conflictDetection';
import ModConflictWarning from './ModConflictWarning';

export default function CharacterDetail({ characterId }) {
  const { mods } = useLoadGameMods(characterId);
  const [conflicts, setConflicts] = useState([]);

  // Check for conflicts when mods change
  useEffect(() => {
    const enabledMods = mods.filter(m => m.enabled);
    if (enabledMods.length > 0) {
      const detected = detectModConflicts(enabledMods);
      const categorized = categorizeConflicts(detected);
      setConflicts(categorized);
    }
  }, [mods]);

  return (
    <div>
      {conflicts.length > 0 && (
        <ModConflictWarning conflicts={conflicts} />
      )}
      {/* Rest of component */}
    </div>
  );
}
```

## 3. Update Notifications

### App.jsx or Navbar.jsx Integration

```jsx
import { useModUpdates } from '../hooks/useModUpdates';
import ModUpdateNotification from './ModUpdateNotification';

export default function Navbar() {
  const { mods } = useLoadGameMods(); // Get all mods
  const { updates, checking, checkUpdates, dismissUpdate, dismissAll } 
    = useModUpdates(mods, { autoCheck: true, checkInterval: 5 * 60 * 1000 });

  const handleUpdate = async (gamebananaId) => {
    // Implement update logic
    console.log(`Updating mod with GameBanana ID: ${gamebananaId}`);
    dismissUpdate(gamebananaId);
  };

  return (
    <>
      <nav>
        {/* Navbar content */}
        <button onClick={checkUpdates} disabled={checking}>
          {checking ? 'Checking...' : 'Check for Updates'}
        </button>
      </nav>

      <ModUpdateNotification
        updates={updates}
        onDismiss={dismissUpdate}
        onDismissAll={dismissAll}
        onUpdate={handleUpdate}
      />
    </>
  );
}
```

## 4. Keyboard Navigation

### CharacterDetail.jsx - Add Keyboard Support

```jsx
import { useKeyboardNav, getKeyboardAttrs } from '../hooks/useKeyboardNav';

export default function CharacterDetail({ characterId }) {
  const { mods } = useLoadGameMods(characterId);
  const containerRef = useRef(null);
  const { currentIndex } = useKeyboardNav({
    ref: containerRef,
    items: mods,
    onToggle: (mod) => handleToggleMod(mod.id),
    onSelect: (mod) => handleToggleSelect(mod.id),
    onDelete: (mod) => handleDeleteMod(mod.id),
  });

  return (
    <div ref={containerRef} className="flex flex-col gap-2">
      {mods.map((mod, index) => (
        <div key={mod.id} {...getKeyboardAttrs(index)}>
          <ModCard mod={mod} />
        </div>
      ))}
    </div>
  );
}
```

### Add to global CSS (index.css or App.css)

```css
/* Keyboard navigation visual feedback */
.keyboard-focused {
  @apply ring-2 ring-primary ring-offset-2;
}

[data-keyboard-index]:focus {
  @apply outline-none;
}
```

## 5. ModCard Component - Multi-Select Ready

Update ModCard to support selection:

```jsx
export default function ModCard({ 
  mod, 
  isSelected = false, 
  onToggleSelect,
  className = '' 
}) {
  return (
    <Card
      className={cn(
        'transition-all duration-200',
        isSelected && 'ring-2 ring-primary ring-offset-2',
        className
      )}
    >
      {/* Checkbox or click area for selection */}
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect?.(mod.id)}
          className="mt-1"
        />
        
        {/* Rest of card content */}
      </div>
    </Card>
  );
}
```

## 6. Complete Integration Example

Here's a minimal example putting it all together:

```jsx
import React, { useRef, useState, useEffect } from 'react';
import { useLoadGameMods } from '../hooks/useLoadGameMods';
import { useMultiSelect } from '../hooks/useMultiSelect';
import { useKeyboardNav, getKeyboardAttrs } from '../hooks/useKeyboardNav';
import { useModUpdates } from '../hooks/useModUpdates';
import { detectModConflicts, categorizeConflicts } from '../lib/conflictDetection';
import MultiSelectToolbar from './MultiSelectToolbar';
import ModConflictWarning from './ModConflictWarning';
import ModUpdateNotification from './ModUpdateNotification';
import ModCard from './ModCard';

export default function CharacterDetail({ characterId }) {
  const { mods } = useLoadGameMods(characterId);
  const { selected, toggleSelect, selectAll, deselectAll, isAllSelected, isPartiallySelected } 
    = useMultiSelect();
  const containerRef = useRef(null);
  const { currentIndex } = useKeyboardNav({
    ref: containerRef,
    items: mods,
    onToggle: (mod) => handleToggleMod(mod),
    onSelect: (mod) => toggleSelect(mod.id),
  });

  const { updates, dismissUpdate, dismissAll } = useModUpdates(mods, { autoCheck: true });
  const [conflicts, setConflicts] = useState([]);

  // Detect conflicts
  useEffect(() => {
    const enabledMods = mods.filter(m => m.enabled);
    if (enabledMods.length > 0) {
      const detected = detectModConflicts(enabledMods);
      const categorized = categorizeConflicts(detected);
      setConflicts(categorized);
    }
  }, [mods]);

  const handleDeleteSelected = async () => {
    for (const modId of selected) {
      await ipcRenderer.invoke('delete-mod', modId);
    }
    deselectAll();
  };

  return (
    <div>
      {conflicts.length > 0 && <ModConflictWarning conflicts={conflicts} />}

      <MultiSelectToolbar
        selected={selected}
        total={mods.length}
        isAllSelected={isAllSelected}
        isPartiallySelected={isPartiallySelected}
        onToggleSelectAll={() => {
          if (isAllSelected) deselectAll();
          else selectAll(mods.map(m => m.id));
        }}
        onDelete={handleDeleteSelected}
        onDeselect={deselectAll}
      />

      <div ref={containerRef} className="grid gap-4">
        {mods.map((mod, index) => (
          <div key={mod.id} {...getKeyboardAttrs(index)}>
            <ModCard
              mod={mod}
              isSelected={selected.has(mod.id)}
              onToggleSelect={() => toggleSelect(mod.id)}
            />
          </div>
        ))}
      </div>

      <ModUpdateNotification
        updates={updates}
        onDismiss={dismissUpdate}
        onDismissAll={dismissAll}
      />
    </div>
  );
}
```

## 7. Keyboard Shortcuts Reference

| Key | Action |
|-----|--------|
| ↓ / → | Next mod |
| ↑ / ← | Previous mod |
| Space / Enter | Toggle current mod |
| Shift+Enter | Multi-select current mod |
| Ctrl/Cmd+Delete | Delete current mod |
| Home | Jump to first mod |
| End | Jump to last mod |

## 8. Testing Checklist

- [ ] Multi-select toggles items correctly
- [ ] "Select All" toggles all items with visual feedback
- [ ] Bulk delete removes all selected mods
- [ ] Conflict warnings appear for overlapping files
- [ ] Update notifications show on app start
- [ ] Dismiss updates individually
- [ ] Dismiss all updates at once
- [ ] Arrow keys navigate through mods
- [ ] Space key toggles current mod
- [ ] Enter focuses first mod

## 9. Performance Notes

- Virtual scrolling can be added to modal lists with `useVirtualScroll`
- Lazy image loading with `useLazyLoadImage` for thumbnails
- Conflict detection runs on mod toggle (cached for 5 mins)
- Update checks happen every 5 mins (configurable)
- Multi-select state stays in memory until cleared

## 10. Future Enhancements

- [ ] Search/filter within selected mods
- [ ] Export selected mod list
- [ ] Batch install mods
- [ ] Conflict auto-resolution suggestions
- [ ] Update all with one click
- [ ] Keyboard shortcut customization
