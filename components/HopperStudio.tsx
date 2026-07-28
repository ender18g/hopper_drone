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
  type ManualFlightDirection,
} from "../lib/drone";
import { ExecutionRuntime } from "../lib/runtime";
import { SimulatedDroneController } from "../lib/simulation";
import {
  VisionRuntime,
  type CustomPrediction,
  type ThresholdResult,
  type VisionScanEvent,
  type VisionScanKind,
  type VisionDetection,
} from "../lib/vision";
import {
  APRIL_TAG_IDS,
  buildAprilTagPdf,
  type AprilTagDetection,
} from "../lib/apriltags";
import {
  DEFAULT_EDITOR_MODE,
  ENABLED_EDITOR_MODES,
  LAB_NAME,
  STUDIO_NAME,
  type EditorMode,
} from "../lib/branding";
import { tokenizeJavaScript } from "../lib/javascript-highlighting";
import {
  PYTHON_STARTER_PROGRAM,
  tokenizePython,
  transpilePython,
} from "../lib/python";
import { JAVASCRIPT_STARTER_PROGRAM } from "../lib/coding-starters";
import { INFORMATION_LESSONS } from "../lib/information-lessons.metadata.generated";
import InformationLessonLauncher from "./InformationLessonLauncher";
import SimulatedDroneArea from "./SimulatedDroneArea";
import wrcLogo from "../logos/wrc_logo.png?inline";

type BlocklyToolkit = typeof import("../lib/blockly");
type ConnectionState = "disconnected" | "connecting" | "connected";
type CameraState = "offline" | "connecting" | "live" | "error";
type ModelState = "off" | "loading" | "ready" | "error";
type WifiState = "checking" | "connected" | "disconnected";
type OfflineCacheState = "saving" | "ready" | "unavailable";
type VisionTestingMode = Exclude<VisionScanKind, "custom">;

const PROJECT_KEY = "hopper-studio-project-v1";
const THRESHOLD_KEY = "hopper-studio-threshold-v1";
const OBJECT_CONFIDENCE_KEY = "hopper-studio-object-confidence-v1";
const VISION_WIDTH_KEY = "hopper-studio-vision-width-v1";
const VISION_MIN_WIDTH = 330;
const EDITOR_MIN_WIDTH = 340;
const VISION_SPLITTER_WIDTH = 9;
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

const clampPercent = (value: number) => Math.max(0, Math.min(100, Number(value) || 0));
const clampConfidencePercent = (value: number) => Math.max(1, clampPercent(value));

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

type SessionPhoto = {
  id: number;
  url: string;
  capturedAt: number;
  source: "real" | "simulated";
  width: number;
  height: number;
};

export default function HopperStudio({ cameraProxyAvailable = false }: HopperStudioProps) {
  const workspaceHostRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<WorkspaceSvg | null>(null);
  const blocklyRef = useRef<BlocklyToolkit | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const javascriptAutosaveTimerRef = useRef<number | null>(null);
  const pythonAutosaveTimerRef = useRef<number | null>(null);
  const controllerRef = useRef<DroneController | null>(null);
  const simulationControllerRef = useRef<SimulatedDroneController | null>(null);
  const simulatorWindowRef = useRef<Window | null>(null);
  const runtimeRef = useRef<ExecutionRuntime | null>(null);
  const stopProgramPromiseRef = useRef<Promise<void> | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const simulationCameraRef = useRef<HTMLCanvasElement>(null);
  const simulationTelemetryCameraRef = useRef<HTMLCanvasElement>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement>(null);
  const thresholdOverlayRef = useRef<HTMLCanvasElement>(null);
  const javascriptHighlightRef = useRef<HTMLPreElement>(null);
  const javascriptLineNumbersRef = useRef<HTMLDivElement>(null);
  const pythonHighlightRef = useRef<HTMLPreElement>(null);
  const pythonLineNumbersRef = useRef<HTMLDivElement>(null);
  const informationMenuRef = useRef<HTMLDetailsElement>(null);
  const visionRef = useRef<VisionRuntime | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const customModelInputRef = useRef<HTMLInputElement>(null);
  const objectScanBusyRef = useRef(false);
  const aprilTagScanBusyRef = useRef(false);
  const latestDetectionsRef = useRef<VisionDetection[]>([]);
  const latestThresholdRef = useRef<ThresholdResult | null>(null);
  const latestAprilTagsRef = useRef<AprilTagDetection[]>([]);
  const manualNudgeSequenceRef = useRef(0);
  const photoSequenceRef = useRef(0);
  const photoUrlsRef = useRef(new Set<string>());
  const projectNameRef = useRef("Object Detection Lab");
  const javascriptCodeRef = useRef(JAVASCRIPT_STARTER_PROGRAM);
  const pythonCodeRef = useRef(PYTHON_STARTER_PROGRAM);

  const [editorMode, setEditorMode] = useState<EditorMode>(DEFAULT_EDITOR_MODE);
  const [generatedCode, setGeneratedCode] = useState("");
  const [javascriptCode, setJavascriptCode] = useState(JAVASCRIPT_STARTER_PROGRAM);
  const [pythonCode, setPythonCode] = useState(PYTHON_STARTER_PROGRAM);
  const [projectName, setProjectName] = useState("Object Detection Lab");
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [connectionMode, setConnectionMode] = useState<"real" | "simulated" | null>(null);
  const [simulationController, setSimulationController] = useState<SimulatedDroneController | null>(null);
  const [simulatorWindow, setSimulatorWindow] = useState<Window | null>(null);
  const [simulatorInline, setSimulatorInline] = useState(false);
  const [simulatorMinimized, setSimulatorMinimized] = useState(false);
  const [droneName, setDroneName] = useState("No drone selected");
  const [telemetry, setTelemetry] = useState<DroneTelemetry>(createEmptyDroneTelemetry);
  const [running, setRunning] = useState(false);
  const [manualOverrideDirection, setManualOverrideDirection] = useState<ManualFlightDirection | null>(null);
  const [logs, setLogs] = useState<string[]>([
    `${STUDIO_NAME} ready. Connect Bluetooth, then connect the video feed.`,
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
  const [visionMaximumWidth, setVisionMaximumWidth] = useState(720);
  const [thresholdPercent, setThresholdPercent] = useState(60);
  const [thresholdInvert, setThresholdInvert] = useState(false);
  const [objectConfidencePercent, setObjectConfidencePercent] = useState(55);
  const [thresholdResult, setThresholdResult] = useState<ThresholdResult | null>(null);
  const [visionTestingMode, setVisionTestingMode] = useState<VisionTestingMode | null>(null);
  const [displayVisionMode, setDisplayVisionMode] = useState<VisionScanKind | null>(null);
  const [simulatorVisionMode, setSimulatorVisionMode] = useState<VisionScanKind | null>(null);
  const [scanEvent, setScanEvent] = useState<VisionScanEvent | null>(null);
  const [modelState, setModelState] = useState<ModelState>("off");
  const [detections, setDetections] = useState<VisionDetection[]>([]);
  const [aprilTagDetections, setAprilTagDetections] = useState<AprilTagDetection[]>([]);
  const [pdfTagId, setPdfTagId] = useState(0);
  const [simulatorDetections, setSimulatorDetections] = useState<VisionDetection[]>([]);
  const [simulatorThresholdResult, setSimulatorThresholdResult] = useState<ThresholdResult | null>(null);
  const [simulatorAprilTags, setSimulatorAprilTags] = useState<AprilTagDetection[]>([]);
  const [customModelState, setCustomModelState] = useState<ModelState>("off");
  const [customLabels, setCustomLabels] = useState<string[]>([]);
  const [customPredictions, setCustomPredictions] = useState<CustomPrediction[]>([]);
  const [missionPhotos, setMissionPhotos] = useState<SessionPhoto[]>([]);
  const javascriptTokens = useMemo(
    () => tokenizeJavaScript(javascriptCode),
    [javascriptCode],
  );
  const pythonTokens = useMemo(
    () => tokenizePython(pythonCode),
    [pythonCode],
  );
  const simulationConnected = connectionMode === "simulated";
  const cameraLive = cameraState === "live" || simulationConnected;
  const manualControlsAvailable = running
    && telemetry.connected
    && ["hovering", "flying", "flipping"].includes(telemetry.flyingState ?? "");

  const appendLog = useCallback((...values: unknown[]) => {
    const line = values.map(formatLogValue).join(" ");
    setLogs((current) => [...current.slice(-99), line]);
  }, []);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const syncJavaScriptScroll = useCallback(
    (target: HTMLTextAreaElement) => {
      if (javascriptHighlightRef.current) {
        javascriptHighlightRef.current.scrollTop = target.scrollTop;
        javascriptHighlightRef.current.scrollLeft = target.scrollLeft;
      }
      if (javascriptLineNumbersRef.current) {
        javascriptLineNumbersRef.current.scrollTop = target.scrollTop;
      }
    },
    [],
  );

  const syncPythonScroll = useCallback(
    (target: HTMLTextAreaElement) => {
      if (pythonHighlightRef.current) {
        pythonHighlightRef.current.scrollTop = target.scrollTop;
        pythonHighlightRef.current.scrollLeft = target.scrollLeft;
      }
      if (pythonLineNumbersRef.current) {
        pythonLineNumbersRef.current.scrollTop = target.scrollTop;
      }
    },
    [],
  );

  const handleCodeEditorKeyDown = useCallback(
    (
      event: ReactKeyboardEvent<HTMLTextAreaElement>,
      mode: "python" | "javascript",
    ) => {
      const textarea = event.currentTarget;
      const source = mode === "python" ? pythonCodeRef.current : javascriptCodeRef.current;
      const setSource = mode === "python" ? setPythonCode : setJavascriptCode;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      if (event.key === "Tab") {
        event.preventDefault();
        const indentation = mode === "python" ? "    " : "  ";
        const next = `${source.slice(0, start)}${indentation}${source.slice(end)}`;
        setSource(next);
        window.requestAnimationFrame(() => {
          const cursor = start + indentation.length;
          textarea.setSelectionRange(cursor, cursor);
        });
        return;
      }

      if (mode !== "python" || event.key !== "Enter" || start !== end) return;
      event.preventDefault();
      const lineStart = source.lastIndexOf("\n", start - 1) + 1;
      const currentLine = source.slice(lineStart, start);
      const existingIndent = currentLine.match(/^ */)?.[0] ?? "";
      const extraIndent = currentLine.trimEnd().endsWith(":") ? "    " : "";
      const insertion = `\n${existingIndent}${extraIndent}`;
      const next = `${source.slice(0, start)}${insertion}${source.slice(end)}`;
      setSource(next);
      window.requestAnimationFrame(() => {
        const cursor = start + insertion.length;
        textarea.setSelectionRange(cursor, cursor);
      });
    },
    [],
  );

  const clearMissionPhotos = useCallback(() => {
    if (missionPhotos.length === 0) return;
    if (!window.confirm(`Clear all ${missionPhotos.length} mission photos from this session?`)) return;
    photoUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    photoUrlsRef.current.clear();
    setMissionPhotos([]);
    appendLog("Mission photo gallery cleared.");
  }, [appendLog, missionPhotos]);

  const openSimulatorWindow = useCallback(() => {
    const useInlineSimulator = window.matchMedia(
      "(max-width: 900px), (pointer: coarse) and (max-width: 1180px)",
    ).matches;
    if (useInlineSimulator) {
      simulatorWindowRef.current = null;
      setSimulatorWindow(null);
      setSimulatorInline(true);
      setSimulatorMinimized(false);
      return true;
    }

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
      notify(`Allow pop-ups for ${STUDIO_NAME}, then connect the simulated drone again.`);
      return null;
    }

    popup.document.title = `${STUDIO_NAME} · Simulated Drone Room`;
    popup.document.documentElement.lang = "en";
    popup.document.head.replaceChildren();
    const viewport = popup.document.createElement("meta");
    viewport.name = "viewport";
    viewport.content = "width=device-width, initial-scale=1, viewport-fit=cover";
    popup.document.head.appendChild(viewport);
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
    setSimulatorInline(false);
    setSimulatorMinimized(false);
    return popup;
  }, [notify]);

  const closeSimulatorWindow = useCallback(() => {
    const popup = simulatorWindowRef.current;
    simulatorWindowRef.current = null;
    setSimulatorWindow(null);
    setSimulatorInline(false);
    if (popup && !popup.closed) popup.close();
  }, []);

  useEffect(() => {
    if (!simulatorInline || simulatorMinimized) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [simulatorInline, simulatorMinimized]);

  const persistProject = useCallback(
    (showConfirmation = false) => {
      const workspace = workspaceRef.current;
      const toolkit = blocklyRef.current;
      if (!workspace || !toolkit) return;
      const project = {
        version: 2,
        name: projectNameRef.current,
        workspace: toolkit.saveWorkspace(workspace),
        javascriptCode: javascriptCodeRef.current,
        pythonCode: pythonCodeRef.current,
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
    notify(`Checking for the newest ${STUDIO_NAME} files…`);
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
          ? `Newest ${STUDIO_NAME} files saved${result.assets ? ` · ${result.assets} assets` : ""}. Reloading…`
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
    if (!workspaceRef.current) return;
    if (javascriptAutosaveTimerRef.current !== null) {
      window.clearTimeout(javascriptAutosaveTimerRef.current);
    }
    javascriptAutosaveTimerRef.current = window.setTimeout(
      () => persistProject(false),
      500,
    );
    return () => {
      if (javascriptAutosaveTimerRef.current !== null) {
        window.clearTimeout(javascriptAutosaveTimerRef.current);
        javascriptAutosaveTimerRef.current = null;
      }
    };
  }, [javascriptCode, persistProject]);

  useEffect(() => {
    pythonCodeRef.current = pythonCode;
    if (!workspaceRef.current) return;
    if (pythonAutosaveTimerRef.current !== null) {
      window.clearTimeout(pythonAutosaveTimerRef.current);
    }
    pythonAutosaveTimerRef.current = window.setTimeout(
      () => persistProject(false),
      500,
    );
    return () => {
      if (pythonAutosaveTimerRef.current !== null) {
        window.clearTimeout(pythonAutosaveTimerRef.current);
        pythonAutosaveTimerRef.current = null;
      }
    };
  }, [persistProject, pythonCode]);

  useEffect(() => () => {
    photoUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    photoUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      if (!workspaceHostRef.current) return;
      const toolkit = await import("../lib/blockly");
      if (disposed || !workspaceHostRef.current) return;
      blocklyRef.current = toolkit;
      const workspace = toolkit.createHopperWorkspace(workspaceHostRef.current);
      workspaceRef.current = workspace;
      let seedJavascriptFromBlocks = false;

      const savedProject = localStorage.getItem(PROJECT_KEY);
      if (savedProject) {
        try {
          const project = JSON.parse(savedProject) as {
            name?: string;
            workspace?: object;
            javascriptCode?: string;
            pythonCode?: string;
          };
          if (project.workspace) toolkit.restoreWorkspace(workspace, project.workspace);
          if (project.name) setProjectName(project.name);
          if (typeof project.javascriptCode === "string") {
            javascriptCodeRef.current = project.javascriptCode;
            setJavascriptCode(project.javascriptCode);
            seedJavascriptFromBlocks = false;
          }
          if (typeof project.pythonCode === "string") {
            pythonCodeRef.current = project.pythonCode;
            setPythonCode(project.pythonCode);
          }
        } catch {
          appendLog("Saved project could not be read; opened a fresh workspace.");
        }
      }

      const refreshCode = () => {
        try {
          const nextGeneratedCode = toolkit.generateWorkspaceCode(workspace);
          setGeneratedCode(nextGeneratedCode);
          if (seedJavascriptFromBlocks) {
            javascriptCodeRef.current = nextGeneratedCode;
            setJavascriptCode(nextGeneratedCode);
            seedJavascriptFromBlocks = false;
          }
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
      if (javascriptAutosaveTimerRef.current !== null) {
        window.clearTimeout(javascriptAutosaveTimerRef.current);
      }
      if (pythonAutosaveTimerRef.current !== null) {
        window.clearTimeout(pythonAutosaveTimerRef.current);
      }
      workspaceRef.current?.dispose();
      workspaceRef.current = null;
    };
  }, [appendLog, persistProject]);

  useEffect(() => {
    const restorePreferences = window.setTimeout(() => {
      try {
        const savedThreshold = localStorage.getItem(THRESHOLD_KEY);
        if (savedThreshold) {
          const saved = JSON.parse(savedThreshold) as { threshold?: number; invert?: boolean };
          if (Number.isFinite(saved.threshold)) setThresholdPercent(clampPercent(saved.threshold ?? 60));
          setThresholdInvert(Boolean(saved.invert));
        }
        const savedObjectConfidence = Number(localStorage.getItem(OBJECT_CONFIDENCE_KEY));
        if (Number.isFinite(savedObjectConfidence)) {
          setObjectConfidencePercent(clampConfidencePercent(savedObjectConfidence));
        }
        const savedVisionWidth = Number(localStorage.getItem(VISION_WIDTH_KEY));
        if (Number.isFinite(savedVisionWidth) && savedVisionWidth >= VISION_MIN_WIDTH) {
          const available = Math.max(
            VISION_MIN_WIDTH,
            window.innerWidth - EDITOR_MIN_WIDTH - VISION_SPLITTER_WIDTH,
          );
          setVisionWidth(Math.min(available, savedVisionWidth));
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
        latestDetectionsRef.current = nextDetections;
        setDetections(nextDetections);
      },
      setCustomModelState,
      setCustomPredictions,
      (result) => {
        latestThresholdRef.current = result;
        setThresholdResult(result);
      },
      (tags) => {
        latestAprilTagsRef.current = tags;
        setAprilTagDetections(tags);
      },
      (event) => {
        setScanEvent(event);
        if (event.phase === "start") {
          setDisplayVisionMode(event.kind);
          if (simulationControllerRef.current) setSimulatorVisionMode(null);
        }
        if (event.phase === "complete" && simulationControllerRef.current) {
          setSimulatorVisionMode(event.kind);
          if (event.kind === "threshold") setSimulatorThresholdResult(latestThresholdRef.current);
          if (event.kind === "object") setSimulatorDetections(latestDetectionsRef.current);
          if (event.kind === "apriltag") setSimulatorAprilTags(latestAprilTagsRef.current);
        }
      },
      (message) => appendLog(message),
    );
    visionRef.current = vision;
    return () => {
      window.clearTimeout(restorePreferences);
      simulationControllerRef.current?.disconnect();
      simulatorWindowRef.current?.close();
      vision.dispose();
      visionRef.current = null;
    };
  }, [appendLog]);

  useEffect(() => {
    localStorage.setItem(THRESHOLD_KEY, JSON.stringify({ threshold: thresholdPercent, invert: thresholdInvert }));
  }, [thresholdInvert, thresholdPercent]);

  useEffect(() => {
    localStorage.setItem(OBJECT_CONFIDENCE_KEY, String(objectConfidencePercent));
  }, [objectConfidencePercent]);

  useEffect(() => {
    const canvas = thresholdOverlayRef.current;
    if (!canvas || !thresholdResult) return;
    canvas.width = thresholdResult.frameWidth;
    canvas.height = thresholdResult.frameHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.putImageData(
      new ImageData(
        new Uint8ClampedArray(thresholdResult.binaryData),
        thresholdResult.frameWidth,
        thresholdResult.frameHeight,
      ),
      0,
      0,
    );
  }, [thresholdResult]);

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
      controller.abortRun();
      controller.disconnect();
    }
    simulationControllerRef.current = null;
    setSimulationController(null);
    if (controllerRef.current === controller) controllerRef.current = null;
    visionRef.current?.setSyntheticDetectionProvider(null);
    visionRef.current?.setSyntheticAprilTagProvider(null);
    setConnectionMode(null);
    setSimulatorMinimized(false);
    setTelemetry(createEmptyDroneTelemetry());
    setCameraState("offline");
    setDetections([]);
    setAprilTagDetections([]);
    setThresholdResult(null);
    setSimulatorDetections([]);
    setSimulatorAprilTags([]);
    setSimulatorThresholdResult(null);
    setVisionTestingMode(null);
    setDisplayVisionMode(null);
    setSimulatorVisionMode(null);
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
    visionRef.current?.setSyntheticAprilTagProvider((width, height) =>
      controller.getSyntheticAprilTags(width, height)
    );
    controller.connect();
    setConnectionMode("simulated");
    setSimulatorMinimized(false);
    setDetections([]);
    setAprilTagDetections([]);
    setThresholdResult(null);
    setSimulatorDetections([]);
    setSimulatorAprilTags([]);
    setSimulatorThresholdResult(null);
    setVisionTestingMode(null);
    setDisplayVisionMode(null);
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

  const captureAndStorePhoto = useCallback(async () => {
    const vision = visionRef.current;
    if (!vision) throw new Error("Camera capture is not ready yet.");
    const captured = await vision.capturePhoto();
    const url = URL.createObjectURL(captured.blob);
    const id = ++photoSequenceRef.current;
    const source = simulationControllerRef.current ? "simulated" : "real";
    photoUrlsRef.current.add(url);
    setMissionPhotos((current) => [
      ...current,
      {
        id,
        url,
        capturedAt: Date.now(),
        source,
        width: captured.width,
        height: captured.height,
      },
    ]);
    appendLog(
      `📷 Photo ${String(id).padStart(2, "0")} stored from the ${source === "simulated" ? "simulator" : "drone camera"}.`,
    );
  }, [appendLog]);

  const runProgram = async () => {
    if (running || runtimeRef.current || stopProgramPromiseRef.current) return;
    const controller = controllerRef.current;
    const vision = visionRef.current;
    if (!controller || !connectionMode || !telemetry.connected) {
      notify("Connect a real or simulated Hopper before running code");
      return;
    }
    if (!vision) return;

    const source =
      editorMode === "blocks"
        ? blocklyRef.current?.generateWorkspaceCode(workspaceRef.current!) || ""
        : editorMode === "python"
          ? pythonCode
          : javascriptCode;
    if (!source.trim()) {
      notify(`Add some ${editorMode === "blocks" ? "blocks" : editorMode === "python" ? "Python" : "JavaScript"} first`);
      return;
    }
    let code = source;
    if (editorMode === "python") {
      try {
        code = transpilePython(source);
      } catch (error) {
        setShowConsole(true);
        appendLog("Python error:", error);
        notify(error instanceof Error ? error.message : "The Python program could not be translated.");
        return;
      }
    }
    let execute: (...values: unknown[]) => Promise<void>;
    try {
      execute = new AsyncFunction("drone", "vision", "runtime", "console", code);
    } catch (error) {
      setShowConsole(true);
      appendLog(`${editorMode === "python" ? "Python" : "JavaScript"} syntax error:`, error);
      notify("Fix the syntax error shown in the console before running.");
      return;
    }

    const runtime = new ExecutionRuntime(
      (error) => appendLog("Event error:", error),
      () => {
        controller.abortRun();
      },
      (blockId) => workspaceRef.current?.highlightBlock(blockId),
    );
    runtimeRef.current = runtime;
    setRunning(true);
    setShowConsole(true);
    appendLog(`▶ ${editorMode === "python" ? "Python" : editorMode === "javascript" ? "JavaScript" : "Blocks"} program started`);

    const programConsole = {
      log: (...values: unknown[]) => appendLog(...values),
      warn: (...values: unknown[]) => appendLog("Warning:", ...values),
      error: (...values: unknown[]) => appendLog("Error:", ...values),
    };
    const programDrone = new Proxy(controller, {
      get(target, property, receiver) {
        if (property === "takePicture") {
          return async () => {
            if (runtime.stopped || runtimeRef.current !== runtime) {
              throw new Error("Program stopped");
            }
            await captureAndStorePhoto();
          };
        }
        const member = Reflect.get(target, property, receiver);
        if (typeof member !== "function") return member;
        return (...argumentsList: unknown[]) => {
          if (runtime.stopped || runtimeRef.current !== runtime) {
            throw new Error("Program stopped");
          }
          return Reflect.apply(member, target, argumentsList);
        };
      },
    }) as DroneController;

    try {
      await controller.startRun();
      await execute(programDrone, vision, runtime, programConsole);
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
      if (runtimeRef.current === runtime) runtimeRef.current = null;
      if (!stopProgramPromiseRef.current) setRunning(false);
    }
  };

  const stopProgram = useCallback(async () => {
    if (stopProgramPromiseRef.current) {
      await stopProgramPromiseRef.current;
      return;
    }
    const controller = controllerRef.current;
    const runtime = runtimeRef.current;
    const stopTask = Promise.resolve().then(async () => {
      manualNudgeSequenceRef.current += 1;
      setManualOverrideDirection(null);
      runtime?.stop();
      controller?.abortRun();
      if (controller) {
        appendLog("Stopping program — cancelling all tasks and landing…");
        await controller.forceLand().catch((error) => appendLog("Landing:", error));
      }
      if (runtime) {
        await Promise.race([
          runtime.waitUntilIdle(),
          new Promise<void>((resolve) => window.setTimeout(resolve, 2000)),
        ]);
      }
      if (runtimeRef.current === runtime) runtimeRef.current = null;
      setRunning(false);
      appendLog("■ All program tasks stopped and flight commands cleared");
    });
    stopProgramPromiseRef.current = stopTask;
    try {
      await stopTask;
    } finally {
      if (stopProgramPromiseRef.current === stopTask) stopProgramPromiseRef.current = null;
    }
  }, [appendLog]);

  const manualNudge = useCallback(async (direction: ManualFlightDirection) => {
    const controller = controllerRef.current;
    if (!running || editorMode !== "blocks" || !controller?.isFlying()) return;
    const sequence = ++manualNudgeSequenceRef.current;
    setManualOverrideDirection(direction);
    appendLog(`Manual override: ${direction}`);
    try {
      await controller.manualNudge(direction);
    } finally {
      if (manualNudgeSequenceRef.current === sequence) setManualOverrideDirection(null);
    }
  }, [appendLog, editorMode, running]);

  useEffect(() => {
    if (!running) return;
    const handleManualFlightKey = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        event.preventDefault();
        event.stopImmediatePropagation();
        void stopProgram();
        return;
      }
      if (editorMode !== "blocks") return;
      const directions: Partial<Record<string, ManualFlightDirection>> = {
        ArrowUp: "forward",
        ArrowDown: "backward",
        ArrowLeft: "left",
        ArrowRight: "right",
      };
      const direction = directions[event.key];
      if (!direction) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void manualNudge(direction);
    };
    const keyboardTargets = simulatorWindow ? [window, simulatorWindow] : [window];
    keyboardTargets.forEach((target) => target.addEventListener("keydown", handleManualFlightKey, true));
    return () => keyboardTargets.forEach((target) => {
      target.removeEventListener("keydown", handleManualFlightKey, true);
    });
  }, [editorMode, manualNudge, running, simulatorWindow, stopProgram]);

  const emergencyCutoff = async () => {
    const controller = controllerRef.current;
    if (!controller) return;
    if (!window.confirm("Emergency only: stop the motors immediately?")) return;
    runtimeRef.current?.stop();
    controller.abortRun();
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
      setAprilTagDetections([]);
      setThresholdResult(null);
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

  const previewThreshold = useCallback(async () => {
    try {
      const result = await visionRef.current?.scanThreshold(thresholdPercent, thresholdInvert, false);
      if (!result) return undefined;
      setDisplayVisionMode("threshold");
      if (simulationControllerRef.current) {
        setSimulatorVisionMode("threshold");
        setSimulatorThresholdResult(result);
      }
      return result;
    } catch (error) {
      setVisionTestingMode(null);
      appendLog("Threshold scan:", error);
      return undefined;
    }
  }, [appendLog, thresholdInvert, thresholdPercent]);

  useEffect(() => {
    if (visionTestingMode !== "threshold") return;
    const initial = window.setTimeout(() => void previewThreshold(), 0);
    const interval = window.setInterval(() => void previewThreshold(), 650);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [previewThreshold, visionTestingMode]);

  const previewObjects = useCallback(async () => {
    if (objectScanBusyRef.current) return;
    objectScanBusyRef.current = true;
    try {
      const nextDetections = await visionRef.current?.detectObjects(
        objectConfidencePercent / 100,
        false,
      );
      if (!nextDetections) return;
      setDisplayVisionMode("object");
      if (simulationControllerRef.current) {
        setSimulatorVisionMode("object");
        setSimulatorDetections(nextDetections);
      }
    } catch (error) {
      setVisionTestingMode(null);
      appendLog("Object detection:", error);
    } finally {
      objectScanBusyRef.current = false;
    }
  }, [appendLog, objectConfidencePercent]);

  const previewAprilTags = useCallback(async () => {
    if (aprilTagScanBusyRef.current) return;
    aprilTagScanBusyRef.current = true;
    try {
      const nextTags = await visionRef.current?.scanAprilTags(false);
      if (!nextTags) return;
      setDisplayVisionMode("apriltag");
      if (simulationControllerRef.current) {
        setSimulatorVisionMode("apriltag");
        setSimulatorAprilTags(nextTags);
      }
    } catch (error) {
      setVisionTestingMode(null);
      appendLog("AprilTag detection:", error);
    } finally {
      aprilTagScanBusyRef.current = false;
    }
  }, [appendLog]);

  const toggleVisionTesting = async (mode: VisionTestingMode) => {
    if (visionTestingMode === mode) {
      setVisionTestingMode(null);
      setDisplayVisionMode(null);
      setSimulatorVisionMode(null);
      return;
    }
    try {
      if (mode === "object" && !simulationControllerRef.current) {
        await visionRef.current?.loadObjectModel();
      }
      setDisplayVisionMode(mode);
      if (simulationControllerRef.current) setSimulatorVisionMode(mode);
      setVisionTestingMode(mode);
    } catch (error) {
      appendLog(`${mode} testing:`, error);
    }
  };

  useEffect(() => {
    if (visionTestingMode !== "object") return;
    const initial = window.setTimeout(() => void previewObjects(), 0);
    const interval = window.setInterval(() => void previewObjects(), 1800);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [previewObjects, visionTestingMode]);

  useEffect(() => {
    if (visionTestingMode !== "apriltag") return;
    const initial = window.setTimeout(() => void previewAprilTags(), 0);
    const interval = window.setInterval(() => void previewAprilTags(), 900);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [previewAprilTags, visionTestingMode]);

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

  const openAprilTagPdf = () => {
    const pdfWindow = window.open("about:blank", "_blank");
    if (!pdfWindow) {
      notify("Allow pop-ups to open the printable AprilTag PDF");
      return;
    }
    const pdfBytes = buildAprilTagPdf(pdfTagId);
    const pdfUrl = URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" }));
    pdfWindow.opener = null;
    pdfWindow.location.href = pdfUrl;
    window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 60_000);
  };

  const clampVisionWidth = useCallback((width: number) => {
    const available = Math.max(
      VISION_MIN_WIDTH,
      window.innerWidth - EDITOR_MIN_WIDTH - VISION_SPLITTER_WIDTH,
    );
    return Math.round(Math.max(VISION_MIN_WIDTH, Math.min(available, width)));
  }, []);

  useEffect(() => {
    const fitVisionDeck = () => {
      setVisionMaximumWidth(Math.max(
        VISION_MIN_WIDTH,
        window.innerWidth - EDITOR_MIN_WIDTH - VISION_SPLITTER_WIDTH,
      ));
      setVisionWidth((current) => clampVisionWidth(current));
    };
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

  const newProject = () => {
    if (!window.confirm("Start a fresh project? Your saved project will stay on this computer.")) return;
    const workspace = workspaceRef.current;
    const toolkit = blocklyRef.current;
    if (workspace && toolkit) {
      toolkit.loadDefaultWorkspace(workspace);
      javascriptCodeRef.current = JAVASCRIPT_STARTER_PROGRAM;
      setJavascriptCode(JAVASCRIPT_STARTER_PROGRAM);
    }
    pythonCodeRef.current = PYTHON_STARTER_PROGRAM;
    setPythonCode(PYTHON_STARTER_PROGRAM);
    setProjectName("Untitled Hopper Project");
    setEditorMode(DEFAULT_EDITOR_MODE);
    notify("Fresh project opened");
  };

  const downloadProject = () => {
    const workspace = workspaceRef.current;
    const toolkit = blocklyRef.current;
    if (!workspace || !toolkit) return;
    const contents = JSON.stringify(
      {
        version: 2,
        name: projectName,
        workspace: toolkit.saveWorkspace(workspace),
        javascriptCode,
        pythonCode,
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
        pythonCode?: string;
      };
      if (!project.workspace) throw new Error("This file has no block workspace.");
      blocklyRef.current?.restoreWorkspace(workspaceRef.current!, project.workspace);
      setProjectName(project.name || "Imported Hopper Project");
      const importedJavascriptCode = project.javascriptCode
        ?? blocklyRef.current?.generateWorkspaceCode(workspaceRef.current!)
        ?? "";
      javascriptCodeRef.current = importedJavascriptCode;
      setJavascriptCode(importedJavascriptCode);
      const importedPythonCode = project.pythonCode ?? PYTHON_STARTER_PROGRAM;
      pythonCodeRef.current = importedPythonCode;
      setPythonCode(importedPythonCode);
      notify("Project imported");
    } catch (error) {
      appendLog("Import:", error);
      notify("That project file could not be opened");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const telemetryLive = telemetry.connected || cameraLive;
  const modelLabel =
    simulationConnected
      ? visionTestingMode === "object"
        ? "Scanning simulation every 1.8s"
        : "Simulation labels ready"
      : modelState === "loading"
      ? "Loading local model…"
      : modelState === "ready"
        ? visionTestingMode === "object"
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

  const objectConfidence = objectConfidencePercent / 100;
  const visibleDetections = useMemo(
    () => detections.filter((item) => item.score >= objectConfidence),
    [detections, objectConfidence],
  );
  const visibleSimulatorDetections = useMemo(
    () => simulatorDetections.filter((item) => item.score >= objectConfidence),
    [objectConfidence, simulatorDetections],
  );
  const detectionSummary = useMemo(
    () =>
      visibleDetections.map((item, index) => ({
        id: `${item.class}-${index}`,
        label: formatDetectionLabel(item.class),
        confidence: Math.round(item.score * 100),
        x: formatCoordinate(item.centerX),
        y: formatCoordinate(item.centerY),
      })),
    [visibleDetections],
  );
  const aprilTagSummary = useMemo(
    () => aprilTagDetections.map((tag) => ({
      id: tag.id,
      x: formatCoordinate(tag.centerX),
      y: formatCoordinate(tag.centerY),
      yaw: formatCoordinate(tag.yaw),
    })),
    [aprilTagDetections],
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
  const scanActive = scanEvent?.phase === "start";
  return (
    <>
    <main className="studio-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <button
            type="button"
            className={`wrc-refresh-button ${hardRefreshing ? "refreshing" : ""}`}
            onClick={() => void hardRefresh()}
            disabled={hardRefreshing}
            aria-label={`Hard refresh ${STUDIO_NAME} and update its offline files`}
            title={`Hard refresh: check for and save the newest ${STUDIO_NAME} files`}
          >
            <img
              src={wrcLogo}
              alt="Weapons, Robotics and Control Engineering"
              className="wrc-logo"
            />
            <span aria-hidden="true">↻</span>
          </button>
          <span className="brand-divider" />
          <div>
            <div className="brand-name">{STUDIO_NAME.toUpperCase()}</div>
            <div className="brand-subtitle">{LAB_NAME.toUpperCase()}</div>
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
          <details className="information-menu" ref={informationMenuRef}>
            <summary aria-label="Open information lessons" title="Information lessons">
              <span aria-hidden="true">ⓘ</span>
              <span className="information-menu-label">Information</span>
              <i aria-hidden="true">▾</i>
            </summary>
            <nav className="information-menu-panel" aria-label="Information lessons">
              <div className="information-menu-heading">
                <b>LEARNING LIBRARY</b>
                <a
                  href="#/information"
                  onClick={() => {
                    if (informationMenuRef.current) informationMenuRef.current.open = false;
                  }}
                >
                  Browse all →
                </a>
              </div>
              <ol>
                {INFORMATION_LESSONS.map((lesson) => (
                  <li key={lesson.slug}>
                    <a
                      href={`#/information/${lesson.slug}`}
                      onClick={() => {
                        if (informationMenuRef.current) informationMenuRef.current.open = false;
                      }}
                    >
                      <span>{lesson.number}</span>
                      <span>
                        <b>{lesson.title}</b>
                        <small>{lesson.summary}</small>
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </details>
        </div>
        <div className="editor-tabs" role="tablist" aria-label="Editor mode">
          {ENABLED_EDITOR_MODES.map((mode) => (
            <button
              key={mode}
              role="tab"
              aria-selected={editorMode === mode}
              className={editorMode === mode ? "active" : ""}
              onClick={() => {
                if (mode === "javascript" && !javascriptCode.trim()) {
                  setJavascriptCode(generatedCode);
                }
                setEditorMode(mode);
              }}
            >
              <span className={
                mode === "blocks"
                  ? "blocks-icon"
                  : mode === "python"
                    ? "python-icon"
                    : "code-icon"
              }>
                {mode === "blocks" ? "◫" : mode === "python" ? "Py" : "</>"}
              </span>
              {mode === "blocks" ? "BLOCKS" : mode === "python" ? "PYTHON" : "JAVASCRIPT"}
            </button>
          ))}
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
          <button
            className="cutoff-button"
            onClick={() => void emergencyCutoff()}
            title="Emergency motor cutoff"
            aria-label="Emergency motor cutoff"
          >
            <span aria-hidden="true">⚠</span><b>CUT MOTORS</b>
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
          {editorMode === "blocks" && (
            <div
              className={`manual-flight-pad ${showConsole ? "above-console" : ""}`}
              aria-label="Manual flight override controls"
            >
              <span>MANUAL OVERRIDE</span>
              <button
                type="button"
                className={`manual-forward ${manualOverrideDirection === "forward" ? "active" : ""}`}
                onClick={() => void manualNudge("forward")}
                disabled={!manualControlsAvailable}
                aria-label="Temporarily override program and fly forward"
                title="Fly forward · Up arrow"
              >↑<small>FWD</small></button>
              <button
                type="button"
                className={`manual-left ${manualOverrideDirection === "left" ? "active" : ""}`}
                onClick={() => void manualNudge("left")}
                disabled={!manualControlsAvailable}
                aria-label="Temporarily override program and fly left"
                title="Fly left · Left arrow"
              >←</button>
              <button
                type="button"
                className="manual-land"
                onClick={() => void stopProgram()}
                disabled={!running}
                aria-label="Stop program and land"
                title="Stop and land · Spacebar"
              >LAND</button>
              <button
                type="button"
                className={`manual-right ${manualOverrideDirection === "right" ? "active" : ""}`}
                onClick={() => void manualNudge("right")}
                disabled={!manualControlsAvailable}
                aria-label="Temporarily override program and fly right"
                title="Fly right · Right arrow"
              >→</button>
              <button
                type="button"
                className={`manual-back ${manualOverrideDirection === "backward" ? "active" : ""}`}
                onClick={() => void manualNudge("backward")}
                disabled={!manualControlsAvailable}
                aria-label="Temporarily override program and fly backward"
                title="Fly backward · Down arrow"
              >↓<small>BACK</small></button>
            </div>
          )}
          {editorMode === "python" && (
            <div className="python-editor">
              <div ref={pythonLineNumbersRef} className="line-numbers" aria-hidden="true">
                {pythonCode.split("\n").map((_, index) => <span key={index}>{index + 1}</span>)}
              </div>
              <div className="python-code-pane">
                <pre
                  ref={pythonHighlightRef}
                  className="python-highlight"
                  aria-hidden="true"
                ><code>{pythonTokens.map((token, index) => (
                    <span className={`py-token-${token.kind}`} key={`${index}-${token.kind}`}>
                      {token.text}
                    </span>
                  ))}{"\u200b"}</code></pre>
                <textarea
                  value={pythonCode}
                  onChange={(event) => setPythonCode(event.target.value)}
                  onScroll={(event) => syncPythonScroll(event.currentTarget)}
                  onKeyDown={(event) => handleCodeEditorKeyDown(event, "python")}
                  wrap="off"
                  spellCheck={false}
                  aria-label="Python program"
                />
              </div>
            </div>
          )}
          {editorMode === "javascript" && (
            <div className="javascript-editor">
              <div ref={javascriptLineNumbersRef} className="line-numbers" aria-hidden="true">
                {javascriptCode.split("\n").map((_, index) => <span key={index}>{index + 1}</span>)}
              </div>
              <div className="javascript-code-pane">
                <pre
                  ref={javascriptHighlightRef}
                  className="javascript-highlight"
                  aria-hidden="true"
                ><code>{javascriptTokens.map((token, index) => (
                    <span className={`js-token-${token.kind}`} key={`${index}-${token.kind}`}>
                      {token.text}
                    </span>
                  ))}{"\u200b"}</code></pre>
                <textarea
                  value={javascriptCode}
                  onChange={(event) => setJavascriptCode(event.target.value)}
                  onScroll={(event) => syncJavaScriptScroll(event.currentTarget)}
                  onKeyDown={(event) => handleCodeEditorKeyDown(event, "javascript")}
                  wrap="off"
                  spellCheck={false}
                  aria-label="JavaScript program"
                />
              </div>
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
          aria-label="Resize Vision Testing panel"
          aria-orientation="vertical"
          aria-valuemin={VISION_MIN_WIDTH}
          aria-valuemax={visionMaximumWidth}
          aria-valuenow={visionWidth}
          title="Drag left or right to resize Vision Testing"
          onPointerDown={beginVisionResize}
          onKeyDown={resizeVisionWithKeyboard}
        ><i /><i /><i /></button>

        <aside className="vision-panel">
          <div className="vision-heading">
            <div>
              <h1>VISION TESTING</h1>
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
                onError={() => { setCameraState("error"); setWifiState("disconnected"); setThresholdResult(null); }}
              />
            ) : (
              <div className="camera-placeholder">
                <span className="camera-glyph">▣</span>
                <b>CAMERA STANDBY</b>
                <small>Join the Hopper Wi-Fi, then connect video.</small>
              </div>
            )}
            <canvas
              ref={thresholdOverlayRef}
              className={`threshold-camera-overlay ${displayVisionMode === "threshold" ? "active" : ""}`}
              aria-label="Binary threshold camera view"
            />
            <div className="reticle"><i /><b /></div>
            <div className="frame-corners"><i /><i /><i /><i /></div>
            {displayVisionMode === "object" && visibleDetections.map((detection, index) => (
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
            {displayVisionMode === "apriltag" && aprilTagDetections.map((tag) => {
              const right = {
                x: (tag.corners[1].x + tag.corners[2].x) / 2,
                y: (tag.corners[1].y + tag.corners[2].y) / 2,
              };
              const up = {
                x: (tag.corners[0].x + tag.corners[1].x) / 2,
                y: (tag.corners[0].y + tag.corners[1].y) / 2,
              };
              return (
                <svg
                  className="apriltag-overlay"
                  key={`tag-${tag.id}`}
                  viewBox={`0 0 ${tag.frameWidth} ${tag.frameHeight}`}
                  preserveAspectRatio="none"
                >
                  <polygon points={tag.corners.map((point) => `${point.x},${point.y}`).join(" ")} />
                  <line className="tag-axis-x" x1={tag.center.x} y1={tag.center.y} x2={right.x} y2={right.y} />
                  <line className="tag-axis-y" x1={tag.center.x} y1={tag.center.y} x2={up.x} y2={up.y} />
                  <circle cx={tag.center.x} cy={tag.center.y} r="4" />
                  <text x={tag.bbox[0]} y={Math.max(14, tag.bbox[1] - 5)}>ID {tag.id} · X {formatCoordinate(tag.centerX)} · Y {formatCoordinate(tag.centerY)}</text>
                </svg>
              );
            })}
            {scanActive && (
              <i
                className={`vision-scan-line ${scanEvent?.kind ?? ""}`}
                key={scanEvent?.sequence}
              />
            )}
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
              Direct video is available. Start the local app to use thresholding, object detection, or AprilTag detection.
            </p>
          )}

          <section className="mission-photo-gallery" aria-label="Mission photos from this session">
            <div className="mission-photo-heading">
              <div>
                <span>SESSION CAMERA ROLL</span>
                <h2>MISSION PHOTOS <b>{missionPhotos.length}</b></h2>
              </div>
              <button
                type="button"
                onClick={clearMissionPhotos}
                disabled={missionPhotos.length === 0}
              >
                CLEAR ALL
              </button>
            </div>
            {missionPhotos.length === 0 ? (
              <p className="mission-photo-empty">
                Run the <b>take and store photo</b> block to save the current camera frame here.
              </p>
            ) : (
              <>
                <div className="mission-photo-strip" role="list">
                  {missionPhotos.map((photo) => (
                    <a
                      className="mission-photo-card"
                      href={photo.url}
                      download={`mission-photo-${String(photo.id).padStart(2, "0")}.jpg`}
                      key={photo.id}
                      role="listitem"
                      title="Download this mission photo"
                    >
                      <img
                        src={photo.url}
                        alt={`Mission photo ${photo.id} from the ${photo.source === "simulated" ? "simulator" : "real drone"}`}
                      />
                      <span>
                        <b>PHOTO {String(photo.id).padStart(2, "0")}</b>
                        <small>
                          {photo.source === "simulated" ? "SIM" : "DRONE"} ·{" "}
                          {new Date(photo.capturedAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </small>
                        <em>{photo.width} × {photo.height}</em>
                      </span>
                    </a>
                  ))}
                </div>
                <p className="mission-photo-help">Scroll the camera roll · select a photo to download it</p>
              </>
            )}
          </section>

          <section className="vision-tool threshold-tool">
            <div className="tool-title">
              <span className="tool-number">01</span>
              <div><h2>THRESHOLDING</h2><p>Binary white / black · live preview</p></div>
              <button
                className={`tiny-toggle ${visionTestingMode === "threshold" ? "on" : ""}`}
                onClick={() => void toggleVisionTesting("threshold")}
                aria-label="Toggle threshold testing"
                disabled={!cameraLive}
              ><i /></button>
            </div>
            <div className="threshold-control">
              <div>
                <label htmlFor="threshold-slider">BRIGHTNESS THRESHOLD</label>
                <b>{thresholdPercent}%</b>
              </div>
              <input
                id="threshold-slider"
                type="range"
                min="0"
                max="100"
                step="1"
                value={thresholdPercent}
                onChange={(event) => setThresholdPercent(clampPercent(Number(event.target.value)))}
              />
              <div className="threshold-scale"><span>BLACK · 0%</span><span>WHITE · 100%</span></div>
            </div>
            <label className="invert-control">
              <input
                type="checkbox"
                checked={thresholdInvert}
                onChange={(event) => setThresholdInvert(event.target.checked)}
              />
              <span><i /> INVERT WHITE AND BLACK</span>
            </label>
            <div className="binary-readouts">
              <span className="white"><small>WHITE IN FRAME</small><b>{thresholdResult ? `${thresholdResult.whiteCoverage.toFixed(1)}%` : "—"}</b></span>
              <span className="black"><small>BLACK IN FRAME</small><b>{thresholdResult ? `${thresholdResult.blackCoverage.toFixed(1)}%` : "—"}</b></span>
              <span className={thresholdResult?.centerWhite ? "white" : "black"}>
                <small>CENTER PIXEL</small><b>{thresholdResult ? thresholdResult.centerWhite ? "WHITE" : "BLACK" : "—"}</b>
              </span>
            </div>
            <div className="threshold-actions">
              <span>Use the purple binary blocks to scan during flight.</span>
              <button onClick={() => void previewThreshold()} disabled={!cameraLive}>TEST ONCE</button>
            </div>
          </section>

          <section className="vision-tool object-tool">
            <div className="tool-title">
              <span className="tool-number">02</span>
              <div><h2>OBJECT DETECTOR</h2><p>Local COCO-SSD · continuous live testing</p></div>
              <button
                className={`tiny-toggle ${visionTestingMode === "object" ? "on" : ""}`}
                onClick={() => void toggleVisionTesting("object")}
                aria-label="Toggle object detection"
                disabled={!cameraLive || modelState === "loading"}
              ><i /></button>
            </div>
            <div className="model-status-row">
              <span className={`model-orb ${modelState}`}><i /></span>
              <div><b>{modelLabel}</b><small>Runs entirely on this computer</small></div>
              {modelState === "ready" && <button onClick={() => void previewObjects()}>TEST ONCE</button>}
            </div>
            <div className="threshold-control confidence-control">
              <div>
                <label htmlFor="object-confidence-slider">MINIMUM CONFIDENCE</label>
                <b>{objectConfidencePercent}%</b>
              </div>
              <input
                id="object-confidence-slider"
                type="range"
                min="1"
                max="100"
                step="1"
                value={objectConfidencePercent}
                onChange={(event) => setObjectConfidencePercent(
                  clampConfidencePercent(Number(event.target.value)),
                )}
              />
              <div className="threshold-scale">
                <span>MORE RESULTS · 1%</span>
                <span>STRICTER · 100%</span>
              </div>
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
              <p className="empty-detections">
                No objects at or above {objectConfidencePercent}%. Lower the confidence or test again.
              </p>
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

          <section className="vision-tool apriltag-tool">
            <div className="tool-title">
              <span className="tool-number">03</span>
              <div><h2>APRILTAG DETECTION</h2><p>tag36h11 · ID + 2D pose axes</p></div>
              <button
                className={`tiny-toggle ${visionTestingMode === "apriltag" ? "on" : ""}`}
                onClick={() => void toggleVisionTesting("apriltag")}
                aria-label="Toggle AprilTag detection"
                disabled={!cameraLive}
              ><i /></button>
            </div>
            <div className="apriltag-pdf-menu">
              <div><b>PRINT A REAL TAG</b><small>Full-page US Letter vector PDF</small></div>
              <label>TAG ID
                <select value={pdfTagId} onChange={(event) => setPdfTagId(Number(event.target.value))}>
                  {APRIL_TAG_IDS.map((id) => <option value={id} key={id}>{id}</option>)}
                </select>
              </label>
              <button type="button" onClick={openAprilTagPdf}>GENERATE PDF ↗</button>
            </div>
            <div className="apriltag-family-row">
              <span><small>TAG FAMILY</small><b>tag36h11</b></span>
              <button onClick={() => void previewAprilTags()} disabled={!cameraLive}>TEST ONCE</button>
            </div>
            {aprilTagSummary.length > 0 ? (
              <div className="detection-chips apriltag-detections">
                {aprilTagSummary.map((tag) => (
                  <span key={tag.id}>
                    <b>APRILTAG ID {tag.id}</b>
                    <small>X {tag.x} · Y {tag.y} · YAW {tag.yaw}°</small>
                  </span>
                ))}
              </div>
            ) : (
              <p className="empty-detections">No tag36h11 markers found in the current test frame.</p>
            )}
            <p className="coordinate-legend">
              RED X AXIS · CYAN Y AXIS · FRAME CENTER 0,0 · ALIGNMENT 0°
            </p>
          </section>

          <div className="vision-footnote">
            <i /> The toggles are test-only and mutually exclusive. Flight blocks perform their own one-shot scans.
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
          inline={simulatorInline}
          minimized={simulatorMinimized}
          detections={visibleSimulatorDetections}
          thresholdResult={simulatorThresholdResult}
          aprilTagDetections={simulatorAprilTags}
          visionMode={simulatorVisionMode}
          scanActive={scanActive && simulationConnected}
          scanSequence={scanEvent?.sequence ?? 0}
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
    <InformationLessonLauncher />
    </>
  );
}
