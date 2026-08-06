import { AttendanceService } from '../../main/services/staff'
import { resetIds } from '../fixtures/builders'
import { createInMemoryStaffMocks } from '../mocks/repositories'

describe('AttendanceService - mark', () => {
  beforeEach(() => resetIds())

  it('marks attendance for a staff member', () => {
    const { attendanceRepo, attendance } = createInMemoryStaffMocks()
    const service = new AttendanceService(attendanceRepo)

    const row = service.mark({
      school_id: 'school_1',
      staff_id: 'staff_1',
      date: '2026-08-06',
      status: 'present',
    })

    expect(row.status).toBe('present')
    expect(attendance).toHaveLength(1)
  })

  it('prevents duplicate rows for the same staff + day (upsert)', () => {
    const { attendanceRepo, attendance } = createInMemoryStaffMocks()
    const service = new AttendanceService(attendanceRepo)

    service.mark({
      school_id: 'school_1',
      staff_id: 'staff_1',
      date: '2026-08-06',
      status: 'present',
    })
    const updated = service.mark({
      school_id: 'school_1',
      staff_id: 'staff_1',
      date: '2026-08-06',
      status: 'late',
      notes: 'Arrived 09:20',
    })

    expect(attendance).toHaveLength(1)
    expect(updated.status).toBe('late')
    expect(updated.notes).toBe('Arrived 09:20')
  })

  it('rejects invalid attendance status values', () => {
    const { attendanceRepo } = createInMemoryStaffMocks()
    const service = new AttendanceService(attendanceRepo)

    expect(() =>
      service.mark({
        school_id: 'school_1',
        staff_id: 'staff_1',
        date: '2026-08-06',
        status: 'on_leave',
      })
    ).toThrow(/Invalid attendance status/i)
  })

  it('produces accurate monthly report counts', () => {
    const { attendanceRepo } = createInMemoryStaffMocks()
    const service = new AttendanceService(attendanceRepo)

    service.mark({
      school_id: 'school_1',
      staff_id: 't1',
      date: '2026-08-01',
      status: 'present',
    })
    service.mark({
      school_id: 'school_1',
      staff_id: 't1',
      date: '2026-08-02',
      status: 'present',
    })
    service.mark({
      school_id: 'school_1',
      staff_id: 't1',
      date: '2026-08-03',
      status: 'absent',
    })
    service.mark({
      school_id: 'school_1',
      staff_id: 't2',
      date: '2026-08-01',
      status: 'late',
    })
    // Different month ignored
    service.mark({
      school_id: 'school_1',
      staff_id: 't1',
      date: '2026-07-31',
      status: 'absent',
    })

    const report = service.monthlyReport('school_1', 2026, 8)
    expect(report.t1).toEqual({
      present: 2,
      absent: 1,
      late: 0,
      half_day: 0,
      total: 3,
    })
    expect(report.t2.late).toBe(1)
    expect(report.t2.total).toBe(1)
  })
})
