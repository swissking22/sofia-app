import { screen, BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'
import Store from 'electron-store'

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
}

export function createWindow(
  windowName: string,
  options: BrowserWindowConstructorOptions
): BrowserWindow {
  const key = 'window-state'
  const name = `window-state-${windowName}`
  const store = new Store<{ [key: string]: WindowState }>({ name })
  const defaultSize = {
    width: options.width ?? 1280,
    height: options.height ?? 800,
  }

  let state: WindowState = { ...defaultSize }
  let win: BrowserWindow

  const restore = (): WindowState =>
    store.get(key, defaultSize) as WindowState

  const getCurrentPosition = (): WindowState => {
    const position = win.getPosition()
    const size = win.getSize()
    return {
      x: position[0],
      y: position[1],
      width: size[0],
      height: size[1],
    }
  }

  const windowWithinBounds = (
    windowState: WindowState,
    bounds: Electron.Rectangle
  ): boolean => {
    return (
      (windowState.x ?? 0) >= bounds.x &&
      (windowState.y ?? 0) >= bounds.y &&
      (windowState.x ?? 0) + windowState.width <= bounds.x + bounds.width &&
      (windowState.y ?? 0) + windowState.height <= bounds.y + bounds.height
    )
  }

  const resetToDefaults = (): WindowState => {
    const bounds = screen.getPrimaryDisplay().bounds
    return {
      ...defaultSize,
      x: Math.round((bounds.width - defaultSize.width) / 2),
      y: Math.round((bounds.height - defaultSize.height) / 2),
    }
  }

  const ensureVisibleOnSomeDisplay = (windowState: WindowState): WindowState => {
    const visible = screen.getAllDisplays().some((display) =>
      windowWithinBounds(windowState, display.bounds)
    )
    if (!visible) {
      return resetToDefaults()
    }
    return windowState
  }

  const saveState = (): void => {
    if (!win.isMinimized() && !win.isMaximized()) {
      Object.assign(state, getCurrentPosition())
    }
    store.set(key, state)
  }

  state = ensureVisibleOnSomeDisplay(restore())

  win = new BrowserWindow({
    ...state,
    ...options,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      ...options.webPreferences,
    },
  })

  win.on('close', saveState)

  return win
}
