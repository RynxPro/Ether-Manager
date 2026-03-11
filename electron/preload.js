console.log("Preload: Script starting...");
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronConfig", {
  getConfig: () => ipcRenderer.invoke("get-config"),
  setConfig: (config) => ipcRenderer.invoke("set-config", config),
  chooseFolder: () => ipcRenderer.invoke("choose-folder"),
});

contextBridge.exposeInMainWorld("electronMods", {
  getMods: (importerPath, knownCharacters) => ipcRenderer.invoke("get-mods", importerPath, knownCharacters),
  toggleMod: (args) => ipcRenderer.invoke("toggle-mod", args),
  openFolder: (folderPath) => ipcRenderer.invoke("open-folder", folderPath),
  importMod: (args) => ipcRenderer.invoke("import-mod", args),
  assignMod: (args) => ipcRenderer.invoke("assign-mod", args),
  fetchGbMod: (gamebananaId) => ipcRenderer.invoke("fetch-gb-mod", gamebananaId),
  browseGbMods: (args) => ipcRenderer.invoke("browse-gb-mods", args),
  installGbMod: (args) => ipcRenderer.invoke("install-gb-mod", args),
  onDownloadProgress: (callback) => {
    const fn = (event, data) => callback(data);
    ipcRenderer.on("download-progress", fn);
    return () => ipcRenderer.removeListener("download-progress", fn);
  },
});

contextBridge.exposeInMainWorld("electronEnvironment", {
  isElectron: true,
});
