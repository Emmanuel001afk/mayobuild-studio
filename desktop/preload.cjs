// Minimal, safe bridge for the MayoCut desktop app.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mayocut", {
  isDesktop: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
  /** Native save dialog. Returns { canceled } or { canceled:false, path } */
  saveFile: async (suggestedName, blob) => {
    const data = new Uint8Array(await blob.arrayBuffer());
    return ipcRenderer.invoke("mayocut:save-file", { suggestedName, data });
  },
});
