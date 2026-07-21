"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { WorkspaceSvg } from "blockly";
import {
  createEmptyDroneTelemetry,
  getBluetoothApi,
  hopperDeviceRequest,
  MamboController,
  type DroneController,
  type DroneTelemetry,
} from "../lib/drone";
import { ExecutionRuntime } from "../lib/runtime";
import { SimulatedDroneController } from "../lib/simulation";
import {
  DEFAULT_COLOR_PROFILES,
  VisionRuntime,
  type ColorDetectionResult,
  type ColorProfile,
  type ColorProfiles,
  type CustomPrediction,
  type RgbPixel,
  type VisionDetection,
} from "../lib/vision";
import SimulatedDroneArea from "./SimulatedDroneArea";
import wrcLogo from "../logos/wrc_logo.png?inline";

type BlocklyToolkit = typeof import("../lib/blockly");
type ConnectionState = "disconnected" | "connecting" | "connected";
type CameraState = "offline" | "connecting" | "live" | "error";
type ModelState = "off" | "loading" | "ready" | "error";
type WifiState = "checking" | "connected" | "disconnected";
type OfflineCacheState = "saving" | "ready" | "unavailable";

const PROJECT_KEY = "hopper-studio-project-v1";
const COLOR_KEY = "hopper-studio-colors-v1";
const VISION_WIDTH_KEY = "hopper-studio-vision-width-v1";
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (...values: unknown[]) => Promise<void>;

type OfflineRefreshResult = {
  status: "updated" | "offline";
  assets?: number;
};

const requestOfflineCacheRefresh = (worker: ServiceWorker) =>
  new Promise<OfflineRefreshResult>((resolve) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => resolve({ status: "offline" }), 90_000);
    channel.port1.onmessage = (event: MessageEvent<OfflineRefreshResult>) => {
      window.clearTimeout(timeout);
      resolve(event.data);
    };
    worker.postMessage({ type: "HARD_REFRESH" }, [channel.port2]);
  });

const waitForServiceWorkerActivation = (worker: ServiceWorker) => {
  if (worker.state === "activated") return Promise.resolve(worker);
  return new Promise<ServiceWorker>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      worker.removeEventListener("statechange", handleStateChange);
      reject(new Error("The updated offline worker did not activate in time."));
    }, 90_000);
    const handleStateChange = () => {
      if (worker.state === "activated") {
        window.clearTimeout(timeout);
        worker.removeEventListener("statechange", handleStateChange);
        resolve(worker);
      } else if (worker.state === "redundant") {
        window.clearTimeout(timeout);
        worker.removeEventListener("statechange", handleStateChange);
        reject(new Error("The updated offline worker could not activate."));
      }
    };
    worker.addEventListener("statechange", handleStateChange);
  });
};

const formatLogValue = (value: unknown) => {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const clampChannel = (value: number) => Math.max(0, Math.min(255, Number(value) || 0));

const formatDetectionLabel = (label: string) =>
  label.replace(/\b\w/g, (character) => character.toUpperCase());

const formatCoordinate = (value: number) =>
  value > 0 ? `+${Math.round(value)}` : `${Math.round(value)}`;

const bluetoothErrorMessage = (error: unknown) => {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotFoundError") {
    return "No Hopper was selected. Make sure the drone is powered on and choose it from the Bluetooth list.";
  }
  if (name === "SecurityError" || name === "NotAllowedError") {
    return "Bluetooth permission is blocked. Use HTTPS or http://localhost:3000 and allow Nearby devices in the browser's site settings.";
  }
  if (name === "NetworkError") {
    return "The Hopper was found but its Bluetooth connection failed. Power-cycle the drone and try again.";
  }
  const detail = formatLogValue(error);
  return detail === "{}" ? "Bluetooth could not connect. Check the browser's Nearby devices permission." : detail;
};

type HopperStudioProps = {
  cameraProxyAvailable?: boolean;
};

export default function HopperStudio({ cameraProxyAvailable = false }: HopperStudioProps) {
  const workspaceHostRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<WorkspaceSvg | null>(null);
  const blocklyRef = useRef<BlocklyToolkit | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const controllerRef = useRef<DroneController | null>(null);
  const simulationControllerRef = useRef<SimulatedDroneController | null>(null);
  const simulatorWindowRef = useRef<Window | null>(null);
  const runtimeRef = useRef<ExecutionRuntime | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const simulationCameraRef = useRef<HTMLCanvasElement>(null);
  const simulationTelemetryCameraRef = useRef<HTMLCanvasElement>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement>(null);
  const visionRef = useRef<VisionRuntime | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const customModelInputRef = useRef<HTMLInputElement>(null);
  const objectScanBusyRef = useRef(false);
  const projectNameRef = useRef("Color Landing Lab");
  const javascriptCodeRef = useRef("");

  const [editorMode, setEditorMode] = useState<"blocks" | "javascript">("blocks");
  const [generatedCode, setGeneratedCode] = useState("");
  const [javascriptCode, setJavascriptCode] = useState("");
  const [projectName, setProjectName] = useState("Color Landing Lab");
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [connectionMode, setConnectionMode] = useState<"real" | "simulated" | null>(null);
  const [simulationController, setSimulationController] = useState<SimulatedDroneController | null>(null);
  const [simulatorWindow, setSimulatorWindow] = useState<Window | null>(null);
  const [simulatorMinimized, setSimulatorMinimized] = useState(false);
  const [droneName, setDroneName] = useState("No drone selected");
  const [telemetry, setTelemetry] = useState<DroneTelemetry>(createEmptyDroneTelemetry);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([
    "Hopper Studio ready. Connect Bluetooth, then connect the video feed.",
  ]);
  const [showConsole, setShowConsole] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [hardRefreshing, setHardRefreshing] = useState(false);
  const [offlineCacheState, setOfflineCacheState] = useState<OfflineCacheState>("saving");

  const [cameraAddress, setCameraAddress] = useState("http://192.168.2.1/");
  const [cameraSource, setCameraSource] = useState<string | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>("offline");
  const [wifiState, setWifiState] = useState<WifiState>("disconnected");
  const [visionWidth, setVisionWidth] = useState(390);
  const [profiles, setProfiles] = useState<ColorProfiles>(DEFAULT_COLOR_PROFILES);
  const [activeProfile, setActiveProfile] = useState<keyof ColorProfiles>("red");
  const [coverage, setCoverage] = useState<number | null>(null);
  const [colorDetection, setColorDetection] = useState<ColorDetectionResult | null>(null);
  const [simulatorVisionMode, setSimulatorVisionMode] = useState<"object" | "color" | null>(null);
  const [centerPixel, setCenterPixel] = useState<RgbPixel | null>(null);
  const [colorScanEnabled, setColorScanEnabled] = useState(false);
  const [modelState, setModelState] = useState<ModelState>("off");
  const [objectScanEnabled, setObjectScanEnabled] = useState(false);
  const [detections, setDetections] = useState<VisionDetection[]>([]);
  const [customModelState, setCustomModelState] = useState<ModelState>("off");
  const [customLabels, setCustomLabels] = useState<string[]>([]);
  const [customPredictions, setCustomPredictions] = useState<CustomPrediction[]>([]);
  const simulationConnected = connectionMode === "simulated";
  const cameraLive = cameraState === "live" || simulationConnected;

  const appendLog = useCallback((...values: unknown[]) => {
    const line = values.map(formatLogValue).join(" ");
    setLogs((current) => [...current.slice(-99), line]);
  }, []);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const openSimulatorWindow = useCallback(() => {
    const availableWidth = window.screen.availWidth || 1440;
    const availableHeight = window.screen.availHeight || 900;
    const popupWidth = Math.min(1280, Math.max(760, Math.round(availableWidth * 0.68)));
    const popupHeight = Math.min(900, Math.max(620, Math.round(availableHeight * 0.86)));
    const popupLeft = Math.max(0, availableWidth - popupWidth - 24);
    const popup = window.open(
      "",
      "hopper-simulated-drone",
      `popup=yes,width=${popupWidth},height=${popupHeight},left=${popupLeft},top=32,resizable=yes,scrollbars=yes`,
    );
    if (!popup) {
      notify("Allow pop-ups for Hopper Studio, then connect the simulated drone again.");
      return null;
    }

    popup.document.title = "Hopper Studio · Simulated Drone Room";
    popup.document.documentElement.lang = "en";
    popup.document.head.replaceChildren();
    const base = popup.document.createElement("base");
    base.href = document.baseURI;
    popup.document.head.appendChild(base);
    document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach((stylesheet) => {
      const link = popup.document.createElement("link");
      link.rel = "stylesheet";
      link.href = stylesheet.href;
      popup.document.head.appendChild(link);
    });
    document.querySelectorAll<HTMLStyleElement>("style").forEach((stylesheet) => {
      popup.document.head.appendChild(stylesheet.cloneNode(true));
    });
    popup.document.body.replaceChildren();
    popup.document.body.className = "sim-popup-body";
    popup.focus();
    simulatorWindowRef.current = popup;
    setSimulatorWindow(popup);
    setSimulatorMinimized(false);
    return popup;
  }, [notify]);

  const closeSimulatorWindow = useCallback(() => {
    const popup = simulatorWindowRef.current;
    simulatorWindowRef.current = null;
    setSimulatorWindow(null);
    if (popup && !popup.closed) popup.close();
  }, []);

  const persistProject = useCallback(
    (showConfirmation = false) => {
      const workspace = workspaceRef.current;
      const toolkit = blocklyRef.current;
      if (!workspace || !toolkit) return;
      const project = {
        version: 1,
        name: projectNameRef.current,
        workspace: toolkit.saveWorkspace(workspace),
        javascriptCode: javascriptCodeRef.current,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(PROJECT_KEY, JSON.stringify(project));
      if (showConfirmation) notify("Project saved on this computer");
    },
    [notify],
  );

  const hardRefresh = useCallback(async () => {
    if (hardRefreshing) return;
    persistProject(false);
    setHardRefreshing(true);
    setOfflineCacheState("saving");
    notify("Checking for the newest Hopper Studio files…");
    try {
      if (!("serviceWorker" in navigator) || !window.isSecureContext) {
        setOfflineCacheState("unavailable");
        window.location.reload();
        return;
      }
      const serviceWorkerUrl = new URL("sw.js", document.baseURI);
      const scopeUrl = new URL("./", document.baseURI);
      let registration = await navigator.serviceWorker.getRegistration(scopeUrl.href);
      registration ??= await navigator.serviceWorker.register(serviceWorkerUrl.href, {
        scope: scopeUrl.pathname,
        updateViaCache: "none",
      });
      await registration.update().catch(() => undefined);
      const updatingWorker = registration.installing || registration.waiting;
      const activatedUpdate = updatingWorker
        ? await waitForServiceWorkerActivation(updatingWorker).catch(() => undefined)
        : undefined;
      const worker = activatedUpdate || registration.active || navigator.serviceWorker.controller;
      if (!worker) {
        window.location.reload();
        return;
      }
      const result = await requestOfflineCacheRefresh(worker);
      setOfflineCacheState("ready");
      notify(
        result.status === "updated"
          ? `Newest Hopper Studio files saved${result.assets ? ` · ${result.assets} assets` : ""}. Reloading…`
          : "Site unavailable — reopening the saved offline copy.",
      );
      window.setTimeout(() => window.location.reload(), 650);
    } catch {
      setOfflineCacheState("ready");
      notify("Site unavailable — reopening the saved offline copy.");
      window.setTimeout(() => window.location.reload(), 650);
    }
  }, [hardRefreshing, notify, persistProject]);

  useEffect(() => {
    projectNameRef.current = projectName;
  }, [projectName]);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) {
      const unavailableTimer = window.setTimeout(() => setOfflineCacheState("unavailable"), 0);
      return () => window.clearTimeout(unavailableTimer);
    }
    const registerOfflineApp = () => {
      const serviceWorkerUrl = new URL("sw.js", document.baseURI);
      const scopeUrl = new URL("./", document.baseURI);
      void navigator.serviceWorker.register(serviceWorkerUrl.href, {
        scope: scopeUrl.pathname,
        updateViaCache: "none",
      }).then(() => navigator.serviceWorker.ready)
        .then(() => {
          setOfflineCacheState("ready");
          appendLog("Offline app copy ready. The WRC logo checks for a fresh version.");
        })
        .catch(() => {
          setOfflineCacheState("unavailable");
          appendLog("Offline app copy could not be prepared in this browser.");
        });
    };
    if (document.readyState === "complete") registerOfflineApp();
    else window.addEventListener("load", registerOfflineApp, { once: true });
    return () => window.removeEventListener("load", registerOfflineApp);
  }, [appendLog]);

  useEffect(() => {
    javascriptCodeRef.current = javascriptCode;
  }, [javascriptCode]);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      if (!workspaceHostRef.current) return;
      const toolkit = await import("../lib/blockly");
      if (disposed || !workspaceHostRef.current) return;
      blocklyRef.current = toolkit;
      const workspace = toolkit.createHopperWorkspace(workspaceHostRef.current);
      workspaceRef.current = workspace;

      const savedProject = localStorage.getItem(PROJECT_KEY);
      if (savedProject) {
        try {
          const project = JSON.parse(savedProject) as {
            name?: string;
            workspace?: object;
            javascriptCode?: string;
          };
          if (project.workspace) toolkit.restoreWorkspace(workspace, project.workspace);
          if (project.name) setProjectName(project.name);
          if (project.javascriptCode) setJavascriptCode(project.javascriptCode);
        } catch {
          appendLog("Saved project could not be read; opened a fresh workspace.");
        }
      }

      const refreshCode = () => {
        try {
          setGeneratedCode(toolkit.generateWorkspaceCode(workspace));
          if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current);
          autosaveTimerRef.current = window.setTimeout(() => persistProject(false), 500);
        } catch (error) {
          appendLog("Code preview:", error);
        }
      };
      workspace.addChangeListener(refreshCode);
      refreshCode();

      const resize = () => toolkit.Blockly.svgResize(workspace);
      window.addEventListener("resize", resize);
      window.setTimeout(resize, 50);
      return () => window.removeEventListener("resize", resize);
    })();

    return () => {
      disposed = true;
      if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current);
      workspaceRef.current?.dispose();
      workspaceRef.current = null;
    };
  }, [appendLog, persistProject]);

  useEffect(() => {
    const restorePreferences = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(COLOR_KEY);
        if (saved) setProfiles(JSON.parse(saved) as ColorProfiles);
        const savedVisionWidth = Number(localStorage.getItem(VISION_WIDTH_KEY));
        if (Number.isFinite(savedVisionWidth) && savedVisionWidth >= 330) {
          setVisionWidth(Math.min(720, savedVisionWidth));
        }
      } catch {
        // Keep safe defaults if prior local preferences are malformed.
      }
    }, 0);

    const vision = new VisionRuntime(
      () => simulationControllerRef.current ? simulationCameraRef.current : imageRef.current,
      () => analysisCanvasRef.current,
      setModelState,
      (nextDetections) => {
        setDetections(nextDetections);
        setSimulatorVisionMode("object");
      },
      setCustomModelState,
      setCustomPredictions,
      (result) => {
        setColorDetection(result);
        setSimulatorVisionMode("color");
      },
    );
    visionRef.current = vision;
    return () => {
      window.clearTimeout(restorePreferences);
      simulationControllerRef.current?.disconnect();
      simulatorWindowRef.current?.close();
      vision.dispose();
      visionRef.current = null;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(COLOR_KEY, JSON.stringify(profiles));
    visionRef.current?.setProfiles(profiles);
  }, [profiles]);

  useEffect(() => {
    if (!simulatorWindow) return;
    const handleWindowClosed = () => {
      if (simulatorWindowRef.current !== simulatorWindow) return;
      simulatorWindowRef.current = null;
      setSimulatorWindow(null);
      setSimulatorMinimized(true);
    };
    simulatorWindow.addEventListener("pagehide", handleWindowClosed);
    const interval = window.setInterval(() => {
      if (simulatorWindow.closed) handleWindowClosed();
    }, 400);
    return () => {
      simulatorWindow.removeEventListener("pagehide", handleWindowClosed);
      window.clearInterval(interval);
    };
  }, [simulatorWindow]);

  useEffect(() => {
    localStorage.setItem(VISION_WIDTH_KEY, String(visionWidth));
    const workspace = workspaceRef.current;
    const toolkit = blocklyRef.current;
    if (workspace && toolkit) window.setTimeout(() => toolkit.Blockly.svgResize(workspace), 0);
  }, [visionWidth]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    const toolkit = blocklyRef.current;
    if (editorMode === "blocks" && workspace && toolkit) {
      window.setTimeout(() => toolkit.Blockly.svgResize(workspace), 0);
    }
  }, [editorMode]);

  const checkWifi = useCallback(async (showChecking = true) => {
    if (showChecking) setWifiState("checking");
    try {
      if (!cameraProxyAvailable) {
        const response = await fetch("http://192.168.2.1/", {
          cache: "no-store",
          mode: "no-cors",
          signal: AbortSignal.timeout(3500),
        });
        if (!response) throw new Error("No Hopper Wi-Fi response");
      } else {
        const response = await fetch(`/api/camera/status?t=${Date.now()}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(4500),
        });
        const status = await response.json() as { connected?: boolean };
        if (!response.ok || !status.connected) throw new Error("No Hopper Wi-Fi response");
      }
      setWifiState("connected");
      return true;
    } catch {
      setWifiState("disconnected");
      return false;
    }
  }, [cameraProxyAvailable]);

  const disconnectSimulation = useCallback(async () => {
    runtimeRef.current?.stop();
    closeSimulatorWindow();
    const controller = simulationControllerRef.current;
    if (controller) {
      controller.cancelRunFlag = true;
      controller.disconnect();
    }
    simulationControllerRef.current = null;
    setSimulationController(null);
    if (controllerRef.current === controller) controllerRef.current = null;
    visionRef.current?.setSyntheticDetectionProvider(null);
    setConnectionMode(null);
    setSimulatorMinimized(false);
    setTelemetry(createEmptyDroneTelemetry());
    setCameraState("offline");
    setDetections([]);
    setColorDetection(null);
    setSimulatorVisionMode(null);
    setCenterPixel(null);
    setRunning(false);
    appendLog("Simulated drone disconnected. Your blocks are unchanged and ready for a real Hopper.");
  }, [appendLog, closeSimulatorWindow]);

  const connectSimulation = async () => {
    if (simulationControllerRef.current) {
      await disconnectSimulation();
      return;
    }
    if (!openSimulatorWindow()) return;
    if (controllerRef.current) {
      runtimeRef.current?.stop();
      controllerRef.current.disconnect();
      controllerRef.current = null;
      setConnectionState("disconnected");
      setDroneName("No drone selected");
    }
    const controller = new SimulatedDroneController();
    controller.onTelemetry = setTelemetry;
    controller.onEvent = (eventName) => appendLog("Simulator event:", eventName);
    simulationControllerRef.current = controller;
    setSimulationController(controller);
    controllerRef.current = controller;
    visionRef.current?.setSyntheticDetectionProvider((width, height) =>
      controller.getSyntheticDetections(width, height)
    );
    controller.connect();
    setConnectionMode("simulated");
    setSimulatorMinimized(false);
    setDetections([]);
    setColorDetection(null);
    setSimulatorVisionMode(null);
    setCameraState("live");
    setDroneName("Hopper Simulator");
    appendLog("Connected to the simulated Hopper. Run the same blocks you use with the real drone.");
  };

  const connectDrone = async () => {
    if (simulationControllerRef.current) await disconnectSimulation();
    const bluetooth = getBluetoothApi();
    if (!bluetooth) {
      notify(
        window.isSecureContext
          ? "Web Bluetooth is unavailable. Use desktop Edge or Chrome and allow Nearby devices."
          : "Bluetooth requires HTTPS or http://localhost:3000; a double-clicked HTML file may be blocked.",
      );
      return;
    }
    try {
      setConnectionState("connecting");
      appendLog("Looking for a Hopper drone…");
      const device = await bluetooth.requestDevice(hopperDeviceRequest);
      const controller = new MamboController(device);
      controllerRef.current = controller;
      controller.onTelemetry = setTelemetry;
      controller.onEvent = (eventName) => appendLog("Drone event:", eventName);
      device.addEventListener("gattserverdisconnected", () => {
        setConnectionState("disconnected");
        setConnectionMode((current) => current === "real" ? null : current);
        setTelemetry((current) => ({ ...current, connected: false }));
        appendLog("Drone Bluetooth disconnected.");
      });
      await controller.connect();
      setConnectionState("connected");
      setConnectionMode("real");
      setDroneName(device.name || "Hopper drone");
      appendLog("Bluetooth connected to", device.name || "Hopper drone");
    } catch (error) {
      controllerRef.current?.disconnect();
      controllerRef.current = null;
      setConnectionState("disconnected");
      const message = bluetoothErrorMessage(error);
      appendLog("Bluetooth:", message);
      notify(message);
    }
  };

  const disconnectDrone = async () => {
    runtimeRef.current?.stop();
    controllerRef.current?.disconnect();
    controllerRef.current = null;
    setConnectionState("disconnected");
    setConnectionMode(null);
    setDroneName("No drone selected");
    setTelemetry(createEmptyDroneTelemetry());
    appendLog("Drone disconnected.");
  };

  const runProgram = async () => {
    if (running) return;
    const controller = controllerRef.current;
    const vision = visionRef.current;
    if (!controller || !connectionMode || !telemetry.connected) {
      notify("Connect a real or simulated Hopper before running code");
      return;
    }
    if (!vision) return;

    const code =
      editorMode === "blocks"
        ? blocklyRef.current?.generateWorkspaceCode(workspaceRef.current!) || ""
        : javascriptCode;
    if (!code.trim()) {
      notify("Add some blocks or JavaScript first");
      return;
    }

    const runtime = new ExecutionRuntime(
      (error) => appendLog("Event error:", error),
      () => {
        controller.cancelRunFlag = true;
      },
      (blockId) => workspaceRef.current?.highlightBlock(blockId),
    );
    runtimeRef.current = runtime;
    setRunning(true);
    setShowConsole(true);
    appendLog("▶ Program started");

    const programConsole = {
      log: (...values: unknown[]) => appendLog(...values),
      warn: (...values: unknown[]) => appendLog("Warning:", ...values),
      error: (...values: unknown[]) => appendLog("Error:", ...values),
    };

    try {
      await controller.startRun();
      const execute = new AsyncFunction("drone", "vision", "runtime", "console", code);
      await execute(controller, vision, runtime, programConsole);
      if (runtime.hasEvents && !runtime.stopped) {
        appendLog("Listening for events. Press Stop when finished.");
        await runtime.waitUntilStopped();
      }
      if (!runtime.stopped) {
        await controller.stopRun();
        runtime.stop();
        appendLog("■ Program complete — landing command sent");
      }
    } catch (error) {
      if ((error as Error).message !== "Program stopped") appendLog("Program error:", error);
      if (!runtime.stopped) {
        runtime.stop();
        await controller.forceLand().catch(() => undefined);
      }
    } finally {
      runtimeRef.current = null;
      setRunning(false);
    }
  };

  const stopProgram = async () => {
    const controller = controllerRef.current;
    runtimeRef.current?.stop();
    if (controller) {
      controller.cancelRunFlag = true;
      appendLog("Stopping program — emergency landing…");
      await controller.forceLand().catch((error) => appendLog("Landing:", error));
    }
    setRunning(false);
  };

  const emergencyCutoff = async () => {
    const controller = controllerRef.current;
    if (!controller) return;
    if (!window.confirm("Emergency only: stop the motors immediately?")) return;
    runtimeRef.current?.stop();
    controller.cancelRunFlag = true;
    await controller.cutoff().catch((error) => appendLog("Motor cutoff:", error));
    setRunning(false);
    appendLog("⚠ Emergency motor cutoff sent");
  };

  const connectCamera = () => {
    try {
      const cameraUrl = new URL(cameraAddress);
      if (cameraUrl.protocol !== "http:") throw new Error("Camera address must use http://");
      setCameraState("connecting");
      setWifiState("checking");
      setDetections([]);
      setCenterPixel(null);
      const source = cameraProxyAvailable
        ? `/api/camera?url=${encodeURIComponent(cameraUrl.href)}&t=${Date.now()}`
        : cameraUrl.href;
      setCameraSource(source);
      appendLog("Connecting to camera at", cameraUrl.href);
      void checkWifi();
    } catch (error) {
      setCameraState("error");
      appendLog("Camera:", error);
    }
  };

  const scanColor = useCallback(() => {
    try {
      const result = visionRef.current?.colorCoverage(activeProfile) ?? null;
      setCoverage(result);
      return result;
    } catch (error) {
      setColorScanEnabled(false);
      appendLog("Color scan:", error);
      return null;
    }
  }, [activeProfile, appendLog]);

  useEffect(() => {
    if (!colorScanEnabled) return;
    scanColor();
    const interval = window.setInterval(scanColor, 750);
    return () => window.clearInterval(interval);
  }, [colorScanEnabled, scanColor]);

  useEffect(() => {
    if (!cameraLive) return;
    const sample = () => {
      try {
        setCenterPixel(visionRef.current?.sampleCenterPixel() ?? null);
      } catch {
        setCenterPixel(null);
      }
    };
    sample();
    const interval = window.setInterval(sample, 500);
    return () => window.clearInterval(interval);
  }, [cameraLive]);

  useEffect(() => {
    if (!cameraLive) return;
    const timer = window.setTimeout(scanColor, 70);
    return () => window.clearTimeout(timer);
  }, [activeProfile, cameraLive, profiles, scanColor]);

  const scanObjects = useCallback(async () => {
    if (objectScanBusyRef.current) return;
    objectScanBusyRef.current = true;
    try {
      await visionRef.current?.detectObjects(0.55);
    } catch (error) {
      setObjectScanEnabled(false);
      appendLog("Object detection:", error);
    } finally {
      objectScanBusyRef.current = false;
    }
  }, [appendLog]);

  const toggleObjectScan = async () => {
    if (objectScanEnabled) {
      setObjectScanEnabled(false);
      return;
    }
    try {
      if (!simulationControllerRef.current) await visionRef.current?.loadObjectModel();
      setObjectScanEnabled(true);
      await scanObjects();
    } catch (error) {
      appendLog("Object model:", error);
    }
  };

  useEffect(() => {
    if (!objectScanEnabled) return;
    const interval = window.setInterval(() => void scanObjects(), 1800);
    return () => window.clearInterval(interval);
  }, [objectScanEnabled, scanObjects]);

  const loadCustomModel = async (files: FileList | null) => {
    if (!files?.length) return;
    const selected = Array.from(files);
    const metadataFile = selected.find((file) => file.name.toLowerCase() === "metadata.json");
    const modelFile = selected.find(
      (file) => file.name.toLowerCase().endsWith(".json") && file !== metadataFile,
    );
    const weightsFile = selected.find((file) => file.name.toLowerCase().endsWith(".bin"));

    if (!modelFile || !weightsFile || !metadataFile) {
      notify("Select model.json, weights.bin, and metadata.json together");
      if (customModelInputRef.current) customModelInputRef.current.value = "";
      return;
    }

    try {
      const labels = await visionRef.current?.loadCustomModel(
        modelFile,
        weightsFile,
        metadataFile,
      );
      setCustomLabels(labels || []);
      appendLog("Teachable Machine model loaded:", (labels || []).join(", "));
      notify(`Custom model ready · ${labels?.length || 0} labels`);
    } catch (error) {
      setCustomLabels([]);
      appendLog("Custom model:", error);
      notify("That Teachable Machine model could not be loaded");
    } finally {
      if (customModelInputRef.current) customModelInputRef.current.value = "";
    }
  };

  const scanCustomModel = async () => {
    try {
      await visionRef.current?.classifyCustomModel();
    } catch (error) {
      appendLog("Custom model:", error);
    }
  };

  const clampVisionWidth = useCallback((width: number) => {
    const available = Math.max(330, window.innerWidth - 570);
    return Math.round(Math.max(330, Math.min(720, available, width)));
  }, []);

  useEffect(() => {
    const fitVisionDeck = () => setVisionWidth((current) => clampVisionWidth(current));
    fitVisionDeck();
    window.addEventListener("resize", fitVisionDeck);
    return () => window.removeEventListener("resize", fitVisionDeck);
  }, [clampVisionWidth]);

  const beginVisionResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (window.innerWidth <= 820) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = visionWidth;
    document.body.classList.add("resizing-vision");

    const move = (moveEvent: PointerEvent) => {
      setVisionWidth(clampVisionWidth(startWidth + startX - moveEvent.clientX));
    };
    const finish = () => {
      document.body.classList.remove("resizing-vision");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };

  const resizeVisionWithKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const change = event.key === "ArrowLeft" ? 32 : -32;
    setVisionWidth((current) => clampVisionWidth(current + change));
  };

  const updateProfile = (
    channel: "r" | "g" | "b",
    side: "Min" | "Max",
    value: number,
  ) => {
    const key = `${channel}${side}` as keyof ColorProfile;
    const oppositeKey = `${channel}${side === "Min" ? "Max" : "Min"}` as keyof ColorProfile;
    setProfiles((current) => ({
      ...current,
      [activeProfile]: {
        ...current[activeProfile],
        [key]:
          side === "Min"
            ? Math.min(clampChannel(value), current[activeProfile][oppositeKey])
            : Math.max(clampChannel(value), current[activeProfile][oppositeKey]),
      },
    }));
  };

  const newProject = () => {
    if (!window.confirm("Start a fresh project? Your saved project will stay on this computer.")) return;
    const workspace = workspaceRef.current;
    const toolkit = blocklyRef.current;
    if (workspace && toolkit) toolkit.loadDefaultWorkspace(workspace);
    setProjectName("Untitled Hopper Project");
    setJavascriptCode("");
    notify("Fresh project opened");
  };

  const downloadProject = () => {
    const workspace = workspaceRef.current;
    const toolkit = blocklyRef.current;
    if (!workspace || !toolkit) return;
    const contents = JSON.stringify(
      {
        version: 1,
        name: projectName,
        workspace: toolkit.saveWorkspace(workspace),
        javascriptCode,
      },
      null,
      2,
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
    link.download = `${projectName.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "hopper-project"}.hopper.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const importProject = async (file: File | undefined) => {
    if (!file) return;
    try {
      const project = JSON.parse(await file.text()) as {
        name?: string;
        workspace?: object;
        javascriptCode?: string;
      };
      if (!project.workspace) throw new Error("This file has no block workspace.");
      blocklyRef.current?.restoreWorkspace(workspaceRef.current!, project.workspace);
      setProjectName(project.name || "Imported Hopper Project");
      setJavascriptCode(project.javascriptCode || "");
      notify("Project imported");
    } catch (error) {
      appendLog("Import:", error);
      notify("That project file could not be opened");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const activeRange = profiles[activeProfile];
  const telemetryLive = telemetry.connected || cameraLive;
  const modelLabel =
    simulationConnected
      ? objectScanEnabled
        ? "Scanning simulation every 1.8s"
        : "Simulation labels ready"
      : modelState === "loading"
      ? "Loading local model…"
      : modelState === "ready"
        ? objectScanEnabled
          ? "Scanning every 1.8s"
          : "Model ready"
        : modelState === "error"
          ? "Model unavailable"
          : "Off — zero CPU use";

  const connectionLabel =
    connectionState === "connected"
      ? droneName
      : connectionState === "connecting"
        ? "Pairing…"
        : "Connect drone";

  const detectionSummary = useMemo(
    () =>
      detections.map((item, index) => ({
        id: `${item.class}-${index}`,
        label: formatDetectionLabel(item.class),
        confidence: Math.round(item.score * 100),
        x: formatCoordinate(item.centerX),
        y: formatCoordinate(item.centerY),
      })),
    [detections],
  );
  const customPredictionSummary = useMemo(
    () =>
      [...customPredictions]
        .sort((left, right) => right.probability - left.probability)
        .map((item) => `${item.className} ${Math.round(item.probability * 100)}%`),
    [customPredictions],
  );
  const batteryTone =
    telemetry.batteryLevel === null
      ? "unknown"
      : telemetry.batteryLevel <= 20
        ? "red"
        : telemetry.batteryLevel <= 50
          ? "yellow"
          : "green";
  const workspaceStyle = {
    "--vision-width": `${visionWidth}px`,
  } as CSSProperties;
  return (
    <main className="studio-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <button
            type="button"
            className={`wrc-refresh-button ${hardRefreshing ? "refreshing" : ""}`}
            onClick={() => void hardRefresh()}
            disabled={hardRefreshing}
            aria-label="Hard refresh Hopper Studio and update its offline files"
            title="Hard refresh: check for and save the newest Hopper Studio files"
          >
            <img src={wrcLogo} alt="World Robotics Championship" className="wrc-logo" />
            <span aria-hidden="true">↻</span>
          </button>
          <span className="brand-divider" />
          <div>
            <div className="brand-name">HOPPER STUDIO</div>
            <div className="brand-subtitle">FLIGHT + VISION LAB</div>
          </div>
        </div>
        <div className="topbar-center">
          <span className={`local-pill ${offlineCacheState}`}>
            <i /> {offlineCacheState === "ready"
              ? "LOCAL · OFFLINE READY"
              : offlineCacheState === "saving"
                ? "LOCAL · SAVING OFFLINE"
                : "LOCAL · ONLINE ONLY"}
          </span>
          <span className="project-label">PROJECT</span>
          <input
            className="project-title-input"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            aria-label="Project name"
          />
        </div>
        <div className="connection-cluster">
          <button
            className={`wifi-status-box ${wifiState}`}
            onClick={() => void checkWifi()}
            title="Check whether the Hopper camera responds at 192.168.2.1"
          >
            <span className="wifi-mark"><i /><i /><i /></span>
            <span>
              <b>{wifiState === "connected" ? "Wi-Fi ready" : wifiState === "checking" ? "Checking Wi-Fi…" : "Wi-Fi offline"}</b>
              <small>192.168.2.1</small>
            </span>
            <i className="wifi-status-dot" />
          </button>
          <div className={`battery-chip ${batteryTone}`} aria-label={`Battery ${telemetry.batteryLevel ?? "unknown"}${telemetry.batteryLevel === null ? "" : "%"}`}>
            <span className="battery-icon">
              <i style={{ width: `${telemetry.batteryLevel ?? 0}%` }} />
            </span>
            <span>{telemetry.batteryLevel === null ? "—" : `${telemetry.batteryLevel}%`}</span>
          </div>
          {connectionMode === "real" && connectionState === "connected" ? (
            <button className="connect-button connected" onClick={() => void disconnectDrone()}>
              <span className="bluetooth-mark">ᛒ</span>
              <span><b>{connectionLabel}</b><small>Bluetooth connected</small></span>
              <i className="status-dot" />
            </button>
          ) : (
            <button className="connect-button" onClick={() => void connectDrone()} disabled={connectionState === "connecting"}>
              <span className="bluetooth-mark">ᛒ</span>
              <span><b>{connectionLabel}</b><small>Bluetooth flight control</small></span>
            </button>
          )}
          <button
            className={`sim-connect-button ${simulationConnected ? "connected" : ""}`}
            onClick={() => void connectSimulation()}
          >
            <span className="sim-connect-icon">▦</span>
            <span>
              <b>{simulationConnected ? "Disconnect simulator" : "Connect simulated drone"}</b>
              <small>{simulationConnected ? "Simulation connected" : "10 × 7 m flight room"}</small>
            </span>
            {simulationConnected && <i className="status-dot" />}
          </button>
        </div>
      </header>

      <section className="commandbar" aria-label="Project and flight controls">
        <div className="file-actions">
          <button onClick={newProject} title="New project"><span>＋</span> New</button>
          <button onClick={() => persistProject(true)} title="Save project"><span>▣</span> Save</button>
          <button onClick={downloadProject} title="Download project"><span>⇩</span> Export</button>
          <button onClick={() => importInputRef.current?.click()} title="Import project"><span>⇧</span> Import</button>
          <input
            ref={importInputRef}
            className="visually-hidden"
            type="file"
            accept=".json,.hopper.json"
            onChange={(event) => void importProject(event.target.files?.[0])}
          />
        </div>
        <div className="editor-tabs" role="tablist" aria-label="Editor mode">
          <button
            role="tab"
            aria-selected={editorMode === "blocks"}
            className={editorMode === "blocks" ? "active" : ""}
            onClick={() => setEditorMode("blocks")}
          >
            <span className="blocks-icon">◫</span> BLOCKS
          </button>
          <button
            role="tab"
            aria-selected={editorMode === "javascript"}
            className={editorMode === "javascript" ? "active" : ""}
            onClick={() => {
              if (!javascriptCode.trim()) setJavascriptCode(generatedCode);
              setEditorMode("javascript");
            }}
          >
            <span className="code-icon">&lt;/&gt;</span> JAVASCRIPT
          </button>
        </div>
        <div className="flight-actions">
          <button className="console-button" onClick={() => setShowConsole((open) => !open)}>
            CONSOLE <span>{logs.length}</span>
          </button>
          {running ? (
            <button className="stop-button" onClick={() => void stopProgram()}><span>■</span> STOP &amp; LAND</button>
          ) : (
            <button className="run-button" onClick={() => void runProgram()}><span>▶</span> RUN PROGRAM</button>
          )}
          <button className="cutoff-button" onClick={() => void emergencyCutoff()} title="Emergency motor cutoff">
            ⚠
          </button>
        </div>
      </section>

      <section className="workspace-grid" style={workspaceStyle}>
        <div className="editor-panel">
          <div className="editor-status-strip">
            <span><i className={connectionMode ? "online" : ""} /> {connectionMode === "simulated" ? "SIMULATOR LINK READY" : connectionMode === "real" ? "DRONE LINK READY" : "DRONE LINK OFFLINE"}</span>
            <span>{telemetry.flyingState ? telemetry.flyingState.toUpperCase() : "LANDED / UNKNOWN"}</span>
            <span>AUTOSAVE ON</span>
          </div>
          <div className={`blockly-host ${editorMode === "blocks" ? "visible" : ""}`} ref={workspaceHostRef} />
          {editorMode === "javascript" && (
            <div className="javascript-editor">
              <div className="line-numbers" aria-hidden="true">
                {javascriptCode.split("\n").map((_, index) => <span key={index}>{index + 1}</span>)}
              </div>
              <textarea
                value={javascriptCode}
                onChange={(event) => setJavascriptCode(event.target.value)}
                spellCheck={false}
                aria-label="JavaScript program"
              />
            </div>
          )}
          {showConsole && (
            <div className="console-drawer">
              <div className="console-heading">
                <span><i /> PROGRAM CONSOLE</span>
                <div>
                  <button onClick={() => setLogs([])}>Clear</button>
                  <button onClick={() => setShowConsole(false)}>×</button>
                </div>
              </div>
              <div className="console-lines">
                {logs.length === 0 ? <p className="muted">Console is clear.</p> : logs.map((line, index) => (
                  <p key={`${index}-${line}`}><span>{String(index + 1).padStart(2, "0")}</span>{line}</p>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          className="vision-resize-handle"
          type="button"
          role="separator"
          aria-label="Resize Telemetry panel"
          aria-orientation="vertical"
          aria-valuemin={330}
          aria-valuemax={720}
          aria-valuenow={visionWidth}
          title="Drag left or right to resize Telemetry"
          onPointerDown={beginVisionResize}
          onKeyDown={resizeVisionWithKeyboard}
        ><i /><i /><i /></button>

        <aside className="vision-panel">
          <div className="vision-heading">
            <div>
              <span className="eyebrow">CAMERA + FLIGHT</span>
              <h1>TELEMETRY</h1>
            </div>
            <span className={`live-badge ${telemetryLive ? "on" : ""}`}>
              <i /> {simulationConnected ? "SIM LIVE" : telemetry.connected ? "DRONE LIVE" : cameraLive ? "CAMERA LIVE" : "OFFLINE"}
            </span>
          </div>

          <div className="camera-frame">
            {simulationConnected ? (
              <canvas
                ref={simulationTelemetryCameraRef}
                className="simulation-telemetry-camera"
                aria-label="Simulated Hopper downward camera feed"
              />
            ) : cameraSource ? (
              <img
                ref={imageRef}
                src={cameraSource}
                alt="Hopper drone bottom camera feed"
                onLoad={() => { setCameraState("live"); setWifiState("connected"); appendLog("Camera feed is live."); }}
                onError={() => { setCameraState("error"); setWifiState("disconnected"); setCenterPixel(null); }}
              />
            ) : (
              <div className="camera-placeholder">
                <span className="camera-glyph">▣</span>
                <b>CAMERA STANDBY</b>
                <small>Join the Hopper Wi-Fi, then connect video.</small>
              </div>
            )}
            <div className="reticle"><i /><b /></div>
            <div className="frame-corners"><i /><i /><i /><i /></div>
            {detections.map((detection, index) => (
              <div
                className="detection-box"
                key={`${detection.class}-${index}`}
                style={{
                  left: `${(detection.bbox[0] / detection.frameWidth) * 100}%`,
                  top: `${(detection.bbox[1] / detection.frameHeight) * 100}%`,
                  width: `${(detection.bbox[2] / detection.frameWidth) * 100}%`,
                  height: `${(detection.bbox[3] / detection.frameHeight) * 100}%`,
                }}
              >
                <span>{detection.class} {Math.round(detection.score * 100)}%</span>
              </div>
            ))}
            <div className="camera-readout">
              <span>CAM · DOWN</span>
              <span>{cameraLive ? "STREAM OK" : "NO SIGNAL"}</span>
            </div>
          </div>
          <canvas ref={analysisCanvasRef} className="analysis-canvas" aria-hidden="true" />

          {simulationConnected ? (
            <div className="sim-camera-connected-row"><i /> SIMULATED DOWN CAMERA CONNECTED</div>
          ) : (
            <div className="camera-connect-row">
              <input
                value={cameraAddress}
                onChange={(event) => setCameraAddress(event.target.value)}
                aria-label="Drone camera URL"
              />
              <button onClick={connectCamera}>{cameraState === "connecting" ? "WAIT" : "CONNECT"}</button>
            </div>
          )}
          {!simulationConnected && cameraState === "error" && (
            <p className="inline-warning">
              No camera signal. Join the Hopper Wi-Fi and allow local-network access if Edge or Chrome asks.
            </p>
          )}
          {!simulationConnected && !cameraProxyAvailable && cameraLive && (
            <p className="inline-warning">
              Direct video is available. Start the local app to use color tracking or object detection.
            </p>
          )}

          <section className="vision-tool color-tool">
            <div className="tool-title">
              <span className="tool-number">01</span>
              <div><h2>COLOR TRACKER</h2><p>Fast pixel check · no neural network</p></div>
              <button
                className={`tiny-toggle ${colorScanEnabled ? "on" : ""}`}
                onClick={() => setColorScanEnabled((enabled) => !enabled)}
                aria-label="Toggle continuous color scan"
              ><i /></button>
            </div>
            <div className="profile-tabs">
              {(Object.keys(profiles) as Array<keyof ColorProfiles>).map((profile) => (
                <button
                  key={profile}
                  className={`${profile} ${activeProfile === profile ? "active" : ""}`}
                  onClick={() => { setActiveProfile(profile); setCoverage(null); }}
                >
                  <i /> {profile.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="rgb-editor">
              {(["r", "g", "b"] as const).map((channel) => (
                <div className="rgb-row" key={channel}>
                  <b>{channel.toUpperCase()}</b>
                  <label className="rgb-number">MIN <input type="number" min="0" max="255" value={activeRange[`${channel}Min`]} onChange={(event) => updateProfile(channel, "Min", Number(event.target.value))} /></label>
                  <div
                    className={`rgb-range ${channel}`}
                    style={{
                      "--range-min": `${(activeRange[`${channel}Min`] / 255) * 100}%`,
                      "--range-max": `${(activeRange[`${channel}Max`] / 255) * 100}%`,
                    } as CSSProperties}
                  >
                    <i />
                    <input
                      type="range"
                      min="0"
                      max="255"
                      value={activeRange[`${channel}Min`]}
                      onChange={(event) => updateProfile(channel, "Min", Number(event.target.value))}
                      aria-label={`${channel.toUpperCase()} minimum`}
                    />
                    <input
                      type="range"
                      min="0"
                      max="255"
                      value={activeRange[`${channel}Max`]}
                      onChange={(event) => updateProfile(channel, "Max", Number(event.target.value))}
                      aria-label={`${channel.toUpperCase()} maximum`}
                    />
                  </div>
                  <label className="rgb-number">MAX <input type="number" min="0" max="255" value={activeRange[`${channel}Max`]} onChange={(event) => updateProfile(channel, "Max", Number(event.target.value))} /></label>
                </div>
              ))}
            </div>
            <div className="center-pixel-readout">
              <span
                className="center-pixel-swatch"
                style={{
                  background: centerPixel
                    ? `rgb(${centerPixel.red} ${centerPixel.green} ${centerPixel.blue})`
                    : "#c7ccca",
                }}
              />
              <div><span>CENTER TARGET PIXEL</span><small>Put each MIN below and MAX above these values</small></div>
              <b>
                <i>R {centerPixel?.red ?? "—"}</i>
                <i>G {centerPixel?.green ?? "—"}</i>
                <i>B {centerPixel?.blue ?? "—"}</i>
              </b>
            </div>
            <div className="coverage-meter">
              <div><span>FRAME COVERAGE</span><b>{coverage === null ? "—" : `${coverage.toFixed(1)}%`}</b></div>
              <div className="meter-track"><i style={{ width: `${Math.min(100, coverage || 0)}%` }} /></div>
              <button onClick={scanColor} disabled={!cameraLive}>SCAN FRAME</button>
            </div>
          </section>

          <section className="vision-tool object-tool">
            <div className="tool-title">
              <span className="tool-number">02</span>
              <div><h2>OBJECT DETECTOR</h2><p>Local COCO-SSD · on demand only</p></div>
              <button
                className={`tiny-toggle ${objectScanEnabled ? "on" : ""}`}
                onClick={() => void toggleObjectScan()}
                aria-label="Toggle object detection"
                disabled={!cameraLive || modelState === "loading"}
              ><i /></button>
            </div>
            <div className="model-status-row">
              <span className={`model-orb ${modelState}`}><i /></span>
              <div><b>{modelLabel}</b><small>Runs entirely on this computer</small></div>
              {modelState === "ready" && <button onClick={() => void scanObjects()}>SCAN ONCE</button>}
            </div>
            {detectionSummary.length > 0 ? (
              <div className="detection-chips object-detections">
                {detectionSummary.map((detection) => (
                  <span key={detection.id}>
                    <b>{detection.label} — {detection.confidence}%</b>
                    <small>X {detection.x} · Y {detection.y}</small>
                  </span>
                ))}
              </div>
            ) : (
              <p className="empty-detections">No labels yet. Enable the model or use a purple vision block.</p>
            )}
            <p className="coordinate-legend">
              X/Y BOX CENTER · FRAME CENTER 0,0 · RIGHT/UP POSITIVE · −100 TO +100
            </p>

            <div className="custom-model-card">
              <div>
                <span className={`custom-model-dot ${customModelState}`} />
                <div>
                  <b>TEACHABLE MACHINE</b>
                  <small>
                    {customModelState === "loading"
                      ? "Loading model files…"
                      : customModelState === "ready"
                        ? `${customLabels.length} custom labels ready`
                        : customModelState === "error"
                          ? "Model could not be loaded"
                          : "Standard image model files"}
                  </small>
                </div>
              </div>
              <div className="custom-model-actions">
                <button onClick={() => customModelInputRef.current?.click()} disabled={customModelState === "loading"}>
                  LOAD MODEL
                </button>
                {customModelState === "ready" && (
                  <button onClick={() => void scanCustomModel()} disabled={!cameraLive}>SCAN ONCE</button>
                )}
                <input
                  ref={customModelInputRef}
                  className="visually-hidden"
                  type="file"
                  accept=".json,.bin,application/json,application/octet-stream"
                  multiple
                  onChange={(event) => void loadCustomModel(event.target.files)}
                />
              </div>
              {customLabels.length > 0 && (
                <p className="custom-label-list"><b>LABELS</b> {customLabels.join(" · ")}</p>
              )}
              {customPredictionSummary.length > 0 && (
                <div className="detection-chips custom-predictions">
                  {customPredictionSummary.map((label) => <span key={label}>{label}</span>)}
                </div>
              )}
            </div>
          </section>

          <div className="vision-footnote">
            <i /> Vision blocks use the current frame. Object detection stays off until called.
          </div>
          <div className="creator-credit">
            <span>CREATED BY</span>
            <b>ALLAN ELSBERRY</b>
          </div>
        </aside>
      </section>

      {simulationConnected && simulationController && (
        <SimulatedDroneArea
          controller={simulationController}
          cameraCanvasRef={simulationCameraRef}
          telemetryCanvasRef={simulationTelemetryCameraRef}
          popupWindow={simulatorWindow}
          minimized={simulatorMinimized}
          detections={detections}
          colorDetection={colorDetection}
          visionMode={simulatorVisionMode}
          onMinimize={() => {
            closeSimulatorWindow();
            setSimulatorMinimized(true);
          }}
          onRestore={() => {
            openSimulatorWindow();
          }}
          onDisconnect={() => void disconnectSimulation()}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
