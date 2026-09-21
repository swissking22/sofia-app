/** Cameroon national phone numbers (no country code). */

/**
 * Normalize to a 9-digit Cameroon national number (no +237 / 237).
 * Accepts common inputs: `670000001`, `670 00 00 01`, `+237670000001`, `237670000001`, `0670000001`.
 * Returns `null` when empty, `'invalid'` when not a Cameroon national number.
 */
export function normalizeCameroonPhone(
  value: string | null | undefined
): string | null | 'invalid' {
  const raw = (value ?? '').trim()
  if (!raw) return null

  let digits = raw.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) digits = digits.slice(1)
  if (digits.startsWith('00237')) digits = digits.slice(5)
  else if (digits.startsWith('237') && digits.length >= 12) {
    digits = digits.slice(3)
  }
  if (digits.startsWith('0') && digits.length === 10) {
    digits = digits.slice(1)
  }

  // National format: 9 digits, mobile (6…) or fixed (2…)
  if (!/^[26]\d{8}$/.test(digits)) return 'invalid'
  return digits
}

export function formatCameroonPhoneHint(): string {
  return '9 digits, e.g. 670000001 (no +237)'
}
