import Database from 'better-sqlite3'
import { createSchema } from '../../main/db/schema'
import { createRepositories } from '../../main/db/repositories'
import { clearExistingColumnsCacheForTests } from '../../main/sync/apply-generic'
import {
  APPLY_YIELD_CHUNK_SIZE,
  applyPulledChangesWithYields,
} from '../../main/sync/pull'
import { getLocalSyncCursor as readCursor } from '../../main/sync/cursor'
import { getOrCreateDeviceId } from '../../main/sync/device'
import type { SyncChange } from '../../main/sync/types'

describe('applyPulledChangesWithYields', () => {
  let db: Database.Database
  let schoolId: string
  let deviceId: string

  beforeEach(() => {
    clearExistingColumnsCacheForTests()
    db = new Database(':memory:')
    createSchema(db)
    const repos = createRepositories(db)
    const school = repos.schools.create({
      name: 'Yield School',
      short_code: 'YLD',
      email: 'admin@yield.school',
    })
    schoolId = school.id
    deviceId = getOrCreateDeviceId()
  })

  afterEach(() => {
    db.close()
  })

  it('applies a large page in chunks and advances the cursor', async () => {
    const n = APPLY_YIELD_CHUNK_SIZE * 3 + 5
    const changes: SyncChange[] = Array.from({ length: n }, (_, i) => {
      const id = `staff-${i}`
      return {
        id: i + 1,
        school_id: schoolId,
        table_name: 'staff',
        record_id: id,
        operation: 'INSERT',
        version: 1,
        payload: {
          id,
          school_id: schoolId,
          full_name: `Staff ${i}`,
          staff_type: 'administrative',
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          version: 1,
        },
      }
    })

    const res = await applyPulledChangesWithYields(
      db,
      changes,
      schoolId,
      deviceId,
      n
    )
    expect(res.applied).toBe(n)
    expect(res.failed).toBe(0)
    expect(readCursor(db, schoolId, deviceId)).toBe(n)

    const count = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM staff WHERE school_id = ? AND deleted_at IS NULL`
        )
        .get(schoolId) as { c: number }
    ).c
    expect(count).toBe(n)
  })

  it('exports a small chunk size for UI responsiveness', () => {
    expect(APPLY_YIELD_CHUNK_SIZE).toBeLessThanOrEqual(50)
  })
})
