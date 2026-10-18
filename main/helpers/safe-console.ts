/**
 * Electron main can throw `write EIO` / `EPIPE` from console.* when stdout/
 * stderr is closed (packaged app, detached process, broken pipe). That becomes
 * an uncaughtException and kills Sync Now. Swallow only those write errors.
 */

const BENIGN_WRITE_CODES = new Set([
  'EIO',
  'EPIPE',
  'ERR_STREAM_DESTROYED',
  'ERR_STREAM_WRITE_AFTER_END',
])

function isBenignWriteError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const code = 'code' in err ? String((err as { code: unknown }).code) : ''
  return BENIGN_WRITE_CODES.has(code)
}

let installed = false

export function installSafeConsole(): void {
  if (installed) return
  installed = true

  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const original = console[method].bind(console)
    console[method] = (...args: unknown[]) => {
      try {
        original(...args)
      } catch (err) {
        if (!isBenignWriteError(err)) throw err
      }
    }
  }

  for (const stream of [process.stdout, process.stderr]) {
    if (!stream || typeof stream.on !== 'function') continue
    stream.on('error', (err: NodeJS.ErrnoException) => {
      if (isBenignWriteError(err)) return
      // Avoid rethrowing — would become another uncaughtException.
    })
  }
}
