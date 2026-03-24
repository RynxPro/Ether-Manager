/**
 * Mod Conflict Detection Utility
 * Analyzes mods for potential file conflicts and overlaps
 */

import fs from 'fs';
import path from 'path';

/**
 * Extract all file paths from a mod folder
 * @param {string} modFolderPath - Path to the mod folder
 * @returns {Array} Array of relative file paths
 */
export function getModFilesList(modFolderPath) {
  const files = [];

  function walkDir(dir, baseDir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      entries.forEach((entry) => {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(baseDir, fullPath);

        if (entry.isDirectory()) {
          walkDir(fullPath, baseDir);
        } else {
          files.push(relativePath);
        }
      });
    } catch (err) {
      console.error(`Error reading directory ${dir}:`, err);
    }
  }

  walkDir(modFolderPath, modFolderPath);
  return files;
}

/**
 * Detect conflicts between mods
 * @param {Array} enabledMods - Array of enabled mods with path
 * @returns {Object} Conflict map with mod pairs and shared files
 */
export function detectModConflicts(enabledMods) {
  const conflicts = {};

  // Build a map of files to mods
  const fileToMods = new Map();

  enabledMods.forEach((mod, index) => {
    try {
      const files = getModFilesList(mod.path);

      files.forEach((file) => {
        const normalizedFile = file.toLowerCase();
        if (!fileToMods.has(normalizedFile)) {
          fileToMods.set(normalizedFile, []);
        }
        fileToMods.get(normalizedFile).push(index);
      });
    } catch (err) {
      console.error(`Error analyzing mod ${mod.name}:`, err);
    }
  });

  // Find conflicts (files that appear in multiple mods)
  fileToMods.forEach((modIndices, file) => {
    if (modIndices.length > 1) {
      const modNames = modIndices.map((i) => enabledMods[i].name);
      const conflictKey = modNames.sort().join(' | ');

      if (!conflicts[conflictKey]) {
        conflicts[conflictKey] = [];
      }
      conflicts[conflictKey].push(file);
    }
  });

  return conflicts;
}

/**
 * Get detailed conflict info for display
 * @param {Object} conflicts - Conflict map from detectModConflicts
 * @returns {Array} Array of conflict objects with metadata
 */
export function getConflictDetails(conflicts) {
  return Object.entries(conflicts).map(([modPair, files]) => ({
    mods: modPair.split(' | '),
    conflictCount: files.length,
    conflictingFiles: files,
    severity: files.length > 5 ? 'high' : files.length > 1 ? 'medium' : 'low',
  }));
}

/**
 * Check if specific file types are conflicting (common patterns)
 * @param {Array} conflictingFiles - Array of conflicting file paths
 * @returns {Object} Categorized conflicts by file type
 */
export function categorizeConflicts(conflictingFiles) {
  const categories = {
    ini: [],
    textures: [],
    models: [],
    scripts: [],
    audio: [],
    other: [],
  };

  conflictingFiles.forEach((file) => {
    const ext = path.extname(file).toLowerCase();

    if (ext === '.ini') {
      categories.ini.push(file);
    } else if (['.dds', '.png', '.jpg', '.bmp'].includes(ext)) {
      categories.textures.push(file);
    } else if (['.fbx', '.xsml', '.xml'].includes(ext)) {
      categories.models.push(file);
    } else if (['.lua', '.py', '.txt'].includes(ext)) {
      categories.scripts.push(file);
    } else if (['.wav', '.mp3', '.ogg'].includes(ext)) {
      categories.audio.push(file);
    } else {
      categories.other.push(file);
    }
  });

  // Remove empty categories
  Object.keys(categories).forEach((key) => {
    if (categories[key].length === 0) {
      delete categories[key];
    }
  });

  return categories;
}
