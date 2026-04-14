import fs from "fs";
import path from "path";
import {
  readConfigFile,
  resolveValidatedModsPath,
  writeConfigFile,
} from "./config.js";
import {
  assertInteger,
  assertFolderName,
  assertOptionalString,
  assertPlainObject,
  assertString,
  assertStringArray,
} from "./validation.js";
import { createLogger } from "./logger.js";

const logger = createLogger("presets");

function normalizePresetMod(mod, index) {
  const validMod = assertPlainObject(mod, `preset.mods[${index}]`);

  const rawModId = validMod.modId ?? null;
  const rawFolderName = validMod.originalFolderName ?? validMod.folderName ?? null;

  const modId =
    rawModId == null
      ? null
      : assertString(String(rawModId), `preset.mods[${index}].modId`, {
          maxLength: 255,
        });

  const originalFolderName =
    rawFolderName == null
      ? null
      : assertFolderName(
          String(rawFolderName),
          `preset.mods[${index}].originalFolderName`,
        );

  if (!modId && !originalFolderName) {
    throw new Error(
      `Invalid preset.mods[${index}]. Expected modId or originalFolderName.`,
    );
  }

  return {
    modId: modId || originalFolderName,
    originalFolderName: originalFolderName || modId,
    character:
      assertOptionalString(validMod.character, `preset.mods[${index}].character`, {
        allowEmpty: true,
        maxLength: 120,
      }) || "Unassigned",
    category: assertOptionalString(validMod.category, `preset.mods[${index}].category`, {
      allowEmpty: true,
      maxLength: 120,
    }),
    name:
      assertOptionalString(validMod.name, `preset.mods[${index}].name`, {
        allowEmpty: true,
        maxLength: 255,
      }) ||
      originalFolderName ||
      modId,
    gamebananaId:
      validMod.gamebananaId == null
        ? null
        : assertInteger(validMod.gamebananaId, `preset.mods[${index}].gamebananaId`, {
            min: 1,
          }),
    customThumbnail: assertOptionalString(
      validMod.customThumbnail,
      `preset.mods[${index}].customThumbnail`,
      {
        allowEmpty: true,
        maxLength: 8192,
      },
    ),
  };
}

function normalizePreset(preset) {
  const validPreset = assertPlainObject(preset, "preset");

  const id = assertString(validPreset.id, "preset.id", { maxLength: 128 });
  const gameId = assertString(validPreset.gameId, "preset.gameId", {
    maxLength: 32,
  });

  if (!Array.isArray(validPreset.mods)) {
    throw new Error("Invalid preset.mods. Expected an array.");
  }

  return {
    ...validPreset,
    id,
    name: assertString(validPreset.name, "preset.name", { maxLength: 120 }),
    description:
      assertOptionalString(validPreset.description, "preset.description", {
        allowEmpty: true,
        maxLength: 2000,
      }) || "",
    gameId,
    createdAt: assertOptionalString(validPreset.createdAt, "preset.createdAt", {
      allowEmpty: true,
      maxLength: 64,
    }),
    updatedAt: assertOptionalString(validPreset.updatedAt, "preset.updatedAt", {
      allowEmpty: true,
      maxLength: 64,
    }),
    mods: validPreset.mods.map(normalizePresetMod),
  };
}

export function getPresets(gameId) {
  const validGameId = assertString(gameId, "gameId", { maxLength: 32 });
  const config = readConfigFile();
  return (config.presets || {})[validGameId] || [];
}

export function savePreset(preset) {
  const normalizedPreset = normalizePreset(preset);
  const { gameId } = normalizedPreset;

  const config = readConfigFile();
  if (!config.presets) config.presets = {};
  if (!config.presets[gameId]) config.presets[gameId] = [];

  const index = config.presets[gameId].findIndex(
    (item) => item.id === normalizedPreset.id,
  );
  if (index >= 0) {
    config.presets[gameId][index] = normalizedPreset;
  } else {
    config.presets[gameId].unshift(normalizedPreset);
  }

  writeConfigFile(config);
  return { success: true };
}

export function deletePreset(gameId, presetId) {
  const validGameId = assertString(gameId, "gameId", { maxLength: 32 });
  const validPresetId = assertString(presetId, "presetId", { maxLength: 128 });
  const config = readConfigFile();

  if (config.presets && config.presets[validGameId]) {
    config.presets[validGameId] = config.presets[validGameId].filter(
      (preset) => preset.id !== validPresetId,
    );
  }

  writeConfigFile(config);
  return { success: true };
}

export function executePresetDiff({ importerPath, enableList, disableList }) {
  const modsPath = resolveValidatedModsPath(importerPath);
  if (!fs.existsSync(modsPath)) {
    return { success: false, error: "Mods directory not found." };
  }

  const toEnable = enableList
    ? assertStringArray(enableList, "enableList")
    : [];
  const toDisable = disableList
    ? assertStringArray(disableList, "disableList")
    : [];

  const renameActions = [
    ...toEnable.map((folderName) => {
      const fromName = folderName.startsWith("DISABLED_")
        ? folderName
        : `DISABLED_${folderName}`;
      return { fromName, toName: fromName.replace(/^DISABLED_/, "") };
    }),
    ...toDisable.map((folderName) => {
      const fromName = folderName.replace(/^DISABLED_/, "");
      return { fromName, toName: `DISABLED_${fromName}` };
    }),
  ];

  if (renameActions.length === 0) {
    return { success: true, applied: 0 };
  }

  const missingMods = renameActions
    .map((action) => action.fromName)
    .filter((folderName) => !fs.existsSync(path.join(modsPath, folderName)));
  if (missingMods.length > 0) {
    return {
      success: false,
      error: `Preset apply aborted: the following mod folders are missing on disk: ${missingMods.join(", ")}. Refresh your library and try again.`,
    };
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
    if (fs.existsSync(toPath) && !sourceNames.has(action.toName)) {
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
    tempPath: path.join(modsPath, `${txId}_${index}_${action.fromName}`),
    state: "pending",
  }));

  try {
    for (const action of stagedActions) {
      fs.renameSync(action.fromPath, action.tempPath);
      action.state = "staged";
    }

    for (const action of stagedActions) {
      fs.renameSync(action.tempPath, action.toPath);
      action.state = "finalized";
    }
  } catch (error) {
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
      } catch (rollbackError) {
        logger.error(
          `Failed to roll back preset action ${action.toName} -> ${action.fromName}`,
          rollbackError,
        );
        return {
          success: false,
          error: `Preset apply failed and rollback was incomplete. Check the Mods folder before retrying. Original error: ${error.message}`,
        };
      }
    }

    return {
      success: false,
      error: `Preset apply failed before completion. No changes were kept. ${error.message}`,
    };
  }

  return { success: true, applied: stagedActions.length };
}

export function exportPresetToFile(filePath, preset) {
  fs.writeFileSync(filePath, JSON.stringify(preset, null, 2));
  return { success: true };
}

export function importPresetFromFile(filePath) {
  return normalizePreset(JSON.parse(fs.readFileSync(filePath, "utf-8")));
}
