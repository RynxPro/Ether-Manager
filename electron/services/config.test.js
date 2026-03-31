import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import {
  getConfigPath,
  readConfigFile,
  resolveModsPath,
  setConfigPathProvider,
  writeConfigFile,
} from "./config.js";

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "aether-config-test-"));
}

function removeTempDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

test("resolveModsPath prefers Mods subfolder when importer root is selected", () => {
  const tempDir = createTempDir();
  try {
    const importerRoot = path.join(tempDir, "Importer");
    const modsDir = path.join(importerRoot, "Mods");
    fs.mkdirSync(modsDir, { recursive: true });

    assert.equal(resolveModsPath(importerRoot), modsDir);
    assert.equal(resolveModsPath(modsDir), modsDir);
  } finally {
    removeTempDir(tempDir);
  }
});

test("config file helpers use the injected config path provider", () => {
  const tempDir = createTempDir();
  try {
    const configPath = path.join(tempDir, "config.json");
    setConfigPathProvider(() => configPath);

    assert.equal(getConfigPath(), configPath);
    assert.deepEqual(readConfigFile(), {});

    writeConfigFile({ bookmarks: { GIMI: [123] } });
    assert.deepEqual(readConfigFile(), {
      bookmarks: { GIMI: [123] },
    });
  } finally {
    removeTempDir(tempDir);
  }
});
