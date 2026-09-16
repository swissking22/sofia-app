import { parseStudentQrPayload } from '../domain/id-card-classic-tokens'
import {
  formatGateClockTime,
  gateFeedbackTone,
  isGateScanRawAcceptable,
  localSchoolDayIso,
  normalizeGateScanRaw,
  type GateScanOutcome,
} from '../domain/gate-attendance'
import { assetToDataUrl } from '../helpers/school-assets'
import { getOrCreateDeviceId } from '../sync/device'
import type { Repositories } from '../db/repositories'
import type { GateAttendance } from '../db/types'

export type GateScanStudentView = {
  id: string
  name: string
  student_code: string
  class_name: string | null
  photo_url: string | null
  status: string
}

export type GateScanResult = {
  outcome: GateScanOutcome
  message: string
  tone: ReturnType<typeof gateFeedbackTone>
  student: GateScanStudentView | null
  attendance: {
    id: string
    attendance_date: string
    scanned_at: string
    arrival_display: string
    status: string
    attendance_type: string
  } | null
  school_day: string
}

function studentView(
  repos: Repositories,
  student: {
    id: string
    name: string
    student_code: string | null
    class_id: string
    photo_path: string | null
    status: string
  }
): GateScanStudentView {
  const cls = repos.classes.findById(student.class_id)
  return {
    id: student.id,
    name: student.name,
    student_code: student.student_code || '',
    class_name: cls?.name || null,
    photo_url: assetToDataUrl(student.photo_path),
    status: student.status,
  }
}

function attendanceView(record: GateAttendance) {
  return {
    id: record.id,
    attendance_date: record.attendance_date,
    scanned_at: record.scanned_at,
    arrival_display: formatGateClockTime(record.scanned_at),
    status: record.status,
    attendance_type: record.attendance_type,
  }
}

/**
 * Process one HID keyboard-wedge scan into a gate attendance outcome.
 * Fully offline — SQLite only.
 */
export function processGateScan(
  repos: Repositories,
  input: {
    schoolId: string
    raw: string
    userId: string | null
    deviceId?: string | null
  }
): GateScanResult {
  const school_day = localSchoolDayIso()
  const raw = normalizeGateScanRaw(input.raw)

  if (!isGateScanRawAcceptable(raw)) {
    return {
      outcome: 'invalid',
      message: 'Please scan a valid Sofia student ID card.',
      tone: gateFeedbackTone('invalid'),
      student: null,
      attendance: null,
      school_day,
    }
  }

  const code = parseStudentQrPayload(raw)
  if (!code) {
    return {
      outcome: 'invalid',
      message: 'Please scan a valid Sofia student ID card.',
      tone: gateFeedbackTone('invalid'),
      student: null,
      attendance: null,
      school_day,
    }
  }

  const student = repos.students.findBySchoolAndCode(input.schoolId, code)
  if (!student) {
    return {
      outcome: 'not_found',
      message: 'This ID is not registered in Sofia.',
      tone: gateFeedbackTone('not_found'),
      student: null,
      attendance: null,
      school_day,
    }
  }

  const view = studentView(repos, student)
  if (student.status !== 'active') {
    return {
      outcome: 'inactive',
      message: `Student status is ${student.status}. Gate check-in is only for active students.`,
      tone: gateFeedbackTone('inactive'),
      student: view,
      attendance: null,
      school_day,
    }
  }

  if (!student.student_code) {
    return {
      outcome: 'invalid',
      message: 'Please scan a valid Sofia student ID card.',
      tone: gateFeedbackTone('invalid'),
      student: view,
      attendance: null,
      school_day,
    }
  }

  let deviceId = input.deviceId ?? null
  try {
    deviceId = deviceId || getOrCreateDeviceId()
  } catch {
    deviceId = null
  }

  const { record, created } = repos.gateAttendance.recordGateArrival({
    school_id: input.schoolId,
    student_id: student.id,
    student_code: student.student_code,
    attendance_date: school_day,
    device_id: deviceId,
    scanned_by: input.userId,
  })

  if (!created) {
    return {
      outcome: 'duplicate',
      message: 'Already recorded for today.',
      tone: gateFeedbackTone('duplicate'),
      student: view,
      attendance: attendanceView(record),
      school_day,
    }
  }

  return {
    outcome: 'recorded',
    message: 'Attendance recorded.',
    tone: gateFeedbackTone('recorded'),
    student: view,
    attendance: attendanceView(record),
    school_day,
  }
}
