/**
 * Secondary-desk onboarding: look up school by code, install tenant locally, pull.
 * Does not require user rows to already exist in sync — first login bootstraps via
 * Supabase Auth (see auth/login + cloud-login).
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
      needsSignIn: boolean
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
  const existingSchool = repos.schools.findLatest()
  if (existingSchool) {
    if (existingSchool.id !== remote.id) {
      return {
        ok: false,
        error:
          'This device already has a different school. Finish registration or clear the app data before joining another school.',
      }
    }
    // Same school left from a previous join attempt — continue pull + finish.
  } else {
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

  // Best-effort branding/photo download (Storage may be empty on first join)
  const storage = syncClient as {
    uploadAsset?: unknown
    downloadAsset?: unknown
  }
  if (
    typeof storage.downloadAsset === 'function' &&
    typeof storage.uploadAsset === 'function'
  ) {
    try {
      const { downloadMissingSyncedAssets } = await import('../sync/assets')
      await downloadMissingSyncedAssets({
        db,
        schoolId: remote.id,
        storage: syncClient as import('../sync/types').AssetStorageClient,
      })
    } catch {
      /* non-fatal — path strings still present for later Sync Now */
    }
  }

  const usersPulled = repos.users.findAll().length

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
    needsSignIn: true,
  }
}
