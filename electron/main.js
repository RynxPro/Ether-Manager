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
  fetchGbFeaturedMods,
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
import { ok, withRawFallback, withResultEnvelope } from "./services/ipc.js";
import { createLogger } from "./services/logger.js";
import { assertPlainObject, assertString } from "./services/validation.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = process.env.NODE_ENV === "development";

let mainWindow;
const logger = createLogger("main");

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

  logger.debug("Preload path resolved", preloadPath);
  if (fs.existsSync(preloadPath)) {
    logger.debug("Preload file exists");
  } else {
    logger.error("Preload file not found", preloadPath);
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

handleIpc(
  "get-config",
  withRawFallback("Failed to read config", {}, () => readConfigFile()),
);

handleIpc(
  "set-config",
  withRawFallback("Failed to write config", false, (event, newConfig) => {
    assertPlainObject(newConfig, "config");
    const config = { ...readConfigFile(), ...newConfig };
    writeConfigFile(config);
    return true;
  }),
);

handleIpc(
  "choose-folder",
  withRawFallback(
    "Main Process: Error showing open dialog:",
    null,
    async (event) => {
      logger.debug("choose-folder invoked");
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

      logger.debug("choose-folder dialog result", result);
      if (result.canceled) {
        logger.debug("choose-folder dialog canceled");
        return null;
      }

      return result.filePaths[0];
    },
  ),
);

handleIpc(
  "open-external",
  withResultEnvelope("Failed to open external URL:", async (event, url) => {
    assertString(url, "url");
    if (!isSafeExternalUrl(url)) {
      throw new Error("Blocked unsafe external URL.");
    }

    await shell.openExternal(url);
    return ok();
  }),
);

handleIpc(
  "get-mods",
  (
    event,
    importerPath,
    knownCharacters = [],
    expectedGameId = null,
    options = {},
  ) => getMods(importerPath, knownCharacters, expectedGameId, options),
);

handleIpc(
  "toggle-mod",
  withResultEnvelope("Failed to toggle mod", (event, args) => toggleMod(args)),
);

handleIpc("open-folder", (event, folderPath) => {
  shell.showItemInFolder(assertAllowedOpenFolder(folderPath));
});

handleIpc(
  "import-mod",
  withResultEnvelope("Failed to import mod:", async (event, args) => {
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
  }),
);

handleIpc(
  "assign-mod",
  withResultEnvelope("Failed to assign mod:", async (event, args) =>
    assignMod(args),
  ),
);

handleIpc(
  "set-custom-thumbnail",
  withResultEnvelope("Failed to set custom thumbnail:", async (event, args) =>
    setCustomThumbnail(args),
  ),
);

handleIpc(
  "delete-mod",
  withResultEnvelope("Failed to delete mod:", async (event, args) =>
    deleteMod(args, {
      trashItem: (folderPath) => shell.trashItem(folderPath),
    }),
  ),
);

handleIpc(
  "fetch-gb-mod",
  withResultEnvelope(
    "Failed to fetch GB mod:",
    async (event, gamebananaId) => ({
      data: await fetchGbMod(gamebananaId),
    }),
  ),
);

handleIpc(
  "fetch-gb-mods-batch",
  withResultEnvelope(
    "[BatchUpdate] Fatal error in parallel fetch:",
    async (event, ids) => ({
      data: await fetchGbModsBatch(ids),
    }),
  ),
);

handleIpc(
  "fetch-gb-mods-summaries",
  withResultEnvelope("[BookmarkSummary] Fatal error:", async (event, ids) => ({
    data: await fetchGbModsSummaries(ids),
  })),
);

handleIpc(
  "browse-gb-mods",
  withResultEnvelope("Failed to browse GB mods:", async (event, args = {}) =>
    browseGbMods(args),
  ),
);

handleIpc(
  "fetch-gb-featured-mods",
  withResultEnvelope(
    "Failed to fetch featured GB mods:",
    async (event, gbGameId) => ({
      data: await fetchGbFeaturedMods(gbGameId),
    }),
  ),
);

handleIpc(
  "install-gb-mod",
  withResultEnvelope("install-gb-mod error:", async (event, args = {}) =>
    installGbMod(args, {
      tempDir: app.getPath("temp"),
      isSafeExternalUrl,
      onDownloadProgress: (data) =>
        event.sender.send("download-progress", data),
      trashItem: (folderPath) => shell.trashItem(folderPath),
    }),
  ),
);

handleIpc(
  "get-presets",
  withRawFallback("get-presets error:", [], (event, gameId) =>
    getPresets(gameId),
  ),
);

handleIpc(
  "save-preset",
  withResultEnvelope("save-preset error:", (event, preset) =>
    savePreset(preset),
  ),
);

handleIpc(
  "delete-preset",
  withResultEnvelope("delete-preset error:", (event, gameId, presetId) =>
    deletePreset(gameId, presetId),
  ),
);

handleIpc(
  "execute-preset-diff",
  withResultEnvelope("execute-preset-diff error:", (event, args) =>
    executePresetDiff(args),
  ),
);

handleIpc(
  "export-preset",
  withResultEnvelope("export-preset error:", async (event, preset) => {
    const validPreset = assertPlainObject(preset, "preset");
    const presetName = assertString(
      validPreset.name || "preset",
      "preset.name",
      {
        maxLength: 120,
      },
    );
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
  }),
);

handleIpc(
  "import-preset",
  withResultEnvelope("import-preset error:", async (event) => {
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
      preset: importPresetFromFile(result.filePaths[0]),
    };
  }),
);
