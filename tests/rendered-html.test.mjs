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

test("ships the local flight, simulation, vision, offline cache, and student-build surfaces", async () => {
  const [component, simulatorComponent, drone, simulation, runtime, vision, aprilTags, blockly, serviceWorker, offlineManifestScript, builtOfflineManifest, styles, readme, packageJson] = await Promise.all([
    readFile(new URL("../components/HopperStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/SimulatedDroneArea.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/drone.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/simulation.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/runtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/vision.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/apriltags.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/blockly.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../scripts/write-offline-manifest.mjs", import.meta.url), "utf8"),
    readFile(new URL("../dist/client/offline-assets.json", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(component, /VISION TESTING/);
  assert.doesNotMatch(component, /COLOR TRACKER/);
  assert.doesNotMatch(component, /SENSOR HEALTH/);
  assert.match(component, /Connect drone/);
  assert.match(component, /Connect simulated drone/);
  assert.match(component, /window\.open/);
  assert.match(component, /hopper-simulated-drone/);
  assert.match(component, /setSyntheticDetectionProvider/);
  assert.match(component, /STOP &amp; LAND/);
  assert.match(component, /Wi-Fi ready/);
  assert.match(component, /Resize Vision Testing panel/);
  assert.match(component, /ALLAN ELSBERRY/);
  assert.match(component, /TEACHABLE MACHINE/);
  assert.match(component, /CENTER PIXEL/);
  assert.match(component, /THRESHOLDING/);
  assert.match(component, /APRILTAG DETECTION/);
  assert.match(component, /GENERATE PDF/);
  assert.match(component, /openAprilTagPdf/);
  assert.match(component, /tag36h11/);
  assert.match(component, /ONE TEST AT A TIME/);
  assert.match(component, /cameraProxyAvailable/);
  assert.match(component, /allow local-network access/i);
  assert.match(component, /Bluetooth permission is blocked/);
  assert.match(component, /useState<WifiState>\("disconnected"\)/);
  assert.match(component, /type="range"/);
  assert.match(component, /detection\.confidence/);
  assert.match(component, /batteryTone/);
  assert.match(component, /highlightBlock/);
  assert.match(component, /requestOfflineCacheRefresh/);
  assert.match(component, /waitForServiceWorkerActivation/);
  assert.match(component, /serviceWorker\.register/);
  assert.match(component, /Hard refresh Hopper Studio/);
  assert.match(component, /OFFLINE READY/);
  assert.match(component, /MANUAL OVERRIDE/);
  assert.match(component, /manualNudge/);
  assert.match(component, /showConsole \? "above-console"/);
  assert.match(component, /ArrowUp: "forward"/);
  assert.match(component, /event\.code === "Space"/);
  assert.match(component, /simulatorWindow \? \[window, simulatorWindow\]/);
  assert.match(component, /className="manual-land"[\s\S]*?onClick=\{\(\) => void stopProgram\(\)\}/);
  assert.match(drone, /9a66fa00-0800-9191-11e4-012d1540cb8e/);
  assert.match(drone, /HOPPER/);
  assert.match(drone, /interface DroneController/);
  assert.match(drone, /abortRun/);
  assert.match(drone, /runGeneration/);
  assert.match(drone, /isRunActive/);
  assert.match(drone, /manualFlightOverride/);
  assert.match(drone, /manualNudge/);
  assert.doesNotMatch(drone, /sensorHealth|linkRssi/);
  assert.match(simulatorComponent, /SIMULATED DRONE ROOM/);
  assert.match(simulatorComponent, /UPLOAD IMAGE/);
  assert.match(simulatorComponent, /5 × 5 IN/);
  assert.match(simulatorComponent, /createPortal/);
  assert.match(simulatorComponent, /Drag Hopper drone to reposition it/);
  assert.match(simulatorComponent, /sim-vision-box/);
  assert.match(simulatorComponent, /white-paper-1/);
  assert.match(simulatorComponent, /ADD TAG/);
  assert.match(simulatorComponent, /sim-tag-x-axis-arrow/);
  assert.match(simulatorComponent, /sim-scan-line/);
  assert.match(simulatorComponent, /sideDroneRef/);
  assert.match(simulatorComponent, /FRONT/);
  assert.match(simulation, /SIMULATION_ROOM = \{ width: 10, height: 7 \}/);
  assert.match(simulation, /Math\.tan\(radians\(pitch\)\)/);
  assert.match(simulation, /powerToTiltDegrees/);
  assert.match(simulation, /getSimulationFlipTransform/);
  assert.doesNotMatch(simulation, /forwardImpulse/);
  assert.match(simulation, /getSimulationSideViewPose/);
  assert.match(simulation, /Wall impact/);
  assert.match(simulation, /placeDrone/);
  assert.match(simulation, /manualFlightOverride/);
  assert.match(runtime, /runBlock/);
  assert.match(vision, /lite_mobilenet_v2/);
  assert.match(vision, /scanThreshold/);
  assert.match(vision, /analyzeThreshold/);
  assert.match(styles, /\.manual-flight-pad/);
  assert.match(styles, /\.manual-flight-pad\.above-console/);
  assert.match(vision, /scanAprilTags/);
  assert.match(vision, /centerOnAprilTag/);
  assert.match(vision, /this\.scanned\("custom"/);
  assert.match(vision, /safeLostTagSearches/);
  assert.match(vision, /await drone\.rotate/);
  assert.match(vision, /detectionCenterCoordinate/);
  assert.match(vision, /lastObjectCoordinates/);
  assert.match(vision, /loadCustomModel/);
  assert.match(vision, /new URL\("models\/coco-ssd\/model\.json", document\.baseURI\)/);
  assert.match(aprilTags, /detectAprilTags/);
  assert.match(aprilTags, /buildAprilTagPdf/);
  assert.match(aprilTags, /tag36h11/);
  assert.match(aprilTags, /hamming/);
  assert.match(blockly, /vision_sees_binary/);
  assert.match(blockly, /vision_binary_center/);
  assert.match(blockly, /vision_scan_apriltags/);
  assert.match(blockly, /vision_sees_apriltag/);
  assert.match(blockly, /vision_center_apriltag/);
  assert.doesNotMatch(blockly, /YAW_POWER/);
  assert.match(blockly, /LOST_SEARCHES/);
  assert.doesNotMatch(blockly, /vision_sees_color/);
  assert.match(blockly, /vision_sees_custom_label/);
  assert.match(blockly, /vision_object_coordinate/);
  assert.match(blockly, /minidrone_takeoff/);
  assert.match(blockly, /activeStatement/);
  assert.match(blockly, /activeExpression/);
  assert.match(blockly, /new URL\("blockly\/media\/", document\.baseURI\)/);
  assert.doesNotThrow(() => new Function(serviceWorker));
  assert.match(serviceWorker, /HARD_REFRESH/);
  assert.match(serviceWorker, /request\.mode === "navigate"/);
  assert.match(serviceWorker, /refreshAppCache/);
  assert.match(serviceWorker, /text\/css,\*\/\*;q=0\.1/);
  assert.match(serviceWorker, /promoteCache/);
  assert.match(serviceWorker, /ACTIVE_CACHE_POINTER_URL/);
  assert.match(serviceWorker, /ignoreVary: true/);
  assert.match(serviceWorker, /isLocalDevelopmentAsset/);
  assert.match(serviceWorker, /models\/coco-ssd\/group1-shard5of5/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(offlineManifestScript, /offline-assets\.json/);
  const offlineManifest = JSON.parse(builtOfflineManifest);
  assert.ok(offlineManifest.assets.some((asset) => /^assets\/HopperStudio-.+\.js$/.test(asset)));
  assert.ok(offlineManifest.assets.includes("models/coco-ssd/model.json"));
  assert.ok(offlineManifest.assets.includes("sw.js"));
  assert.match(styles, /activeBlockGlow/);
  assert.match(styles, /sim-pitch-reference/);
  assert.match(styles, /visionScanSweep/);
  assert.match(styles, /threshold-camera-overlay/);
  assert.match(styles, /apriltag-overlay/);
  assert.match(styles, /rotateX\(var\(--sim-flip-pitch/);
  assert.match(styles, /height: 232px/);
  assert.match(styles, /wrcRefreshSpin/);
  assert.match(styles, /local-pill\.saving/);
  assert.match(readme, /start-windows\.bat/);
  assert.match(readme, /local-network access prompt/i);
  assert.match(readme, /Bluetooth flight control is independent/);
  assert.match(readme, /hair drier/);
  assert.match(readme, /Altitude telemetry/);
  assert.match(readme, /Use the simulated drone/);
  assert.match(readme, /Use Hopper Studio offline/);
  assert.match(readme, /OpenMoji/);
  assert.match(readme, /Standard model versus embedded model/);
  assert.match(packageJson, /"build:student"/);
  assert.match(packageJson, /"build:pages"/);
  assert.match(packageJson, /"apriltag"/);
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
    access(new URL("../public/sw.js", import.meta.url)),
    access(new URL("../scripts/write-offline-manifest.mjs", import.meta.url)),
  ]);
  await assert.rejects(access(new URL("app/_sites-preview", root)));
});

test("refreshes local CSS as a stylesheet and promotes offline caches atomically", async () => {
  const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  class MemoryCache {
    entries = new Map();

    async match(request) {
      const response = this.entries.get(new Request(request).url);
      return response?.clone();
    }

    async put(request, response) {
      this.entries.set(new Request(request).url, response.clone());
    }

    async keys() {
      return [...this.entries.keys()].map((url) => new Request(url));
    }
  }

  const stores = new Map();
  const cacheStorage = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new MemoryCache());
      return stores.get(name);
    },
    async has(name) {
      return stores.has(name);
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      return stores.delete(name);
    },
  };
  let unavailablePath = null;
  const requestedCssAcceptHeaders = [];
  const mockFetch = async (request) => {
    const normalizedRequest = new Request(request);
    const url = new URL(normalizedRequest.url);
    if (url.pathname === unavailablePath) return new Response("missing", { status: 503 });
    if (url.pathname === "/") {
      return new Response(
        '<link rel="stylesheet" href="/app/globals.css"><script src="/assets/app.js"></script>',
        { status: 200, headers: { "content-type": "text/html" } },
      );
    }
    if (url.pathname === "/offline-assets.json") {
      return new Response(JSON.stringify({ assets: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname === "/app/globals.css") {
      const accept = normalizedRequest.headers.get("accept") || "";
      requestedCssAcceptHeaders.push(accept);
      return accept.includes("text/css")
        ? new Response(".studio-shell { display: grid; }", { status: 200, headers: { "content-type": "text/css" } })
        : new Response("export default {};", { status: 200, headers: { "content-type": "text/javascript" } });
    }
    if (url.pathname === "/assets/app.js") {
      return new Response('import "/assets/chunk.js";', {
        status: 200,
        headers: { "content-type": "text/javascript" },
      });
    }
    return new Response("asset", { status: 200, headers: { "content-type": "application/octet-stream" } });
  };
  const serviceWorkerSelf = {
    registration: { scope: "https://hopper.test/" },
    clients: { claim: async () => undefined },
    skipWaiting: async () => undefined,
    addEventListener() {},
  };
  const createWorker = new Function(
    "self",
    "caches",
    "fetch",
    `${source}\nreturn { performAppCacheRefresh, readActiveCacheName };`,
  );
  const worker = createWorker(serviceWorkerSelf, cacheStorage, mockFetch);

  const legacyCache = await cacheStorage.open("hopper-studio-offline-v1");
  await legacyCache.put(new Request("https://hopper.test/"), new Response("old complete shell"));
  const refreshed = await worker.performAppCacheRefresh({ strict: true });
  assert.equal(refreshed.status, "updated");
  assert.ok(requestedCssAcceptHeaders.length > 0);
  assert.ok(requestedCssAcceptHeaders.every((header) => header.includes("text/css")));
  const activeName = await worker.readActiveCacheName();
  assert.match(activeName, /^hopper-studio-offline-v2-snapshot-/);
  const activeCache = await cacheStorage.open(activeName);
  const cachedCss = await activeCache.match(new Request("https://hopper.test/app/globals.css"));
  assert.equal(cachedCss.headers.get("content-type"), "text/css");
  assert.match(await cachedCss.text(), /display: grid/);
  assert.equal(await cacheStorage.has("hopper-studio-offline-v1"), false);

  unavailablePath = "/sim-assets/car.png";
  const failedRefresh = await worker.performAppCacheRefresh({ strict: true });
  assert.equal(failedRefresh.status, "offline");
  assert.equal(await worker.readActiveCacheName(), activeName, "failed refresh keeps the prior complete cache active");
  assert.match(await (await activeCache.match(new Request("https://hopper.test/"))).text(), /app\/globals\.css/);
});

test("calculates binary threshold coverage and centered object coordinates", async () => {
  const source = await readFile(new URL("../lib/vision.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(
    /^import \{ detectAprilTags \} from "\.\/apriltags";$/m,
    "const detectAprilTags = () => [];",
  );
  const visionMath = await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );

  const pixels = new Uint8ClampedArray([
    0, 0, 0, 255,
    160, 160, 160, 255,
    255, 255, 255, 255,
    150, 150, 150, 255,
  ]);
  const binary = visionMath.analyzeThreshold(pixels, 2, 2, 60, false);
  assert.equal(binary.whiteCoverage, 50);
  assert.equal(binary.blackCoverage, 50);
  assert.equal(binary.centerWhite, false);
  assert.equal(binary.binaryData[0], 0);
  assert.equal(binary.binaryData[4], 255);
  const inverted = visionMath.analyzeThreshold(pixels, 2, 2, 60, true);
  assert.equal(inverted.whiteCoverage, 50);
  assert.equal(inverted.centerWhite, true);
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

  const noOp = () => undefined;
  const runtime = new visionMath.VisionRuntime(
    () => null,
    () => null,
    noOp,
    noOp,
    noOp,
    noOp,
    noOp,
    noOp,
    noOp,
  );
  let objectScans = 0;
  runtime.detectObjects = async () => {
    objectScans += 1;
    return [{ class: "bottle", score: 0.97 }];
  };
  assert.equal(await runtime.seesObject("bottle", 0.55), true);
  assert.equal(objectScans, 1, "camera sees object performs its own scan");

  let aprilScans = 0;
  runtime.scanAprilTags = async () => {
    aprilScans += 1;
    return [{ id: 7, centerX: 0, centerY: 0, yaw: 0 }];
  };
  assert.equal(await runtime.seesAprilTag(7), true);
  assert.equal(aprilScans, 1, "camera sees AprilTag performs its own scan");

  const scanSequence = [
    [{ id: 7, centerX: 18, centerY: 0, yaw: 0 }],
    [],
    [],
    [{ id: 7, centerX: 0, centerY: 0, yaw: 20 }],
    [{ id: 7, centerX: 0, centerY: 0, yaw: 0 }],
  ];
  runtime.scanAprilTags = async () => scanSequence.shift() ?? [];
  const commands = [];
  const drone = {
    cancelRunFlag: false,
    setAxis(axis, power) { commands.push(["axis", axis, power]); },
    reset() { commands.push(["reset"]); },
    async wait(seconds) { commands.push(["wait", seconds]); },
    async rotate(degrees, direction) { commands.push(["rotate", degrees, direction]); },
  };
  assert.equal(await runtime.centerOnAprilTag(drone, 7, 7, 5, 5, 3), true);
  assert.ok(commands.some((command) => command[0] === "axis" && command[1] === "roll" && command[2] === 7));
  assert.ok(commands.some((command) => command[0] === "wait" && command[1] === 0.3));
  assert.ok(commands.some((command) => command[0] === "rotate" && command[1] === 20 && command[2] === "clockwise"));
  assert.equal(scanSequence.length, 0, "centering rescans after movement and tolerates two missed frames");
});

test("detects tag36h11 IDs and rotated 2D pose from camera pixels", async () => {
  const source = await readFile(new URL("../lib/apriltags.ts", import.meta.url), "utf8");
  const { AprilTagFamily } = await import("apriltag");
  const tagConfig = JSON.parse(await readFile(new URL("../node_modules/apriltag/families/36h11.json", import.meta.url), "utf8"));
  globalThis.__hopperAprilTagTest = { AprilTagFamily, tagConfig };
  try {
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText
      .replace(
        /^import \{ AprilTagFamily \} from "apriltag";$/m,
        "const { AprilTagFamily } = globalThis.__hopperAprilTagTest;",
      )
      .replace(
        /^import tag36h11 from "apriltag\/families\/36h11\.json";$/m,
        "const tag36h11 = globalThis.__hopperAprilTagTest.tagConfig;",
      );
    const aprilTags = await import(
      `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
    );
    const width = 220;
    const height = 220;
    const centerX = 110;
    const centerY = 110;
    const size = 140;
    const angle = 25 * Math.PI / 180;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < pixels.length; index += 4) {
      pixels[index] = 255;
      pixels[index + 1] = 255;
      pixels[index + 2] = 255;
      pixels[index + 3] = 255;
    }
    const marker = aprilTags.getAprilTagPixels(19);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const dx = x - centerX;
        const dy = y - centerY;
        const localX = dx * Math.cos(angle) + dy * Math.sin(angle);
        const localY = -dx * Math.sin(angle) + dy * Math.cos(angle);
        const gridX = Math.floor((localX + size / 2) / (size / 10));
        const gridY = Math.floor((localY + size / 2) / (size / 10));
        if (gridX < 0 || gridX >= 10 || gridY < 0 || gridY >= 10 || marker[gridY][gridX] !== "b") continue;
        const pixel = (y * width + x) * 4;
        pixels[pixel] = 0;
        pixels[pixel + 1] = 0;
        pixels[pixel + 2] = 0;
      }
    }
    const detections = aprilTags.detectAprilTags({ data: pixels, width, height }, width, height);
    assert.equal(detections.length, 1);
    assert.equal(detections[0].id, 19);
    assert.equal(detections[0].hamming, 0);
    assert.ok(Math.abs(detections[0].centerX) < 1);
    assert.ok(Math.abs(detections[0].centerY) < 1);
    assert.ok(Math.abs(detections[0].yaw - 115) < 1.5);
    const pdf = aprilTags.buildAprilTagPdf(586);
    const pdfText = Buffer.from(pdf).toString("latin1");
    assert.match(pdfText, /^%PDF-1\.4/);
    assert.match(pdfText, /\/MediaBox \[0 0 612 792\]/);
    assert.match(pdfText, /tag36h11 - ID 586/);
    assert.match(pdfText, /xref\n0 7/);
    assert.match(pdfText, /%%EOF\n$/);
  } finally {
    delete globalThis.__hopperAprilTagTest;
  }
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
    flipAxis: null, flipAngle: 0, flipDirection: null,
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

  const groundedPose = simulationMath.getSimulationSideViewPose({ z: 0, vz: 0, pitch: 0 });
  assert.equal(groundedPose.heightPixels, 0);
  assert.equal(groundedPose.pitchLabel, "LEVEL");
  const forwardPose = simulationMath.getSimulationSideViewPose({ z: 1.25, vz: 0.42, pitch: 4.3 });
  assert.ok(Math.abs(forwardPose.heightPixels - 64.48) < 0.01);
  assert.equal(forwardPose.pitchDegrees, 4.3);
  assert.equal(forwardPose.pitchLabel, "FORWARD · NOSE DOWN");
  assert.equal(forwardPose.verticalSpeedLabel, "↑ +0.42 m/s");

  const highPose = simulationMath.getSimulationSideViewPose({ z: 5, vz: 0, pitch: 0 });
  assert.ok(highPose.heightPixels > 140 && highPose.heightPixels < 160, "five metres retains visible headroom");
  const forwardFlip = simulationMath.getSimulationFlipTransform("forward", 0.5);
  const backwardFlip = simulationMath.getSimulationFlipTransform("backward", 0.5);
  const leftFlip = simulationMath.getSimulationFlipTransform("left", 0.5);
  const rightFlip = simulationMath.getSimulationFlipTransform("right", 0.5);
  assert.deepEqual(forwardFlip, { axis: "pitch", angle: 180 });
  assert.deepEqual(backwardFlip, { axis: "pitch", angle: -180 });
  assert.deepEqual(leftFlip, { axis: "roll", angle: -180 });
  assert.deepEqual(rightFlip, { axis: "roll", angle: 180 });
  const flipPose = simulationMath.getSimulationSideViewPose({
    z: 1.25,
    vz: 0,
    pitch: 0,
    flipAxis: "pitch",
    flipAngle: 180,
    flipDirection: "forward",
  });
  assert.equal(flipPose.pitchDegrees, 180);
  assert.equal(flipPose.pitchLabel, "FORWARD FLIP · 180°");
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
    let releaseLongBlock;
    const longBlock = runtime.runBlock("long-flight", () => new Promise((resolve) => {
      releaseLongBlock = resolve;
    }));
    runtime.stop();
    let idle = false;
    const idlePromise = runtime.waitUntilIdle().then(() => { idle = true; });
    await Promise.resolve();
    assert.equal(idle, false, "stop waits for an already-running task to settle");
    releaseLongBlock();
    await Promise.all([longBlock, idlePromise]);
    assert.equal(idle, true);
    await assert.rejects(runtime.runBlock("stale-command", async () => undefined), /Program stopped/);
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

    controller.placeDrone(5, 3);
    const flipPromise = controller.flip("left");
    const flipStart = controller.getSnapshot();
    assert.equal(flipStart.flyingState, "flipping");
    assert.equal(flipStart.flipAxis, "roll");
    assert.equal(flipStart.vx, 0);
    assert.equal(flipStart.vy, 0);
    controller.step(0.016, performance.now() + 410);
    const flipMiddle = controller.getSnapshot();
    assert.ok(flipMiddle.flipAngle < -170 && flipMiddle.flipAngle > -190, "left flip reaches half rotation");
    assert.equal(flipMiddle.x, 5, "flip holds horizontal position");
    assert.equal(flipMiddle.y, 3, "flip holds horizontal position");
    controller.abortRun();
    await flipPromise;
    assert.equal(controller.getSnapshot().flipAxis, null);

    await controller.startRun();
    const staleFly = controller.fly("forward", 1, 5);
    controller.abortRun();
    await controller.startRun();
    controller.setAxis("pitch", 20);
    await staleFly;
    assert.equal(controller.axes.pitch, 20, "a stale command cannot clear movement from a newer run");

    const manualCorrection = controller.manualNudge("left", 30, 0.15);
    assert.equal(controller.manualFlightOverride.roll, -30, "manual correction takes control immediately");
    controller.setAxis("pitch", 35);
    assert.equal(controller.axes.pitch, 35, "program commands continue updating beneath the override");
    await manualCorrection;
    assert.equal(controller.manualFlightOverride, null, "manual correction releases control after its pulse");
    assert.equal(controller.axes.pitch, 35, "the latest program command is ready to resume");

    const manualDirectionChecks = [
      ["forward", "y", 1],
      ["backward", "y", -1],
      ["left", "x", -1],
      ["right", "x", 1],
    ];
    for (const [direction, coordinate, sign] of manualDirectionChecks) {
      controller.setAxis("pitch", 0);
      controller.setAxis("roll", 0);
      controller.setAxis("yaw", 0);
      controller.setAxis("gaz", 0);
      for (let frame = 0; frame < 120; frame += 1) {
        simulatedTime += 16;
        controller.step(0.016, simulatedTime);
      }
      controller.placeDrone(5, 3);
      const start = controller.getSnapshot()[coordinate];
      const correction = controller.manualNudge(direction, 30, 0.15);
      for (let frame = 0; frame < 30; frame += 1) {
        simulatedTime += 16;
        controller.step(0.016, simulatedTime);
      }
      const distance = (controller.getSnapshot()[coordinate] - start) * sign;
      assert.ok(distance > 0.01, `${direction} manual control moves the simulated drone`);
      await correction;
    }

    const forcedLanding = controller.forceLand();
    for (let frame = 0; frame < 300; frame += 1) {
      simulatedTime += 16;
      controller.step(0.016, simulatedTime);
    }
    await forcedLanding;
    assert.equal(controller.cancelRunFlag, true, "forced landing keeps old run tasks cancelled");
    assert.deepEqual(controller.axes, { pitch: 0, roll: 0, yaw: 0, gaz: 0 });
    controller.disconnect();
  } finally {
    globalThis.window = previousWindow;
    globalThis.CustomEvent = previousCustomEvent;
  }
});
