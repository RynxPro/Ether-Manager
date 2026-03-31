import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  assertAllowedOpenFolder,
  readConfigFile,
  setConfigPathProvider,
  writeConfigFile,
} from "./services/config.js";
import {
  browseGbMods,
  fetchGbMod,
  fetchGbModsBatch,
  fetchGbModsSummaries,
} from "./services/gamebanana.js";
import {
  assignMod,
  deleteMod,
  getMods,
  importMod,
  installGbMod,
  setCustomThumbnail,
  toggleMod,
} from "./services/mods.js";
import {
  deletePreset,
  executePresetDiff,
  exportPresetToFile,
  getPresets,
  importPresetFromFile,
  savePreset,
} from "./services/presets.js";
import { assertPlainObject, assertString } from "./services/validation.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = process.env.NODE_ENV === "development";

let mainWindow;

setConfigPathProvider(() =>
  path.join(app.getPath("userData"), "aether_manager_config.json"),
);

function isSafeExternalUrl(rawUrl) {
  if (!rawUrl) return false;

  try {
    const url = new URL(rawUrl);
    return ["https:", "http:", "mailto:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function createWindow() {
  const preloadPath = path.join(__dirname, "preload.cjs");
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    backgroundColor: "#0a0a0f",
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,
    },
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#0d0d15",
      symbolColor: "#ffffff",
      height: 60,
    },
  });

  console.log("Main Process: Preload path is:", preloadPath);
  if (fs.existsSync(preloadPath)) {
    console.log("Main Process: Preload file EXISTS");
  } else {
    console.error("Main Process: Preload file NOT FOUND at path!");
  }

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
    event.preventDefault();
    if (isSafeExternalUrl(navigationUrl)) {
      shell.openExternal(navigationUrl);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
}

function assertTrustedSender(event) {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  if (!senderWindow || senderWindow !== mainWindow) {
    throw new Error("Blocked IPC call from untrusted renderer.");
  }
}

function handleIpc(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    assertTrustedSender(event);
    return handler(event, ...args);
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

handleIpc("get-config", () => {
  try {
    return readConfigFile();
  } catch (error) {
    console.error("Failed to read config", error);
    return {};
  }
});

handleIpc("set-config", (event, newConfig) => {
  try {
    assertPlainObject(newConfig, "config");
    const config = { ...readConfigFile(), ...newConfig };
    writeConfigFile(config);
    return true;
  } catch (error) {
    console.error("Failed to write config", error);
    return false;
  }
});

handleIpc("choose-folder", async (event) => {
  console.log("Main Process: ipcMain handle 'choose-folder' triggered");
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.focus();
    }

    const result = await dialog.showOpenDialog(win || mainWindow, {
      properties: ["openDirectory", "createDirectory"],
      title: "Select Mods Folder",
      buttonLabel: "Select Folder",
      defaultPath: app.getPath("documents"),
    });

    console.log("Main Process: dialog result:", result);
    if (result.canceled) {
      console.log("Main Process: dialog was canceled");
      return null;
    }

    return result.filePaths[0];
  } catch (error) {
    console.error("Main Process: Error showing open dialog:", error);
    return null;
  }
});

handleIpc("open-external", async (event, url) => {
  try {
    assertString(url, "url");
    if (!isSafeExternalUrl(url)) {
      return { success: false, error: "Blocked unsafe external URL." };
    }

    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error("Failed to open external URL:", error);
    return { success: false, error: error.message };
  }
});

handleIpc("get-mods", (event, importerPath, knownCharacters = [], expectedGameId = null, options = {}) =>
  getMods(importerPath, knownCharacters, expectedGameId, options),
);

handleIpc("toggle-mod", (event, args) => {
  try {
    return toggleMod(args);
  } catch (error) {
    console.error("Failed to toggle mod", error);
    return { success: false, error: error.message };
  }
});

handleIpc("open-folder", (event, folderPath) => {
  shell.showItemInFolder(assertAllowedOpenFolder(folderPath));
});

handleIpc("import-mod", async (event, args) => {
  try {
    const payload = assertPlainObject(args, "importArgs");
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win || mainWindow, {
      properties: ["openDirectory"],
      title: `Select Mod Folder for ${payload.characterName}`,
      buttonLabel: "Import Mod",
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    return importMod({
      importerPath: payload.importerPath,
      sourcePath: result.filePaths[0],
      characterName: payload.characterName,
      gameId: payload.gameId,
    });
  } catch (error) {
    console.error("Failed to import mod:", error);
    return { success: false, error: error.message };
  }
});

handleIpc("assign-mod", async (event, args) => {
  try {
    return assignMod(args);
  } catch (error) {
    console.error("Failed to assign mod:", error);
    return { success: false, error: error.message };
  }
});

handleIpc("set-custom-thumbnail", async (event, args) => {
  try {
    return setCustomThumbnail(args);
  } catch (error) {
    console.error("Failed to set custom thumbnail:", error);
    return { success: false, error: error.message };
  }
});

handleIpc("delete-mod", async (event, args) => {
  try {
    return await deleteMod(args, {
      trashItem: (folderPath) => shell.trashItem(folderPath),
    });
  } catch (error) {
    console.error("Failed to delete mod:", error);
    return { success: false, error: error.message };
  }
});

handleIpc("fetch-gb-mod", async (event, gamebananaId) => {
  try {
    return { success: true, data: await fetchGbMod(gamebananaId) };
  } catch (error) {
    console.error("Failed to fetch GB mod:", error);
    return { success: false, error: error.message };
  }
});

handleIpc("fetch-gb-mods-batch", async (event, ids) => {
  try {
    return { success: true, data: await fetchGbModsBatch(ids) };
  } catch (error) {
    console.error("[BatchUpdate] Fatal error in parallel fetch:", error);
    return { success: false, error: error.message };
  }
});

handleIpc("fetch-gb-mods-summaries", async (event, ids) => {
  try {
    return { success: true, data: await fetchGbModsSummaries(ids) };
  } catch (error) {
    console.error("[BookmarkSummary] Fatal error:", error);
    return { success: false, error: error.message };
  }
});

handleIpc("browse-gb-mods", async (event, args = {}) => {
  try {
    const result = await browseGbMods(args);
    return { success: true, ...result };
  } catch (error) {
    console.error("Failed to browse GB mods:", error);
    return { success: false, error: error.message };
  }
});

handleIpc("install-gb-mod", async (event, args = {}) =>
  installGbMod(args, {
    tempDir: app.getPath("temp"),
    isSafeExternalUrl,
    onDownloadProgress: (data) => event.sender.send("download-progress", data),
    trashItem: (folderPath) => shell.trashItem(folderPath),
  }),
);

handleIpc("get-presets", (event, gameId) => {
  try {
    return getPresets(gameId);
  } catch (error) {
    console.error("get-presets error:", error);
    return [];
  }
});

handleIpc("save-preset", (event, preset) => {
  try {
    return savePreset(preset);
  } catch (error) {
    console.error("save-preset error:", error);
    return { success: false, error: error.message };
  }
});

handleIpc("delete-preset", (event, gameId, presetId) => {
  try {
    return deletePreset(gameId, presetId);
  } catch (error) {
    console.error("delete-preset error:", error);
    return { success: false, error: error.message };
  }
});

handleIpc("execute-preset-diff", (event, args) => {
  try {
    return executePresetDiff(args);
  } catch (error) {
    console.error("execute-preset-diff error:", error);
    return { success: false, error: error.message };
  }
});

handleIpc("export-preset", async (event, preset) => {
  try {
    const validPreset = assertPlainObject(preset, "preset");
    const presetName = assertString(validPreset.name || "preset", "preset.name", {
      maxLength: 120,
    });
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(win || mainWindow, {
      title: "Export Preset",
      defaultPath: `${presetName.replace(/[^a-z0-9]/gi, "_")}.aether-preset`,
      filters: [{ name: "Aether Preset", extensions: ["aether-preset"] }],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    return exportPresetToFile(result.filePath, validPreset);
  } catch (error) {
    console.error("export-preset error:", error);
    return { success: false, error: error.message };
  }
});

handleIpc("import-preset", async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win || mainWindow, {
      title: "Import Preset",
      filters: [{ name: "Aether Preset", extensions: ["aether-preset"] }],
      properties: ["openFile"],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    return {
      success: true,
      preset: importPresetFromFile(result.filePaths[0]),
    };
  } catch (error) {
    console.error("import-preset error:", error);
    return { success: false, error: error.message };
  }
});
