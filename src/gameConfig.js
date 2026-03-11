// GameBanana game row IDs — used for the mod browser and update checking
// These are the numeric IDs from gamebanana.com/games/{id}
const GB_GAME_IDS = {
  GIMI: 8552,   // Genshin Impact
  WWMI: 20357,  // Wuthering Waves
  ZZMI: 19567,  // Zenless Zone Zero
  SRMI: 18366,  // Honkai: Star Rail
  HIMI: 10349,   // Honkai Impact 3rd
  EFMI: null,   // Eternal Frontier — no dedicated GB page yet
};

export const GAME_CONFIG = {
  GIMI: {
    id: "GIMI",
    name: "Genshin Impact",
    accentColor: "#00f5cc",
    folderHint: "GIMI",
    gbGameId: GB_GAME_IDS.GIMI,
  },
  WWMI: {
    id: "WWMI",
    name: "Wuthering Waves",
    accentColor: "#7c6be8",
    folderHint: "WWMI",
    gbGameId: GB_GAME_IDS.WWMI,
  },
  ZZMI: {
    id: "ZZMI",
    name: "Zenless Zone Zero",
    accentColor: "#ff6b35",
    folderHint: "ZZMI",
    gbGameId: GB_GAME_IDS.ZZMI,
  },
  SRMI: {
    id: "SRMI",
    name: "Star Rail",
    accentColor: "#00b4d8",
    folderHint: "SRMI",
    gbGameId: GB_GAME_IDS.SRMI,
  },
  HIMI: {
    id: "HIMI",
    name: "Honkai Impact 3rd",
    accentColor: "#ff2d78",
    folderHint: "HIMI",
    gbGameId: GB_GAME_IDS.HIMI,
  },
  EFMI: {
    id: "EFMI",
    name: "Eternal Frontier",
    accentColor: "#39ff14",
    folderHint: "EFMI",
    gbGameId: GB_GAME_IDS.EFMI,
  },
};
