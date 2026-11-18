// Mayobuild Studio desktop main process (Electron).
//
// IMPORTANT: the shell is served over a LOCAL HTTP server (127.0.0.1), not
// via loadFile()/file://. Under file:// the router's location.pathname is the
// full filesystem path (e.g. /C:/Users/.../index.html), no route ever
// matches, and the app shows a blank window. A real http:// origin also keeps
// every origin-relative feature (fetch, wasm, object URLs) behaving exactly
// like the web build and the Capacitor shell.
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");

// Dev: the repo layout (desktop/../app-shell-dist). Packaged: electron-builder
// places the bundle in resources/app-shell-dist (extraResources), NOT inside
// the asar — an asar path plus a ".." join resolves to a folder that does not
// exist, which is exactly what left the window blank.
const DIST = app.isPackaged
  ? path.join(process.resourcesPath, "app-shell-dist")
  : path.join(__dirname, "..", "app-shell-dist");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".bin": "application/octet-stream",
};

/** Tiny static file server for the shell bundle. 127.0.0.1 only, random port. */
function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
        let rel = urlPath === "/" || urlPath === "" ? "index.html" : urlPath.replace(/^\/+/, "");
        const filePath = path.normalize(path.join(DIST, rel));
        if (!filePath.startsWith(DIST)) {
          res.writeHead(403).end("forbidden");
          return;
        }
        fs.stat(filePath, (err, st) => {
          if (err || !st.isFile()) {
            // SPA fallback: unknown paths serve index.html (router takes over)
            if (!path.extname(filePath)) {
              const idx = path.join(DIST, "index.html");
              fs.readFile(idx, (e2, data) => {
                if (e2) {
                  res.writeHead(500).end("index.html missing");
                  return;
                }
                res.writeHead(200, { "Content-Type": MIME[".html"] });
                res.end(data);
              });
              return;
            }
            res.writeHead(404).end("not found");
            return;
          }
          res.writeHead(200, {
            "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
            "Content-Length": st.size,
            // local-only, always fresh (the bundle is immutable per build anyway)
            "Cache-Control": "no-cache",
          });
          fs.createReadStream(filePath).pipe(res);
        });
      } catch (e) {
        try {
          res.writeHead(500).end(String(e));
        } catch {
          /* ignore */
        }
      }
    });
    server.on("error", reject);
    // port 0 = OS-assigned free port (no collisions, no hard-coded ports)
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port });
    });
  });
}

let localServer = null;
let localPort = null;

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

  void win.loadURL(`http://127.0.0.1:${localPort}/`).catch((e) => {
    win.webContents
      .executeJavaScript(
        "document.body.innerHTML = '<pre style=color:red;padding:20px>Failed to load the app: ' + (window.__loadErr || 'unknown')"
      )
      .catch(() => undefined);
    console.error("loadURL failed:", e);
  });
  win.webContents.on("did-fail-load", (_e, code, desc) => {
    console.error("did-fail-load", code, desc);
  });

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

// CI/verification hook: MAYOBUILD_CDP=9222 exposes a CDP endpoint so
// automated checks can inspect the rendered DOM (and screenshot it).
if (process.env.MAYOBUILD_CDP) {
  app.commandLine.appendSwitch("remote-debugging-port", process.env.MAYOBUILD_CDP);
}

app.whenReady().then(async () => {
  try {
    const started = await startServer();
    localServer = started.server;
    localPort = started.port;
    if (!Number.isInteger(localPort) || localPort < 1) {
      throw new Error("Local shell server did not provide a valid port");
    }
    const indexPath = path.join(DIST, "index.html");
    await fs.promises.access(indexPath, fs.constants.R_OK);
  } catch (e) {
    console.error("Could not start local server:", e);
    app.quit();
    return;
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  try {
    localServer?.close();
  } catch {
    /* ignore */
  }
});
