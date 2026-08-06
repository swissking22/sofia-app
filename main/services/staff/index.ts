import {
  ATTENDANCE_STATUSES,
  canApplyLeave,
  countLeaveDays,
  hasOverlappingLeave,
  isValidAttendanceStatus,
  isValidLeaveType,
  summarizeMonthlyAttendance,
  type LeaveRequestStatus,
  type LeaveType,
  type StaffAttendanceStatus,
} from '../../domain/staff'

export type AttendanceRecord = {
  id: string
  school_id: string
  staff_id: string
  date: string
  status: StaffAttendanceStatus
  notes: string | null
}

export type LeaveRequestRecord = {
  id: string
  school_id: string
  staff_id: string
  leave_type: LeaveType
  start_date: string
  end_date: string
  days: number
  status: LeaveRequestStatus
  reason: string | null
}

export type LeaveBalanceRecord = {
  id: string
  staff_id: string
  leave_type: LeaveType
  year: number
  entitled: number | null
  used: number
}

export interface AttendanceRepositoryPort {
  findByStaffDate(
    schoolId: string,
    staffId: string,
    date: string
  ): AttendanceRecord | undefined
  upsertDay(input: {
    school_id: string
    staff_id: string
    date: string
    status: StaffAttendanceStatus
    notes?: string | null
  }): AttendanceRecord
  findBySchoolMonth(
    schoolId: string,
    year: number,
    month: number
  ): AttendanceRecord[]
}

export interface LeaveRepositoryPort {
  listActiveRequests(
    schoolId: string,
    staffId: string
  ): LeaveRequestRecord[]
  getBalance(
    schoolId: string,
    staffId: string,
    leaveType: LeaveType,
    year: number
  ): LeaveBalanceRecord | undefined
  createRequest(input: {
    school_id: string
    staff_id: string
    leave_type: LeaveType
    start_date: string
    end_date: string
    days: number
    reason?: string | null
  }): LeaveRequestRecord
  findById(id: string): LeaveRequestRecord | undefined
  decide(
    id: string,
    status: 'approved' | 'rejected' | 'cancelled'
  ): LeaveRequestRecord
  addUsed(balanceId: string, days: number): void
}

export class AttendanceService {
  constructor(private readonly repo: AttendanceRepositoryPort) {}

  mark(input: {
    school_id: string
    staff_id: string
    date: string
    status: string
    notes?: string | null
  }): AttendanceRecord {
    if (!isValidAttendanceStatus(input.status)) {
      throw new Error(
        `Invalid attendance status. Allowed: ${ATTENDANCE_STATUSES.join(', ')}`
      )
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      throw new Error('Attendance date must be YYYY-MM-DD.')
    }

    // Upsert semantics: one row per staff per day (no duplicate inserts).
    return this.repo.upsertDay({
      school_id: input.school_id,
      staff_id: input.staff_id,
      date: input.date,
      status: input.status,
      notes: input.notes,
    })
  }

  monthlyReport(schoolId: string, year: number, month: number) {
    const rows = this.repo.findBySchoolMonth(schoolId, year, month)
    return summarizeMonthlyAttendance(rows)
  }
}

export class LeaveService {
  constructor(private readonly repo: LeaveRepositoryPort) {}

  apply(input: {
    school_id: string
    staff_id: string
    leave_type: string
    start_date: string
    end_date: string
    reason?: string | null
  }): LeaveRequestRecord {
    if (!isValidLeaveType(input.leave_type)) {
      throw new Error('Invalid leave type.')
    }
    const days = countLeaveDays(input.start_date, input.end_date)
    const gate = canApplyLeave({ entitled: null, used: 0, days })
    if (!gate.ok) throw new Error(gate.error)

    const existing = this.repo.listActiveRequests(
      input.school_id,
      input.staff_id
    )
    if (hasOverlappingLeave(existing, input.start_date, input.end_date)) {
      throw new Error('Leave request overlaps an existing pending or approved leave.')
    }

    const year = Number(input.start_date.slice(0, 4))
    const bal = this.repo.getBalance(
      input.school_id,
      input.staff_id,
      input.leave_type,
      year
    )
    const balanceGate = canApplyLeave({
      entitled: bal?.entitled ?? null,
      used: bal?.used ?? 0,
      days,
    })
    if (!balanceGate.ok) {
      throw new Error(`Insufficient ${input.leave_type} leave balance.`)
    }

    return this.repo.createRequest({
      school_id: input.school_id,
      staff_id: input.staff_id,
      leave_type: input.leave_type,
      start_date: input.start_date,
      end_date: input.end_date,
      days,
      reason: input.reason,
    })
  }

  decide(input: {
    id: string
    decision: 'approved' | 'rejected' | 'cancelled'
  }): LeaveRequestRecord {
    const existing = this.repo.findById(input.id)
    if (!existing) throw new Error('Leave request not found.')
    if (existing.status !== 'pending') {
      throw new Error('Only pending requests can be decided.')
    }

    const updated = this.repo.decide(input.id, input.decision)

    if (input.decision === 'approved') {
      const year = Number(existing.start_date.slice(0, 4))
      const bal = this.repo.getBalance(
        existing.school_id,
        existing.staff_id,
        existing.leave_type,
        year
      )
      if (bal) this.repo.addUsed(bal.id, existing.days)
    }

    return updated
  }
}
