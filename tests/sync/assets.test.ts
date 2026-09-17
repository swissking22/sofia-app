import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3'
import { createSchema } from '../../main/db/schema'
import {
  assetObjectKey,
  downloadMissingSyncedAssets,
  downloadRowAssets,
  uploadRowAssets,
} from '../../main/sync/assets'
import type { AssetStorageClient } from '../../main/sync/types'
import { enqueueSync, queueStatsByTable } from '../../main/sync/queue'

function memoryStore(): AssetStorageClient & { files: Map<string, Buffer> } {
  const files = new Map<string, Buffer>()
  return {
    files,
    async uploadAsset(objectKey, data) {
      files.set(objectKey, Buffer.from(data))
      return { ok: true }
    },
    async downloadAsset(objectKey) {
      const data = files.get(objectKey)
      if (!data) return { ok: false, error: 'not found' }
      return { ok: true, data }
    },
  }
}

describe('Synced asset helpers', () => {
  it('builds deterministic object keys from path extension', () => {
    expect(
      assetObjectKey(
        'school-1',
        'schools',
        'rec-1',
        'logo_path',
        '/tmp/uploads/logos/abc.png'
      )
    ).toBe('school-1/schools/rec-1/logo_path.png')
  })

  it('uploads local branding files and downloads onto another desk path', async () => {
    const storage = memoryStore()
    const tmpA = fs.mkdtempSync(path.join(os.tmpdir(), 'sofia-asset-a-'))
    const tmpB = fs.mkdtempSync(path.join(os.tmpdir(), 'sofia-asset-b-'))
    const src = path.join(tmpA, 'logo.png')
    fs.writeFileSync(src, Buffer.from('fake-png-bytes'))

    const up = await uploadRowAssets({
      schoolId: 'school-1',
      table: 'schools',
      recordId: 'school-1',
      payload: { logo_path: src },
      storage,
    })
    expect(up.uploaded).toBe(1)
    expect(storage.files.size).toBe(1)

    const db = new Database(':memory:')
    createSchema(db)
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO schools (
        id, name, email, school_code, short_code, logo_path,
        created_at, updated_at, sync_status, version
      ) VALUES (?, 'S', 'a@t.com', 'TST', 'TST', ?, ?, ?, 'synced', 1)`
    ).run('school-1', '/missing/on/desk-b/logo.png', now, now)

    const down = await downloadRowAssets({
      db,
      schoolId: 'school-1',
      table: 'schools',
      recordId: 'school-1',
      payload: { logo_path: '/missing/on/desk-b/logo.png' },
      storage,
      userDataPath: tmpB,
    })
    expect(down.downloaded).toBe(1)
    const row = db
      .prepare(`SELECT logo_path FROM schools WHERE id = ?`)
      .get('school-1') as { logo_path: string }
    expect(fs.existsSync(row.logo_path)).toBe(true)
    expect(fs.readFileSync(row.logo_path).toString()).toBe('fake-png-bytes')

    fs.rmSync(tmpA, { recursive: true, force: true })
    fs.rmSync(tmpB, { recursive: true, force: true })
    db.close()
  })

  it('downloadMissingSyncedAssets fills student photos', async () => {
    const storage = memoryStore()
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sofia-asset-c-'))
    const key = assetObjectKey(
      'school-1',
      'students',
      'stu-1',
      'photo_path',
      'x.jpg'
    )
    await storage.uploadAsset(key, Buffer.from('photo'), 'image/jpeg')

    const db = new Database(':memory:')
    createSchema(db)
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO schools (
        id, name, email, school_code, short_code,
        created_at, updated_at, sync_status, version
      ) VALUES ('school-1', 'S', 'a@t.com', 'TST', 'TST', ?, ?, 'synced', 1)`
    ).run(now, now)
    db.prepare(
      `INSERT INTO classes (
        id, name, school_id, is_active, created_at, updated_at, sync_status, version
      ) VALUES ('c1', 'F1', 'school-1', 1, ?, ?, 'synced', 1)`
    ).run(now, now)
    db.prepare(
      `INSERT INTO students (
        id, name, class_id, school_id, status, photo_path,
        created_at, updated_at, sync_status, version
      ) VALUES ('stu-1', 'Ada', 'c1', 'school-1', 'active', ?, ?, ?, 'synced', 1)`
    ).run('/other/desk/photo.jpg', now, now)

    const result = await downloadMissingSyncedAssets({
      db,
      schoolId: 'school-1',
      storage,
      userDataPath: tmp,
    })
    expect(result.downloaded).toBe(1)
    const stu = db
      .prepare(`SELECT photo_path FROM students WHERE id = ?`)
      .get('stu-1') as { photo_path: string }
    expect(fs.existsSync(stu.photo_path)).toBe(true)

    fs.rmSync(tmp, { recursive: true, force: true })
    db.close()
  })
})

describe('queueStatsByTable', () => {
  it('groups pending and failed by table', () => {
    const db = new Database(':memory:')
    createSchema(db)
    enqueueSync(db, 'invoices', 'a', 'INSERT', { id: 'a' })
    enqueueSync(db, 'invoices', 'b', 'INSERT', { id: 'b' })
    enqueueSync(db, 'announcements', 'c', 'INSERT', { id: 'c' })
    db.prepare(`UPDATE sync_queue SET status = 'failed' WHERE record_id = 'c'`).run()

    const stats = queueStatsByTable(db)
    const inv = stats.find((s) => s.table_name === 'invoices')
    const ann = stats.find((s) => s.table_name === 'announcements')
    expect(inv?.pending).toBe(2)
    expect(ann?.failed).toBe(1)
    db.close()
  })
})
