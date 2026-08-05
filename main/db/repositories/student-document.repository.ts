import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import type { DocumentType, StudentDocument } from '../types'
import { BaseRepository } from './base'

export class StudentDocumentRepository extends BaseRepository<StudentDocument> {
  constructor(db: Database.Database) {
    super(db, 'student_documents')
  }

  findBySchool(schoolId: string): StudentDocument[] {
    return this.db
      .prepare(
        `SELECT * FROM student_documents
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC`
      )
      .all(schoolId) as StudentDocument[]
  }

  findByStudent(studentId: string): StudentDocument[] {
    return this.db
      .prepare(
        `SELECT * FROM student_documents
         WHERE student_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC`
      )
      .all(studentId) as StudentDocument[]
  }

  create(input: {
    school_id: string
    student_id: string
    document_type: DocumentType
    title: string
    file_path?: string | null
    notes?: string | null
  }): StudentDocument {
    const record: StudentDocument = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      student_id: input.student_id,
      document_type: input.document_type,
      title: input.title.trim(),
      file_path: input.file_path ?? null,
      notes: input.notes ?? null,
    }

    this.db
      .prepare(
        `INSERT INTO student_documents (
          id, school_id, student_id, document_type, title, file_path, notes,
          created_at, updated_at, deleted_at, sync_status, version
        ) VALUES (
          @id, @school_id, @student_id, @document_type, @title, @file_path, @notes,
          @created_at, @updated_at, @deleted_at, @sync_status, @version
        )`
      )
      .run(record)

    enqueueSync(
      this.db,
      this.tableName,
      record.id,
      'INSERT',
      record as unknown as Record<string, unknown>
    )
    return record
  }
}
