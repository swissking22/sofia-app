/**
 * Abstraction for future Teacher mobile push notifications.
 * Desktop must emit domain events here; do not couple UI to FCM/APNs.
 * Currently a no-op recorder for tests / future wiring.
 */

import {
  TEACHER_NOTIFICATION_EVENTS,
  type TeacherNotificationEvent,
} from '../domain/teacher-sync'

export type TeacherNotificationPayload = {
  schoolId: string
  event: TeacherNotificationEvent
  title: string
  body?: string
  entityType?: string
  entityId?: string
  /** Optional staff ids; empty = school-wide teachers later filtered by audience. */
  staffIds?: string[]
  data?: Record<string, string>
}

export type TeacherNotificationSink = {
  enqueue(payload: TeacherNotificationPayload): void
}

const memoryLog: TeacherNotificationPayload[] = []

const memorySink: TeacherNotificationSink = {
  enqueue(payload) {
    if (!(TEACHER_NOTIFICATION_EVENTS as readonly string[]).includes(payload.event)) {
      return
    }
    memoryLog.push(payload)
  },
}

let sink: TeacherNotificationSink = memorySink

export function setTeacherNotificationSink(next: TeacherNotificationSink): void {
  sink = next
}

export function resetTeacherNotificationSink(): void {
  sink = memorySink
  memoryLog.length = 0
}

export function getTeacherNotificationLog(): readonly TeacherNotificationPayload[] {
  return memoryLog
}

export function notifyTeachers(payload: TeacherNotificationPayload): void {
  sink.enqueue(payload)
}
