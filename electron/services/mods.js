import fs from "fs";
import path from "path";
import Seven from "node-7z";
import sevenBin from "7zip-bin";
import {
  resolveModFolderPath,
  resolveValidatedModsPath,
} from "./config.js";
import {
  assertBoolean,
  assertInteger,
  assertOptionalString,
  assertPlainObject,
  assertString,
  assertStringArray,
} from "./validation.js";
import { createLogger } from "./logger.js";

const logger = createLogger("mods");

export function getMods(
  importerPath,
  knownCharacters = [],
  expectedGameId = null,
  options = {},
) {
  logger.debug("Scanning mods path", { importerPath, expectedGameId });
  assertStringArray(knownCharacters, "knownCharacters");
  assertOptionalString(expectedGameId, "expectedGameId");
  assertPlainObject(options, "options");
  if (!importerPath) return [];

  let modsPath = resolveValidatedModsPath(importerPath);
  if (
    !modsPath.toLowerCase().endsWith("mods") &&
    fs.existsSync(path.join(modsPath, "Mods"))
  ) {
    modsPath = path.join(modsPath, "Mods");
  }

  logger.debug("Resolved mods directory path", modsPath);

  if (!fs.existsSync(modsPath)) {
    logger.info("Mods directory does not exist", modsPath);
    return [];
  }

  try {
    const modFolders = fs
      .readdirSync(modsPath, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    logger.debug(`Found ${modFolders.length} folders in Mods directory`);

    const mods = [];
    const sharedImporterAcrossGames = Boolean(options?.sharedImporterAcrossGames);

    modFolders.forEach((folderName) => {
      const folderPath = path.join(modsPath, folderName);
      const isEnabled = !folderName.startsWith("DISABLED_");
      const realName = isEnabled
        ? folderName
        : folderName.replace(/^DISABLED_/, "");

      let character = "Unassigned";
      let hasKnownCharacterMatch = false;

      if (knownCharacters && knownCharacters.length > 0) {
        const normalizedFolder = realName.toLowerCase().replace(/[\s_-]/g, "");

        let bestMatch = null;
        let bestMatchLength = 0;

        for (const knownChar of knownCharacters) {
          const normalizedKnown = knownChar.toLowerCase().replace(/[\s_-]/g, "");
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

      let iniCount = 0;
      try {
        const files = fs.readdirSync(folderPath);
        iniCount = files.filter((file) => file.toLowerCase().endsWith(".ini")).length;
      } catch {
        // Leave zero when the folder cannot be inspected.
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
        // Ignore invalid aether.json files during scan.
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
            logger.warn(
              `Failed to backfill gameId for legacy mod "${folderName}"`,
              migrationErr.message,
            );
          }
        }

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
  } catch (error) {
    logger.error("Failed to read mods", error);
    return [];
  }
}

export function toggleMod({ importerPath, originalFolderName, enable }) {
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
}

export function importMod({ importerPath, sourcePath, characterName, gameId }) {
  assertOptionalString(characterName, "characterName", { allowEmpty: true });
  assertOptionalString(gameId, "gameId");

  const sourceFolderName = path.basename(sourcePath);
  const modsPath = resolveValidatedModsPath(importerPath);

  if (!fs.existsSync(modsPath)) {
    return {
      success: false,
      error: "Mods directory not found in the selected importer path.",
    };
  }

  let targetFolderName = sourceFolderName;
  if (characterName && characterName !== "Unassigned") {
    const cleanCharName = characterName.replace(/\s+/g, "");
    if (!sourceFolderName.toLowerCase().startsWith(cleanCharName.toLowerCase())) {
      targetFolderName = `${cleanCharName}_${sourceFolderName}`;
    }
  }

  const targetPath = path.join(modsPath, targetFolderName);
  if (fs.existsSync(targetPath)) {
    return {
      success: false,
      error: `A mod folder named "${targetFolderName}" already exists.`,
    };
  }

  fs.cpSync(sourcePath, targetPath, { recursive: true });
  fs.writeFileSync(
    path.join(targetPath, "aether.json"),
    JSON.stringify(
      {
        installedAt: new Date().toISOString(),
        gameId: gameId || null,
      },
      null,
      2,
    ),
  );

  return { success: true, newFolderName: targetFolderName };
}

export function assignMod({ importerPath, originalFolderName, newCharacterName }) {
  const modsPath = resolveValidatedModsPath(importerPath);
  assertString(newCharacterName, "newCharacterName");
  const { folderName: safeOriginalFolderName, folderPath: oldPath } =
    resolveModFolderPath(modsPath, originalFolderName, "originalFolderName");

  if (!fs.existsSync(oldPath)) {
    return { success: false, error: "Original mod folder not found." };
  }

  const isDisabled = safeOriginalFolderName.startsWith("DISABLED_");
  const realName = isDisabled
    ? safeOriginalFolderName.replace(/^DISABLED_/, "")
    : safeOriginalFolderName;
  const cleanCharName = newCharacterName.replace(/\s+/g, "");
  const newRealName = `${cleanCharName}_${realName}`;
  const newFolderName = isDisabled ? `DISABLED_${newRealName}` : newRealName;
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
}

export function setCustomThumbnail({
  importerPath,
  originalFolderName,
  thumbnailUrl,
}) {
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
    } catch (error) {
      logger.warn("Error reading aether.json", error);
    }
  }

  if (thumbnailUrl === null) {
    delete aetherData.customThumbnail;
  } else {
    aetherData.customThumbnail = thumbnailUrl;
  }

  fs.writeFileSync(aetherJsonPath, JSON.stringify(aetherData, null, 2));
  return { success: true };
}

export async function deleteMod(
  { importerPath, originalFolderName },
  { trashItem },
) {
  const modsPath = resolveValidatedModsPath(importerPath);
  const { folderPath } = resolveModFolderPath(
    modsPath,
    originalFolderName,
    "originalFolderName",
  );
  if (!fs.existsSync(folderPath)) {
    throw new Error(`Folder "${originalFolderName}" not found`);
  }

  await trashItem(folderPath);
  return { success: true };
}

export async function installGbMod(
  args,
  { tempDir, isSafeExternalUrl, onDownloadProgress, trashItem },
) {
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

  const normalizedGbModId = Number(gbModId);
  const tmpPath = path.join(tempDir, `aether_${Date.now()}_${fileName}`);
  let extractSandboxPath = null;
  const installedFolderPaths = [];

  try {
    const modsPath = importerPath;
    if (!fs.existsSync(modsPath)) {
      return { success: false, error: "Mods directory not found." };
    }

    const cleanCharName =
      characterName && characterName !== "Unassigned"
        ? characterName.replace(/\s+/g, "")
        : null;

    const modFolders = fs
      .readdirSync(modsPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const folder of modFolders) {
      const ajsonPath = path.join(modsPath, folder, "aether.json");
      if (!fs.existsSync(ajsonPath)) continue;

      try {
        const data = JSON.parse(fs.readFileSync(ajsonPath, "utf-8"));
        if (
          data.gamebananaId === normalizedGbModId &&
          data.installedFile === fileName
        ) {
          logger.info(`Moving old mod version to recycle bin: ${folder}`);
          try {
            await trashItem(path.join(modsPath, folder));
          } catch (trashErr) {
            logger.warn(
              `trashItem failed for ${folder}, falling back to rmSync`,
              trashErr.message,
            );
            fs.rmSync(path.join(modsPath, folder), {
              recursive: true,
              force: true,
            });
          }
        }
      } catch (error) {
        logger.warn(`Failed to read aether.json in ${folder} during cleanup`, error);
      }
    }

    const res = await fetch(fileUrl, {
      headers: { "User-Agent": "AetherManager/1.0.0" },
    });
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);

    const contentLength = res.headers.get("content-length");
    const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
    let downloadedBytes = 0;
    const chunks = [];
    const reader = res.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      downloadedBytes += value.length;
      if (totalBytes > 0) {
        const percent = Math.round((downloadedBytes / totalBytes) * 100);
        onDownloadProgress({
          gbModId: normalizedGbModId,
          percent,
          downloadedBytes,
          totalBytes,
        });
      }
    }

    fs.writeFileSync(tmpPath, Buffer.concat(chunks));

    const extractSandboxName = `.aether_tmp_extract_${Date.now()}`;
    extractSandboxPath = path.join(modsPath, extractSandboxName);
    fs.mkdirSync(extractSandboxPath, { recursive: true });

    await new Promise((resolve, reject) => {
      const stream = Seven.extractFull(tmpPath, extractSandboxPath, {
        $bin: sevenBin.path7za,
      });
      stream.on("end", () => resolve());
      stream.on("error", (error) => reject(error));
    });

    const sandboxContents = fs.readdirSync(extractSandboxPath, {
      withFileTypes: true,
    });
    const hasLooseFiles = sandboxContents.some((entry) => !entry.isDirectory());
    const directoryCount = sandboxContents.filter((entry) =>
      entry.isDirectory(),
    ).length;

    const extractedRootFolders = [];
    if (directoryCount === 1 && !hasLooseFiles) {
      const rootFolder = sandboxContents.find((entry) => entry.isDirectory()).name;
      extractedRootFolders.push(path.join(extractSandboxPath, rootFolder));
    } else {
      extractedRootFolders.push(extractSandboxPath);
    }

    const installationTargets = [];
    for (const srcPath of extractedRootFolders) {
      if (!fs.existsSync(srcPath)) continue;

      const rawFolderName =
        srcPath === extractSandboxPath
          ? fileName.replace(/\.[^/.]+$/, "")
          : path.basename(srcPath);

      let targetName = rawFolderName.replace(/[^a-zA-Z0-9_\-\s]/g, "");
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

    const renamedFolders = [];
    for (const { srcPath, targetName, finalTargetPath } of installationTargets) {
      fs.renameSync(srcPath, finalTargetPath);
      installedFolderPaths.push(finalTargetPath);
      fs.writeFileSync(
        path.join(finalTargetPath, "aether.json"),
        JSON.stringify(
          {
            gamebananaId: normalizedGbModId,
            installedAt: new Date().toISOString(),
            installedFile: fileName,
            character: characterName || null,
            category: category || null,
            gameId: gameId || null,
          },
          null,
          2,
        ),
      );
      renamedFolders.push(targetName);
    }

    if (fs.existsSync(extractSandboxPath)) {
      fs.rmSync(extractSandboxPath, { recursive: true, force: true });
    }
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }

    return { success: true, installedFolders: renamedFolders };
  } catch (error) {
    logger.error("Failed to install GB mod", error);
    for (const folderPath of installedFolderPaths) {
      if (fs.existsSync(folderPath)) {
        fs.rmSync(folderPath, { recursive: true, force: true });
      }
    }
    if (extractSandboxPath && fs.existsSync(extractSandboxPath)) {
      fs.rmSync(extractSandboxPath, { recursive: true, force: true });
    }
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
    return { success: false, error: error.message };
  }
}
