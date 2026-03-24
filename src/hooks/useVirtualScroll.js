import { useState, useCallback } from "react";

/**
 * Custom hook for managing virtual scrolling of lists
 * Renders only visible items to improve performance with large lists
 *
 * @param {Array} items - Full array of items to virtualize
 * @param {number} itemHeight - Height of each item in pixels
 * @param {number} containerHeight - Height of the scrollable container
 * @param {number} overscan - Number of items to render outside visible area (default 5)
 * @returns {Object} { visibleItems, handleScroll, scrollTop }
 */
export function useVirtualScroll(
  items,
  itemHeight,
  containerHeight,
  overscan = 5,
) {
  const [scrollTop, setScrollTop] = useState(0);

  // Calculate visible range
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan,
  );

  const visibleItems = items.slice(startIndex, endIndex).map((item, index) => ({
    item,
    index: startIndex + index,
    offset: (startIndex + index) * itemHeight,
  }));

  const handleScroll = useCallback((e) => {
    setScrollTop(e.target.scrollTop);
  }, []);

  const totalHeight = items.length * itemHeight;

  return {
    visibleItems,
    handleScroll,
    scrollTop,
    startIndex,
    endIndex,
    totalHeight,
  };
}

/**
 * Component wrapper for virtual scroll container
 * Renders visible items with proper spacing
 */
export function VirtualScrollContainer({
  items,
  itemHeight,
  containerHeight,
  overscan,
  renderItem,
  className = "",
}) {
  const { visibleItems, handleScroll, totalHeight } = useVirtualScroll(
    items,
    itemHeight,
    containerHeight,
    overscan,
  );

  return (
    <div
      className={`overflow-y-auto ${className}`}
      style={{ height: containerHeight }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {visibleItems.map(({ item, offset, index }) => (
          <div
            key={index}
            style={{
              position: "absolute",
              top: offset,
              height: itemHeight,
              width: "100%",
            }}
          >
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    </div>
  );
}
