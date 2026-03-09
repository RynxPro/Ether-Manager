import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

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
ipcMain.handle("get-mods", (event, importerPath) => {
  if (!importerPath) return [];

  const modsPath = path.join(importerPath, "Mods");
  if (!fs.existsSync(modsPath)) return [];

  try {
    const modFolders = fs
      .readdirSync(modsPath, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    const mods = [];

    modFolders.forEach((folderName) => {
      const folderPath = path.join(modsPath, folderName);
      const isEnabled = !folderName.startsWith("DISABLED_");
      const realName = isEnabled
        ? folderName
        : folderName.replace(/^DISABLED_/, "");

      // Auto-detect character from prefix (e.g., HuTao_Dress -> HuTao)
      let character = "Uncategorized";
      if (realName.includes("_") || realName.includes("-")) {
        const parts = realName.split(/[-_]/);
        character = parts[0];
      } else {
        // Fallback or simple names
        character = realName; // In a real app we might have a better mapping
      }

      // Count ini files
      let iniCount = 0;
      try {
        const files = fs.readdirSync(folderPath);
        iniCount = files.filter((file) =>
          file.toLowerCase().endsWith(".ini"),
        ).length;
      } catch (err) {}

      mods.push({
        id: realName,
        originalFolderName: folderName,
        name: realName.replace(/_/g, " "),
        character,
        isEnabled,
        iniCount,
        path: folderPath,
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
      const modsPath = path.join(importerPath, "Mods");
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
