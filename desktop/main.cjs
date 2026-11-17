// Mayobuild Studio desktop main process (Electron).
// Loads the same static bundle the web app ships; everything else is local.
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: "#0d1220",
    title: "Mayobuild Studio",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, "..", "app-shell-dist", "index.html"));

  // external links open in the system browser, never inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  // keep the window focused during long exports (MediaRecorder is real-time)
  win.setAlwaysOnTop(false);
}

ipcMain.handle("mayocut:save-file", async (_event, payload) => {
  const { suggestedName, data } = payload;
  const win = BrowserWindow.getFocusedWindow();
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: "Save exported video (Mayobuild Studio)",
    defaultPath: suggestedName,
  });
  if (canceled || !filePath) return { canceled: true };
  await fs.promises.writeFile(filePath, Buffer.from(data));
  return { canceled: false, path: filePath };
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
