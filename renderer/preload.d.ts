interface IpcHandler {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  send(channel: string, value: unknown): void
  on(channel: string, callback: (...args: unknown[]) => void): () => void
}

declare global {
  interface Window {
    ipc: IpcHandler
  }
}

export {}
