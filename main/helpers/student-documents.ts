import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { app } from 'electron'
import { assetToDataUrl } from './school-assets'

export function saveStudentDocumentFile(
  base64OrDataUrl: string,
  mimeType = 'application/octet-stream',
  originalName?: string
): string {
  const dir = path.join(app.getPath('userData'), 'uploads', 'student-documents')
  fs.mkdirSync(dir, { recursive: true })

  const raw = base64OrDataUrl.includes(',')
    ? base64OrDataUrl.split(',')[1]
    : base64OrDataUrl

  let ext = 'bin'
  if (mimeType.includes('pdf')) ext = 'pdf'
  else if (mimeType.includes('png')) ext = 'png'
  else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg'
  else if (originalName?.includes('.')) {
    ext = originalName.split('.').pop()!.toLowerCase().slice(0, 8)
  }

  const filePath = path.join(dir, `${randomUUID()}.${ext}`)
  fs.writeFileSync(filePath, Buffer.from(raw, 'base64'))
  return filePath
}

/** Passport / 4×4 student photo under userData/uploads/student-photos. */
export function saveStudentPhoto(
  base64OrDataUrl: string,
  mimeType = 'image/jpeg'
): string {
  const dir = path.join(app.getPath('userData'), 'uploads', 'student-photos')
  fs.mkdirSync(dir, { recursive: true })

  const raw = base64OrDataUrl.includes(',')
    ? base64OrDataUrl.split(',')[1]
    : base64OrDataUrl

  let ext = 'jpg'
  if (mimeType.includes('png')) ext = 'png'
  else if (mimeType.includes('webp')) ext = 'webp'
  else if (mimeType.includes('gif')) ext = 'gif'

  const filePath = path.join(dir, `${randomUUID()}.${ext}`)
  fs.writeFileSync(filePath, Buffer.from(raw, 'base64'))
  return filePath
}

export { assetToDataUrl }
