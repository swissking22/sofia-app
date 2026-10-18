/**
 * Strip noise from sync payloads before outbox / cloud RPC.
 * No gzip yet (next: batch RPC can add compression). Focus: nulls + secrets + blobs.
 */

const STRIP_KEYS = new Set([
  'password_hash',
  'password',
  // Large local-only / binary fields — photos go via Storage assets
  'photo_blob',
  'avatar_blob',
  'logo_blob',
  'stamp_blob',
  'signature_blob',
])

/**
 * Deep-enough lean: drop null/undefined, strip known secret/blob keys,
 * omit empty strings on optional text fields is not applied (empty may be intentional clear).
 */
export function leanSyncPayload(
  tableName: string,
  payload: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payload)) {
    if (value === null || value === undefined) continue
    if (STRIP_KEYS.has(key)) continue
    if (tableName === 'users' && key === 'password_hash') continue
    out[key] = value
  }
  return out
}
