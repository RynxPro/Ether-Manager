import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { getMods } from "./mods.js";

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "aether-mods-test-"));
}

function removeTempDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

test("getMods backfills gameId for attributable legacy mods", () => {
  const tempDir = createTempDir();
  try {
    const importerRoot = path.join(tempDir, "Importer");
    const modsDir = path.join(importerRoot, "Mods");
    const modDir = path.join(modsDir, "Alice_MyMod");
    fs.mkdirSync(modDir, { recursive: true });
    fs.writeFileSync(
      path.join(modDir, "aether.json"),
      JSON.stringify({ gamebananaId: 123 }, null, 2),
    );

    const mods = getMods(importerRoot, ["Alice"], "GIMI", {
      sharedImporterAcrossGames: true,
    });

    assert.equal(mods.length, 1);
    assert.equal(mods[0].gameId, "GIMI");

    const migrated = JSON.parse(
      fs.readFileSync(path.join(modDir, "aether.json"), "utf-8"),
    );
    assert.equal(migrated.gameId, "GIMI");
  } finally {
    removeTempDir(tempDir);
  }
});

test("getMods skips ambiguous legacy folders when importer path is shared", () => {
  const tempDir = createTempDir();
  try {
    const importerRoot = path.join(tempDir, "Importer");
    const modsDir = path.join(importerRoot, "Mods");
    fs.mkdirSync(path.join(modsDir, "RandomFolder"), { recursive: true });

    const mods = getMods(importerRoot, ["Alice"], "GIMI", {
      sharedImporterAcrossGames: true,
    });

    assert.deepEqual(mods, []);
  } finally {
    removeTempDir(tempDir);
  }
});
