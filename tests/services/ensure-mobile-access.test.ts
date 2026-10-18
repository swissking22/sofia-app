import Database from 'better-sqlite3'
import { createSchema } from '../../main/db/schema'
import { createRepositories } from '../../main/db/repositories'
import { ensureMobileAccessCatalog } from '../../main/services/ensure-mobile-access'

describe('ensureMobileAccessCatalog', () => {
  it('seeds Teacher role grants and can force-requeue after a false synced state', () => {
    const db = new Database(':memory:')
    createSchema(db)
    const repos = createRepositories(db)
    const school = repos.schools.create({
      name: 'Mobile Ready School',
      short_code: 'MRS',
      email: 'admin@mrs.school',
    })

    ensureMobileAccessCatalog(repos, school.id)

    const teacherRole = db
      .prepare(
        `SELECT id FROM roles WHERE school_id = ? AND name = 'Teacher' AND deleted_at IS NULL`
      )
      .get(school.id) as { id: string } | undefined
    expect(teacherRole?.id).toBeTruthy()

    const grants = db
      .prepare(
        `SELECT COUNT(*) AS n FROM role_permissions
         WHERE role_id = ? AND deleted_at IS NULL`
      )
      .get(teacherRole!.id) as { n: number }
    expect(grants.n).toBeGreaterThan(5)

    const pendingPerms = db
      .prepare(
        `SELECT COUNT(*) AS n FROM sync_queue
         WHERE table_name = 'permissions' AND status = 'pending'`
      )
      .get() as { n: number }
    expect(pendingPerms.n).toBeGreaterThan(50)

    // Historical bug: outbox marked synced but cloud empty — force re-queue.
    db.prepare(`UPDATE sync_queue SET status = 'synced'`).run()
    db.prepare(`UPDATE permissions SET sync_status = 'synced'`).run()
    db.prepare(`UPDATE roles SET sync_status = 'synced'`).run()
    db.prepare(`UPDATE role_permissions SET sync_status = 'synced'`).run()

    const forced = ensureMobileAccessCatalog(repos, school.id)
    expect(forced).toBeGreaterThan(50)

    const pendingAgain = db
      .prepare(
        `SELECT COUNT(*) AS n FROM sync_queue
         WHERE table_name = 'permissions' AND status = 'pending'`
      )
      .get() as { n: number }
    expect(pendingAgain.n).toBeGreaterThan(50)

    // Idempotent while pending rows remain
    expect(ensureMobileAccessCatalog(repos, school.id)).toBe(0)
  })
})
