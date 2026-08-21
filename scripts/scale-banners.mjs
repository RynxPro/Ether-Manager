// Normalises the character-page banner art to the size it is actually drawn at.
//
// The band on a character's page renders the banner at `h-[387px] w-auto`
// (`CharacterDetail.tsx`), sized by height with the width following. The sources were
// 1080px tall — and 1512 to 2584 wide — so on a 1× display every one of them was being
// reduced nearly 3× at paint time, and the whole set weighed 17.3 MB inside a 25.8 MB
// installer. That is the largest single number in the app's distribution, and none of it is
// pixels anyone sees.
//
// 810px tall, not 387. The app ships to other people: 150% and 200% Windows scaling are
// common, and at 2× the band wants 774 device pixels. 810 covers that with a little margin
// and still removes ~44% of the pixels. Deliberately not tuned to the machine it was run on.
//
// Scaled by HEIGHT ONLY, preserving each banner's own width. The CSS positioning is
// calibrated against the source proportions — the figure sits at y 120-958 of the 1080px
// canvas, and `top-[-43px]` lines it up with the band's borders. A uniform scale keeps every
// one of those ratios true; cropping or padding to a fixed width would break the alignment on
// every character at once.
//
// Run with `node scripts/scale-banners.mjs` after adding art. Files already at or below the
// target height are left alone, so re-running is free. Pass --dry to report without writing.
//
// sharp rather than anything built into Windows, for the same reason as the portraits: WIC's
// WebP decoder returns Bgr32 and silently drops alpha. Every banner here has a transparent
// background, so losing it would paint a black slab across the band.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import sharp from "sharp";

const DIR = fileURLToPath(new URL("../public/banners/", import.meta.url));
const TARGET_HEIGHT = 810;
// Matches the portraits script. Measured on the heaviest banner, re-encoding at 90 alone —
// before any resizing — already returned a third of the file, so the sources were simply
// encoded harder than they needed to be.
const QUALITY = 90;
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

  if (meta.height <= TARGET_HEIGHT) {
    skipped++;
    after += input.length;
    continue;
  }

  const output = await sharp(input)
    // `inside` + `withoutEnlargement` so a banner that is already small is never blown up —
    // upscaling would cost bytes to add nothing.
    .resize({ height: TARGET_HEIGHT, fit: "inside", withoutEnlargement: true })
    .webp({ quality: QUALITY, alphaQuality: 100, effort: 5 })
    .toBuffer();

  const check = await sharp(output).metadata();
  if (meta.hasAlpha && !check.hasAlpha) {
    throw new Error(`${file}: alpha channel lost during conversion`);
  }
  // The band's layout depends on the aspect ratio being preserved exactly. A rounding error of
  // a pixel or two is unavoidable at these sizes; anything more means the figure will no longer
  // meet the borders, so fail rather than ship a set of subtly misaligned pages.
  const sourceRatio = meta.width / meta.height;
  const outputRatio = check.width / check.height;
  if (Math.abs(sourceRatio - outputRatio) > 0.01) {
    throw new Error(
      `${file}: aspect ratio changed ${sourceRatio.toFixed(3)} -> ${outputRatio.toFixed(3)}`,
    );
  }

  if (!DRY) await writeFile(path, output);
  converted++;
  after += output.length;
}

console.log(
  `${DRY ? "[dry] " : ""}${converted} converted, ${skipped} already small enough\n` +
    `${(before / 1024 / 1024).toFixed(1)} MB -> ${(after / 1024 / 1024).toFixed(1)} MB ` +
    `(${(100 - (after / before) * 100).toFixed(0)}% smaller)`,
);
