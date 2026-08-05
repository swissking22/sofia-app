import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import type { Score } from '../types'
import { BaseRepository, type CreateInput, type UpdateInput } from './base'

export class ScoreRepository extends BaseRepository<Score> {
  constructor(db: Database.Database) {
    super(db, 'scores')
  }

  create(input: CreateInput<Score>): Score {
    const record: Score = {
      ...this.buildBaseFields(),
      student_id: input.student_id,
      subject_id: input.subject_id,
      test_score: input.test_score,
      exam_score: input.exam_score,
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO scores (id, student_id, subject_id, test_score, exam_score, created_at, updated_at, deleted_at, sync_status, version)
           VALUES (@id, @student_id, @subject_id, @test_score, @exam_score, @created_at, @updated_at, @deleted_at, @sync_status, @version)`
        )
        .run(record)

      enqueueSync(this.db, this.tableName, record.id, 'INSERT', record as unknown as Record<string, unknown>)
    })

    tx()
    return record
  }

  update(id: string, input: UpdateInput<Score>): Score | undefined {
    const existing = this.findById(id)
    if (!existing) return undefined

    const record: Score = {
      ...existing,
      ...input,
      ...this.applyUpdateMeta(existing),
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE scores
           SET student_id = @student_id,
               subject_id = @subject_id,
               test_score = @test_score,
               exam_score = @exam_score,
               updated_at = @updated_at,
               version = @version,
               sync_status = @sync_status
           WHERE id = @id`
        )
        .run(record)

      enqueueSync(this.db, this.tableName, record.id, 'UPDATE', record as unknown as Record<string, unknown>)
    })

    tx()
    return record
  }

  findByStudentId(studentId: string): Score[] {
    return this.db
      .prepare(
        `SELECT * FROM scores WHERE student_id = ? AND deleted_at IS NULL`
      )
      .all(studentId) as Score[]
  }
}
