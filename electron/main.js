import { app, BrowserWindow, ipcMain, dialog, shell, net } from "electron";
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    backgroundColor: "#0a0a0f",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Sometimes helpful for custom bridges
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
    path.join(__dirname, "preload.js"),
  );
  if (fs.existsSync(path.join(__dirname, "preload.js"))) {
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
  mainWindow.webContents.on("will-navigate", (event) => {
    event.preventDefault();
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

ipcMain.handle("get-config", () => {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, "utf-8");
      return JSON.parse(data);
    }
    return {};
  } catch (err) {
    console.error("Failed to read config", err);
    return {};
  }
});

ipcMain.handle("set-config", (event, newConfig) => {
  try {
    const configPath = getConfigPath();
    let config = {};
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
    config = { ...config, ...newConfig };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return true;
  } catch (err) {
    console.error("Failed to write config", err);
    return false;
  }
});

ipcMain.handle("choose-folder", async (event) => {
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

// Mods management
ipcMain.handle("get-mods", (event, importerPath, knownCharacters = []) => {
  console.log("Fetching mods for path:", importerPath);
  if (!importerPath) return [];

  let modsPath = importerPath;
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
      
      if (knownCharacters && knownCharacters.length > 0) {
        const normalizedFolder = realName.toLowerCase().replace(/[\s_\-]/g, "");
        
        let bestMatch = null;
        let bestMatchLength = 0;

        for (const knownChar of knownCharacters) {
          // Strip spaces/symbols from the known character name for comparison
          const normalizedKnown = knownChar.toLowerCase().replace(/[\s_\-]/g, "");
          // Check if the folder name STARTS WITH the normalized character name
          if (normalizedFolder.startsWith(normalizedKnown) && normalizedKnown.length > bestMatchLength) {
            bestMatch = knownChar;
            bestMatchLength = normalizedKnown.length;
          }
        }

        if (bestMatch) character = bestMatch;
      }

      // Count ini files
      let iniCount = 0;
      try {
        const files = fs.readdirSync(folderPath);
        iniCount = files.filter((file) =>
          file.toLowerCase().endsWith(".ini"),
        ).length;
      } catch (err) {}

      let gamebananaId = null;
      let installedAt = null;
      let installedFile = null;
      let customThumbnail = null;
      let category = null;
      try {
        const aetherJsonPath = path.join(folderPath, "aether.json");
        if (fs.existsSync(aetherJsonPath)) {
          const aetherData = JSON.parse(fs.readFileSync(aetherJsonPath, "utf-8"));
          gamebananaId = aetherData.gamebananaId || null;
          installedAt = aetherData.installedAt || null;
          installedFile = aetherData.installedFile || null;
          customThumbnail = aetherData.customThumbnail || null;
          category = aetherData.category || null;
        }
      } catch (err) { /* ignore parse errors */ }

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
      });
    });

    return mods;
  } catch (err) {
    console.error("Failed to read mods", err);
    return [];
  }
});

ipcMain.handle(
  "toggle-mod",
  (event, { importerPath, originalFolderName, enable }) => {
    try {
      let modsPath = importerPath;
      if (!modsPath.toLowerCase().endsWith("mods") && fs.existsSync(path.join(modsPath, "Mods"))) {
        modsPath = path.join(modsPath, "Mods");
      }
      
      const oldPath = path.join(modsPath, originalFolderName);

      let newFolderName = originalFolderName;
      if (enable && originalFolderName.startsWith("DISABLED_")) {
        newFolderName = originalFolderName.replace(/^DISABLED_/, "");
      } else if (!enable && !originalFolderName.startsWith("DISABLED_")) {
        newFolderName = `DISABLED_${originalFolderName}`;
      }

      if (newFolderName !== originalFolderName) {
        const newPath = path.join(modsPath, newFolderName);
        fs.renameSync(oldPath, newPath);
        return { success: true, newFolderName };
      }
      return { success: true, newFolderName: originalFolderName };
    } catch (err) {
      console.error("Failed to toggle mod", err);
      return { success: false, error: err.message };
    }
  },
);

ipcMain.handle("open-folder", (event, folderPath) => {
  shell.showItemInFolder(folderPath);
});

// Import Mod Flow
ipcMain.handle("import-mod", async (event, { importerPath, characterName }) => {
  try {
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
    let modsPath = importerPath;
    if (!modsPath.toLowerCase().endsWith("mods") && fs.existsSync(path.join(modsPath, "Mods"))) {
      modsPath = path.join(modsPath, "Mods");
    }

    if (!fs.existsSync(modsPath)) {
      return { success: false, error: "Mods directory not found in the selected importer path." };
    }

    // Prefix the folder with the character name if it's not "Unassigned"
    let targetFolderName = sourceFolderName;
    if (characterName && characterName !== "Unassigned") {
      // Clean up character name for folder (e.g., "Ellen Joe" -> "EllenJoe")
      const cleanCharName = characterName.replace(/\s+/g, "");
      
      // Only prefix if it doesn't already start with it
      if (!sourceFolderName.toLowerCase().startsWith(cleanCharName.toLowerCase())) {
        targetFolderName = `${cleanCharName}_${sourceFolderName}`;
      }
    }

    const targetPath = path.join(modsPath, targetFolderName);

    // Prevent overwriting existing mods
    if (fs.existsSync(targetPath)) {
      return { success: false, error: `A mod folder named "${targetFolderName}" already exists.` };
    }

    // Copy folder recursively
    fs.cpSync(sourcePath, targetPath, { recursive: true });

    return { success: true, newFolderName: targetFolderName };
  } catch (err) {
    console.error("Failed to import mod:", err);
    return { success: false, error: err.message };
  }
});

// Assign Unassigned Mod to Character
ipcMain.handle("assign-mod", async (event, { importerPath, originalFolderName, newCharacterName }) => {
  try {
    let modsPath = importerPath;
    if (!modsPath.toLowerCase().endsWith("mods") && fs.existsSync(path.join(modsPath, "Mods"))) {
      modsPath = path.join(modsPath, "Mods");
    }

    const oldPath = path.join(modsPath, originalFolderName);
    if (!fs.existsSync(oldPath)) {
      return { success: false, error: "Original mod folder not found." };
    }

    // Handle whether it was disabled
    const isDisabled = originalFolderName.startsWith("DISABLED_");
    const realName = isDisabled ? originalFolderName.replace(/^DISABLED_/, "") : originalFolderName;

    const cleanCharName = newCharacterName.replace(/\s+/g, "");
    
    // Create new name: CharacterName_RealName
    let newRealName = `${cleanCharName}_${realName}`;
    let newFolderName = isDisabled ? `DISABLED_${newRealName}` : newRealName;
    
    const newPath = path.join(modsPath, newFolderName);
    
    if (fs.existsSync(newPath) && newPath !== oldPath) {
      return { success: false, error: `A mod folder named "${newFolderName}" already exists.` };
    }

    fs.renameSync(oldPath, newPath);
    return { success: true, newFolderName };
  } catch (err) {
    console.error("Failed to assign mod:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("set-custom-thumbnail", async (event, { importerPath, originalFolderName, thumbnailUrl }) => {
  try {
    let modsPath = importerPath;
    if (!modsPath.toLowerCase().endsWith("mods") && fs.existsSync(path.join(modsPath, "Mods"))) {
      modsPath = path.join(modsPath, "Mods");
    }
    const folderPath = path.join(modsPath, originalFolderName);
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
});

ipcMain.handle("delete-mod", async (event, { importerPath, originalFolderName }) => {
  try {
    let modsPath = importerPath;
    if (!modsPath.toLowerCase().endsWith("mods") && fs.existsSync(path.join(modsPath, "Mods"))) {
      modsPath = path.join(modsPath, "Mods");
    }
    const folderPath = path.join(modsPath, originalFolderName);
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
});

// ─── GameBanana API Helpers ───────────────────────────────────────────────

const GB_API = "https://gamebanana.com/apiv10";
const GB_PROPERTIES = "_idRow,_sName,_sDescription,_sText,_aPreviewMedia,_aFiles,_tsDateUpdated,_nLikeCount,_nDownloadCount,_nViewCount,_aSubmitter,_aGame,_aCategory,_aRootCategory";

async function fetchFromGB(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "AetherManager/1.0.0" },
  });
  if (!res.ok) throw new Error(`GB API error: ${res.status}`);
  return res.json();
}

// Fetch single mod metadata from GameBanana
ipcMain.handle("fetch-gb-mod", async (event, gamebananaId) => {
  try {
    const data = await fetchFromGB(`${GB_API}/Mod/${gamebananaId}?_csvProperties=${encodeURIComponent(GB_PROPERTIES)}`);
    // Construct thumbnail URLs from all preview media
    const allImages = [];
    const images = data._aPreviewMedia?._aImages;
    if (images) {
      images.forEach(img => {
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

const characterCategoryCache = {}; // Cache to map character name -> GameBanana subcategory ID

// Fetch a page of mods from GameBanana for a given game
// Dual-mode: keyword search via Util/Search/Results, general browse via Mod/Index
ipcMain.handle("browse-gb-mods", async (event, { gbGameId, page = 1, perPage = 20, sort = "", search = "" }) => {
  try {
    const browseFields = "name,_aPreviewMedia,_aSubmitter,_nLikeCount,_nDownloadCount,_nViewCount,_tsDateUpdated,_sProfileUrl";

    // Only supported sort aliases (verified via testing)
    const sortAliases = {
      "likes":     "Generic_MostLiked",
      "downloads": "Generic_MostDownloaded",
      "views":     "Generic_MostViewed",
    };
    const sortStr = sort && sortAliases[sort] ? `&_sSort=${sortAliases[sort]}` : "";

    let url;
    
    // Auto-discover the character category ID to enable native Mod/Index sorting
    async function resolveCharCategory(gameId, charName) {
      const searchLower = charName.toLowerCase();
      const cacheKey = `${gameId}_${searchLower}`;
      if (characterCategoryCache[cacheKey]) return characterCategoryCache[cacheKey];

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
          const mData = await fetchFromGB(`${GB_API}/Mod/${mod._idRow}?_csvProperties=_aRootCategory,_aCategory`);
          if (mData._aCategory && mData._aRootCategory) {
            const rootName = (mData._aRootCategory._sName || "").toLowerCase();
            const catName = (mData._aCategory._sName || "").toLowerCase();
            
            // If it's a character/skin
            if (rootName.includes("skin") || rootName.includes("character")) {
               const catId = mData._aCategory._idRow;
               characterCategoryCache[cacheKey] = catId;
               return catId;
            }
            
            // If it's UI/GUI
            if (searchLower.includes("interface") || searchLower === "ui") {
              if (rootName.includes("ui") || rootName.includes("gui") || rootName.includes("interface") ||
                  catName.includes("ui") || catName.includes("gui") || catName.includes("interface")) {
                const catId = mData._aRootCategory._idRow; // Usually UI is a root category, but fallback to sub
                characterCategoryCache[cacheKey] = catId;
                return catId;
              }
            }

            // If it's Miscellaneous
            if (searchLower.includes("misc")) {
              if (rootName.includes("misc") || rootName.includes("other") || 
                  catName.includes("misc") || catName.includes("other")) {
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

    if (search && search.trim().length >= 2) {
      const charName = search.trim();
      const catId = await resolveCharCategory(gbGameId, charName);
      
      if (catId) {
        // We found their explicit category! Use Mod/Index to get perfect sorting & pagination.
        // Omit Generic_Game here because providing both game and category filters causes an empty response bug in apiv10.
        url = `${GB_API}/Mod/Index?_aFilters[Generic_Category]=${catId}&_nPage=${page}&_nPerpage=${perPage}${sortStr}&_csvFields=${encodeURIComponent(browseFields)}`;
      } else {
        // Fallback: full-text search endpoint (Warning: GameBanana ignores _sSort parameter here)
        url = `${GB_API}/Util/Search/Results?_sModelName=Mod&_idGameRow=${gbGameId}&_sSearchString=${encodeURIComponent(charName)}&_nPage=${page}&_nPerpage=${perPage}${sortStr}`;
      }
    } else {
      // General browse
      url = `${GB_API}/Mod/Index?_aFilters[Generic_Game]=${gbGameId}&_nPage=${page}&_nPerpage=${perPage}${sortStr}&_csvFields=${encodeURIComponent(browseFields)}`;
    }

    const data = await fetchFromGB(url);

    // Add constructed thumbnail URLs
    const records = (data._aRecords || []).map(mod => {
      const images = mod._aPreviewMedia?._aImages;
      let thumbnailUrl = null;
      if (images && images.length > 0) {
        const img = images[0];
        thumbnailUrl = img._sFile220
          ? `${img._sBaseUrl}/${img._sFile220}`
          : img._sFile
          ? `${img._sBaseUrl}/${img._sFile}`
          : null;
      }
      return { ...mod, thumbnailUrl };
    });

    return { success: true, records, total: data._aMetadata?._nRecordCount || 0 };
  } catch (err) {
    console.error("Failed to browse GB mods:", err);
    return { success: false, error: err.message };
  }
});

// Download and install a mod from GameBanana
ipcMain.handle("install-gb-mod", async (event, { importerPath, characterName, gbModId, fileUrl, fileName, category }) => {
  const tmpPath = path.join(app.getPath("temp"), `aether_${Date.now()}_${fileName}`);
  
  try {
    // Resolve mods dir
    let modsPath = importerPath;
    if (!modsPath.toLowerCase().endsWith("mods") && fs.existsSync(path.join(modsPath, "Mods"))) {
      modsPath = path.join(modsPath, "Mods");
    }
    if (!fs.existsSync(modsPath)) {
      return { success: false, error: "Mods directory not found." };
    }

    // Clean character name for folder prefix
    const cleanCharName = characterName && characterName !== "Unassigned"
      ? characterName.replace(/\s+/g, "")
      : null;

    // Download the zip file
    const res = await fetch(fileUrl, { headers: { "User-Agent": "AetherManager/1.0.0" } });
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
          event.sender.send("download-progress", { gbModId, percent, downloadedBytes, totalBytes });
        }
      }
    }
    const buffer = Buffer.concat(chunks);
    fs.writeFileSync(tmpPath, buffer);

    // Extract the archive using 7zip (supports zip, rar, 7z)
    const extractedFolders = [];
    
    await new Promise((resolve, reject) => {
      const stream = Seven.extractFull(tmpPath, modsPath, {
        $bin: sevenBin.path7za,
      });

      stream.on('data', function (data) {
        // data.file is the relative path (e.g. "JaneDoe", "JaneDoe/face", "README.txt")
        // data.attributes contains 'D' for directory.
        const entryPath = data.file;
        const normalizedPath = entryPath.replace(/\\/g, '/');
        const parts = normalizedPath.replace(/\/+$/, "").split("/");
        
        // Ensure it's a directory by checking attributes, or by inference if we see a file with a parent
        // Even if 7z doesn't yield an explicit "Directory" event for the folder itself,
        // we can track the root folder name from any file inside it.
        if (parts.length > 1) {
          const topLevel = parts[0];
          if (topLevel && !extractedFolders.includes(topLevel)) {
            extractedFolders.push(topLevel);
          }
        } else if (data.attributes && data.attributes.startsWith('D')) {
           const topLevel = parts[0];
           if (topLevel && !extractedFolders.includes(topLevel)) {
             extractedFolders.push(topLevel);
           }
        }
      });

      stream.on('end', () => resolve());
      stream.on('error', (err) => reject(err));
    });

    // Rename each top-level folder with the character prefix and write metadata
    const renamedFolders = [];
    for (const folderName of extractedFolders) {
      const srcPath = path.join(modsPath, folderName);
      if (!fs.existsSync(srcPath)) continue;

      // Ensure it's actually a directory (ignore top-level loose files like README.txt)
      if (!fs.statSync(srcPath).isDirectory()) continue;

      let targetName = folderName;
      if (cleanCharName && !folderName.toLowerCase().startsWith(cleanCharName.toLowerCase())) {
        targetName = `${cleanCharName}_${folderName}`;
      }

      const targetPath = path.join(modsPath, targetName);
      if (srcPath !== targetPath) {
        fs.renameSync(srcPath, targetPath);
      }

      // Write aether.json inside the mod folder
      const aetherJson = {
        gamebananaId: gbModId,
        installedAt: new Date().toISOString(),
        installedFile: fileName,
        category: category || null
      };
      fs.writeFileSync(path.join(targetPath, "aether.json"), JSON.stringify(aetherJson, null, 2));
      renamedFolders.push(targetName);
    }

    // Cleanup temp file
    fs.unlinkSync(tmpPath);

    return { success: true, installedFolders: renamedFolders };
  } catch (err) {
    console.error("Failed to install GB mod:", err);
    // Cleanup temp if error
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    return { success: false, error: err.message };
  }
});
