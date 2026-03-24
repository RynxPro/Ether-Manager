import { create } from 'zustand';
import { GAME_CONFIG } from '../gameConfig';

export const useAppStore = create((set) => ({
  // Active Game State
  activeGameId: 'GIMI',
  activeGame: GAME_CONFIG['GIMI'],
  setActiveGameId: (gameId) => set({ 
    activeGameId: gameId, 
    activeGame: GAME_CONFIG[gameId],
    // Reset view-specific state when switching games
    selectedCharacter: null 
  }),

  // Navigation / View State
  activeView: 'mods', // "mods" | "browse" | "presets"
  setActiveView: (view) => set({ activeView: view }),

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

  // Config invalidation
  configVersion: 0,
  bumpConfigVersion: () => set((state) => ({
    configVersion: state.configVersion + 1,
  })),
}));
