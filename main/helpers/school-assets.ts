import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { app } from 'electron'

export type SchoolAssetKind = 'logo' | 'stamp' | 'signature'

const KIND_DIR: Record<SchoolAssetKind, string> = {
  logo: 'logos',
  stamp: 'stamps',
  signature: 'signatures',
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes('png')) return 'png'
  if (mimeType.includes('webp')) return 'webp'
  if (mimeType.includes('gif')) return 'gif'
  return 'jpg'
}

/**
 * Save a school branding asset from a data-URL / raw base64 string.
 * Returns the absolute file path stored under userData (offline-first).
 */
export function saveSchoolAsset(
  kind: SchoolAssetKind,
  base64OrDataUrl: string,
  mimeType = 'image/png'
): string {
  const dir = path.join(app.getPath('userData'), 'uploads', KIND_DIR[kind])
  fs.mkdirSync(dir, { recursive: true })

  const raw = base64OrDataUrl.includes(',')
    ? base64OrDataUrl.split(',')[1]
    : base64OrDataUrl

  const filePath = path.join(
    dir,
    `${randomUUID()}.${extensionForMime(mimeType)}`
  )
  fs.writeFileSync(filePath, Buffer.from(raw, 'base64'))
  return filePath
}

/** @deprecated Prefer saveSchoolAsset('logo', ...) */
export function saveSchoolLogo(
  base64OrDataUrl: string,
  mimeType = 'image/png'
): string {
  return saveSchoolAsset('logo', base64OrDataUrl, mimeType)
}

/** Read a local asset path into a data URL for safe renderer display. */
export function assetToDataUrl(filePath: string | null | undefined): string | null {
  if (!filePath || !fs.existsSync(filePath)) return null

  const ext = path.extname(filePath).toLowerCase().replace('.', '')
  const mime =
    ext === 'png'
      ? 'image/png'
      : ext === 'webp'
        ? 'image/webp'
        : ext === 'gif'
          ? 'image/gif'
          : 'image/jpeg'

  const buffer = fs.readFileSync(filePath)
  return `data:${mime};base64,${buffer.toString('base64')}`
}
