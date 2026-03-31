/* global require */
const { contextBridge, ipcRenderer } = require("electron");

console.log("Preload: Script starting...");

contextBridge.exposeInMainWorld("electronConfig", {
  getConfig: () => ipcRenderer.invoke("get-config"),
  setConfig: (config) => ipcRenderer.invoke("set-config", config),
  chooseFolder: () => ipcRenderer.invoke("choose-folder"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
});

contextBridge.exposeInMainWorld("electronMods", {
  getMods: (importerPath, knownCharacters, gameId, options = {}) =>
    ipcRenderer.invoke(
      "get-mods",
      importerPath,
      knownCharacters,
      gameId,
      options,
    ),
  toggleMod: (args) => ipcRenderer.invoke("toggle-mod", args),
  openFolder: (folderPath) => ipcRenderer.invoke("open-folder", folderPath),
  importMod: (args) => ipcRenderer.invoke("import-mod", args),
  assignMod: (args) => ipcRenderer.invoke("assign-mod", args),
  setCustomThumbnail: (args) => ipcRenderer.invoke("set-custom-thumbnail", args),
  deleteMod: (args) => ipcRenderer.invoke("delete-mod", args),
  fetchGbMod: (gamebananaId) => ipcRenderer.invoke("fetch-gb-mod", gamebananaId),
  browseGbMods: (args) => ipcRenderer.invoke("browse-gb-mods", args),
  installGbMod: (args) => ipcRenderer.invoke("install-gb-mod", args),
  fetchGbModsBatch: (ids) => ipcRenderer.invoke("fetch-gb-mods-batch", ids),
  fetchGbModsSummaries: (ids) =>
    ipcRenderer.invoke("fetch-gb-mods-summaries", ids),
  getPresets: (gameId) => ipcRenderer.invoke("get-presets", gameId),
  savePreset: (preset) => ipcRenderer.invoke("save-preset", preset),
  deletePreset: (gameId, presetId) =>
    ipcRenderer.invoke("delete-preset", gameId, presetId),
  executePresetDiff: (args) => ipcRenderer.invoke("execute-preset-diff", args),
  exportPreset: (preset) => ipcRenderer.invoke("export-preset", preset),
  importPreset: () => ipcRenderer.invoke("import-preset"),
  onDownloadProgress: (callback) => {
    const fn = (event, data) => callback(data);
    ipcRenderer.on("download-progress", fn);
    return () => ipcRenderer.removeListener("download-progress", fn);
  },
});

contextBridge.exposeInMainWorld("electronEnvironment", {
  isElectron: true,
});
