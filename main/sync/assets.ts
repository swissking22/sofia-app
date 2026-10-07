/**
 * Multi-desk binary asset sync via Supabase Storage (Step 9).
 * Path strings already travel with synced rows; this module moves file bytes
 * for school branding and student photos when Storage is available.
 */
import fs from 'fs'
import path from 'path'
import type { Database } from 'better-sqlite3'
import { app } from 'electron'
import type { AssetStorageClient } from './types'

export const SCHOOL_ASSETS_BUCKET = 'school-assets'

/** Tables/columns whose local files are mirrored to Storage. */
export const SYNCED_ASSET_FIELDS: Record<string, readonly string[]> = {
  schools: ['logo_path', 'stamp_path', 'principal_signature_path'],
  students: ['photo_path'],
  document_signatories: ['signature_path'],
  assessment_question_paper_revisions: ['file_path'],
}

const FIELD_UPLOAD_DIR: Record<string, string> = {
  logo_path: 'logos',
  stamp_path: 'stamps',
  principal_signature_path: 'signatures',
  photo_path: 'student-photos',
  signature_path: 'signatures',
  file_path: 'question-papers',
}
export type AssetSyncResult = {
  uploaded: number
  downloaded: number
  failed: number
  skipped: number
}

function userDataRoot(override?: string): string {
  if (override) return override
  try {
    return app.getPath('userData')
  } catch {
    return path.join(process.cwd(), '.sofia-userdata')
  }
}

export function assetObjectKey(
  schoolId: string,
  table: string,
  recordId: string,
  field: string,
  filePath: string
): string {
  const ext = path.extname(filePath) || '.bin'
  return `${schoolId}/${table}/${recordId}/${field}${ext}`
}

function contentTypeForExt(ext: string): string {
  const e = ext.toLowerCase().replace('.', '')
  if (e === 'png') return 'image/png'
  if (e === 'webp') return 'image/webp'
  if (e === 'gif') return 'image/gif'
  if (e === 'pdf') return 'application/pdf'
  return 'image/jpeg'
}

function localDirForField(field: string, root: string): string {
  const sub = FIELD_UPLOAD_DIR[field] || 'misc'
  const dir = path.join(root, 'uploads', sub)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Upload local file bytes for one synced row (call after successful push).
 */
export async function uploadRowAssets(params: {
  schoolId: string
  table: string
  recordId: string
  payload: Record<string, unknown>
  storage: AssetStorageClient
}): Promise<{ uploaded: number; failed: number }> {
  const fields = SYNCED_ASSET_FIELDS[params.table]
  if (!fields) return { uploaded: 0, failed: 0 }

  let uploaded = 0
  let failed = 0
  for (const field of fields) {
    const localPath = params.payload[field]
    if (typeof localPath !== 'string' || !localPath) continue
    if (!fs.existsSync(localPath)) continue

    try {
      const data = fs.readFileSync(localPath)
      const key = assetObjectKey(
        params.schoolId,
        params.table,
        params.recordId,
        field,
        localPath
      )
      const res = await params.storage.uploadAsset(
        key,
        data,
        contentTypeForExt(path.extname(localPath))
      )
      if (res.ok) uploaded += 1
      else {
        failed += 1
        console.warn(
          `[SYNC] Asset upload failed ${params.table}.${field}: ${res.error}`
        )
      }
    } catch (err) {
      failed += 1
      console.warn(
        `[SYNC] Asset upload error ${params.table}.${field}:`,
        err instanceof Error ? err.message : err
      )
    }
  }
  return { uploaded, failed }
}

/**
 * Download missing local files referenced by a pulled payload; rewrite paths.
 */
export async function downloadRowAssets(params: {
  db: Database
  schoolId: string
  table: string
  recordId: string
  payload: Record<string, unknown>
  storage: AssetStorageClient
  userDataPath?: string
}): Promise<{ downloaded: number; failed: number }> {
  const fields = SYNCED_ASSET_FIELDS[params.table]
  if (!fields) return { downloaded: 0, failed: 0 }

  const root = userDataRoot(params.userDataPath)
  let downloaded = 0
  let failed = 0

  for (const field of fields) {
    const remotePath = params.payload[field]
    if (typeof remotePath !== 'string' || !remotePath) continue
    if (fs.existsSync(remotePath)) continue

    const key = assetObjectKey(
      params.schoolId,
      params.table,
      params.recordId,
      field,
      remotePath
    )
    try {
      const res = await params.storage.downloadAsset(key)
      if (!res.ok || !res.data) {
        failed += 1
        continue
      }
      const ext = path.extname(remotePath) || '.bin'
      const dest = path.join(
        localDirForField(field, root),
        `${params.recordId}-${field}${ext}`
      )
      fs.writeFileSync(dest, res.data)
      params.db
        .prepare(`UPDATE ${params.table} SET ${field} = ? WHERE id = ?`)
        .run(dest, params.recordId)
      downloaded += 1
    } catch (err) {
      failed += 1
      console.warn(
        `[SYNC] Asset download error ${params.table}.${field}:`,
        err instanceof Error ? err.message : err
      )
    }
  }
  return { downloaded, failed }
}

/**
 * After pull: scan synced asset tables for path strings missing on disk.
 */
export async function downloadMissingSyncedAssets(params: {
  db: Database
  schoolId: string
  storage: AssetStorageClient
  userDataPath?: string
}): Promise<AssetSyncResult> {
  const result: AssetSyncResult = {
    uploaded: 0,
    downloaded: 0,
    failed: 0,
    skipped: 0,
  }

  for (const [table, fields] of Object.entries(SYNCED_ASSET_FIELDS)) {
    const cols = fields.join(', ')
    let rows: Array<Record<string, unknown>> = []
    try {
      if (table === 'schools') {
        rows = params.db
          .prepare(
            `SELECT id, ${cols} FROM schools
             WHERE id = ? AND deleted_at IS NULL`
          )
          .all(params.schoolId) as Array<Record<string, unknown>>
      } else {
        rows = params.db
          .prepare(
            `SELECT id, ${cols} FROM ${table}
             WHERE school_id = ? AND deleted_at IS NULL`
          )
          .all(params.schoolId) as Array<Record<string, unknown>>
      }
    } catch {
      // Table may not exist in minimal test DBs
      continue
    }

    for (const row of rows) {
      const payload: Record<string, unknown> = {}
      let needsDownload = false
      for (const field of fields) {
        const p = row[field]
        if (typeof p === 'string' && p) {
          payload[field] = p
          if (!fs.existsSync(p)) needsDownload = true
        }
      }
      if (!needsDownload) {
        result.skipped += 1
        continue
      }
      const r = await downloadRowAssets({
        db: params.db,
        schoolId: params.schoolId,
        table,
        recordId: String(row.id),
        payload,
        storage: params.storage,
        userDataPath: params.userDataPath,
      })
      result.downloaded += r.downloaded
      result.failed += r.failed
    }
  }

  return result
}
