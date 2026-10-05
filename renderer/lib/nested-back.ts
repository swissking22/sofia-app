/**
 * Resolve a parent href for deep nested AppShell routes.
 * Prefer explicit parent links over history.back() so Electron navigation stays predictable.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Last path segments that are actions / wizards under a list hub. */
const ACTION_SEGMENTS = new Set([
  'create',
  'upload',
  'take',
  'entry',
  'scores',
  'process',
  'publish',
  'generate',
  'run',
  'print',
  'edit',
  'new',
])

/**
 * Full-path overrides when stripping the last segment would land on a missing page.
 * Patterns use ^…$ against the pathname without query/hash.
 */
const SPECIAL_PARENTS: Array<{ pattern: RegExp; parent: string }> = [
  {
    pattern: /^\/students\/id-cards\/designer\/[^/]+$/,
    parent: '/students/id-cards/templates',
  },
  {
    pattern: /^\/students\/id-cards\/templates\/new$/,
    parent: '/students/id-cards/templates',
  },
  {
    pattern: /^\/students\/id-cards\/(generate|issued|settings|print-history|print)$/,
    parent: '/students/id-cards',
  },
  {
    pattern: /^\/academic\/report-cards\/view\/[^/]+$/,
    parent: '/academic/report-cards',
  },
  {
    pattern: /^\/academic\/results\/(calculation-settings|coefficients)$/,
    parent: '/academic/results',
  },
  {
    pattern: /^\/academic\/attendance\/gate-scanner$/,
    parent: '/academic/attendance',
  },
  {
    pattern: /^\/documents\/print\/[^/]+$/,
    parent: '/students/documents',
  },
  {
    pattern: /^\/setup\/roles\/[^/]+\/edit$/,
    parent: '/setup/roles',
  },
]

function normalizePath(asPath: string): string {
  const withoutHash = asPath.split('#')[0] ?? asPath
  const withoutQuery = withoutHash.split('?')[0] ?? withoutHash
  const trimmed = withoutQuery.replace(/\/+$/, '')
  return trimmed || '/'
}

function isEntityId(segment: string): boolean {
  if (UUID_RE.test(segment)) return true
  if (/^\d+$/.test(segment)) return true
  // Non-reserved slug used as local row id (cuid / nanoid-ish)
  if (
    segment.length >= 8 &&
    !ACTION_SEGMENTS.has(segment) &&
    !/^(index|new)$/i.test(segment)
  ) {
    // Only treat as id when it looks opaque (has digits or is long hex-ish)
    if (/[0-9]/.test(segment) || /^[a-z0-9_-]{12,}$/i.test(segment)) return true
  }
  return false
}

/**
 * Returns a parent route for nested pages, or null for top-level hubs.
 * Pass `backHref={false}` on AppShell to suppress; pass a string to override.
 */
export function resolveNestedBackHref(asPath: string): string | null {
  const path = normalizePath(asPath)
  if (path === '/' || path === '/home' || path === '/login') return null

  for (const { pattern, parent } of SPECIAL_PARENTS) {
    if (pattern.test(path)) return parent
  }

  const segments = path.split('/').filter(Boolean)
  if (segments.length < 2) return null

  const last = segments[segments.length - 1]!
  const parentOfLast = `/${segments.slice(0, -1).join('/')}`

  if (ACTION_SEGMENTS.has(last) || isEntityId(last)) {
    return parentOfLast
  }

  // Module sub-pages under a hub (e.g. /students/id-cards/templates)
  if (segments.length >= 3) {
    return parentOfLast
  }

  return null
}
