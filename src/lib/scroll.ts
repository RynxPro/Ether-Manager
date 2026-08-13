/** The nearest ancestor that actually scrolls, falling back to the document.
 *
 * This app scrolls a panel beside the sidebar rather than the window, so anything that needs to
 * read or set a scroll offset has to find that panel. Walking up from a node keeps that knowledge
 * in one place instead of hard-coding a selector into every caller, and it keeps working if the
 * shell's markup changes. */
export function findScrollParent(node: HTMLElement | null): HTMLElement | null {
  for (let element = node?.parentElement; element; element = element.parentElement) {
    const overflowY = getComputedStyle(element).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return element;
  }
  return document.scrollingElement as HTMLElement | null;
}
