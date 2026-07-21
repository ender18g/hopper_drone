"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  SIMULATION_ROOM,
  SimulatedDroneController,
  projectObjectToCamera,
  type SimulationObject,
  type SimulationSnapshot,
} from "../lib/simulation";
import type { ColorDetectionResult, VisionDetection } from "../lib/vision";

const DEFAULT_OBJECTS: SimulationObject[] = [
  { id: "airplane-1", label: "airplane", src: "sim-assets/airplane.png", x: 3.1, y: 5.7, size: 0.7, rotation: 28 },
  { id: "car-1", label: "car", src: "sim-assets/car.png", x: 7.9, y: 5.25, size: 0.72, rotation: -20 },
  { id: "banana-1", label: "banana", src: "sim-assets/banana.png", x: 6.35, y: 2.0, size: 0.58, rotation: 8 },
  { id: "apple-1", label: "apple", src: "sim-assets/apple.png", x: 3.8, y: 3.2, size: 0.56, rotation: 0 },
];

const FLOOR_PRESETS = [
  { name: "Midnight blue", value: "#122747" },
  { name: "Charcoal", value: "#29343c" },
  { name: "Forest", value: "#254638" },
  { name: "Warm gray", value: "#625f59" },
];

type SimulatedDroneAreaProps = {
  controller: SimulatedDroneController;
  cameraCanvasRef: RefObject<HTMLCanvasElement | null>;
  telemetryCanvasRef: RefObject<HTMLCanvasElement | null>;
  popupWindow: Window | null;
  minimized: boolean;
  detections: VisionDetection[];
  colorDetection: ColorDetectionResult | null;
  visionMode: "object" | "color" | null;
  onMinimize(): void;
  onRestore(): void;
  onDisconnect(): void;
};

const speed = (snapshot: SimulationSnapshot) => Math.hypot(snapshot.vx, snapshot.vy);
const round = (value: number, digits = 1) => value.toFixed(digits);

export default function SimulatedDroneArea({
  controller,
  cameraCanvasRef,
  telemetryCanvasRef,
  popupWindow,
  minimized,
  detections,
  colorDetection,
  visionMode,
  onMinimize,
  onRestore,
  onDisconnect,
}: SimulatedDroneAreaProps) {
  const [snapshot, setSnapshot] = useState(() => controller.getSnapshot());
  const [objects, setObjects] = useState<SimulationObject[]>(DEFAULT_OBJECTS);
  const [selectedId, setSelectedId] = useState(DEFAULT_OBJECTS[0].id);
  const [floorColor, setFloorColor] = useState(FLOOR_PRESETS[0].value);
  const [manualAngle, setManualAngle] = useState(10);
  const arenaRef = useRef<HTMLDivElement>(null);
  const trailCanvasRef = useRef<HTMLCanvasElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const dragIdRef = useRef<string | null>(null);
  const draggingDroneRef = useRef(false);
  const imageCacheRef = useRef(new Map<string, HTMLImageElement>());
  const nextObjectIdRef = useRef(1);
  const selectedObject = objects.find((object) => object.id === selectedId) ?? null;

  useEffect(() => controller.subscribe(setSnapshot), [controller]);

  useEffect(() => {
    controller.setSceneObjects(objects);
    objects.forEach((object) => {
      if (imageCacheRef.current.has(object.src)) return;
      const image = new Image();
      image.src = object.src;
      imageCacheRef.current.set(object.src, image);
    });
  }, [controller, objects]);

  useEffect(() => {
    const canvas = trailCanvasRef.current;
    const arena = arenaRef.current;
    if (!canvas || !arena) return;
    const bounds = arena.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(bounds.width * scale));
    canvas.height = Math.max(1, Math.round(bounds.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(scale, scale);
    context.clearRect(0, 0, bounds.width, bounds.height);
    if (snapshot.trail.length < 2) return;
    context.beginPath();
    snapshot.trail.forEach((point, index) => {
      const x = (point.x / SIMULATION_ROOM.width) * bounds.width;
      const y = (1 - point.y / SIMULATION_ROOM.height) * bounds.height;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.strokeStyle = "rgba(108, 221, 255, 0.64)";
    context.lineWidth = 2;
    context.setLineDash([5, 5]);
    context.stroke();
  }, [snapshot.trail]);

  useEffect(() => {
    const primary = cameraCanvasRef.current;
    if (!primary) return;
    primary.width = 640;
    primary.height = 360;
    const context = primary.getContext("2d");
    if (!context) return;

    context.fillStyle = floorColor;
    context.fillRect(0, 0, primary.width, primary.height);
    const heading = (snapshot.heading * Math.PI) / 180;
    const fieldWidth = Math.max(1.05, snapshot.z * 1.8 + 0.62);
    const fieldHeight = fieldWidth * (primary.height / primary.width);

    for (let worldX = 0.08; worldX < SIMULATION_ROOM.width; worldX += 0.22) {
      for (let worldY = 0.08; worldY < SIMULATION_ROOM.height; worldY += 0.22) {
        const hash = Math.abs(Math.sin(worldX * 91.7 + worldY * 47.3) * 10000) % 1;
        if (hash > 0.105) continue;
        const deltaX = worldX - snapshot.x;
        const deltaY = worldY - snapshot.y;
        const cameraRight = deltaX * Math.cos(heading) - deltaY * Math.sin(heading);
        const cameraForward = deltaX * Math.sin(heading) + deltaY * Math.cos(heading);
        const x = primary.width / 2 + (cameraRight / fieldWidth) * primary.width;
        const y = primary.height / 2 - (cameraForward / fieldHeight) * primary.height;
        if (x < 0 || y < 0 || x > primary.width || y > primary.height) continue;
        context.fillStyle = hash < 0.035 ? "rgba(255,255,255,.7)" : "rgba(229,239,248,.34)";
        context.fillRect(x, y, hash < 0.035 ? 2.2 : 1.2, hash < 0.035 ? 2.2 : 1.2);
      }
    }

    objects.forEach((object) => {
      const projection = projectObjectToCamera(snapshot, object, primary.width, primary.height);
      if (!projection.visible) return;
      const image = imageCacheRef.current.get(object.src);
      context.save();
      context.translate(projection.centerX, projection.centerY);
      context.rotate(((object.rotation - snapshot.heading) * Math.PI) / 180);
      context.shadowColor = "rgba(0,0,0,.4)";
      context.shadowBlur = Math.max(2, 9 - snapshot.z * 2);
      context.shadowOffsetY = 3;
      if (image?.complete && image.naturalWidth > 0) {
        context.drawImage(
          image,
          -projection.size / 2,
          -projection.size / 2,
          projection.size,
          projection.size,
        );
      } else {
        context.fillStyle = "#f5c84b";
        context.beginPath();
        context.arc(0, 0, projection.size / 3, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    });

    const gradient = context.createRadialGradient(320, 180, 70, 320, 180, 370);
    gradient.addColorStop(0, "rgba(255,255,255,.035)");
    gradient.addColorStop(1, "rgba(0,0,0,.32)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, primary.width, primary.height);
    context.fillStyle = "rgba(255,255,255,.035)";
    for (let line = 0; line < 16; line += 1) {
      const y = (line * 37 + Math.round(performance.now() / 80)) % 360;
      context.fillRect(0, y, 640, 1);
    }

    const mirror = telemetryCanvasRef.current;
    if (mirror) {
      mirror.width = primary.width;
      mirror.height = primary.height;
      mirror.getContext("2d")?.drawImage(primary, 0, 0);
    }
  }, [cameraCanvasRef, floorColor, objects, snapshot, telemetryCanvasRef]);

  const objectTypes = useMemo(
    () => DEFAULT_OBJECTS.map(({ label, src, size }) => ({ label, src, size })),
    [],
  );

  const addObject = (label: string) => {
    const template = objectTypes.find((item) => item.label === label);
    if (!template) return;
    const id = `${label}-copy-${nextObjectIdRef.current}`;
    nextObjectIdRef.current += 1;
    setObjects((current) => [
      ...current,
      { ...template, id, x: 5, y: 3.5, rotation: 0 },
    ]);
    setSelectedId(id);
  };

  const duplicateSelected = () => {
    if (!selectedObject) return;
    const id = `${selectedObject.label}-copy-${nextObjectIdRef.current}`;
    nextObjectIdRef.current += 1;
    setObjects((current) => [
      ...current,
      {
        ...selectedObject,
        id,
        x: Math.min(9.5, selectedObject.x + 0.35),
        y: Math.min(6.5, selectedObject.y + 0.35),
      },
    ]);
    setSelectedId(id);
  };

  const deleteSelected = () => {
    if (!selectedObject) return;
    setObjects((current) => current.filter((object) => object.id !== selectedObject.id));
    setSelectedId("");
  };

  const updateSelectedSize = (size: number) => {
    setObjects((current) =>
      current.map((object) => object.id === selectedId ? { ...object, size } : object),
    );
  };

  const uploadImage = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      const fileLabel = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "custom image";
      const id = `upload-${nextObjectIdRef.current}`;
      nextObjectIdRef.current += 1;
      setObjects((current) => [
        ...current,
        { id, label: fileLabel, src: reader.result as string, x: 5, y: 3.5, size: 0.8, rotation: 0, uploaded: true },
      ]);
      setSelectedId(id);
    };
    reader.readAsDataURL(file);
    if (uploadInputRef.current) uploadInputRef.current.value = "";
  };

  const beginObjectDrag = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragIdRef.current = id;
    setSelectedId(id);
  };

  const moveObject = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const id = dragIdRef.current;
    const arena = arenaRef.current;
    if (!id || !arena) return;
    const bounds = arena.getBoundingClientRect();
    const x = clampRoomX(((event.clientX - bounds.left) / bounds.width) * SIMULATION_ROOM.width);
    const y = clampRoomY((1 - (event.clientY - bounds.top) / bounds.height) * SIMULATION_ROOM.height);
    setObjects((current) => current.map((object) => object.id === id ? { ...object, x, y } : object));
  };

  const stopObjectDrag = () => {
    dragIdRef.current = null;
  };

  const beginDroneDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (snapshot.crashed) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingDroneRef.current = true;
  };

  const moveDrone = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const arena = arenaRef.current;
    if (!draggingDroneRef.current || !arena) return;
    const bounds = arena.getBoundingClientRect();
    const x = clampRoomX(((event.clientX - bounds.left) / bounds.width) * SIMULATION_ROOM.width);
    const y = clampRoomY((1 - (event.clientY - bounds.top) / bounds.height) * SIMULATION_ROOM.height);
    controller.placeDrone(x, y);
  };

  const stopDroneDrag = () => {
    draggingDroneRef.current = false;
  };

  const droneStyle = {
    left: `${(snapshot.x / SIMULATION_ROOM.width) * 100}%`,
    top: `${(1 - snapshot.y / SIMULATION_ROOM.height) * 100}%`,
    "--sim-heading": `${snapshot.heading}deg`,
    "--sim-altitude": `${Math.min(1, snapshot.z / 2.5)}`,
  } as CSSProperties;
  const sideDroneStyle = {
    "--sim-side-height": `${Math.min(128, snapshot.z * 72)}px`,
    "--sim-pitch": `${-snapshot.pitch}deg`,
  } as CSSProperties;

  if (minimized || !popupWindow || popupWindow.closed) {
    return (
      <>
        <canvas ref={cameraCanvasRef} className="sim-minimized-camera" aria-hidden="true" />
        <button className="sim-restore-tab" onClick={onRestore}>
          <span>SIM</span> OPEN DRONE ROOM
        </button>
      </>
    );
  }

  const simulatorWindowContent = (
    <section className="sim-window detached" role="dialog" aria-label="Simulated drone room">
      <header className="sim-titlebar">
        <div>
          <span className="sim-window-icon">SIM</span>
          <div><b>SIMULATED DRONE ROOM</b><small>10 m × 7 m · downward camera · realistic damping</small></div>
        </div>
        <div className="sim-title-actions">
          <span className={`sim-state-badge ${snapshot.crashed ? "crashed" : ""}`}>
            <i /> {snapshot.crashed ? "CRASHED" : snapshot.flyingState.toUpperCase()}
          </span>
          <button onClick={onMinimize} aria-label="Minimize simulator">—</button>
          <button onClick={onDisconnect} aria-label="Disconnect simulator">×</button>
        </div>
      </header>

      <div className="sim-toolbar">
        <label>FLOOR
          <select value={floorColor} onChange={(event) => setFloorColor(event.target.value)}>
            {FLOOR_PRESETS.map((preset) => <option value={preset.value} key={preset.value}>{preset.name}</option>)}
          </select>
        </label>
        <input
          className="sim-color-input"
          type="color"
          value={floorColor}
          onChange={(event) => setFloorColor(event.target.value)}
          aria-label="Custom floor color"
        />
        <span className="sim-toolbar-divider" />
        <div className="sim-object-adders" aria-label="Add floor objects">
          {objectTypes.map((object) => (
            <button onClick={() => addObject(object.label)} key={object.label}>
              <img src={object.src} alt="" /> + {object.label}
            </button>
          ))}
        </div>
        <button onClick={() => uploadInputRef.current?.click()}>⇧ UPLOAD IMAGE</button>
        <input
          ref={uploadInputRef}
          className="visually-hidden"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(event) => uploadImage(event.target.files?.[0])}
        />
        <span className="sim-toolbar-spacer" />
        <button onClick={duplicateSelected} disabled={!selectedObject}>DUPLICATE</button>
        <button className="sim-delete-button" onClick={deleteSelected} disabled={!selectedObject}>DELETE</button>
        {selectedObject && (
          <label className="sim-size-control">SIZE {round(selectedObject.size, 2)} m
            <input
              type="range"
              min="0.25"
              max="1.8"
              step="0.05"
              value={selectedObject.size}
              onChange={(event) => updateSelectedSize(Number(event.target.value))}
            />
          </label>
        )}
      </div>

      <div className="sim-body">
        <div className="sim-arena-column">
          <div className="sim-dimension sim-dimension-width"><span>10 METERS</span></div>
          <div className="sim-arena-wrap">
            <div className="sim-dimension sim-dimension-height"><span>7 METERS</span></div>
            <div
              ref={arenaRef}
              className="sim-arena"
              style={{ "--sim-floor": floorColor } as CSSProperties}
              aria-label="Top-down 10 by 7 meter drone room"
            >
              <canvas ref={trailCanvasRef} className="sim-trail-canvas" aria-hidden="true" />
              <div className="sim-start-area"><b>START</b><span>1.25, 1.20 m</span></div>
              <span className="sim-scale-note">DRAG DRONE TO PLACE · MARKER ENLARGED · TRUE SIZE 5 × 5 IN</span>
              {objects.map((object) => (
                <button
                  type="button"
                  className={`sim-floor-object ${selectedId === object.id ? "selected" : ""}`}
                  key={object.id}
                  style={{
                    left: `${(object.x / SIMULATION_ROOM.width) * 100}%`,
                    top: `${(1 - object.y / SIMULATION_ROOM.height) * 100}%`,
                    width: `${Math.max(4.5, (object.size / SIMULATION_ROOM.width) * 100)}%`,
                    rotate: `${object.rotation}deg`,
                  }}
                  onPointerDown={(event) => beginObjectDrag(event, object.id)}
                  onPointerMove={moveObject}
                  onPointerUp={stopObjectDrag}
                  onPointerCancel={stopObjectDrag}
                  aria-label={`Move ${object.label}`}
                >
                  <img src={object.src} alt={object.label} draggable={false} />
                </button>
              ))}
              <button
                type="button"
                className={`sim-drone-top ${snapshot.crashed ? "crashed" : ""}`}
                style={droneStyle}
                aria-label="Drag Hopper drone to reposition it"
                disabled={snapshot.crashed}
                onPointerDown={beginDroneDrag}
                onPointerMove={moveDrone}
                onPointerUp={stopDroneDrag}
                onPointerCancel={stopDroneDrag}
              >
                <span className="sim-direction-arrow"><i /></span>
                <span className="sim-drone-shadow" />
                <span className="sim-drone-rotor rotor-one"><i /></span>
                <span className="sim-drone-rotor rotor-two"><i /></span>
                <span className="sim-drone-rotor rotor-three"><i /></span>
                <span className="sim-drone-rotor rotor-four"><i /></span>
                <span className="sim-drone-arm arm-one" />
                <span className="sim-drone-arm arm-two" />
                <span className="sim-drone-body"><b>H</b><i /></span>
                {snapshot.crashed && <span className="sim-explosion" key={snapshot.crashSequence}><i /><i /><i /><i /><b>BOOM!</b></span>}
              </button>
              {snapshot.crashed && (
                <div className="sim-crash-card">
                  <b>IMPACT DETECTED</b>
                  <span>{snapshot.crashReason}</span>
                  <button onClick={() => controller.resetSimulation()}>↻ RESET TO START</button>
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="sim-instruments">
          <section className="sim-side-card">
            <header><b>SIDE VIEW</b><span>ATTITUDE + ALTITUDE</span></header>
            <div className="sim-side-field">
              <div className="sim-cloud cloud-one" />
              <div className="sim-cloud cloud-two" />
              <div className="sim-bank-indicator">
                <span style={{ rotate: `${snapshot.roll}deg` }} /><b>ROLL {round(snapshot.roll)}°</b>
              </div>
              <div className="sim-side-shadow" style={{ opacity: Math.max(0.12, 0.55 - snapshot.z * 0.17) }} />
              <div className={`sim-drone-side ${snapshot.crashed ? "crashed" : ""}`} style={sideDroneStyle}>
                <i className="side-rotor left" /><i className="side-rotor right" />
                <span className="side-arm" /><span className="side-body"><b>HOPPER</b></span>
                <i className="side-leg left" /><i className="side-leg right" />
              </div>
              <div className="sim-side-ground"><i /></div>
              <span className="sim-altitude-ruler">{round(snapshot.z, 2)} m</span>
            </div>
            <div className="sim-attitude-values">
              <span><b>{round(snapshot.pitch)}°</b>PITCH</span>
              <span><b>{round(snapshot.roll)}°</b>ROLL</span>
              <span><b>{Math.round(snapshot.heading)}°</b>HEADING</span>
            </div>
          </section>

          <section className="sim-camera-card">
            <header><b>DOWN CAMERA</b><span>OBJECTS IN VIEW ARE AVAILABLE TO VISION BLOCKS</span></header>
            <div className="sim-camera-screen">
              <canvas ref={cameraCanvasRef} aria-label="Simulated downward drone camera feed" />
              {visionMode === "object" && detections.map((detection, index) => (
                <div
                  className="sim-vision-box object"
                  key={`${detection.class}-${index}`}
                  style={{
                    left: `${(detection.bbox[0] / detection.frameWidth) * 100}%`,
                    top: `${(detection.bbox[1] / detection.frameHeight) * 100}%`,
                    width: `${(detection.bbox[2] / detection.frameWidth) * 100}%`,
                    height: `${(detection.bbox[3] / detection.frameHeight) * 100}%`,
                  }}
                >
                  <span>{detection.class.toUpperCase()} · {Math.round(detection.score * 100)}%</span>
                </div>
              ))}
              {visionMode === "color" && colorDetection?.bbox && (
                <div
                  className={`sim-vision-box color ${colorDetection.profile}`}
                  style={{
                    left: `${(colorDetection.bbox[0] / colorDetection.frameWidth) * 100}%`,
                    top: `${(colorDetection.bbox[1] / colorDetection.frameHeight) * 100}%`,
                    width: `${(colorDetection.bbox[2] / colorDetection.frameWidth) * 100}%`,
                    height: `${(colorDetection.bbox[3] / colorDetection.frameHeight) * 100}%`,
                  }}
                >
                  <span>{colorDetection.profile.toUpperCase()} · {colorDetection.coverage.toFixed(1)}%</span>
                </div>
              )}
              <i className="sim-camera-crosshair horizontal" /><i className="sim-camera-crosshair vertical" />
              <span className="sim-camera-status">CAM 01 · {snapshot.z < 0.12 ? "GROUND" : "LIVE"}</span>
              <span className={`sim-vision-status ${visionMode ?? "idle"}`}>
                {visionMode === "object"
                  ? `OBJECT SCAN · ${detections.length} FOUND`
                  : visionMode === "color"
                    ? `${colorDetection?.profile.toUpperCase() ?? "COLOR"} FILTER · ${colorDetection?.coverage.toFixed(1) ?? "0.0"}%`
                    : "VISION IDLE"}
              </span>
            </div>
          </section>

          <section className="sim-controls-card">
            <div className="sim-flight-controls">
              <button onClick={() => void controller.takeOff()} disabled={snapshot.crashed || snapshot.z > 0.1}>TAKE OFF</button>
              <button onClick={() => void controller.land()} disabled={snapshot.crashed || snapshot.z < 0.1}>LAND</button>
              <button onClick={() => void controller.hover()} disabled={snapshot.crashed || snapshot.z < 0.1}>HOVER</button>
            </div>
            <div className="sim-tilt-controls">
              <label>TEST TILT
                <select value={manualAngle} onChange={(event) => setManualAngle(Number(event.target.value))}>
                  <option value={5}>5°</option><option value={10}>10°</option><option value={15}>15°</option>
                </select>
              </label>
              <button onClick={() => void controller.manualTilt("pitch", manualAngle)} disabled={snapshot.z < 0.1 || snapshot.crashed}>↑ FORWARD</button>
              <button onClick={() => void controller.manualTilt("pitch", -manualAngle)} disabled={snapshot.z < 0.1 || snapshot.crashed}>↓ BACK</button>
              <button onClick={() => void controller.manualTilt("roll", -manualAngle)} disabled={snapshot.z < 0.1 || snapshot.crashed}>← LEFT</button>
              <button onClick={() => void controller.manualTilt("roll", manualAngle)} disabled={snapshot.z < 0.1 || snapshot.crashed}>→ RIGHT</button>
            </div>
          </section>

          <div className="sim-readouts">
            <span><small>POSITION</small><b>{round(snapshot.x, 2)}, {round(snapshot.y, 2)} m</b></span>
            <span><small>GROUND SPEED</small><b>{round(speed(snapshot), 2)} m/s</b></span>
            <span><small>BATTERY</small><b>{Math.round(snapshot.batteryLevel)}%</b></span>
          </div>
          <p className="sim-license">Floor objects by <a href="https://openmoji.org/" target="_blank" rel="noreferrer">OpenMoji</a> · CC BY-SA 4.0</p>
        </aside>
      </div>
    </section>
  );
  return createPortal(simulatorWindowContent, popupWindow.document.body);
}

const clampRoomX = (value: number) => Math.max(0.2, Math.min(SIMULATION_ROOM.width - 0.2, value));
const clampRoomY = (value: number) => Math.max(0.2, Math.min(SIMULATION_ROOM.height - 0.2, value));
