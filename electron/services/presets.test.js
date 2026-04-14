import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import {
  deletePreset,
  executePresetDiff,
  getPresets,
  importPresetFromFile,
  savePreset,
} from "./presets.js";
import { setConfigPathProvider } from "./config.js";

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "aether-presets-test-"));
}

function removeTempDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function createPresetFixture(tempDir) {
  const importerRoot = path.join(tempDir, "Importer");
  const modsDir = path.join(importerRoot, "Mods");
  fs.mkdirSync(modsDir, { recursive: true });
  setConfigPathProvider(() => path.join(tempDir, "config.json"));
  return { importerRoot, modsDir };
}

test("savePreset/getPresets/deletePreset round-trips through config storage", () => {
  const tempDir = createTempDir();
  try {
    createPresetFixture(tempDir);

    const preset = {
      id: "preset-1",
      name: "Test Preset",
      gameId: "GIMI",
      mods: [
        {
          modId: "ModA",
          originalFolderName: "ModA",
          character: "Unassigned",
          category: null,
          name: "Mod A",
          gamebananaId: null,
          customThumbnail: null,
        },
      ],
    };

    assert.deepEqual(savePreset(preset), { success: true });
    assert.deepEqual(getPresets("GIMI"), [
      {
        ...preset,
        description: "",
        createdAt: null,
        updatedAt: null,
      },
    ]);
    assert.deepEqual(deletePreset("GIMI", "preset-1"), { success: true });
    assert.deepEqual(getPresets("GIMI"), []);
  } finally {
    removeTempDir(tempDir);
  }
});

test("importPresetFromFile normalizes legacy preset mod entries", () => {
  const tempDir = createTempDir();
  try {
    createPresetFixture(tempDir);
    const presetPath = path.join(tempDir, "legacy.aether-preset");
    fs.writeFileSync(
      presetPath,
      JSON.stringify({
        id: "legacy-1",
        name: "Legacy Preset",
        gameId: "GIMI",
        mods: [{ folderName: "LegacyMod" }],
      }),
    );

    const imported = importPresetFromFile(presetPath);

    assert.equal(imported.mods[0].modId, "LegacyMod");
    assert.equal(imported.mods[0].originalFolderName, "LegacyMod");
    assert.equal(imported.mods[0].character, "Unassigned");
    assert.equal(imported.mods[0].name, "LegacyMod");
  } finally {
    removeTempDir(tempDir);
  }
});

test("importPresetFromFile rejects malformed preset payloads", () => {
  const tempDir = createTempDir();
  try {
    createPresetFixture(tempDir);
    const presetPath = path.join(tempDir, "invalid.aether-preset");
    fs.writeFileSync(
      presetPath,
      JSON.stringify({
        id: "broken-1",
        name: "Broken Preset",
        gameId: "GIMI",
        mods: [{ enabled: true }],
      }),
    );

    assert.throws(
      () => importPresetFromFile(presetPath),
      /modId or originalFolderName/i,
    );
  } finally {
    removeTempDir(tempDir);
  }
});

test("executePresetDiff renames enable/disable targets atomically", () => {
  const tempDir = createTempDir();
  try {
    const { importerRoot, modsDir } = createPresetFixture(tempDir);
    fs.mkdirSync(path.join(modsDir, "DISABLED_ModA"));
    fs.mkdirSync(path.join(modsDir, "ModB"));

    const result = executePresetDiff({
      importerPath: importerRoot,
      enableList: ["ModA"],
      disableList: ["ModB"],
    });

    assert.deepEqual(result, { success: true, applied: 2 });
    assert.equal(fs.existsSync(path.join(modsDir, "ModA")), true);
    assert.equal(fs.existsSync(path.join(modsDir, "DISABLED_ModB")), true);
    assert.equal(fs.existsSync(path.join(modsDir, "DISABLED_ModA")), false);
    assert.equal(fs.existsSync(path.join(modsDir, "ModB")), false);
  } finally {
    removeTempDir(tempDir);
  }
});

test("executePresetDiff keeps disk state unchanged when preflight fails", () => {
  const tempDir = createTempDir();
  try {
    const { importerRoot, modsDir } = createPresetFixture(tempDir);
    fs.mkdirSync(path.join(modsDir, "DISABLED_ModA"));
    fs.mkdirSync(path.join(modsDir, "ModA"));

    const result = executePresetDiff({
      importerPath: importerRoot,
      enableList: ["ModA"],
      disableList: [],
    });

    assert.equal(result.success, false);
    assert.match(result.error, /already exists/i);
    assert.equal(fs.existsSync(path.join(modsDir, "DISABLED_ModA")), true);
    assert.equal(fs.existsSync(path.join(modsDir, "ModA")), true);
  } finally {
    removeTempDir(tempDir);
  }
});
