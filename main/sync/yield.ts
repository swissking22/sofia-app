/**
 * Let the Electron main process pump UI / IPC / input events.
 * better-sqlite3 work is synchronous; without yields, Sync Now freezes the cursor.
 */
export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof setImmediate === 'function') {
      setImmediate(resolve)
    } else {
      setTimeout(resolve, 0)
    }
  })
}
