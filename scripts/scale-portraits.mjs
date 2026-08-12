// Pre-scales the roster portraits to roughly the size they are displayed at.
//
// The Library grid renders a portrait about 186px wide. Shipping 1000px+ sources made the
// browser reduce them more than 5x in one step, which aliases hair and fine linework into
// something that reads as pixelation. 480px covers both the grid and the 460px character-page
// fallback while leaving only a mild reduction, which the browser handles cleanly.
//
// Run with `node scripts/scale-portraits.mjs` after adding art; it skips anything already at
// or below the target width, so re-running is free. Pass --dry to report without writing.
//
// sharp is used rather than anything built into Windows because WIC's WebP decoder returns
// Bgr32 — it silently drops the alpha channel, which flattens every transparent background
// to black.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import sharp from "sharp";

const DIR = fileURLToPath(new URL("../public/characters/", import.meta.url));
const TARGET_WIDTH = 480;
const DRY = process.argv.includes("--dry");

const files = (await readdir(DIR)).filter((f) => f.endsWith(".webp"));
let converted = 0;
let skipped = 0;
let before = 0;
let after = 0;

for (const file of files) {
  const path = join(DIR, file);
  const input = await readFile(path);
  const meta = await sharp(input).metadata();
  before += input.length;

  if (meta.width <= TARGET_WIDTH) {
    skipped++;
    after += input.length;
    continue;
  }

  const output = await sharp(input)
    .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
    .webp({ quality: 90, alphaQuality: 100, effort: 5 })
    .toBuffer();

  // A portrait that loses its alpha channel would render as a black box against the card, so
  // treat that as a hard failure rather than writing it out.
  const check = await sharp(output).metadata();
  if (meta.hasAlpha && !check.hasAlpha) {
    throw new Error(`${file}: alpha channel lost during conversion`);
  }

  if (!DRY) await writeFile(path, output);
  converted++;
  after += output.length;
}

console.log(
  `${DRY ? "[dry] " : ""}${converted} converted, ${skipped} already small enough\n` +
    `${(before / 1024 / 1024).toFixed(1)} MB -> ${(after / 1024 / 1024).toFixed(1)} MB`,
);
