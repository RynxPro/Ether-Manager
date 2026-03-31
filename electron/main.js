import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import Seven from "node-7z";
import sevenBin from "7zip-bin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure we have __dirname properly set in ES module
const isDev = process.env.NODE_ENV === "development";

let mainWindow;

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

  console.log(
    "Main Process: Preload path is:",
    preloadPath,
  );
  if (fs.existsSync(preloadPath)) {
    console.log("Main Process: Preload file EXISTS");
  } else {
    console.error("Main Process: Preload file NOT FOUND at path!");
  }

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // Prevent drag-drop navigation
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

app.whenReady().then(() => {
  createWindow();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});

// IPC Handlers

// Config management
const getConfigPath = () =>
  path.join(app.getPath("userData"), "aether_manager_config.json");

const CONFIGURED_GAME_IDS = new Set(["GIMI", "WWMI", "ZZMI", "SRMI", "HIMI"]);

function readConfigFile() {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

function writeConfigFile(config) {
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
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

function assertPlainObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${name}. Expected an object.`);
  }
  return value;
}

function assertString(value, name, { allowEmpty = false, maxLength = 4096 } = {}) {
  if (typeof value !== "string") {
    throw new Error(`Invalid ${name}. Expected a string.`);
  }
  if (value.includes("\0")) {
    throw new Error(`Invalid ${name}.`);
  }
  if (!allowEmpty && value.trim().length === 0) {
    throw new Error(`Invalid ${name}.`);
  }
  if (value.length > maxLength) {
    throw new Error(`Invalid ${name}.`);
  }
  return value;
}

function assertOptionalString(value, name, options = {}) {
  if (value == null) return null;
  return assertString(value, name, options);
}

function assertBoolean(value, name) {
  if (typeof value !== "boolean") {
    throw new Error(`Invalid ${name}. Expected a boolean.`);
  }
  return value;
}

function assertInteger(value, name, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const num = Number(value);
  if (!Number.isInteger(num) || num < min || num > max) {
    throw new Error(`Invalid ${name}. Expected an integer.`);
  }
  return num;
}

function assertStringArray(value, name, { maxItems = 500 } = {}) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new Error(`Invalid ${name}. Expected a string array.`);
  }
  value.forEach((item, index) => {
    assertString(item, `${name}[${index}]`);
  });
  return value;
}

function assertIntegerArray(value, name, { maxItems = 200 } = {}) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new Error(`Invalid ${name}. Expected an integer array.`);
  }
  return value.map((item, index) =>
    assertInteger(item, `${name}[${index}]`, { min: 1 }),
  );
}

function isSubPath(basePath, targetPath) {
  const resolvedBase = path.resolve(basePath);
  const resolvedTarget = path.resolve(targetPath);
  return (
    resolvedTarget === resolvedBase ||
    resolvedTarget.startsWith(`${resolvedBase}${path.sep}`)
  );
}

function assertPathValue(value, name) {
  return assertString(value, name, { maxLength: 8192 });
}

function assertFolderName(value, name) {
  const folderName = assertString(value, name, { maxLength: 255 });
  if (
    path.basename(folderName) !== folderName ||
    folderName.includes("/") ||
    folderName.includes("\\")
  ) {
    throw new Error(`Invalid ${name}.`);
  }
  return folderName;
}

function getConfiguredModsRoots() {
  try {
    const config = readConfigFile();
    return Object.entries(config)
      .filter(([key, value]) => CONFIGURED_GAME_IDS.has(key) && typeof value === "string" && value.trim())
      .map(([, value]) => path.resolve(resolveModsPath(value)))
      .filter((modsPath) => fs.existsSync(modsPath));
  } catch {
    return [];
  }
}

function assertAllowedOpenFolder(targetPath) {
  const resolvedPath = path.resolve(assertPathValue(targetPath, "folderPath"));
  const allowedRoots = getConfiguredModsRoots();
  if (!allowedRoots.some((root) => isSubPath(root, resolvedPath))) {
    throw new Error("Blocked folder path outside configured Mods directories.");
  }
  return resolvedPath;
}

function resolveValidatedModsPath(importerPath) {
  return resolveModsPath(assertPathValue(importerPath, "importerPath"));
}

function resolveModFolderPath(modsPath, folderName, name = "folderName") {
  const safeFolderName = assertFolderName(folderName, name);
  const resolvedPath = path.resolve(modsPath, safeFolderName);
  if (!isSubPath(modsPath, resolvedPath)) {
    throw new Error(`Invalid ${name}.`);
  }
  return { folderName: safeFolderName, folderPath: resolvedPath };
}

handleIpc("get-config", () => {
  try {
    return readConfigFile();
  } catch (err) {
    console.error("Failed to read config", err);
    return {};
  }
});

handleIpc("set-config", (event, newConfig) => {
  try {
    assertPlainObject(newConfig, "config");
    let config = readConfigFile();
    config = { ...config, ...newConfig };
    writeConfigFile(config);
    return true;
  } catch (err) {
    console.error("Failed to write config", err);
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
  } catch (err) {
    console.error("Main Process: Error showing open dialog:", err);
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
  } catch (err) {
    console.error("Failed to open external URL:", err);
    return { success: false, error: err.message };
  }
});

// Mods management
handleIpc(
  "get-mods",
  (
    event,
    importerPath,
    knownCharacters = [],
    expectedGameId = null,
    options = {},
  ) => {
    console.log(
      "Fetching mods for path:",
      importerPath,
      "Expected Game ID:",
      expectedGameId,
    );
    assertStringArray(knownCharacters, "knownCharacters");
    assertOptionalString(expectedGameId, "expectedGameId");
    assertPlainObject(options, "options");
    if (!importerPath) return [];

    let modsPath = resolveValidatedModsPath(importerPath);
    // If the selected path doesn't end in 'Mods', and there's a 'Mods' subfolder, use it.
    // Otherwise, if the path itself is the Mods folder, use it as is.
    if (
      !modsPath.toLowerCase().endsWith("mods") &&
      fs.existsSync(path.join(modsPath, "Mods"))
    ) {
      modsPath = path.join(modsPath, "Mods");
    }

    console.log("Final mods directory path:", modsPath);

    if (!fs.existsSync(modsPath)) {
      console.log("Mods directory does not exist at:", modsPath);
      return [];
    }

    try {
      const modFolders = fs
        .readdirSync(modsPath, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);

      console.log(`Found ${modFolders.length} folders in Mods directory`);

      const mods = [];
      const sharedImporterAcrossGames = Boolean(
        options?.sharedImporterAcrossGames,
      );

      modFolders.forEach((folderName) => {
        const folderPath = path.join(modsPath, folderName);
        const isEnabled = !folderName.startsWith("DISABLED_");
        const realName = isEnabled
          ? folderName
          : folderName.replace(/^DISABLED_/, "");

        // Match mod to a known character.
        // Strategy: compare the folder name (lowercased, symbols stripped) against each known character
        // name (lowercased, spaces and symbols stripped). This handles the common convention where
        // folder names like "AliceThymefield_alice-wt" map to known character "Alice Thymefield".
        let character = "Unassigned";
        let hasKnownCharacterMatch = false;

        if (knownCharacters && knownCharacters.length > 0) {
          const normalizedFolder = realName
            .toLowerCase()
            .replace(/[\s_-]/g, "");

          let bestMatch = null;
          let bestMatchLength = 0;

          for (const knownChar of knownCharacters) {
            // Strip spaces/symbols from the known character name for comparison
            const normalizedKnown = knownChar
              .toLowerCase()
              .replace(/[\s_-]/g, "");
            // Check if the folder name STARTS WITH the normalized character name
            if (
              normalizedFolder.startsWith(normalizedKnown) &&
              normalizedKnown.length > bestMatchLength
            ) {
              bestMatch = knownChar;
              bestMatchLength = normalizedKnown.length;
            }
          }

          if (bestMatch) {
            character = bestMatch;
            hasKnownCharacterMatch = true;
          }
        }

        // Count ini files
        let iniCount = 0;
        try {
          const files = fs.readdirSync(folderPath);
          iniCount = files.filter((file) =>
            file.toLowerCase().endsWith(".ini"),
          ).length;
        } catch {
          // Leave iniCount at zero if the folder cannot be inspected.
        }

        let gamebananaId = null;
        let installedAt = null;
        let installedFile = null;
        let customThumbnail = null;
        let category = null;
        let gameId = null;
        let aetherData = {};
        const aetherJsonPath = path.join(folderPath, "aether.json");
        try {
          if (fs.existsSync(aetherJsonPath)) {
            aetherData = JSON.parse(fs.readFileSync(aetherJsonPath, "utf-8"));
            gamebananaId = aetherData.gamebananaId || null;
            installedAt = aetherData.installedAt || null;
            installedFile = aetherData.installedFile || null;
            customThumbnail = aetherData.customThumbnail || null;
            category = aetherData.category || null;
            gameId = aetherData.gameId || null;
          }
        } catch {
          /* ignore parse errors */
        }

        if (expectedGameId) {
          if (gameId && gameId !== expectedGameId) {
            return;
          }

          const hasMatchableLegacyMetadata = Boolean(
            hasKnownCharacterMatch ||
              category ||
              gamebananaId ||
              installedAt ||
              installedFile ||
              customThumbnail,
          );

          if (!gameId && hasMatchableLegacyMetadata) {
            gameId = expectedGameId;
            try {
              fs.writeFileSync(
                aetherJsonPath,
                JSON.stringify(
                  {
                    ...aetherData,
                    gamebananaId,
                    installedAt,
                    installedFile,
                    customThumbnail,
                    category,
                    gameId,
                  },
                  null,
                  2,
                ),
              );
            } catch (migrationErr) {
              console.warn(
                `Failed to backfill gameId for legacy mod "${folderName}":`,
                migrationErr.message,
              );
            }
          }

          // If multiple games point at the same Mods directory, untagged legacy
          // folders without enough metadata to attribute safely are ambiguous.
          if (sharedImporterAcrossGames && !gameId) {
            return;
          }
        }

        mods.push({
          id: realName,
          originalFolderName: folderName,
          name: realName.replace(/_/g, " "),
          character,
          category,
          isEnabled,
          iniCount,
          path: folderPath,
          gamebananaId,
          installedAt,
          installedFile,
          customThumbnail,
          gameId,
        });
      });

      return mods;
    } catch (err) {
      console.error("Failed to read mods", err);
      return [];
    }
  },
);

handleIpc(
  "toggle-mod",
  (event, { importerPath, originalFolderName, enable }) => {
    try {
      const modsPath = resolveValidatedModsPath(importerPath);
      const { folderName: safeOriginalFolderName, folderPath: oldPath } =
        resolveModFolderPath(modsPath, originalFolderName, "originalFolderName");
      assertBoolean(enable, "enable");

      let newFolderName = safeOriginalFolderName;
      if (enable && safeOriginalFolderName.startsWith("DISABLED_")) {
        newFolderName = safeOriginalFolderName.replace(/^DISABLED_/, "");
      } else if (!enable && !safeOriginalFolderName.startsWith("DISABLED_")) {
        newFolderName = `DISABLED_${safeOriginalFolderName}`;
      }

      if (newFolderName !== safeOriginalFolderName) {
        const { folderPath: newPath } = resolveModFolderPath(
          modsPath,
          newFolderName,
          "newFolderName",
        );
        fs.renameSync(oldPath, newPath);
        return { success: true, newFolderName };
      }
      return { success: true, newFolderName: safeOriginalFolderName };
    } catch (err) {
      console.error("Failed to toggle mod", err);
      return { success: false, error: err.message };
    }
  },
);

handleIpc("open-folder", (event, folderPath) => {
  shell.showItemInFolder(assertAllowedOpenFolder(folderPath));
});

// Import Mod Flow
handleIpc(
  "import-mod",
  async (event, { importerPath, characterName, gameId }) => {
    try {
      assertOptionalString(characterName, "characterName", { allowEmpty: true });
      assertOptionalString(gameId, "gameId");
      const win = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showOpenDialog(win || mainWindow, {
        properties: ["openDirectory"],
        title: `Select Mod Folder for ${characterName}`,
        buttonLabel: "Import Mod",
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      const sourcePath = result.filePaths[0];
      const sourceFolderName = path.basename(sourcePath);

      // Resolve Mods directory
      let modsPath = resolveValidatedModsPath(importerPath);

      if (!fs.existsSync(modsPath)) {
        return {
          success: false,
          error: "Mods directory not found in the selected importer path.",
        };
      }

      // Prefix the folder with the character name if it's not "Unassigned"
      let targetFolderName = sourceFolderName;
      if (characterName && characterName !== "Unassigned") {
        // Clean up character name for folder (e.g., "Ellen Joe" -> "EllenJoe")
        const cleanCharName = characterName.replace(/\s+/g, "");

        // Only prefix if it doesn't already start with it
        if (
          !sourceFolderName
            .toLowerCase()
            .startsWith(cleanCharName.toLowerCase())
        ) {
          targetFolderName = `${cleanCharName}_${sourceFolderName}`;
        }
      }

      const targetPath = path.join(modsPath, targetFolderName);

      // Prevent overwriting existing mods
      if (fs.existsSync(targetPath)) {
        return {
          success: false,
          error: `A mod folder named "${targetFolderName}" already exists.`,
        };
      }

      // Copy folder recursively
      fs.cpSync(sourcePath, targetPath, { recursive: true });

      // Write aether.json for manual imports too to track game isolation
      const aetherJson = {
        installedAt: new Date().toISOString(),
        gameId: gameId || null,
      };
      fs.writeFileSync(
        path.join(targetPath, "aether.json"),
        JSON.stringify(aetherJson, null, 2),
      );

      return { success: true, newFolderName: targetFolderName };
    } catch (err) {
      console.error("Failed to import mod:", err);
      return { success: false, error: err.message };
    }
  },
);

// Assign Unassigned Mod to Character
handleIpc(
  "assign-mod",
  async (event, { importerPath, originalFolderName, newCharacterName }) => {
    try {
      const modsPath = resolveValidatedModsPath(importerPath);
      assertString(newCharacterName, "newCharacterName");
      const { folderName: safeOriginalFolderName, folderPath: oldPath } =
        resolveModFolderPath(modsPath, originalFolderName, "originalFolderName");
      if (!fs.existsSync(oldPath)) {
        return { success: false, error: "Original mod folder not found." };
      }

      // Handle whether it was disabled
      const isDisabled = safeOriginalFolderName.startsWith("DISABLED_");
      const realName = isDisabled
        ? safeOriginalFolderName.replace(/^DISABLED_/, "")
        : safeOriginalFolderName;

      const cleanCharName = newCharacterName.replace(/\s+/g, "");

      // Create new name: CharacterName_RealName
      let newRealName = `${cleanCharName}_${realName}`;
      let newFolderName = isDisabled ? `DISABLED_${newRealName}` : newRealName;

      const { folderPath: newPath } = resolveModFolderPath(
        modsPath,
        newFolderName,
        "newFolderName",
      );

      if (fs.existsSync(newPath) && newPath !== oldPath) {
        return {
          success: false,
          error: `A mod folder named "${newFolderName}" already exists.`,
        };
      }

      fs.renameSync(oldPath, newPath);
      return { success: true, newFolderName };
    } catch (err) {
      console.error("Failed to assign mod:", err);
      return { success: false, error: err.message };
    }
  },
);

handleIpc(
  "set-custom-thumbnail",
  async (event, { importerPath, originalFolderName, thumbnailUrl }) => {
    try {
      const modsPath = resolveValidatedModsPath(importerPath);
      if (thumbnailUrl !== null) {
        assertString(thumbnailUrl, "thumbnailUrl", { maxLength: 8192 });
      }
      const { folderPath } = resolveModFolderPath(
        modsPath,
        originalFolderName,
        "originalFolderName",
      );
      if (!fs.existsSync(folderPath)) {
        throw new Error(`Folder "${originalFolderName}" not found`);
      }

      const aetherJsonPath = path.join(folderPath, "aether.json");
      let aetherData = {};
      if (fs.existsSync(aetherJsonPath)) {
        try {
          aetherData = JSON.parse(fs.readFileSync(aetherJsonPath, "utf-8"));
        } catch (e) {
          console.error("Error reading aether.json:", e);
        }
      }

      if (thumbnailUrl === null) {
        delete aetherData.customThumbnail;
      } else {
        aetherData.customThumbnail = thumbnailUrl;
      }

      fs.writeFileSync(aetherJsonPath, JSON.stringify(aetherData, null, 2));
      return { success: true };
    } catch (err) {
      console.error("Failed to set custom thumbnail:", err);
      return { success: false, error: err.message };
    }
  },
);

handleIpc(
  "delete-mod",
  async (event, { importerPath, originalFolderName }) => {
    try {
      const modsPath = resolveValidatedModsPath(importerPath);
      const { folderPath } = resolveModFolderPath(
        modsPath,
        originalFolderName,
        "originalFolderName",
      );
      if (!fs.existsSync(folderPath)) {
        throw new Error(`Folder "${originalFolderName}" not found`);
      }

      // Move to recycle bin instead of permanent rm -rf
      await shell.trashItem(folderPath);
      return { success: true };
    } catch (err) {
      console.error("Failed to delete mod:", err);
      return { success: false, error: err.message };
    }
  },
);

// ─── GameBanana API Helpers ───────────────────────────────────────────────

const GB_API = "https://gamebanana.com/apiv10";
const GB_PROPERTIES =
  "_idRow,_sName,_sDescription,_sText,_aPreviewMedia,_aFiles,_tsDateUpdated,_nLikeCount,_nDownloadCount,_nViewCount,_aSubmitter,_aGame,_aCategory,_aRootCategory";

async function fetchFromGB(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "AetherManager/1.0.0" },
  });
  if (!res.ok) throw new Error(`GB API error: ${res.status}`);
  return res.json();
}

// Fetch single mod metadata from GameBanana
handleIpc("fetch-gb-mod", async (event, gamebananaId) => {
  try {
    gamebananaId = assertInteger(gamebananaId, "gamebananaId", { min: 1 });
    const data = await fetchFromGB(
      `${GB_API}/Mod/${gamebananaId}?_csvProperties=${encodeURIComponent(GB_PROPERTIES)}`,
    );
    // Construct thumbnail URLs from all preview media
    const allImages = [];
    const images = data._aPreviewMedia?._aImages;
    if (images) {
      images.forEach((img) => {
        const url = img._sFile530
          ? `${img._sBaseUrl}/${img._sFile530}`
          : img._sFile
            ? `${img._sBaseUrl}/${img._sFile}`
            : null;
        if (url) allImages.push(url);
      });
    }
    const thumbnailUrl = allImages.length > 0 ? allImages[0] : null;

    return { success: true, data: { ...data, thumbnailUrl, allImages } };
  } catch (err) {
    console.error("Failed to fetch GB mod:", err);
    return { success: false, error: err.message };
  }
});

// Fetch multiple mods in parallel for update checks
handleIpc("fetch-gb-mods-batch", async (event, ids) => {
  try {
    if (!ids || ids.length === 0) return { success: true, data: [] };
    ids = assertIntegerArray(ids, "ids");

    // Using individual fetches in parallel is more reliable than the V10 batch API
    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          // We need the update timestamp for status and preview media for thumbnails
          const data = await fetchFromGB(
            `${GB_API}/Mod/${id}?_csvProperties=_idRow,_tsDateUpdated,_aPreviewMedia`,
          );
          return data;
        } catch (e) {
          console.error(`[BatchUpdate] Failed to fetch mod ${id}:`, e.message);
          return null;
        }
      }),
    );

    const validData = results.filter((r) => r !== null);
    return { success: true, data: validData };
  } catch (err) {
    console.error("[BatchUpdate] Fatal error in parallel fetch:", err);
    return { success: false, error: err.message };
  }
});

handleIpc("fetch-gb-mods-summaries", async (event, ids) => {
  try {
    if (!ids || ids.length === 0) return { success: true, data: [] };
    ids = assertIntegerArray(ids, "ids");

    const summaryProperties =
      "_idRow,_sName,_aPreviewMedia,_nLikeCount,_nDownloadCount,_nViewCount,_tsDateUpdated,_aSubmitter,_sProfileUrl";

    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          const data = await fetchFromGB(
            `${GB_API}/Mod/${id}?_csvProperties=${encodeURIComponent(summaryProperties)}`,
          );

          const images = data._aPreviewMedia?._aImages;
          let thumbnailUrl = null;
          if (images && images.length > 0) {
            const img = images[0];
            const fileName = img._sFile530 || img._sFile || img._sFile220;
            thumbnailUrl = fileName ? `${img._sBaseUrl}/${fileName}` : null;
          }

          return { ...data, thumbnailUrl };
        } catch (err) {
          console.error(`[BookmarkSummary] Failed to fetch mod ${id}:`, err.message);
          return null;
        }
      }),
    );

    return {
      success: true,
      data: results.filter(Boolean),
    };
  } catch (err) {
    console.error("[BookmarkSummary] Fatal error:", err);
    return { success: false, error: err.message };
  }
});

const characterCategoryCache = {}; // Cache to map character name -> GameBanana subcategory ID

// Fetch a page of mods from GameBanana for a given game
// Dual-mode: keyword search via Util/Search/Results, general browse via Mod/Index
handleIpc(
  "browse-gb-mods",
  async (event, args = {}) => {
    try {
      assertPlainObject(args, "browseArgs");
      const gbGameId = assertInteger(args.gbGameId, "gbGameId", { min: 1 });
      const page = assertInteger(args.page ?? 1, "page", { min: 1, max: 1000 });
      const perPage = assertInteger(args.perPage ?? 20, "perPage", { min: 1, max: 100 });
      const sort = assertOptionalString(args.sort ?? "", "sort", {
        allowEmpty: true,
        maxLength: 32,
      }) || "";
      const context = assertOptionalString(args.context ?? "", "context", {
        allowEmpty: true,
        maxLength: 120,
      }) || "";
      const search = assertOptionalString(args.search ?? "", "search", {
        allowEmpty: true,
        maxLength: 240,
      }) || "";
      const submitterId = args.submitterId == null
        ? null
        : assertInteger(args.submitterId, "submitterId", { min: 1 });

      const browseFields =
        "name,_aPreviewMedia,_aSubmitter,_nLikeCount,_nDownloadCount,_nViewCount,_tsDateUpdated,_sProfileUrl";

      // Only supported sort aliases (verified via testing)
      const sortAliases = {
        likes: "Generic_MostLiked",
        downloads: "Generic_MostDownloaded",
        views: "Generic_MostViewed",
      };
      const sortStr =
        sort && sortAliases[sort] ? `&_sSort=${sortAliases[sort]}` : "";

      // Auto-discover the character category ID to enable native Mod/Index sorting
      async function resolveCharCategory(gameId, charName) {
        const searchLower = charName.toLowerCase();
        const cacheKey = `${gameId}_${searchLower}`;
        if (characterCategoryCache[cacheKey])
          return characterCategoryCache[cacheKey];

        // Fast-path exact root categories for UI and Misc to avoid fuzzy search inaccuracies
        if (searchLower === "ui" || searchLower.includes("interface")) {
          if (gameId == 19567) return 30395; // ZZZ UI
        }
        if (searchLower === "misc" || searchLower === "miscellaneous") {
          if (gameId == 19567) return 29874; // ZZZ Other/Misc
        }

        try {
          const searchUrl = `${GB_API}/Util/Search/Results?_sModelName=Mod&_idGameRow=${gameId}&_nPage=1&_nPerpage=3&_sSearchString=${encodeURIComponent(charName)}`;
          const searchRes = await fetchFromGB(searchUrl);
          if (!searchRes._aRecords) return null;

          for (const mod of searchRes._aRecords) {
            // Fetch detailed mod to inspect category tree
            const mData = await fetchFromGB(
              `${GB_API}/Mod/${mod._idRow}?_csvProperties=_aRootCategory,_aCategory`,
            );
            if (mData._aCategory && mData._aRootCategory) {
              const rootName = (
                mData._aRootCategory._sName || ""
              ).toLowerCase();
              const catName = (mData._aCategory._sName || "").toLowerCase();

              // If it's a character/skin
              if (rootName.includes("skin") || rootName.includes("character")) {
                const catId = mData._aCategory._idRow;
                characterCategoryCache[cacheKey] = catId;
                return catId;
              }

              // If it's UI/GUI
              if (searchLower.includes("interface") || searchLower === "ui") {
                if (
                  rootName.includes("ui") ||
                  rootName.includes("gui") ||
                  rootName.includes("interface") ||
                  catName.includes("ui") ||
                  catName.includes("gui") ||
                  catName.includes("interface")
                ) {
                  const catId = mData._aRootCategory._idRow; // Usually UI is a root category, but fallback to sub
                  characterCategoryCache[cacheKey] = catId;
                  return catId;
                }
              }

              // If it's Miscellaneous
              if (searchLower.includes("misc")) {
                if (
                  rootName.includes("misc") ||
                  rootName.includes("other") ||
                  catName.includes("misc") ||
                  catName.includes("other")
                ) {
                  const catId = mData._aRootCategory._idRow;
                  characterCategoryCache[cacheKey] = catId;
                  return catId;
                }
              }
            }
          }
        } catch (err) {
          console.error("Failed to auto-discover category ID:", err.message);
        }
        return null;
      }

      let url;

      const hasManualSearch = search && search.trim().length >= 1;
      const hasCategoryContext = context && context.trim().length >= 1;

      if (submitterId) {
        // CREATOR PROFILE MODE
        url = `${GB_API}/Mod/Index?_aFilters[Generic_Game]=${gbGameId}&_aFilters[Generic_Submitter]=${submitterId}&_nPage=${page}&_nPerpage=${perPage}${sortStr}&_csvFields=${encodeURIComponent(browseFields)}`;
      } else if (hasManualSearch) {
        // MANUAL SEARCH MODE: Combine context and search for fuzzy string results
        // We skip category resolution here to prevent "hijacking" by unrelated categories
        const combinedQuery = [context, search].filter(Boolean).join(" ");
        url = `${GB_API}/Util/Search/Results?_sModelName=Mod&_idGameRow=${gbGameId}&_sSearchString=${encodeURIComponent(combinedQuery)}&_nPage=${page}&_nPerpage=${perPage}${sortStr}&_csvProperties=${encodeURIComponent(browseFields)}`;
      } else if (hasCategoryContext) {
        // BROWSING MODE: Pure character/category selection
        // Use high-precision category ID if possible for perfect sorting
        const charName = context.trim();
        const catId = await resolveCharCategory(gbGameId, charName);

        if (catId) {
          url = `${GB_API}/Mod/Index?_aFilters[Generic_Category]=${catId}&_nPage=${page}&_nPerpage=${perPage}${sortStr}&_csvFields=${encodeURIComponent(browseFields)}`;
        } else {
          url = `${GB_API}/Util/Search/Results?_sModelName=Mod&_idGameRow=${gbGameId}&_sSearchString=${encodeURIComponent(charName)}&_nPage=${page}&_nPerpage=${perPage}${sortStr}&_csvProperties=${encodeURIComponent(browseFields)}`;
        }
      } else {
        // GLOBAL HOME MODE
        url = `${GB_API}/Mod/Index?_aFilters[Generic_Game]=${gbGameId}&_nPage=${page}&_nPerpage=${perPage}${sortStr}&_csvFields=${encodeURIComponent(browseFields)}`;
      }

      console.log("GB API Request URL:", url);
      const data = await fetchFromGB(url);

      // Add constructed thumbnail URLs
      const records = (data._aRecords || []).map((mod) => {
        const images = mod._aPreviewMedia?._aImages;
        let thumbnailUrl = null;
        if (images && images.length > 0) {
          const img = images[0];
          // Prioritize higher resolution 530px file if available, then original, then small preview
          const fileName = img._sFile530 || img._sFile || img._sFile220;
          thumbnailUrl = fileName ? `${img._sBaseUrl}/${fileName}` : null;
        }
        return { ...mod, thumbnailUrl };
      });

      return {
        success: true,
        records,
        total: data._aMetadata?._nRecordCount || 0,
      };
    } catch (err) {
      console.error("Failed to browse GB mods:", err);
      return { success: false, error: err.message };
    }
  },
);

// Download and install a mod from GameBanana
handleIpc(
  "install-gb-mod",
  async (event, args = {}) => {
    assertPlainObject(args, "installArgs");
    const importerPath = resolveValidatedModsPath(args.importerPath);
    const characterName = assertOptionalString(args.characterName, "characterName", {
      allowEmpty: true,
      maxLength: 120,
    });
    const gbModId = assertInteger(args.gbModId, "gbModId", { min: 1 });
    const fileUrl = assertString(args.fileUrl, "fileUrl", { maxLength: 4096 });
    const fileName = assertString(args.fileName, "fileName", { maxLength: 255 });
    const category = assertOptionalString(args.category, "category", {
      allowEmpty: true,
      maxLength: 120,
    });
    const gameId = assertOptionalString(args.gameId, "gameId", { maxLength: 32 });
    if (!isSafeExternalUrl(fileUrl)) {
      return { success: false, error: "Blocked unsafe download URL." };
    }

    const tmpPath = path.join(
      app.getPath("temp"),
      `aether_${Date.now()}_${fileName}`,
    );
    let extractSandboxPath = null;
    const installedFolderPaths = [];

    try {
      // Resolve mods dir
      let modsPath = importerPath;
      if (!fs.existsSync(modsPath)) {
        return { success: false, error: "Mods directory not found." };
      }

      // Clean character name for folder prefix
      const cleanCharName =
        characterName && characterName !== "Unassigned"
          ? characterName.replace(/\s+/g, "")
          : null;

      // --- CLEAN UPDATE STRATEGY ---
      // If updating, find existing folders with the exact same gamebananaId AND the exact same installedFile
      // This prevents Variant A from deleting Variant B if both are downloaded from the same post!
      const modFolders = fs
        .readdirSync(modsPath, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

      for (const folder of modFolders) {
        const ajsonPath = path.join(modsPath, folder, "aether.json");
        if (fs.existsSync(ajsonPath)) {
          try {
            const data = JSON.parse(fs.readFileSync(ajsonPath, "utf-8"));
            if (data.gamebananaId === gbModId && data.installedFile === fileName) {
              console.log(`Moving old mod version to Recycle Bin: ${folder}`);
              // Use trashItem (Recycle Bin) instead of rmSync so the user can recover if something goes wrong
              try {
                await shell.trashItem(path.join(modsPath, folder));
              } catch (trashErr) {
                // Fallback to rmSync only if trashItem fails (e.g. external / network drives)
                console.warn(`trashItem failed for ${folder}, falling back to rmSync:`, trashErr.message);
                fs.rmSync(path.join(modsPath, folder), { recursive: true, force: true });
              }
            }
          } catch (e) {
            console.error(
              `Failed to read aether.json in ${folder} during cleanup`,
              e,
            );
          }
        }
      }
      // ----------------------------

      // Download the zip file
      const res = await fetch(fileUrl, {
        headers: { "User-Agent": "AetherManager/1.0.0" },
      });
      if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);

      const contentLength = res.headers.get("content-length");
      const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
      let downloadedBytes = 0;
      const chunks = [];

      // Read the stream chunk by chunk to report progress
      const reader = res.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          downloadedBytes += value.length;
          if (totalBytes > 0) {
            const percent = Math.round((downloadedBytes / totalBytes) * 100);
            event.sender.send("download-progress", {
              gbModId,
              percent,
              downloadedBytes,
              totalBytes,
            });
          }
        }
      }
      const buffer = Buffer.concat(chunks);
      fs.writeFileSync(tmpPath, buffer);

      // Create a dedicated Sandbox extraction folder to trap "Flat Zips" (zips without root folders)
      const extractSandboxName = `.aether_tmp_extract_${Date.now()}`;
      extractSandboxPath = path.join(modsPath, extractSandboxName);
      fs.mkdirSync(extractSandboxPath, { recursive: true });

      // Extract the archive into the Sandbox
      await new Promise((resolve, reject) => {
        const stream = Seven.extractFull(tmpPath, extractSandboxPath, {
          $bin: sevenBin.path7za,
        });

        stream.on("end", () => resolve());
        stream.on("error", (err) => reject(err));
      });

      // Analyze the Sandbox contents
      const sandboxContents = fs.readdirSync(extractSandboxPath, { withFileTypes: true });
      let extractedRootFolders = [];
      const hasLooseLooseFiles = sandboxContents.some(d => !d.isDirectory());
      const directoryCount = sandboxContents.filter(d => d.isDirectory()).length;

      // If the zip was "properly formatted" (only 1 single root folder inside, no loose files beside it)
      if (directoryCount === 1 && !hasLooseLooseFiles) {
        const rootFolder = sandboxContents.find(d => d.isDirectory()).name;
        extractedRootFolders.push(path.join(extractSandboxPath, rootFolder));
      } 
      // If the zip was "improperly formatted" (a flat zip containing multiple folders or loose files at the root)
      else {
        // We package the entire sandbox itself into a single directory!
        extractedRootFolders.push(extractSandboxPath);
      }

      // Precompute target folders before moving anything so collisions fail safely.
      const installationTargets = [];
      for (const srcPath of extractedRootFolders) {
        if (!fs.existsSync(srcPath)) continue;

        // Use the original zip/tar name (sans extension) if it was a flat zip, otherwise use the intrinsic folder name
        const rawFolderName = srcPath === extractSandboxPath 
          ? fileName.replace(/\.[^/.]+$/, "") // strip extension
          : path.basename(srcPath);

        let targetName = rawFolderName.replace(/[^a-zA-Z0-9_\-\s]/g, ""); // sanitize just in case
        if (
          cleanCharName &&
          !targetName.toLowerCase().startsWith(cleanCharName.toLowerCase())
        ) {
          targetName = `${cleanCharName}_${targetName}`;
        }

        const finalTargetPath = path.join(modsPath, targetName);
        if (fs.existsSync(finalTargetPath)) {
          throw new Error(
            `A mod folder named "${targetName}" already exists. Remove or rename the existing folder before installing this archive.`,
          );
        }

        installationTargets.push({ srcPath, targetName, finalTargetPath });
      }

      // Rename each top-level root folder with the character prefix and write metadata, moving it OUT of the sandbox
      const renamedFolders = [];
      for (const { srcPath, targetName, finalTargetPath } of installationTargets) {
        fs.renameSync(srcPath, finalTargetPath);
        installedFolderPaths.push(finalTargetPath);

        // Write aether.json inside the packaged directory
        const aetherJson = {
          gamebananaId: gbModId,
          installedAt: new Date().toISOString(),
          installedFile: fileName,
          character: characterName || null,
          category: category || null,
          gameId: gameId || null,
        };
        fs.writeFileSync(
          path.join(finalTargetPath, "aether.json"),
          JSON.stringify(aetherJson, null, 2),
        );
        renamedFolders.push(targetName);
      }

      // Cleanup Sandbox & Zip Tracker
      if (fs.existsSync(extractSandboxPath)) {
        fs.rmSync(extractSandboxPath, { recursive: true, force: true });
      }
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }

      return { success: true, installedFolders: renamedFolders };
    } catch (err) {
      console.error("Failed to install GB mod:", err);
      for (const folderPath of installedFolderPaths) {
        if (fs.existsSync(folderPath)) {
          fs.rmSync(folderPath, { recursive: true, force: true });
        }
      }
      if (extractSandboxPath && fs.existsSync(extractSandboxPath)) {
        fs.rmSync(extractSandboxPath, { recursive: true, force: true });
      }
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      return { success: false, error: err.message };
    }
  },
);

// ─────────────────────────────────────────────
//  PRESETS / LOADOUTS
// ─────────────────────────────────────────────

/** Helper to resolve the Mods directory from an importer path (same logic used everywhere) */
function resolveModsPath(importerPath) {
  let modsPath = importerPath;
  if (
    !modsPath.toLowerCase().endsWith("mods") &&
    fs.existsSync(path.join(modsPath, "Mods"))
  ) {
    modsPath = path.join(modsPath, "Mods");
  }
  return modsPath;
}

/** Read all presets for a game from config */
handleIpc("get-presets", (event, gameId) => {
  try {
    gameId = assertString(gameId, "gameId", { maxLength: 32 });
    const config = readConfigFile();
    return (config.presets || {})[gameId] || [];
  } catch (err) {
    console.error("get-presets error:", err);
    return [];
  }
});

/** Create or update a preset (identified by preset.id) */
handleIpc("save-preset", (event, preset) => {
  try {
    preset = assertPlainObject(preset, "preset");
    assertString(preset.id, "preset.id", { maxLength: 128 });
    const gameId = assertString(preset.gameId, "preset.gameId", { maxLength: 32 });
    if (!Array.isArray(preset.mods)) {
      throw new Error("Invalid preset.mods. Expected an array.");
    }
    let config = readConfigFile();
    if (!config.presets) config.presets = {};
    if (!config.presets[gameId]) config.presets[gameId] = [];

    const index = config.presets[gameId].findIndex((p) => p.id === preset.id);
    if (index >= 0) {
      config.presets[gameId][index] = preset;
    } else {
      config.presets[gameId].unshift(preset); // newest first
    }

    writeConfigFile(config);
    return { success: true };
  } catch (err) {
    console.error("save-preset error:", err);
    return { success: false, error: err.message };
  }
});

/** Delete a preset by id */
handleIpc("delete-preset", (event, gameId, presetId) => {
  try {
    gameId = assertString(gameId, "gameId", { maxLength: 32 });
    presetId = assertString(presetId, "presetId", { maxLength: 128 });
    const config = readConfigFile();
    if (config.presets && config.presets[gameId]) {
      config.presets[gameId] = config.presets[gameId].filter(
        (p) => p.id !== presetId,
      );
    }
    writeConfigFile(config);
    return { success: true };
  } catch (err) {
    console.error("delete-preset error:", err);
    return { success: false, error: err.message };
  }
});

/**
 * Execute a calculated preset diff: applies exact enable/disable folder renames.
 */
handleIpc(
  "execute-preset-diff",
  (event, { importerPath, enableList, disableList }) => {
    try {
      const modsPath = resolveValidatedModsPath(importerPath);
      if (!fs.existsSync(modsPath))
        return { success: false, error: "Mods directory not found." };

      const toEnable = enableList ? assertStringArray(enableList, "enableList") : [];
      const toDisable = disableList ? assertStringArray(disableList, "disableList") : [];

      const renameActions = [
        ...toEnable.map((folderName) => {
          const fromName = folderName.startsWith("DISABLED_")
            ? folderName
            : `DISABLED_${folderName}`;
          const toName = fromName.replace(/^DISABLED_/, "");
          return { fromName, toName };
        }),
        ...toDisable.map((folderName) => {
          const fromName = folderName.replace(/^DISABLED_/, "");
          return { fromName, toName: `DISABLED_${fromName}` };
        }),
      ];

      if (renameActions.length === 0) {
        return { success: true, applied: 0 };
      }

      const sourceNames = new Set();
      const targetNames = new Set();
      for (const action of renameActions) {
        assertFolderName(action.fromName, "renameActions.fromName");
        assertFolderName(action.toName, "renameActions.toName");
        if (action.fromName === action.toName) {
          return {
            success: false,
            error: `Invalid preset diff for "${action.fromName}".`,
          };
        }

        if (sourceNames.has(action.fromName)) {
          return {
            success: false,
            error: `Preset diff contains duplicate source folder "${action.fromName}".`,
          };
        }
        if (targetNames.has(action.toName)) {
          return {
            success: false,
            error: `Preset diff contains duplicate target folder "${action.toName}".`,
          };
        }

        sourceNames.add(action.fromName);
        targetNames.add(action.toName);
      }

      for (const action of renameActions) {
        const fromPath = path.join(modsPath, action.fromName);
        if (!fs.existsSync(fromPath)) {
          return {
            success: false,
            error: `Preset apply aborted because "${action.fromName}" no longer exists on disk. Refresh the library and try again.`,
          };
        }

        const toPath = path.join(modsPath, action.toName);
        if (
          fs.existsSync(toPath) &&
          !sourceNames.has(action.toName)
        ) {
          return {
            success: false,
            error: `Preset apply aborted because "${action.toName}" already exists.`,
          };
        }
      }

      const txId = `.aether_preset_txn_${Date.now()}`;
      const stagedActions = renameActions.map((action, index) => ({
        ...action,
        fromPath: path.join(modsPath, action.fromName),
        toPath: path.join(modsPath, action.toName),
        tempName: `${txId}_${index}_${action.fromName}`,
        tempPath: path.join(modsPath, `${txId}_${index}_${action.fromName}`),
        state: "pending",
      }));

      try {
        // Phase 1: move every source out of the way so target names become free.
        for (const action of stagedActions) {
          fs.renameSync(action.fromPath, action.tempPath);
          action.state = "staged";
        }

        // Phase 2: move staged folders into their final names.
        for (const action of stagedActions) {
          fs.renameSync(action.tempPath, action.toPath);
          action.state = "finalized";
        }
      } catch (err) {
        for (const action of [...stagedActions].reverse()) {
          try {
            if (action.state === "finalized" && fs.existsSync(action.toPath)) {
              fs.renameSync(action.toPath, action.fromPath);
            } else if (
              action.state === "staged" &&
              fs.existsSync(action.tempPath)
            ) {
              fs.renameSync(action.tempPath, action.fromPath);
            }
          } catch (rollbackErr) {
            console.error(
              `Failed to roll back preset action ${action.toName} -> ${action.fromName}:`,
              rollbackErr,
            );
            return {
              success: false,
              error: `Preset apply failed and rollback was incomplete. Check the Mods folder before retrying. Original error: ${err.message}`,
            };
          }
        }

        return {
          success: false,
          error: `Preset apply failed before completion. No changes were kept. ${err.message}`,
        };
      }

      return { success: true, applied: stagedActions.length };
    } catch (err) {
      console.error("execute-preset-diff error:", err);
      return { success: false, error: err.message };
    }
  },
);

/** Export preset to a .aether-preset file via Save dialog */
handleIpc("export-preset", async (event, preset) => {
  try {
    preset = assertPlainObject(preset, "preset");
    const presetName = assertString(preset.name || "preset", "preset.name", {
      maxLength: 120,
    });
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(win || mainWindow, {
      title: "Export Preset",
      defaultPath: `${presetName.replace(/[^a-z0-9]/gi, "_")}.aether-preset`,
      filters: [{ name: "Aether Preset", extensions: ["aether-preset"] }],
    });
    if (result.canceled || !result.filePath)
      return { success: false, canceled: true };
    fs.writeFileSync(result.filePath, JSON.stringify(preset, null, 2));
    return { success: true };
  } catch (err) {
    console.error("export-preset error:", err);
    return { success: false, error: err.message };
  }
});

/** Import preset from a .aether-preset file via Open dialog */
handleIpc("import-preset", async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win || mainWindow, {
      title: "Import Preset",
      filters: [{ name: "Aether Preset", extensions: ["aether-preset"] }],
      properties: ["openFile"],
    });
    if (result.canceled || result.filePaths.length === 0)
      return { success: false, canceled: true };
    const data = JSON.parse(fs.readFileSync(result.filePaths[0], "utf-8"));
    return { success: true, preset: data };
  } catch (err) {
    console.error("import-preset error:", err);
    return { success: false, error: err.message };
  }
});
