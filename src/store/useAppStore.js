import { create } from 'zustand';
import { DEFAULT_GAME_ID, GAME_CONFIG } from '../gameConfig';

function resolveGameId(gameId) {
  const game = GAME_CONFIG[gameId];
  if (!game || game.isWorkInProgress) {
    return DEFAULT_GAME_ID;
  }
  return gameId;
}
let modalIdCounter = 0;
let currentModalId = 0;

if (typeof window !== 'undefined') {
  if (!window.history.state || typeof window.history.state.modalId !== 'number') {
    window.history.replaceState({ modalId: 0 }, '');
  } else {
    currentModalId = window.history.state.modalId;
    modalIdCounter = currentModalId;
  }

  window.addEventListener('popstate', (e) => {
    const newModalId = e.state?.modalId || 0;
    
    if (newModalId < currentModalId) {
      // User went BACK
      const diff = currentModalId - newModalId;
      useAppStore.setState(state => {
        const popped = state.pageStack.slice(-diff);
        return {
          pageStack: state.pageStack.slice(0, -diff),
          forwardStack: [...state.forwardStack, ...popped.reverse()]
        };
      });
    } else if (newModalId > currentModalId) {
      // User went FORWARD
      const diff = newModalId - currentModalId;
      useAppStore.setState(state => {
        const pushed = state.forwardStack.slice(-diff).reverse();
        return {
          pageStack: [...state.pageStack, ...pushed],
          forwardStack: state.forwardStack.slice(0, -diff)
        };
      });
    }
    currentModalId = newModalId;
  });

  // Polyfill native gestures for Electron
  let swipeAccumulatorX = 0;
  let isSwiping = false;
  let swipeTimeout = null;

  window.addEventListener('wheel', (e) => {
    // Check if we are scrolling inside a horizontally scrollable element
    let current = e.target;
    while (current && current !== document.body) {
      if (current.scrollWidth > current.clientWidth) {
        const style = window.getComputedStyle(current);
        if (style.overflowX === 'auto' || style.overflowX === 'scroll') {
          return; // Ignore swipe, let the user scroll the container
        }
      }
      current = current.parentElement;
    }

    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      swipeAccumulatorX += e.deltaX;
      
      if (!isSwiping) {
        // Mac Trackpad: two fingers moving left -> deltaX is positive -> forward
        // two fingers moving right -> deltaX is negative -> back
        if (swipeAccumulatorX < -150) { 
          isSwiping = true;
          window.history.back();
        } else if (swipeAccumulatorX > 150) { 
          isSwiping = true;
          window.history.forward();
        }
      }
    } else {
      swipeAccumulatorX = 0; // Vertical scroll resets the accumulator
    }

    clearTimeout(swipeTimeout);
    swipeTimeout = setTimeout(() => {
      swipeAccumulatorX = 0;
      isSwiping = false;
    }, 250);
  }, { passive: true });

  window.addEventListener('mouseup', (e) => {
    // Mouse button 4 = Back, Mouse button 5 = Forward
    if (e.button === 3) window.history.back();
    if (e.button === 4) window.history.forward();
  });
}

export const useAppStore = create((set) => ({
  // Active Game State
  activeGameId: DEFAULT_GAME_ID,
  activeGame: GAME_CONFIG[DEFAULT_GAME_ID],
  setActiveGameId: (gameId) => {
    const resolvedGameId = resolveGameId(gameId);
    set({
      activeGameId: resolvedGameId,
      activeGame: GAME_CONFIG[resolvedGameId],
      // Reset view-specific state when switching games
      selectedCharacter: null,
      pageStack: [],
      forwardStack: [],
    });
  },

  // Navigation / View State
  activeView: 'mods', // "mods" | "browse" | "presets"
  setActiveView: (view) => set({ activeView: view, pageStack: [], forwardStack: [] }),

  // Global Page Stack
  pageStack: [], // Array of { id: string, component: string, props: object }
  forwardStack: [], // Array of popped pages for Native Forward
  pushPage: (page) => {
    modalIdCounter++;
    currentModalId = modalIdCounter;
    window.history.pushState({ modalId: modalIdCounter }, '');
    set((state) => ({ 
      pageStack: [...state.pageStack, page],
      forwardStack: []
    }));
  },
  popPage: () => {
    if (useAppStore.getState().pageStack.length > 0) {
      window.history.back(); // Relies on popstate listener to actually pop
    }
  },
  clearPages: () => set({ pageStack: [], forwardStack: [] }),

  // Content Settings
  nsfwMode: "blur", // "blur" | "hide" | "show"
  setNsfwMode: (mode) => set({ nsfwMode: mode }),

  // Sub-view State (e.g. Mod Detail Overlay)
  selectedCharacter: null,
  setSelectedCharacter: (character) => set({ selectedCharacter: character }),

  // Global Mod Cache
  modsCache: {}, // { [gameId]: modsArray }
  modsCacheMeta: {}, // { [gameId]: { importerPath } }
  setModsCache: (gameId, mods, meta) => set((state) => ({
    modsCache: {
      ...state.modsCache,
      [gameId]: mods
    },
    modsCacheMeta: {
      ...state.modsCacheMeta,
      [gameId]: meta ?? state.modsCacheMeta[gameId]
    }
  })),

  // Pre-derived installed mods map — updated atomically after every disk scan.
  // Shape: { [gameId]: { [gbModId: number]: { installedFiles: InstalledFile[] } } }
  // All browse/detail components read from here — no prop drilling needed.
  installedModsMap: {},
  setInstalledModsMap: (gameId, infoMap) => set((state) => ({
    installedModsMap: { ...state.installedModsMap, [gameId]: infoMap },
  })),

  // Update Check Cache
  updateCheckCache: {}, // { [gameId]: { signature, checkedAt, updatesMap } }
  setUpdateCheckCache: (gameId, entry) => set((state) => ({
    updateCheckCache: {
      ...state.updateCheckCache,
      [gameId]: entry,
    },
  })),
  clearUpdateCheckCache: (gameId) => set((state) => {
    if (!gameId) {
      return { updateCheckCache: {} };
    }

    const nextCache = { ...state.updateCheckCache };
    delete nextCache[gameId];
    return { updateCheckCache: nextCache };
  }),

  // Config invalidation
  configVersion: 0,
  bumpConfigVersion: () => set((state) => ({
    configVersion: state.configVersion + 1,
  })),

  // Downloads Queue
  // Job format: { id: string|number, title: string, percent: number, status: "downloading" | "extracting" | "done" | "error", error?: string }
  downloads: [],
  addDownload: (job) => set((state) => ({
    downloads: [...state.downloads.filter(d => d.id !== job.id), { ...job, percent: 0, status: "downloading" }]
  })),
  updateDownloadProgress: (id, percent, bytesPerSecond) => set((state) => ({
    downloads: state.downloads.map(d => d.id === id ? { ...d, percent, bytesPerSecond, status: percent === 100 ? "extracting" : d.status } : d)
  })),
  completeDownload: (id, success, error) => set((state) => ({
    downloads: state.downloads.map(d => d.id === id ? { ...d, percent: success ? 100 : d.percent, status: success ? "done" : "error", error } : d)
  })),
  clearDownload: (id) => set((state) => ({
    downloads: state.downloads.filter(d => d.id !== id)
  })),
  cancelDownload: async (id) => {
    if (window.electronMods?.cancelInstallGbMod) {
      await window.electronMods.cancelInstallGbMod({ gbModId: id }).catch(() => {});
    }
    set((state) => ({
      downloads: state.downloads.filter(d => d.id !== id)
    }));
  },
}));
