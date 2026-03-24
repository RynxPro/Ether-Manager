import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

const PORTRAIT_DIRECTORIES = [
  {
    gameId: "ZZMI",
    label: "Zenless Zone Zero",
    status: "curated",
    dir: "src/assets/character-portraits",
  },
  {
    gameId: "WWMI",
    label: "Wuthering Waves",
    status: "curated",
    dir: "src/assets/ww-characters",
  },
  {
    gameId: "GIMI",
    label: "Genshin Impact",
    status: "curated",
    dir: "src/assets/Genshin Splash Art",
  },
];

const SOFT_LIMITS_KB = {
  curatedAverage: 350,
  curatedLargest: 1500,
  totalDirectoryMb: 40,
};

function readImageFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((file) => /\.(png|jpe?g|webp)$/i.test(file))
    .map((file) => {
      const absolutePath = path.join(dir, file);
      const sizeBytes = fs.statSync(absolutePath).size;
      return {
        file,
        sizeBytes,
      };
    });
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} kB`;
}

function formatMb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const report = PORTRAIT_DIRECTORIES.map((entry) => {
  const absoluteDir = path.join(projectRoot, entry.dir);
  const files = readImageFiles(absoluteDir);
  const totalBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);
  const averageBytes = files.length > 0 ? totalBytes / files.length : 0;
  const largestFiles = [...files]
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .slice(0, 5);

  const warnings = [];
  if (averageBytes / 1024 > SOFT_LIMITS_KB.curatedAverage) {
    warnings.push(
      `average portrait size exceeds ${SOFT_LIMITS_KB.curatedAverage} kB`,
    );
  }
  if (largestFiles[0] && largestFiles[0].sizeBytes / 1024 > SOFT_LIMITS_KB.curatedLargest) {
    warnings.push(
      `largest portrait exceeds ${SOFT_LIMITS_KB.curatedLargest} kB`,
    );
  }
  if (totalBytes / 1024 / 1024 > SOFT_LIMITS_KB.totalDirectoryMb) {
    warnings.push(
      `directory size exceeds ${SOFT_LIMITS_KB.totalDirectoryMb} MB`,
    );
  }

  return {
    ...entry,
    files,
    totalBytes,
    averageBytes,
    largestFiles,
    warnings,
  };
});

console.log("Portrait Asset Audit\n");

for (const entry of report) {
  console.log(`${entry.gameId} · ${entry.label}`);
  console.log(`  Status: ${entry.status}`);
  console.log(`  Files: ${entry.files.length}`);
  console.log(`  Total: ${formatMb(entry.totalBytes)}`);
  console.log(`  Average: ${formatKb(entry.averageBytes)}`);
  if (entry.largestFiles.length > 0) {
    console.log("  Largest:");
    for (const file of entry.largestFiles) {
      console.log(`    - ${file.file} (${formatMb(file.sizeBytes)})`);
    }
  }
  if (entry.warnings.length > 0) {
    console.log("  Warnings:");
    for (const warning of entry.warnings) {
      console.log(`    - ${warning}`);
    }
  }
  console.log("");
}

const totalWarnings = report.reduce((sum, entry) => sum + entry.warnings.length, 0);
if (totalWarnings > 0) {
  process.exitCode = 1;
}
