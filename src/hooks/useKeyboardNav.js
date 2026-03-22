import { useEffect, useCallback, useRef } from 'react';

/**
 * Hook for keyboard navigation in mod lists
 * Supports arrow keys for navigation and Enter/Space for selection
 * 
 * Usage:
 * const ref = useRef(null);
 * useKeyboardNav({
 *   ref,
 *   items: mods,
 *   onSelect: (mod) => handleSelect(mod),
 *   onToggle: (mod) => handleToggle(mod),
 * });
 */
export function useKeyboardNav({
  ref,
  items = [],
  onSelect,
  onToggle,
  onDelete,
  enabled = true,
}) {
  const currentIndexRef = useRef(0);

  // Handle arrow key navigation
  const handleKeyDown = useCallback(
    (e) => {
      if (!enabled || !ref?.current) return;

      const currentIndex = currentIndexRef.current;
      const itemCount = items.length;

      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          e.preventDefault();
          const nextIndex = (currentIndex + 1) % itemCount;
          currentIndexRef.current = nextIndex;
          scrollToItem(nextIndex);
          break;

        case 'ArrowUp':
        case 'ArrowLeft':
          e.preventDefault();
          const prevIndex = (currentIndex - 1 + itemCount) % itemCount;
          currentIndexRef.current = prevIndex;
          scrollToItem(prevIndex);
          break;

        case 'Enter':
        case ' ':
          e.preventDefault();
          if (items[currentIndex] && onToggle) {
            onToggle(items[currentIndex]);
          }
          break;

        case 'Shift+Enter':
          e.preventDefault();
          if (items[currentIndex] && onSelect) {
            onSelect(items[currentIndex]);
          }
          break;

        case 'Delete':
        case 'Backspace':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (items[currentIndex] && onDelete) {
              onDelete(items[currentIndex]);
            }
          }
          break;

        case 'Home':
          e.preventDefault();
          currentIndexRef.current = 0;
          scrollToItem(0);
          break;

        case 'End':
          e.preventDefault();
          currentIndexRef.current = itemCount - 1;
          scrollToItem(itemCount - 1);
          break;

        default:
          break;
      }
    },
    [items, onSelect, onToggle, onDelete, enabled]
  );

  // Scroll to item and highlight
  const scrollToItem = useCallback((index) => {
    if (!ref?.current) return;

    const items = ref.current.querySelectorAll('[data-keyboard-index]');
    if (items[index]) {
      items[index].focus();
      items[index].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      items[index].classList.add('keyboard-focused');

      // Remove highlight from previous
      items.forEach((item, i) => {
        if (i !== index) {
          item.classList.remove('keyboard-focused');
        }
      });
    }
  }, []);

  // Set up event listeners
  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, enabled]);

  // Reset index when items change
  useEffect(() => {
    currentIndexRef.current = 0;
  }, [items.length]);

  return {
    currentIndex: currentIndexRef.current,
    setCurrentIndex: (index) => {
      currentIndexRef.current = Math.min(index, items.length - 1);
    },
  };
}

/**
 * Higher-order component for adding keyboard-focusable attributes to items
 * Add this to each item in your list:
 * <div {...getKeyboardAttrs(index)}>...</div>
 */
export function getKeyboardAttrs(index) {
  return {
    'data-keyboard-index': index,
    tabIndex: -1,
    className:
      'transition-all duration-200 focus:outline-none keyboard-focused:[&]:ring-2 keyboard-focused:[&]:ring-primary keyboard-focused:[&]:ring-offset-1',
  };
}

/**
 * CSS to add to global styles for keyboard navigation visual feedback
 * .keyboard-focused {
 *   @apply ring-2 ring-primary ring-offset-2;
 * }
 * 
 * [data-keyboard-index]:focus {
 *   @apply outline-none;
 * }
 */
