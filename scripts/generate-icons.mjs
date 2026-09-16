/**
 * Build Electron packaging icons from the official SOFIA brand mark.
 *
 * Source of truth: renderer/assets/images/sofia-icon.png
 * Outputs: resources/icon.png (1024²), resources/icon.icns, resources/icon.ico
 *
 * Usage: npm run icons
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Jimp } from 'jimp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = path.join(root, 'renderer/assets/images/sofia-icon.png')
const logoSource = path.join(root, 'renderer/assets/images/sofia-logo.png')
const resourcesDir = path.join(root, 'resources')
const masterPath = path.join(resourcesDir, 'icon.png')
const logoDest = path.join(resourcesDir, 'logo.png')
const buildDir = path.join(resourcesDir, '.icon-build')
const SIZE = 1024

if (!fs.existsSync(sourcePath)) {
  console.error(`Missing brand icon: ${sourcePath}`)
  process.exit(1)
}

console.log(`Building square master from ${path.relative(root, sourcePath)}`)

const src = await Jimp.read(sourcePath)
const canvas = new Jimp({ width: SIZE, height: SIZE, color: 0x000000ff })
const scale = Math.min(SIZE / src.width, SIZE / src.height)
const w = Math.max(1, Math.round(src.width * scale))
const h = Math.max(1, Math.round(src.height * scale))
src.resize({ w, h })
canvas.composite(src, Math.floor((SIZE - w) / 2), Math.floor((SIZE - h) / 2))
await canvas.write(masterPath)
console.log(`Wrote ${path.relative(root, masterPath)} (${SIZE}x${SIZE})`)

fs.rmSync(buildDir, { recursive: true, force: true })
fs.mkdirSync(buildDir, { recursive: true })

const iconGenBin = path.join(root, 'node_modules/.bin/icon-gen')
if (!fs.existsSync(iconGenBin) && !fs.existsSync(path.join(root, 'node_modules/icon-gen/dist/bin/index.js'))) {
  console.error('icon-gen not found. Run: npm install -D icon-gen jimp')
  process.exit(1)
}

console.log('Generating .icns and .ico via icon-gen…')
execFileSync(
  iconGenBin,
  [
    '-i',
    masterPath,
    '-o',
    buildDir,
    '--ico',
    '--icns',
    '--ico-name',
    'icon',
    '--icns-name',
    'icon',
    '-r',
  ],
  { stdio: 'inherit', cwd: root, shell: process.platform === 'win32' }
)

const icnsSrc = path.join(buildDir, 'icon.icns')
const icoSrc = path.join(buildDir, 'icon.ico')
if (!fs.existsSync(icnsSrc) || !fs.existsSync(icoSrc)) {
  console.error('icon-gen did not produce icon.icns / icon.ico', fs.readdirSync(buildDir))
  process.exit(1)
}

fs.copyFileSync(icnsSrc, path.join(resourcesDir, 'icon.icns'))
fs.copyFileSync(icoSrc, path.join(resourcesDir, 'icon.ico'))
console.log('Wrote resources/icon.icns and resources/icon.ico')

if (fs.existsSync(logoSource)) {
  fs.copyFileSync(logoSource, logoDest)
  console.log(`Synced ${path.relative(root, logoDest)} from sofia-logo.png`)
}

fs.rmSync(buildDir, { recursive: true, force: true })
// Remove mistaken intermediate tree from electron-icon-generator experiments
fs.rmSync(path.join(resourcesDir, 'icons'), { recursive: true, force: true })

console.log('Done. Packaging uses resources/icon.icns (mac) and resources/icon.ico (win).')
