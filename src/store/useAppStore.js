import { create } from 'zustand';
import { DEFAULT_GAME_ID, GAME_CONFIG } from '../gameConfig';

function resolveGameId(gameId) {
  const game = GAME_CONFIG[gameId];
  if (!game || game.isWorkInProgress) {
    return DEFAULT_GAME_ID;
  }
  return gameId;
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
    });
  },

  // Navigation / View State
  activeView: 'mods', // "mods" | "browse" | "presets"
  setActiveView: (view) => set({ activeView: view, pageStack: [] }),

  // Global Page Stack
  pageStack: [], // Array of { id: string, component: string, props: object }
  pushPage: (page) => set((state) => ({ pageStack: [...state.pageStack, page] })),
  popPage: () => set((state) => ({ pageStack: state.pageStack.slice(0, -1) })),
  clearPages: () => set({ pageStack: [] }),

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
