export const app = {
  getPath: (name: string) => `/tmp/sofia-test-${name}`,
  getVersion: () => '1.0.0',
  getName: () => 'sofia',
  isPackaged: false,
}

export const ipcMain = {
  handle: () => {},
  on: () => {},
  removeHandler: () => {},
}

export const ipcRenderer = {
  invoke: async () => {},
  on: () => {},
  send: () => {},
}

export const dialog = {
  showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  showSaveDialog: async () => ({ canceled: true, filePath: '' }),
}

export const BrowserWindow = class {
  static getAllWindows = () => []
}

export default {
  app,
  ipcMain,
  ipcRenderer,
  dialog,
  BrowserWindow,
}
