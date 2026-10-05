import {
  isTeacherWritableTable,
  TEACHER_SYNC_DEFERRED,
  TEACHER_SYNC_MANIFEST,
  TEACHER_WRITABLE_TABLES,
  teacherOwnsClass,
  teacherOwnsClassSubject,
  validateMarkScore,
} from '../../main/domain/teacher-sync'
import {
  getTeacherNotificationLog,
  notifyTeachers,
  resetTeacherNotificationSink,
} from '../../main/services/teacher-notifications'
import { isGenericSyncTable, isSupportedSyncTable } from '../../main/sync/tables'

describe('Teacher sync domain', () => {
  const assignments = [
    { class_id: 'c1', subject_id: 's1' },
    { class_id: 'c1', subject_id: 's2' },
    { class_id: 'c2', subject_id: 's1' },
  ]

  it('exposes a stable sync manifest without deferred lesson writes', () => {
    expect(TEACHER_SYNC_MANIFEST).toContain('teacherAssignments')
    expect(TEACHER_SYNC_MANIFEST).toContain('students')
    expect(TEACHER_SYNC_MANIFEST).toContain('marks')
    expect(TEACHER_SYNC_DEFERRED).toContain('lessonRecords')
  })

  it('limits teacher writable tables', () => {
    expect(TEACHER_WRITABLE_TABLES).toEqual([
      'attendance_sessions',
      'attendance_records',
      'ca_scores',
    ])
    expect(isTeacherWritableTable('ca_scores')).toBe(true)
    expect(isTeacherWritableTable('invoices')).toBe(false)
  })

  it('checks assignment ownership by class and subject', () => {
    expect(teacherOwnsClass(assignments, 'c1')).toBe(true)
    expect(teacherOwnsClass(assignments, 'c9')).toBe(false)
    expect(teacherOwnsClassSubject(assignments, 'c1', 's2')).toBe(true)
    expect(teacherOwnsClassSubject(assignments, 'c2', 's2')).toBe(false)
  })

  it('rejects marks outside the assessment maximum', () => {
    expect(validateMarkScore(20, 20)).toEqual({ ok: true })
    expect(validateMarkScore(21, 20).ok).toBe(false)
    expect(validateMarkScore(-1, 20).ok).toBe(false)
    expect(validateMarkScore(null, 20).ok).toBe(false)
  })

  it('includes school_day_breaks in the desk sync allowlist', () => {
    expect(isSupportedSyncTable('school_day_breaks')).toBe(true)
    expect(isGenericSyncTable('school_day_breaks')).toBe(true)
  })
})

describe('Teacher notification abstraction', () => {
  beforeEach(() => {
    resetTeacherNotificationSink()
  })

  it('records announcement events without requiring a push provider', () => {
    notifyTeachers({
      schoolId: 'sch_1',
      event: 'announcement.published',
      title: 'Sports day',
      entityType: 'announcement',
      entityId: 'ann_1',
    })
    expect(getTeacherNotificationLog()).toHaveLength(1)
    expect(getTeacherNotificationLog()[0].event).toBe('announcement.published')
  })
})
