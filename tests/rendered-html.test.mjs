import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders Hopper Studio metadata and product shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /Hopper Studio · Flight \+ Vision Lab/i);
  assert.match(html, /private, local block-coding and computer-vision studio/i);
  assert.match(html, /og\.png/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("ships the local flight, simulation, vision, and student-build surfaces", async () => {
  const [component, simulatorComponent, drone, simulation, runtime, vision, blockly, styles, readme, packageJson] = await Promise.all([
    readFile(new URL("../components/HopperStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/SimulatedDroneArea.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/drone.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/simulation.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/runtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/vision.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/blockly.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(component, /TELEMETRY/);
  assert.doesNotMatch(component, /DRONE TELEMETRY/);
  assert.doesNotMatch(component, /SENSOR HEALTH/);
  assert.match(component, /Connect drone/);
  assert.match(component, /Connect simulated drone/);
  assert.match(component, /window\.open/);
  assert.match(component, /hopper-simulated-drone/);
  assert.match(component, /setSyntheticDetectionProvider/);
  assert.match(component, /STOP &amp; LAND/);
  assert.match(component, /Wi-Fi ready/);
  assert.match(component, /Resize Telemetry panel/);
  assert.match(component, /ALLAN ELSBERRY/);
  assert.match(component, /TEACHABLE MACHINE/);
  assert.match(component, /CENTER TARGET PIXEL/);
  assert.match(component, /cameraProxyAvailable/);
  assert.match(component, /allow local-network access/i);
  assert.match(component, /Bluetooth permission is blocked/);
  assert.match(component, /useState<WifiState>\("disconnected"\)/);
  assert.match(component, /type="range"/);
  assert.match(component, /detection\.confidence/);
  assert.match(component, /batteryTone/);
  assert.match(component, /highlightBlock/);
  assert.match(drone, /9a66fa00-0800-9191-11e4-012d1540cb8e/);
  assert.match(drone, /HOPPER/);
  assert.match(drone, /interface DroneController/);
  assert.doesNotMatch(drone, /sensorHealth|linkRssi/);
  assert.match(simulatorComponent, /SIMULATED DRONE ROOM/);
  assert.match(simulatorComponent, /UPLOAD IMAGE/);
  assert.match(simulatorComponent, /5 × 5 IN/);
  assert.match(simulatorComponent, /createPortal/);
  assert.match(simulatorComponent, /Drag Hopper drone to reposition it/);
  assert.match(simulatorComponent, /sim-vision-box/);
  assert.match(simulation, /SIMULATION_ROOM = \{ width: 10, height: 7 \}/);
  assert.match(simulation, /Math\.tan\(radians\(pitch\)\)/);
  assert.match(simulation, /powerToTiltDegrees/);
  assert.match(simulation, /Wall impact/);
  assert.match(simulation, /placeDrone/);
  assert.match(runtime, /runBlock/);
  assert.match(vision, /lite_mobilenet_v2/);
  assert.match(vision, /colorCoverage/);
  assert.match(vision, /analyzeColorDetection/);
  assert.match(vision, /detectionCenterCoordinate/);
  assert.match(vision, /lastObjectCoordinates/);
  assert.match(vision, /loadCustomModel/);
  assert.match(vision, /new URL\("models\/coco-ssd\/model\.json", document\.baseURI\)/);
  assert.match(blockly, /vision_sees_color/);
  assert.match(blockly, /vision_sees_custom_label/);
  assert.match(blockly, /vision_object_coordinate/);
  assert.match(blockly, /minidrone_takeoff/);
  assert.match(blockly, /activeStatement/);
  assert.match(blockly, /activeExpression/);
  assert.match(blockly, /new URL\("blockly\/media\/", document\.baseURI\)/);
  assert.match(styles, /activeBlockGlow/);
  assert.match(readme, /start-windows\.bat/);
  assert.match(readme, /local-network access prompt/i);
  assert.match(readme, /Bluetooth flight control is independent/);
  assert.match(readme, /hair drier/);
  assert.match(readme, /Altitude telemetry/);
  assert.match(readme, /Use the simulated drone/);
  assert.match(readme, /OpenMoji/);
  assert.match(readme, /Standard model versus embedded model/);
  assert.match(packageJson, /"build:student"/);
  assert.match(packageJson, /"build:pages"/);
  assert.doesNotMatch(packageJson, /WRANGLER_LOG_PATH=.*vinext/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await Promise.all([
    access(new URL("../public/models/coco-ssd/model.json", import.meta.url)),
    access(new URL("../student-build/hopper-studio.html", import.meta.url)),
    access(new URL("../public/og.png", import.meta.url)),
    access(new URL("../app/api/camera/status/route.ts", import.meta.url)),
    access(new URL("../public/sim-assets/airplane.png", import.meta.url)),
    access(new URL("../public/sim-assets/car.png", import.meta.url)),
    access(new URL("../public/sim-assets/banana.png", import.meta.url)),
    access(new URL("../public/sim-assets/apple.png", import.meta.url)),
  ]);
  await assert.rejects(access(new URL("app/_sites-preview", root)));
});

test("calculates inclusive RGB coverage and centered object coordinates", async () => {
  const source = await readFile(new URL("../lib/vision.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const visionMath = await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );

  const green = { rMin: 0, rMax: 130, gMin: 120, gMax: 255, bMin: 0, bMax: 140 };
  const pixels = new Uint8ClampedArray([
    0, 200, 0, 255,
    50, 119, 50, 255,
    130, 255, 140, 255,
    131, 255, 140, 255,
  ]);
  assert.equal(visionMath.calculateColorCoverage(pixels, green), 50);
  assert.deepEqual(
    visionMath.analyzeColorDetection(pixels, 2, 2, "green", green),
    {
      profile: "green",
      coverage: 50,
      bbox: [0, 0, 1, 2],
      frameWidth: 2,
      frameHeight: 2,
    },
  );
  assert.deepEqual(visionMath.detectionCenterCoordinate([40, 40, 20, 20], 100, 100), {
    x: 0,
    y: 0,
  });
  assert.deepEqual(visionMath.detectionCenterCoordinate([100, 0, 0, 0], 100, 100), {
    x: 100,
    y: 100,
  });
  assert.deepEqual(visionMath.detectionCenterCoordinate([0, 100, 0, 0], 100, 100), {
    x: -100,
    y: -100,
  });
});

test("projects simulated floor targets into the downward camera frame", async () => {
  const source = await readFile(new URL("../lib/simulation.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const simulationMath = await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
  const snapshot = {
    x: 5, y: 3, z: 1.25, vx: 0, vy: 0, vz: 0,
    heading: 0, pitch: 0, roll: 0, yawRate: 0,
    flyingState: "hovering", connected: true, crashed: false,
    crashReason: null, crashSequence: 0, batteryLevel: 100, trail: [],
  };
  const northTarget = { id: "apple", label: "apple", src: "apple.png", x: 5, y: 3.7, size: 0.5, rotation: 0 };
  const eastTarget = { ...northTarget, id: "car", label: "car", x: 5.7, y: 3 };
  const north = simulationMath.projectObjectToCamera(snapshot, northTarget, 640, 360);
  const east = simulationMath.projectObjectToCamera(snapshot, eastTarget, 640, 360);
  assert.equal(north.visible, true);
  assert.ok(north.centerY < 180, "north/forward targets appear above frame center");
  assert.ok(east.centerX > 320, "east/right targets appear right of frame center");
});

test("tracks nested active action and vision blocks without highlighting loop blocks", async () => {
  const source = await readFile(new URL("../lib/runtime.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const { ExecutionRuntime } = await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
  const previousWindow = globalThis.window;
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    setTimeout,
  };
  const activeBlocks = [];
  try {
    const runtime = new ExecutionRuntime(() => {}, () => {}, (blockId) => activeBlocks.push(blockId));
    const result = await runtime.runBlock("fly-forward", async () =>
      runtime.runBlock("camera-sees-apple", async () => 42)
    );
    assert.equal(result, 42);
    assert.deepEqual(activeBlocks, [
      "fly-forward",
      "camera-sees-apple",
      "fly-forward",
      null,
    ]);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("simulated takeoff, tilt acceleration, and damping behave as a flight controller", async () => {
  const source = await readFile(new URL("../lib/simulation.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const simulation = await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
  const previousWindow = globalThis.window;
  const previousCustomEvent = globalThis.CustomEvent;
  globalThis.window = {
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    dispatchEvent() {},
    setTimeout,
  };
  globalThis.CustomEvent = class {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  };

  try {
    const controller = new simulation.SimulatedDroneController();
    controller.connect();
    controller.placeDrone(6, 5);
    assert.equal(controller.getSnapshot().x, 6);
    assert.equal(controller.getSnapshot().y, 5);
    const takeoff = controller.takeOff();
    let simulatedTime = performance.now();
    for (let frame = 0; frame < 300; frame += 1) {
      simulatedTime += 16;
      controller.step(0.016, simulatedTime);
    }
    await takeoff;
    assert.ok(controller.getSnapshot().z > 1, "takeoff reaches a stable hover altitude");

    controller.placeDrone(5, 3);
    controller.setAxis("pitch", 5);
    for (let frame = 0; frame < 60; frame += 1) {
      simulatedTime += 16;
      controller.step(0.016, simulatedTime);
    }
    const crawl = controller.getSnapshot();
    assert.ok(crawl.pitch > 1 && crawl.pitch < 2.2, "5% power produces a visible slow-crawl pitch");

    controller.setAxis("pitch", 0);
    for (let frame = 0; frame < 140; frame += 1) {
      simulatedTime += 16;
      controller.step(0.016, simulatedTime);
    }
    controller.placeDrone(5, 3);
    controller.setAxis("pitch", 20);
    for (let frame = 0; frame < 60; frame += 1) {
      simulatedTime += 16;
      controller.step(0.016, simulatedTime);
    }
    const twentyPercent = controller.getSnapshot();
    assert.ok(twentyPercent.pitch > 3.5 && twentyPercent.pitch < 5.3, "20% power uses a stronger forward pitch");
    assert.ok(
      Math.hypot(twentyPercent.vx, twentyPercent.vy) > Math.hypot(crawl.vx, crawl.vy) * 2,
      "20% power travels clearly faster than the 5% crawl",
    );

    controller.setAxis("pitch", 0);
    for (let frame = 0; frame < 140; frame += 1) {
      simulatedTime += 16;
      controller.step(0.016, simulatedTime);
    }
    controller.placeDrone(5, 3);
    controller.setAxis("pitch", 100);
    for (let frame = 0; frame < 60; frame += 1) {
      simulatedTime += 16;
      controller.step(0.016, simulatedTime);
    }
    const tilted = controller.getSnapshot();
    assert.ok(tilted.pitch > 10 && tilted.pitch <= 15.5, "full pitch command approaches 15 degrees");
    assert.ok(Math.hypot(tilted.vx, tilted.vy) > 0.35, "tilt produces horizontal acceleration");

    controller.setAxis("pitch", 0);
    for (let frame = 0; frame < 140; frame += 1) {
      simulatedTime += 16;
      controller.step(0.016, simulatedTime);
    }
    assert.ok(Math.abs(controller.getSnapshot().pitch) < 1, "attitude damps back to level");
    controller.disconnect();
  } finally {
    globalThis.window = previousWindow;
    globalThis.CustomEvent = previousCustomEvent;
  }
});
