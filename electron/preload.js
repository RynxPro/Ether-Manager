console.log("Preload: Script starting...");
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronConfig", {
  getConfig: () => ipcRenderer.invoke("get-config"),
  setConfig: (config) => ipcRenderer.invoke("set-config", config),
  chooseFolder: () => ipcRenderer.invoke("choose-folder"),
});

contextBridge.exposeInMainWorld("electronMods", {
  getMods: (importerPath) => ipcRenderer.invoke("get-mods", importerPath),
  toggleMod: (args) => ipcRenderer.invoke("toggle-mod", args),
  openFolder: (folderPath) => ipcRenderer.invoke("open-folder", folderPath),
});

contextBridge.exposeInMainWorld("electronEnvironment", {
  isElectron: true,
});
