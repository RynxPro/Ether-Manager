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
  setModsCache: (gameId, mods) => set((state) => ({
    modsCache: {
      ...state.modsCache,
      [gameId]: mods
    }
  }))
}));
