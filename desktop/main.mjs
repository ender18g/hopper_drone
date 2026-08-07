import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startDesktopServer } from "./server.mjs";

// Electron exposes its main-process API as a CommonJS built-in. Loading it
// through createRequire keeps this native ESM entry point stable across Node
// versions instead of depending on synthetic named-export detection.
const require = createRequire(import.meta.url);
const { app, BrowserWindow, dialog, Menu, shell } = require("electron");

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const branding = JSON.parse(readFileSync(join(moduleDirectory, "branding.json"), "utf8"));
const STUDIO_NAME = branding.studioName || "Drone Studio";
const ALLOWED_DRONE_NAME = /^(?:mambo_|travis_|ftw_|mars_|hopper)/i;
const APP_ID = "org.wrc.hopperstudio";
const DESKTOP_SMOKE_TEST = process.argv.includes("--desktop-smoke-test");

let desktopServer;
let mainWindow;
let appOrigin = "";

app.enableSandbox();
app.setName(STUDIO_NAME);
app.setAppUserModelId(APP_ID);

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function isAppUrl(value) {
  try {
    return new URL(value).origin === appOrigin;
  } catch {
    return false;
  }
}

function isAllowedPopupUrl(value) {
  if (value === "about:blank") return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "blob:" && parsed.origin === appOrigin;
  } catch {
    return false;
  }
}

function isAllowedExternalUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function openExternalReference(value) {
  if (!isAllowedExternalUrl(value)) return;
  void shell.openExternal(value).catch(() => undefined);
}

function presentMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function verifyRenderedInterface(window) {
  const deadline = Date.now() + 30_000;
  let status;
  while (Date.now() < deadline && !window.isDestroyed()) {
    status = await window.webContents.executeJavaScript(
      `(() => {
        const root = document.querySelector("#root");
        return {
          readyState: document.readyState,
          rootChildren: root?.childElementCount || 0,
          hasStudioName: (document.body?.innerText || "")
            .toLowerCase()
            .includes(${JSON.stringify(STUDIO_NAME.toLowerCase())}),
        };
      })()`,
      true,
    );
    if (
      window.isVisible()
      && status.readyState === "complete"
      && status.rootChildren > 0
      && status.hasStudioName
    ) {
      return;
    }
    await delay(200);
  }
  throw new Error(
    `Desktop UI did not render visibly within 30 seconds: ${JSON.stringify(status)}`,
  );
}

function secureWebContents(contents) {
  contents.on("will-attach-webview", (event) => event.preventDefault());
  contents.on("will-navigate", (event, navigationUrl) => {
    if (isAllowedExternalUrl(navigationUrl)) {
      event.preventDefault();
      openExternalReference(navigationUrl);
      return;
    }
    if (!isAppUrl(navigationUrl) && !isAllowedPopupUrl(navigationUrl)) {
      event.preventDefault();
    }
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      openExternalReference(url);
      return { action: "deny" };
    }
    if (!isAllowedPopupUrl(url)) return { action: "deny" };
    return {
      action: "allow",
      overrideBrowserWindowOptions: {
        autoHideMenuBar: true,
        backgroundColor: "#111a21",
        parent: undefined,
        webPreferences: {
          allowRunningInsecureContent: false,
          backgroundThrottling: false,
          contextIsolation: true,
          devTools: !app.isPackaged,
          navigateOnDragDrop: false,
          nodeIntegration: false,
          sandbox: true,
          safeDialogs: true,
          spellcheck: false,
          webSecurity: true,
        },
      },
    };
  });
}

function attachBluetoothPicker(window) {
  let pendingRequest = null;

  window.webContents.on(
    "select-bluetooth-device",
    (event, deviceList, selectDevice) => {
      event.preventDefault();
      if (!isAppUrl(window.webContents.getURL())) {
        selectDevice("");
        return;
      }

      if (!pendingRequest) {
        const request = {
          callback: selectDevice,
          devices: new Map(),
          timer: setTimeout(async () => {
            if (pendingRequest !== request || window.isDestroyed()) {
              if (pendingRequest === request) {
                pendingRequest = null;
                request.callback("");
              }
              return;
            }

            const devices = [...request.devices.values()]
              .sort((left, right) =>
                (left.deviceName || "").localeCompare(right.deviceName || ""))
              .slice(0, 12);
            if (devices.length === 0) {
              pendingRequest = null;
              request.callback("");
              return;
            }

            const labels = devices.map((device, index) => {
              const duplicateCount = devices.filter(
                (candidate) => candidate.deviceName === device.deviceName,
              ).length;
              const suffix = duplicateCount > 1
                ? ` · ${device.deviceId.slice(-6)}`
                : "";
              return `${device.deviceName || `Hopper ${index + 1}`}${suffix}`;
            });
            const cancelIndex = labels.length;
            const result = await dialog.showMessageBox(window, {
              type: "question",
              title: "Choose a Hopper drone",
              message: "Choose the drone you want this computer to control.",
              detail: "Only Hopper, Mambo, FTW, Travis, and Mars classroom drones are shown.",
              buttons: [...labels, "Cancel"],
              cancelId: cancelIndex,
              defaultId: 0,
              noLink: true,
            });
            if (pendingRequest !== request) return;
            pendingRequest = null;
            request.callback(
              result.response === cancelIndex
                ? ""
                : devices[result.response]?.deviceId || "",
            );
          }, 3000),
        };
        pendingRequest = request;
      }

      for (const device of deviceList) {
        if (ALLOWED_DRONE_NAME.test(device.deviceName || "")) {
          pendingRequest.devices.set(device.deviceId, device);
        }
      }
    },
  );

  window.webContents.once("destroyed", () => {
    if (!pendingRequest) return;
    clearTimeout(pendingRequest.timer);
    pendingRequest.callback("");
    pendingRequest = null;
  });
}

function configureSession(window) {
  const desktopSession = window.webContents.session;

  desktopSession.setPermissionCheckHandler(() => false);
  desktopSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  desktopSession.setBluetoothPairingHandler(async (details, callback) => {
    if (!details.frame || !isAppUrl(details.frame.url)) {
      callback({ confirmed: false });
      return;
    }
    if (details.pairingKind === "providePin") {
      callback({ confirmed: false });
      return;
    }

    const pinDetail = details.pairingKind === "confirmPin" && details.pin
      ? ` Confirm that the drone shows PIN ${details.pin}.`
      : "";
    const result = await dialog.showMessageBox(window, {
      type: "question",
      title: "Confirm Bluetooth pairing",
      message: `Allow ${STUDIO_NAME} to pair with this drone?`,
      detail: `Device ${details.deviceId}.${pinDetail}`,
      buttons: ["Pair", "Cancel"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    callback({ confirmed: result.response === 0 });
  });
}

async function createMainWindow() {
  const staticRoot = app.isPackaged
    ? join(app.getAppPath(), "student-build")
    : join(moduleDirectory, "student-build");

  if (!desktopServer) {
    desktopServer = await startDesktopServer({ staticRoot });
    appOrigin = desktopServer.origin;
  }

  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1024,
    minHeight: 700,
    // This app has a large offline bundle. Showing its native frame and matching
    // background immediately gives Windows users feedback while Chromium loads.
    show: true,
    autoHideMenuBar: true,
    backgroundColor: "#111a21",
    title: STUDIO_NAME,
    webPreferences: {
      allowRunningInsecureContent: false,
      backgroundThrottling: false,
      contextIsolation: true,
      devTools: !app.isPackaged,
      navigateOnDragDrop: false,
      nodeIntegration: false,
      sandbox: true,
      safeDialogs: true,
      spellcheck: false,
      webSecurity: true,
    },
  });
  mainWindow = window;

  configureSession(window);
  attachBluetoothPicker(window);
  window.webContents.on("render-process-gone", (_event, details) => {
    if (DESKTOP_SMOKE_TEST || window.isDestroyed()) return;
    window.show();
    void dialog.showMessageBox(window, {
      type: "error",
      title: `${STUDIO_NAME} stopped`,
      message: `${STUDIO_NAME} could not display its interface.`,
      detail: `The renderer process ended unexpectedly (${details.reason}, code ${details.exitCode}).`,
    });
  });
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = undefined;
  });
  await window.loadURL(`${appOrigin}/?desktop=1`);
  return window;
}

app.on("web-contents-created", (_event, contents) => secureWebContents(contents));
app.on("second-instance", presentMainWindow);
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  void desktopServer?.close().catch(() => undefined);
  desktopServer = undefined;
});

app.whenReady()
  .then(async () => {
    Menu.setApplicationMenu(null);
    const window = await createMainWindow();
    if (DESKTOP_SMOKE_TEST) {
      await verifyRenderedInterface(window);
      app.exit(0);
    }
  })
  .catch(async (error) => {
    if (DESKTOP_SMOKE_TEST) {
      console.error(error);
      app.exit(1);
      return;
    }
    await dialog.showMessageBox({
      type: "error",
      title: `${STUDIO_NAME} could not start`,
      message: `The local ${STUDIO_NAME} service could not start.`,
      detail: error instanceof Error ? error.message : String(error),
    });
    app.quit();
  });
