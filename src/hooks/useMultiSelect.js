import { useState, useCallback } from 'react';

/**
 * Custom hook for managing multi-select state
 * Handles selection, bulk operations, and toggle logic
 */
export function useMultiSelect(items = []) {
  const [selectedIds, setSelectedIds] = useState(new Set());

  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(items.map((item) => item.id)));
  }, [items]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === items.length) {
      deselectAll();
    } else {
      selectAll();
    }
  }, [selectedIds.size, items.length, selectAll, deselectAll]);

  const isSelected = useCallback(
    (id) => selectedIds.has(id),
    [selectedIds]
  );

  const getSelected = useCallback(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds]
  );

  const count = selectedIds.size;
  const isAllSelected = count === items.length && items.length > 0;
  const isPartiallySelected = count > 0 && count < items.length;

  return {
    selectedIds,
    toggleSelect,
    selectAll,
    deselectAll,
    toggleSelectAll,
    isSelected,
    getSelected,
    count,
    isAllSelected,
    isPartiallySelected,
  };
}
