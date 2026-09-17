/**
 * Secondary-desk onboarding: look up school by code, install tenant locally, pull.
 */
import type { Repositories } from '../db/repositories'
import {
  getDeviceFingerprint,
  getDeviceName,
  getOrCreateDeviceId,
  markDeviceRegisteredForSchool,
} from '../sync/device'
import { pullRemoteChanges } from '../sync/pull'
import { getSupabaseSyncClient } from '../sync/supabase-client'
import type { SupabaseSyncClientInterface } from '../sync/types'

export type JoinSchoolResult =
  | {
      ok: true
      schoolId: string
      schoolName: string
      schoolCode: string
      usersPulled: number
      applied: number
    }
  | { ok: false; error: string }

export async function joinSchoolByCode(
  repos: Repositories,
  schoolCode: string,
  client?: SupabaseSyncClientInterface
): Promise<JoinSchoolResult> {
  const code = String(schoolCode || '').trim()
  if (!code) {
    return { ok: false, error: 'Enter your school code.' }
  }

  if (repos.users.findAll().length > 0) {
    return {
      ok: false,
      error: 'This device already has user accounts. Log in instead.',
    }
  }

  if (repos.schools.findLatest()) {
    return {
      ok: false,
      error:
        'This device already has a school. Finish registration or log in.',
    }
  }

  const syncClient = client || getSupabaseSyncClient()
  if (!syncClient.lookupSchoolByCode) {
    return {
      ok: false,
      error: 'Cloud lookup is not available. Update the app and try again.',
    }
  }

  const lookup = await syncClient.lookupSchoolByCode(code)
  if (!lookup.ok || !lookup.school) {
    return {
      ok: false,
      error: lookup.error || 'Could not find that school code.',
    }
  }

  const remote = lookup.school
  try {
    repos.schools.insertJoinedSchool({
      id: remote.id,
      name: remote.name,
      email: remote.email,
      phone: remote.phone,
      address: remote.address,
      school_code: remote.school_code,
      short_code: remote.short_code,
      version: remote.version,
    })
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Could not create local school record.',
    }
  }

  const deviceId = getOrCreateDeviceId()
  const reg = await syncClient.registerDevice({
    id: deviceId,
    schoolId: remote.id,
    deviceName: getDeviceName(),
    deviceFingerprint: getDeviceFingerprint(),
  })
  if (!reg.ok) {
    return {
      ok: false,
      error:
        reg.error ||
        'Could not register this device with the cloud. Check your connection.',
    }
  }
  markDeviceRegisteredForSchool(remote.id)

  const db = repos.schools.getDb()
  const pull = await pullRemoteChanges({
    db,
    schoolId: remote.id,
    deviceId,
    client: syncClient,
  })

  if (!pull.ok) {
    return {
      ok: false,
      error:
        pull.message ||
        'Connected to the school but failed to download data. Try again.',
    }
  }

  const usersPulled = repos.users.findAll().length
  if (usersPulled === 0) {
    return {
      ok: false,
      error:
        'School found, but no user accounts were downloaded yet. On the main office computer, open Administration → Backup & Sync and run Sync Now, then try joining again.',
    }
  }

  try {
    repos.setupSteps.completeAllSteps()
  } catch {
    /* non-fatal */
  }

  return {
    ok: true,
    schoolId: remote.id,
    schoolName: remote.name,
    schoolCode: remote.school_code || remote.short_code || code,
    usersPulled,
    applied: pull.applied,
  }
}
