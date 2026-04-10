// Update check timestamp helpers
export function getUpdateCheckTimestamp(gameId) {
  const config = readConfigFile();
  return config.updateCheckTimestamps?.[gameId] || 0;
}

export function setUpdateCheckTimestamp(gameId, timestamp) {
  const config = readConfigFile();
  if (!config.updateCheckTimestamps) config.updateCheckTimestamps = {};
  config.updateCheckTimestamps[gameId] = timestamp;
  writeConfigFile(config);
}
import fs from "fs";
import path from "path";
import {
  assertFolderName,
  assertPathValue,
  isSubPath,
} from "./validation.js";

export const CONFIGURED_GAME_IDS = new Set([
  "GIMI",
  "WWMI",
  "ZZMI",
  "SRMI",
  "HIMI",
]);

let configPathProvider = null;

export function setConfigPathProvider(provider) {
  configPathProvider = provider;
}

export function getConfigPath() {
  if (!configPathProvider) {
    throw new Error("Config path provider has not been initialized.");
  }
  return configPathProvider();
}

export function readConfigFile() {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

export function writeConfigFile(config) {
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
}

export function resolveModsPath(importerPath) {
  let modsPath = importerPath;
  if (
    !modsPath.toLowerCase().endsWith("mods") &&
    fs.existsSync(path.join(modsPath, "Mods"))
  ) {
    modsPath = path.join(modsPath, "Mods");
  }
  return modsPath;
}

export function resolveValidatedModsPath(importerPath) {
  return resolveModsPath(assertPathValue(importerPath, "importerPath"));
}

export function getConfiguredModsRoots() {
  try {
    const config = readConfigFile();
    return Object.entries(config)
      .filter(
        ([key, value]) =>
          CONFIGURED_GAME_IDS.has(key) &&
          typeof value === "string" &&
          value.trim(),
      )
      .map(([, value]) => path.resolve(resolveModsPath(value)))
      .filter((modsPath) => fs.existsSync(modsPath));
  } catch {
    return [];
  }
}

export function assertAllowedOpenFolder(targetPath) {
  const resolvedPath = path.resolve(assertPathValue(targetPath, "folderPath"));
  const allowedRoots = getConfiguredModsRoots();
  if (!allowedRoots.some((root) => isSubPath(root, resolvedPath))) {
    throw new Error("Blocked folder path outside configured Mods directories.");
  }
  return resolvedPath;
}

export function resolveModFolderPath(modsPath, folderName, name = "folderName") {
  const safeFolderName = assertFolderName(folderName, name);
  const resolvedPath = path.resolve(modsPath, safeFolderName);
  if (!isSubPath(modsPath, resolvedPath)) {
    throw new Error(`Invalid ${name}.`);
  }
  return { folderName: safeFolderName, folderPath: resolvedPath };
}
