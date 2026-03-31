import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import {
  deletePreset,
  executePresetDiff,
  getPresets,
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
      mods: [{ folderName: "ModA", enabled: true }],
    };

    assert.deepEqual(savePreset(preset), { success: true });
    assert.deepEqual(getPresets("GIMI"), [preset]);
    assert.deepEqual(deletePreset("GIMI", "preset-1"), { success: true });
    assert.deepEqual(getPresets("GIMI"), []);
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
