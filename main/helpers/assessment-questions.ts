import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { app } from 'electron'

/** Persist an uploaded question-paper PDF under userData/uploads/question-papers. */
export function saveQuestionPaperFile(
  base64OrDataUrl: string,
  mimeType = 'application/pdf',
  originalName?: string
): { filePath: string; fileName: string; mimeType: string; fileSize: number } {
  const dir = path.join(app.getPath('userData'), 'uploads', 'question-papers')
  fs.mkdirSync(dir, { recursive: true })

  const raw = base64OrDataUrl.includes(',')
    ? base64OrDataUrl.split(',')[1]
    : base64OrDataUrl

  let ext = 'pdf'
  if (mimeType.includes('pdf')) ext = 'pdf'
  else if (originalName?.includes('.')) {
    ext = originalName.split('.').pop()!.toLowerCase().slice(0, 8)
  }

  const fileName =
    originalName?.trim() || `question-paper-${randomUUID().slice(0, 8)}.${ext}`
  const filePath = path.join(dir, `${randomUUID()}.${ext}`)
  const buffer = Buffer.from(raw, 'base64')
  fs.writeFileSync(filePath, buffer)
  return {
    filePath,
    fileName,
    mimeType: mimeType.includes('pdf') ? 'application/pdf' : mimeType,
    fileSize: buffer.length,
  }
}

export function questionPaperFileExists(filePath: string | null): boolean {
  return Boolean(filePath && fs.existsSync(filePath))
}

/** Data URL for PDF (or other) files for embedded preview. */
export function questionPaperToDataUrl(
  filePath: string | null | undefined
): string | null {
  if (!filePath || !fs.existsSync(filePath)) return null
  const ext = path.extname(filePath).toLowerCase().replace('.', '')
  const mime = ext === 'pdf' ? 'application/pdf' : 'application/octet-stream'
  const buffer = fs.readFileSync(filePath)
  return `data:${mime};base64,${buffer.toString('base64')}`
}
