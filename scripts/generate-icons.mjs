/**
 * Build Electron packaging icons from the official SOFIA brand mark.
 *
 * Source of truth: renderer/assets/images/sofia-icon.png
 * Outputs:
 *   resources/icon.png  — 1024² white plate with macOS-style corner radius
 *   resources/icon.icns — macOS (rounded)
 *   resources/icon.ico  — Windows multi-size (square; Windows does not bake radius)
 *
 * Conventions:
 * - White filled background, ~10% safe-area padding.
 * - macOS: baked rounded corners (~22% radius, soft edge) so Dock / Finder
 *   show a rounded tile. (OS may still apply squircle masking on top.)
 * - Windows: square .ico at 16–256px per desktop icon guidelines.
 *
 * Usage: npm run icons
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Jimp } from "jimp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "renderer/assets/images/sofia-icon.png");
const logoSource = path.join(root, "renderer/assets/images/sofia-logo.png");
const resourcesDir = path.join(root, "resources");
const masterPath = path.join(resourcesDir, "icon.png");
const masterSquarePath = path.join(resourcesDir, "icon-square.png");
const logoDest = path.join(resourcesDir, "logo.png");
const buildDir = path.join(resourcesDir, ".icon-build");
const SIZE = 1024;
/** Content box as a fraction of the canvas (≈10% margin each side). */
const CONTENT_RATIO = 0.8;
/**
 * Corner radius relative to canvas size — close to Apple’s continuous-corner
 * app-icon template on a 1024² artboard.
 */
const MAC_CORNER_RATIO = 0.2237;
const WHITE = 0xffffffff;
/** Treat near-black source pixels as background (logo itself has no black). */
const BG_LUMA_MAX = 28;

if (!fs.existsSync(sourcePath)) {
  console.error(`Missing brand icon: ${sourcePath}`);
  process.exit(1);
}

/**
 * Soft rounded-rect mask: opaque inside, transparent outside, AA on the edge.
 * @param {InstanceType<typeof Jimp>} image
 * @param {number} radius
 */
function applyMacRoundedCorners(image, radius) {
  const w = image.bitmap.width;
  const h = image.bitmap.height;
  const r = Math.max(1, radius);
  image.scan(0, 0, w, h, function (x, y, idx) {
    let dist = 0;
    if (x < r && y < r) {
      dist = Math.hypot(x - r, y - r);
    } else if (x >= w - r && y < r) {
      dist = Math.hypot(x - (w - 1 - r), y - r);
    } else if (x < r && y >= h - r) {
      dist = Math.hypot(x - r, y - (h - 1 - r));
    } else if (x >= w - r && y >= h - r) {
      dist = Math.hypot(x - (w - 1 - r), y - (h - 1 - r));
    } else {
      return;
    }
    if (dist <= r - 0.5) return;
    if (dist >= r + 0.5) {
      this.bitmap.data[idx + 3] = 0;
      return;
    }
    // Anti-aliased edge
    const t = r + 0.5 - dist;
    this.bitmap.data[idx + 3] = Math.round(
      this.bitmap.data[idx + 3] * Math.max(0, Math.min(1, t)),
    );
  });
}

function runIconGen(inputPath, { ico, icns }) {
  const args = ["-i", inputPath, "-o", buildDir, "-r"];
  if (ico) {
    args.push("--ico", "--ico-name", "icon");
  }
  if (icns) {
    args.push("--icns", "--icns-name", "icon");
  }
  execFileSync(iconGenBin, args, {
    stdio: "inherit",
    cwd: root,
    shell: process.platform === "win32",
  });
}

console.log(`Building square master from ${path.relative(root, sourcePath)}`);

const src = await Jimp.read(sourcePath);

src.scan(0, 0, src.bitmap.width, src.bitmap.height, function (x, y, idx) {
  const r = this.bitmap.data[idx];
  const g = this.bitmap.data[idx + 1];
  const b = this.bitmap.data[idx + 2];
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (luma <= BG_LUMA_MAX) {
    this.bitmap.data[idx + 3] = 0;
  }
});

const square = new Jimp({ width: SIZE, height: SIZE, color: WHITE });
const content = Math.round(SIZE * CONTENT_RATIO);
const scale = Math.min(content / src.width, content / src.height);
const w = Math.max(1, Math.round(src.width * scale));
const h = Math.max(1, Math.round(src.height * scale));
src.resize({ w, h });
square.composite(src, Math.floor((SIZE - w) / 2), Math.floor((SIZE - h) / 2));

// Flatten onto opaque white (Windows ICO prefers no sparse alpha).
square.scan(0, 0, SIZE, SIZE, function (x, y, idx) {
  if (this.bitmap.data[idx + 3] < 255) {
    const a = this.bitmap.data[idx + 3] / 255;
    const r = this.bitmap.data[idx];
    const g = this.bitmap.data[idx + 1];
    const b = this.bitmap.data[idx + 2];
    this.bitmap.data[idx] = Math.round(r * a + 255 * (1 - a));
    this.bitmap.data[idx + 1] = Math.round(g * a + 255 * (1 - a));
    this.bitmap.data[idx + 2] = Math.round(b * a + 255 * (1 - a));
    this.bitmap.data[idx + 3] = 255;
  }
});

await square.write(masterSquarePath);

// macOS / Dock / Finder: rounded tile with transparent corners.
const rounded = square.clone();
const cornerRadius = Math.round(SIZE * MAC_CORNER_RATIO);
applyMacRoundedCorners(rounded, cornerRadius);
await rounded.write(masterPath);
console.log(
  `Wrote ${path.relative(root, masterPath)} (white bg, radius ${cornerRadius}px)`,
);

fs.rmSync(buildDir, { recursive: true, force: true });
fs.mkdirSync(buildDir, { recursive: true });

const iconGenBin = path.join(root, "node_modules/.bin/icon-gen");
if (
  !fs.existsSync(iconGenBin) &&
  !fs.existsSync(path.join(root, "node_modules/icon-gen/dist/bin/index.js"))
) {
  console.error("icon-gen not found. Run: npm install -D icon-gen jimp");
  process.exit(1);
}

console.log("Generating Windows .ico (square)…");
runIconGen(masterSquarePath, { ico: true, icns: false });
const icoSrc = path.join(buildDir, "icon.ico");
if (!fs.existsSync(icoSrc)) {
  console.error("icon-gen did not produce icon.ico", fs.readdirSync(buildDir));
  process.exit(1);
}
fs.copyFileSync(icoSrc, path.join(resourcesDir, "icon.ico"));

fs.rmSync(buildDir, { recursive: true, force: true });
fs.mkdirSync(buildDir, { recursive: true });

console.log("Generating macOS .icns (rounded)…");
runIconGen(masterPath, { ico: false, icns: true });
const icnsSrc = path.join(buildDir, "icon.icns");
if (!fs.existsSync(icnsSrc)) {
  console.error("icon-gen did not produce icon.icns", fs.readdirSync(buildDir));
  process.exit(1);
}
fs.copyFileSync(icnsSrc, path.join(resourcesDir, "icon.icns"));
console.log("Wrote resources/icon.icns and resources/icon.ico");

if (fs.existsSync(logoSource)) {
  fs.copyFileSync(logoSource, logoDest);
  console.log(`Synced ${path.relative(root, logoDest)} from sofia-logo.png`);
}

fs.rmSync(buildDir, { recursive: true, force: true });
fs.rmSync(path.join(resourcesDir, "icons"), { recursive: true, force: true });
// Intermediate square plate is only for .ico generation.
fs.rmSync(masterSquarePath, { force: true });

console.log(
  "Done. Packaging uses resources/icon.icns (mac, rounded) and resources/icon.ico (win, square).",
);
