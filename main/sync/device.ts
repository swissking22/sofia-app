import { randomUUID } from 'crypto'
import os from 'os'
import Store from 'electron-store'

interface DeviceStoreData {
  deviceId: string
  registeredSchoolIds: string[]
}

let storeInstance: Store<DeviceStoreData> | null = null

function getStore(): Store<DeviceStoreData> {
  if (!storeInstance) {
    storeInstance = new Store<DeviceStoreData>({
      name: 'sofia-device',
      projectName: 'sofia',
      defaults: {
        deviceId: '',
        registeredSchoolIds: [],
      },
    } as any)
  }
  return storeInstance
}

/**
 * Returns the stable installation UUID for this Sofia client.
 * Generated once on first run and preserved permanently across app restarts.
 */
export function getOrCreateDeviceId(): string {
  try {
    const store = getStore()
    let id = store.get('deviceId')
    if (!id || typeof id !== 'string' || id.trim() === '') {
      id = randomUUID()
      store.set('deviceId', id)
    }
    return id
  } catch {
    // In memory fallback if store cannot be initialized
    return '00000000-0000-0000-0000-000000000001'
  }
}

/**
 * Returns the human-readable device name (e.g. computer hostname).
 */
export function getDeviceName(): string {
  try {
    return os.hostname() || 'Sofia Desktop'
  } catch {
    return 'Sofia Desktop'
  }
}

/**
 * Returns a stable system fingerprint string.
 */
export function getDeviceFingerprint(): string {
  try {
    return `${os.platform()}-${os.arch()}-${os.release()}`
  } catch {
    return 'unknown-fingerprint'
  }
}

/**
 * Checks whether this device has already been registered in the cloud for the given school.
 */
export function isDeviceRegisteredForSchool(schoolId: string): boolean {
  try {
    const store = getStore()
    const registered = store.get('registeredSchoolIds') || []
    return registered.includes(schoolId)
  } catch {
    return false
  }
}

/**
 * Marks this device as registered in the cloud for the given school.
 */
export function markDeviceRegisteredForSchool(schoolId: string): void {
  try {
    const store = getStore()
    const registered = new Set(store.get('registeredSchoolIds') || [])
    registered.add(schoolId)
    store.set('registeredSchoolIds', Array.from(registered))
  } catch {
    // Ignore store write failure
  }
}

/**
 * Reset device registration state (primarily for test environments).
 */
export function resetDeviceStoreForTests(initialDeviceId?: string): void {
  try {
    const store = getStore()
    store.set('deviceId', initialDeviceId || '')
    store.set('registeredSchoolIds', [])
  } catch {
    // Ignore
  }
}
