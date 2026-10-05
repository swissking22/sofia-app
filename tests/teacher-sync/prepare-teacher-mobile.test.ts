import { describe, expect, it } from '@jest/globals'
import { STAFF_TEMP_PASSWORD } from '../../main/db/repositories/staff.repository'
import { TEACHER_SYNC_MANIFEST } from '../../main/domain/teacher-sync'

describe('Teacher mobile readiness contract', () => {
  it('uses the shared staff temp password for Auth provisioning', () => {
    expect(STAFF_TEMP_PASSWORD).toBe('Sofia@Staff1')
  })

  it('lists assignments and students in the teacher sync manifest', () => {
    expect(TEACHER_SYNC_MANIFEST).toEqual(
      expect.arrayContaining([
        'teacherAssignments',
        'students',
        'timetable',
        'classes',
        'subjects',
      ])
    )
  })
})
