/**
 * Preload for tsx/node scripts that import Electron-bound main modules.
 * Usage: node --require ./scripts/mock-electron.cjs ./node_modules/tsx/dist/cli.mjs <script>
 */
const Module = require("module");
const path = require("path");

const mock = {
  app: {
    getPath: (name) => path.join("/tmp", "sofia-script", String(name)),
    getVersion: () => "1.0.0",
    getName: () => "sofia",
    isPackaged: false,
  },
  ipcMain: { handle() {}, on() {}, removeHandler() {} },
  ipcRenderer: {
    invoke: async () => {},
    on() {},
    send() {},
  },
  dialog: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    showSaveDialog: async () => ({ canceled: true, filePath: "" }),
  },
  BrowserWindow: class {
    static getAllWindows() {
      return [];
    }
  },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "electron") return mock;
  return originalLoad.apply(this, arguments);
};
