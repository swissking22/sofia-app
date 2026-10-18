import path from "node:path";
import os from "node:os";

const base = path.join(os.tmpdir(), "sofia-script");

export const app = {
  getPath: (name) => path.join(base, String(name)),
  getVersion: () => "1.0.0",
  getName: () => "sofia",
  isPackaged: false,
};

export const ipcMain = {
  handle() {},
  on() {},
  removeHandler() {},
};

export const ipcRenderer = {
  invoke: async () => {},
  on() {},
  send() {},
};

export const dialog = {
  showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  showSaveDialog: async () => ({ canceled: true, filePath: "" }),
};

export class BrowserWindow {
  static getAllWindows() {
    return [];
  }
}

export default {
  app,
  ipcMain,
  ipcRenderer,
  dialog,
  BrowserWindow,
};
