// Normalises the roster portraits for the Library grid: same aspect, same scale, and no
// bigger than they are drawn.
//
// Two problems are solved together.
//
// Size: the grid renders a portrait about 186px wide. Shipping 1000px+ sources made the
// browser reduce them more than 5x in one step, which aliases hair and fine linework into
// something that reads as pixelation.
//
// Framing: the sources vary wildly in shape — Zhu Yuan is 905x2048 (ratio 0.44) where Ellen
// Joe is 1000x1175 (0.85) — against a card that is a fixed 3:4. `object-cover` therefore cut
// the tall ones down to a head and shoulders while the wide ones showed nearly the whole
// figure, so neighbouring cards looked framed by different rules. Each portrait is trimmed to
// its own figure using the alpha channel, then centred on a transparent 3:4 canvas, so the
// figure is as large as it can be and every card frames alike.
//
// Run with `node scripts/scale-portraits.mjs` after adding art; already-normalised files are
// left alone, so re-running is free. Pass --dry to report without writing.
//
// sharp is used rather than anything built into Windows because WIC's WebP decoder returns
// Bgr32 — it silently drops the alpha channel, which flattens every transparent background
// to black.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import sharp from "sharp";

const DIR = fileURLToPath(new URL("../public/characters/", import.meta.url));
// 3:4 to match the card's aspect exactly, so `object-cover` has nothing left to crop.
const TARGET_WIDTH = 480;
const TARGET_HEIGHT = 640;
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

  if (meta.width === TARGET_WIDTH && meta.height === TARGET_HEIGHT) {
    skipped++;
    after += input.length;
    continue;
  }

  const output = await sharp(input)
    // Drop the transparent margin so the figure, not the artist's canvas, decides the framing.
    .trim({ threshold: 1 })
    // `contain` fits the whole figure inside 3:4 and pads the remainder transparently, rather
    // than cropping it — which is the entire point, since cropping is what looked wrong.
    .resize({
      width: TARGET_WIDTH,
      height: TARGET_HEIGHT,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
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
