// Minimal, safe bridge for the MayoCut desktop app.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mayocut", {
  isDesktop: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
  nativeStatus: () => ipcRenderer.invoke("mayocut:native-status"),
  nativeCheckProject: (project) => ipcRenderer.invoke("mayocut:native-check", project),
  nativeExport: (payload) => ipcRenderer.invoke("mayocut:native-export", payload),
  /** Native save dialog. Returns { canceled } or { canceled:false, path } */
  saveFile: async (suggestedName, blob) => {
    const data = new Uint8Array(await blob.arrayBuffer());
    return ipcRenderer.invoke("mayocut:save-file", { suggestedName, data });
  },
});
