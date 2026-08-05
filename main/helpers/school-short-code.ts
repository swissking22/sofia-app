/** School short-code generation and uniqueness helpers. */

const STOP_WORDS = new Set([
  'of',
  'and',
  'the',
  'for',
  'a',
  'an',
  'in',
  'at',
  'to',
  'on',
])

/**
 * Build a short code from a school name.
 * "Government Bilingual High School Buea" → "GBHSB"
 */
export function generateSchoolShortCode(name: string): string {
  const words = name
    .trim()
    .split(/[\s\-_/,.]+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
    .filter((w) => w.length > 0)
    .filter((w) => !STOP_WORDS.has(w.toLowerCase()))

  if (words.length === 0) {
    return 'SCH'
  }

  let code = words.map((w) => w[0]!.toUpperCase()).join('')

  // Prefer 4–8 chars: if too short, pull more letters from significant words
  if (code.length < 4) {
    for (const word of words) {
      if (code.length >= 4) break
      const extra = word.slice(1, 3).toUpperCase()
      code += extra
    }
  }

  code = code.slice(0, 8).toUpperCase()
  if (code.length < 4) {
    code = (code + 'XXXX').slice(0, 4)
  }
  return code
}

/** Normalize admin-entered short codes. */
export function normalizeShortCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
}

export function validateShortCode(code: string): string | null {
  const normalized = normalizeShortCode(code)
  if (!normalized) return 'School short code is required.'
  if (normalized.length < 2) return 'Short code must be at least 2 characters.'
  if (normalized.length > 10) return 'Short code must be at most 10 characters.'
  if (!/^[A-Z0-9]+$/.test(normalized)) {
    return 'Short code may only contain letters and numbers.'
  }
  return null
}
