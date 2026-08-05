import type { NextronConfig } from 'nextron'

/**
 * Nextron already externalizes package.json dependencies (including better-sqlite3).
 * Keep this file for future main-process webpack tweaks.
 */
const config: NextronConfig = {}

export default config
