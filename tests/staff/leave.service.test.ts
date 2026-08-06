import { LeaveService } from '../../main/services/staff'
import { countLeaveDays } from '../../main/domain/staff'
import { buildLeaveBalance, buildLeaveRequest, resetIds } from '../fixtures/builders'
import { createInMemoryStaffMocks } from '../mocks/repositories'

describe('LeaveService - apply / decide', () => {
  beforeEach(() => resetIds())

  it('counts inclusive leave days correctly', () => {
    expect(countLeaveDays('2026-08-10', '2026-08-10')).toBe(1)
    expect(countLeaveDays('2026-08-10', '2026-08-12')).toBe(3)
    expect(countLeaveDays('2026-08-12', '2026-08-10')).toBe(0)
  })

  it('applies leave when balance is sufficient', () => {
    const { leaveRepo, leaves } = createInMemoryStaffMocks({
      balances: [buildLeaveBalance({ id: 'bal_1', entitled: 10, used: 2 })],
    })
    const service = new LeaveService(leaveRepo)

    const req = service.apply({
      school_id: 'school_1',
      staff_id: 'staff_1',
      leave_type: 'sick',
      start_date: '2026-08-10',
      end_date: '2026-08-12',
      reason: 'Flu',
    })

    expect(req.status).toBe('pending')
    expect(req.days).toBe(3)
    expect(leaves).toHaveLength(1)
  })

  it('rejects leave that exceeds remaining balance', () => {
    const { leaveRepo } = createInMemoryStaffMocks({
      balances: [buildLeaveBalance({ entitled: 5, used: 4 })],
    })
    const service = new LeaveService(leaveRepo)

    expect(() =>
      service.apply({
        school_id: 'school_1',
        staff_id: 'staff_1',
        leave_type: 'sick',
        start_date: '2026-08-10',
        end_date: '2026-08-12',
      })
    ).toThrow(/Insufficient sick leave balance/i)
  })

  it('allows unlimited unpaid leave regardless of used days', () => {
    const { leaveRepo } = createInMemoryStaffMocks({
      balances: [
        buildLeaveBalance({
          leave_type: 'unpaid',
          entitled: null,
          used: 100,
        }),
      ],
    })
    const service = new LeaveService(leaveRepo)

    const req = service.apply({
      school_id: 'school_1',
      staff_id: 'staff_1',
      leave_type: 'unpaid',
      start_date: '2026-09-01',
      end_date: '2026-09-05',
    })
    expect(req.days).toBe(5)
  })

  it('prevents overlapping pending or approved leave requests', () => {
    const { leaveRepo } = createInMemoryStaffMocks({
      balances: [buildLeaveBalance({ entitled: 15, used: 0 })],
      leaves: [
        buildLeaveRequest({
          start_date: '2026-08-10',
          end_date: '2026-08-14',
          status: 'approved',
        }),
      ],
    })
    const service = new LeaveService(leaveRepo)

    expect(() =>
      service.apply({
        school_id: 'school_1',
        staff_id: 'staff_1',
        leave_type: 'sick',
        start_date: '2026-08-12',
        end_date: '2026-08-16',
      })
    ).toThrow(/overlaps/i)
  })

  it('approves leave and deducts balance only on approval', () => {
    const balance = buildLeaveBalance({ id: 'bal_1', entitled: 10, used: 0 })
    const pending = buildLeaveRequest({
      id: 'leave_1',
      days: 3,
      status: 'pending',
      start_date: '2026-08-10',
      end_date: '2026-08-12',
    })
    const { leaveRepo, balances } = createInMemoryStaffMocks({
      balances: [balance],
      leaves: [pending],
    })
    const service = new LeaveService(leaveRepo)

    const approved = service.decide({ id: 'leave_1', decision: 'approved' })
    expect(approved.status).toBe('approved')
    expect(balances[0].used).toBe(3)
  })

  it('rejects leave without deducting balance', () => {
    const balance = buildLeaveBalance({ id: 'bal_1', entitled: 10, used: 1 })
    const pending = buildLeaveRequest({
      id: 'leave_1',
      days: 2,
      status: 'pending',
    })
    const { leaveRepo, balances } = createInMemoryStaffMocks({
      balances: [balance],
      leaves: [pending],
    })
    const service = new LeaveService(leaveRepo)

    service.decide({ id: 'leave_1', decision: 'rejected' })
    expect(balances[0].used).toBe(1)
  })

  it('blocks deciding a non-pending request', () => {
    const { leaveRepo } = createInMemoryStaffMocks({
      leaves: [buildLeaveRequest({ id: 'leave_1', status: 'approved' })],
    })
    const service = new LeaveService(leaveRepo)

    expect(() =>
      service.decide({ id: 'leave_1', decision: 'rejected' })
    ).toThrow(/Only pending/i)
  })
})
