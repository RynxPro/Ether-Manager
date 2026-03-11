import { app, BrowserWindow, ipcMain, dialog, shell, net } from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import unzipper from "unzipper";

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

      // Read aether.json for GameBanana metadata
      let gamebananaId = null;
      try {
        const aetherJsonPath = path.join(folderPath, "aether.json");
        if (fs.existsSync(aetherJsonPath)) {
          const aetherData = JSON.parse(fs.readFileSync(aetherJsonPath, "utf-8"));
          gamebananaId = aetherData.gamebananaId || null;
        }
      } catch (err) { /* ignore parse errors */ }

      mods.push({
        id: realName,
        originalFolderName: folderName,
        name: realName.replace(/_/g, " "),
        character,
        isEnabled,
        iniCount,
        path: folderPath,
        gamebananaId,
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
// ─── GameBanana API Helpers ───────────────────────────────────────────────

const GB_API = "https://gamebanana.com/apiv10";
const GB_FIELDS = "name,_aPreviewMedia,_aFiles,_tsDateUpdated,_nLikeCount,_nViewCount,_aSubmitter,_aGame";

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
    const data = await fetchFromGB(`${GB_API}/Mod/${gamebananaId}?_csvFields=${encodeURIComponent(GB_FIELDS)}`);
    // Construct thumbnail URL from preview media
    let thumbnailUrl = null;
    const images = data._aPreviewMedia?._aImages;
    if (images && images.length > 0) {
      const img = images[0];
      thumbnailUrl = img._sFile530
        ? `${img._sBaseUrl}/${img._sFile530}`
        : img._sFile
        ? `${img._sBaseUrl}/${img._sFile}`
        : null;
    }
    return { success: true, data: { ...data, thumbnailUrl } };
  } catch (err) {
    console.error("Failed to fetch GB mod:", err);
    return { success: false, error: err.message };
  }
});

// Fetch a page of mods from GameBanana for a given game
ipcMain.handle("browse-gb-mods", async (event, { gbGameId, page = 1, perPage = 20, sort = "new", search = "" }) => {
  try {
    const searchParam = search ? `&_sName=${encodeURIComponent(search)}` : "";
    const browseFields = "name,_aPreviewMedia,_aSubmitter,_nLikeCount,_nDownloadCount,_nViewCount,_tsDateUpdated,_sProfileUrl";
    
    // Map our sort options to GB's undocumented valid sort aliases, or omit for 'Latest' (default)
    let sortStr = "";
    if (sort === "popular") sortStr = "&_sSort=Generic_MostDownloaded";
    else if (sort === "best_rating") sortStr = "&_sSort=Generic_MostLiked";
    else if (sort === "downloads") sortStr = "&_sSort=Generic_MostDownloaded";
    
    const url = `${GB_API}/Mod/Index?_aFilters[Generic_Game]=${gbGameId}&_nPage=${page}&_nPerpage=${perPage}${searchParam}${sortStr}&_csvFields=${encodeURIComponent(browseFields)}`;
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
ipcMain.handle("install-gb-mod", async (event, { importerPath, characterName, gbModId, fileUrl, fileName }) => {
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
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(tmpPath, buffer);

    // Extract the zip
    const extractedFolders = [];
    await fs
      .createReadStream(tmpPath)
      .pipe(unzipper.Parse())
      .on("entry", (entry) => {
        const entryPath = entry.path;
        const type = entry.type;
        // Get top-level folder name
        const topLevel = entryPath.split("/")[0];
        if (!extractedFolders.includes(topLevel)) extractedFolders.push(topLevel);

        const dest = path.join(modsPath, entryPath);
        if (type === "Directory") {
          fs.mkdirSync(dest, { recursive: true });
          entry.autodrain();
        } else {
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          entry.pipe(fs.createWriteStream(dest));
        }
      })
      .promise();

    // Rename each top-level folder with the character prefix
    const renamedFolders = [];
    for (const folderName of extractedFolders) {
      const srcPath = path.join(modsPath, folderName);
      if (!fs.existsSync(srcPath)) continue;

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
