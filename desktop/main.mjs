import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, Menu } from "electron";
import { startDesktopServer } from "./server.mjs";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const ALLOWED_DRONE_NAME = /^(?:mambo_|travis_|ftw_|mars_|hopper)/i;
const APP_ID = "org.wrc.hopperstudio";

let desktopServer;
let mainWindow;
let appOrigin = "";

app.enableSandbox();
app.setName("Hopper Studio");
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

function secureWebContents(contents) {
  contents.on("will-attach-webview", (event) => event.preventDefault());
  contents.on("will-navigate", (event, navigationUrl) => {
    if (!isAppUrl(navigationUrl) && !isAllowedPopupUrl(navigationUrl)) {
      event.preventDefault();
    }
  });
  contents.setWindowOpenHandler(({ url }) => {
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
      message: "Allow Hopper Studio to pair with this drone?",
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
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#111a21",
    title: "Hopper Studio",
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

  configureSession(window);
  attachBluetoothPicker(window);
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = undefined;
  });
  await window.loadURL(`${appOrigin}/?desktop=1`);
  mainWindow = window;
  return window;
}

app.on("web-contents-created", (_event, contents) => secureWebContents(contents));
app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  void desktopServer?.close().catch(() => undefined);
  desktopServer = undefined;
});

app.whenReady()
  .then(async () => {
    Menu.setApplicationMenu(null);
    await createMainWindow();
  })
  .catch(async (error) => {
    await dialog.showMessageBox({
      type: "error",
      title: "Hopper Studio could not start",
      message: "The local Hopper Studio service could not start.",
      detail: error instanceof Error ? error.message : String(error),
    });
    app.quit();
  });
