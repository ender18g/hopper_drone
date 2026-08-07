import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const branding = JSON.parse(
  await readFile(new URL("../config/branding.json", import.meta.url), "utf8"),
);
const informationLessonPaths = [
  "information/01-hopper-sensor-suite.html",
  "information/02-quadrotor-aerodynamics.html",
  "information/03-coding-blocks-reference.html",
  "information/04-javascript-api-reference.html",
  "information/05-thresholding-with-hopper.html",
  "information/06-object-detection-and-coco.html",
  "information/07-teachable-machine-models.html",
  "information/08-apriltags-with-hopper.html",
  "information/09-python-coding-reference.html",
];

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

test("server-renders shared branding metadata and product shell", async () => {
  assert.ok(["python", "javascript", "blocks"].includes(branding.codingOptions.defaultEditor));
  assert.ok(branding.codingOptions.enabledEditors.includes(branding.codingOptions.defaultEditor));
  assert.equal(branding.codingOptions.defaultEditor, "blocks");
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, new RegExp(
    `${branding.studioName} · ${branding.labName}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "i",
  ));
  assert.match(html, /offline-ready coding, computer-vision, and quadrotor learning studio/i);
  assert.match(html, /og\.png/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("ships the local flight, simulation, vision, offline cache, and student-build surfaces", async () => {
  const [component, codeQuickReference, lessonLauncher, lessonReader, generatedLessons, simulatorComponent, simulatorTargets, drone, simulation, runtime, vision, aprilTags, blockly, serviceWorker, offlineManifestScript, builtOfflineManifest, styles, readme, packageJson, brandingModule, desktopBuilder, desktopMain, javascriptHighlighting, pythonSurface] = await Promise.all([
    readFile(new URL("../components/HopperStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/CodeQuickReference.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/InformationLessonLauncher.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/InformationLessonReader.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/information-lessons.generated.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/SimulatedDroneArea.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/simulator-targets.ts", import.meta.url), "utf8"),
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
    readFile(new URL("../lib/branding.ts", import.meta.url), "utf8"),
    readFile(new URL("../desktop/electron-builder.config.cjs", import.meta.url), "utf8"),
    readFile(new URL("../desktop/main.mjs", import.meta.url), "utf8"),
    readFile(new URL("../lib/javascript-highlighting.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/python.ts", import.meta.url), "utf8"),
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
  assert.match(component, /EDITOR_MIN_WIDTH = 340/);
  assert.match(component, /visionMaximumWidth/);
  assert.match(component, /ALLAN ELSBERRY/);
  assert.match(component, /TEACHABLE MACHINE/);
  assert.match(component, /PIXEL X 0 · Y 0/);
  assert.match(component, /THRESHOLDING/);
  assert.match(component, /APRILTAG DETECTION/);
  assert.match(component, /GENERATE PDF/);
  assert.match(component, /openAprilTagPdf/);
  assert.match(component, /openSimulatorObjectPdf/);
  assert.match(component, /PRINT A SIMULATOR TARGET/);
  assert.match(component, /tag36h11/);
  assert.doesNotMatch(component, /ONE TEST AT A TIME/);
  assert.match(component, /cameraProxyAvailable/);
  assert.match(component, /allow local-network access/i);
  assert.match(component, /Bluetooth permission is blocked/);
  assert.match(component, /useState<WifiState>\("disconnected"\)/);
  assert.match(component, /type="range"/);
  assert.match(component, /MINIMUM CONFIDENCE/);
  assert.match(component, /useState<EditorMode>\(DEFAULT_EDITOR_MODE\)/);
  assert.match(component, /setEditorMode\(DEFAULT_EDITOR_MODE\)/);
  assert.match(component, /ENABLED_EDITOR_MODES\.map/);
  assert.match(component, /tokenizePython\(pythonCode\)/);
  assert.match(component, /transpilePython\(source\)/);
  assert.match(component, /aria-label="Python program"/);
  assert.match(component, /pythonCode:/);
  assert.match(component, /seedJavascriptFromBlocks/);
  assert.match(component, /tokenizeJavaScript\(javascriptCode\)/);
  assert.match(component, /className="javascript-highlight"/);
  assert.match(component, /syncJavaScriptScroll/);
  assert.match(component, /CodeQuickReference language="python"/);
  assert.match(component, /CodeQuickReference language="javascript"/);
  assert.match(codeQuickReference, /Python" : "JavaScript"\} quick guide/);
  assert.match(codeQuickReference, /binary_at/);
  assert.match(codeQuickReference, /center_on_object/);
  assert.match(codeQuickReference, /Decisions \+ loops/);
  assert.match(codeQuickReference, /Parameters:/);
  assert.match(codeQuickReference, /Returns:/);
  assert.match(codeQuickReference, /\\"white\\" \| \\"black\\"/);
  assert.match(codeQuickReference, /Promise<boolean>/);
  assert.match(codeQuickReference, /minimumConfidence/);
  assert.match(component, /className="information-menu"/);
  assert.match(component, /INFORMATION_LESSONS\.map/);
  assert.match(component, /#\/information/);
  assert.match(component, /InformationLessonLauncher/);
  assert.match(lessonLauncher, /lazy\(\(\) => import\("\.\/InformationLessonReader"\)\)/);
  assert.match(lessonLauncher, /hash === "#\/information"/);
  assert.match(lessonLauncher, /hash\.startsWith\("#\/information\/"\)/);
  assert.doesNotMatch(component, /PDF slide decks/);
  assert.match(lessonReader, /role="dialog"/);
  assert.match(lessonReader, /aria-modal="true"/);
  assert.match(lessonLauncher, /event\.key === "Escape"/);
  assert.match(lessonLauncher, /event\.key !== "Tab"/);
  assert.match(lessonReader, /hashchange/);
  assert.match(lessonLauncher, /previousFocusRef/);
  assert.match(lessonReader, /embedInformationLessonAssets/);
  assert.match(lessonLauncher, /setAttribute\("inert", ""\)/);
  assert.match(lessonReader, /history\.replaceState/);
  assert.match(lessonReader, /useState<LessonRoute>\(\(\) => routeFromHash\(\)\)/);
  assert.match(lessonReader, /decodeURIComponent[\s\S]*?catch/);
  assert.match(lessonReader, /document\.execCommand\("copy"\)/);
  assert.match(generatedLessons, /01-hopper-sensor-suite/);
  assert.match(generatedLessons, /09-python-coding-reference/);
  assert.match(component, /javascriptAutosaveTimerRef/);
  assert.match(component, /objectConfidencePercent \/ 100/);
  assert.match(component, /visibleDetections/);
  assert.match(component, /detection\.confidence/);
  assert.match(component, /batteryTone/);
  assert.match(component, /highlightBlock/);
  assert.match(component, /requestOfflineCacheRefresh/);
  assert.match(component, /waitForServiceWorkerActivation/);
  assert.match(component, /serviceWorker\.register/);
  assert.match(component, /Hard refresh \$\{STUDIO_NAME\}/);
  assert.match(component, /OFFLINE READY/);
  assert.match(component, /MANUAL OVERRIDE/);
  assert.match(component, /manualNudge/);
  assert.match(component, /showConsole \? "above-console"/);
  assert.match(component, /ArrowUp: "forward"/);
  assert.match(component, /event\.code === "Space"/);
  assert.match(component, /simulatorWindow \? \[window, simulatorWindow\]/);
  assert.match(component, /navigator\.maxTouchPoints > 0/);
  assert.match(component, /new SimulatedDroneController\([\s\S]*?simulatorSurface/);
  assert.match(component, /className="manual-land"[\s\S]*?onClick=\{\(\) => void stopProgram\(\)\}/);
  assert.match(component, /visionTestingMode !== "object"[\s\S]*?setInterval\(\(\) => void previewObjects\(\), 1800\)/);
  assert.match(component, /visionTestingMode !== "apriltag"[\s\S]*?setInterval\(\(\) => void previewAprilTags\(\), 900\)/);
  assert.match(component, /setSimulatorDetections\(nextDetections\)/);
  assert.match(component, /setSimulatorAprilTags\(nextTags\)/);
  const stopProgramSource = component.slice(
    component.indexOf("const stopProgram = useCallback"),
    component.indexOf("const manualNudge"),
  );
  assert.doesNotMatch(stopProgramSource, /setVisionTestingMode/);
  const visionRuntimeSetup = component.slice(
    component.indexOf("const vision = new VisionRuntime"),
    component.indexOf("visionRef.current = vision"),
  );
  assert.doesNotMatch(visionRuntimeSetup, /setVisionTestingMode/);
  assert.match(drone, /9a66fa00-0800-9191-11e4-012d1540cb8e/);
  assert.match(drone, /HOPPER/);
  assert.match(drone, /interface DroneController/);
  assert.match(drone, /abortRun/);
  assert.match(drone, /runGeneration/);
  assert.match(drone, /isRunActive/);
  assert.match(drone, /manualFlightOverride/);
  assert.match(drone, /manualNudge/);
  assert.match(drone, /DATA_WITH_ACK_PACKET_TYPE/);
  assert.match(drone, /writeAcknowledgedCommand/);
  assert.match(drone, /pendingCommandAcks/);
  assert.doesNotMatch(drone, /sensorHealth|linkRssi/);
  assert.match(simulatorComponent, /SIMULATED DRONE ROOM/);
  assert.match(simulatorComponent, /UPLOAD IMAGE/);
  assert.match(simulatorComponent, /5 × 5 IN/);
  assert.match(simulatorComponent, /createPortal/);
  assert.match(simulatorComponent, /Drag Hopper drone to reposition it/);
  assert.match(simulatorComponent, /sim-vision-box/);
  assert.match(simulatorTargets, /Person \(Marine\)/);
  assert.match(simulatorTargets, /sim-assets\/marine-digicam\.png/);
  assert.doesNotMatch(simulatorComponent, /💂/);
  assert.match(simulatorTargets, /menuLabel: "Knife"/);
  assert.match(simulatorTargets, /menuLabel: "Stop sign"/);
  assert.match(simulatorTargets, /Computer \(laptop\)/);
  assert.match(simulatorTargets, /menuLabel: "Truck"/);
  assert.match(simulatorTargets, /menuLabel: "Flag \(red\)"/);
  assert.match(simulatorTargets, /menuLabel: "Flag \(blue\)"/);
  assert.match(simulatorTargets, /buildSimulatorObjectPdf/);
  assert.match(simulatorTargets, /\/MediaBox \[0 0 612 792\]/);
  assert.match(simulatorTargets, /Print at Actual Size \/ 100%/);
  assert.match(simulatorComponent, /sim-capture-flag/);
  assert.match(simulatorComponent, /object\.flagColor === "red"/);
  assert.match(simulatorComponent, /person-soldier-default/);
  assert.match(simulatorComponent, /apriltag-7-left/);
  assert.match(simulatorComponent, /apriltag-19-right/);
  assert.match(simulatorComponent, /rotation: 180/);
  assert.match(simulatorComponent, /Choose an object to add/);
  assert.match(simulatorComponent, /ADD TAG/);
  assert.match(simulatorComponent, /sim-tag-x-axis-arrow/);
  assert.match(simulatorComponent, /sim-mobile-inspector/);
  assert.match(component, /simulatorInline/);
  assert.match(component, /viewport-fit=cover/);
  assert.match(component, /wrap="off"/);
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
  assert.match(simulation, /flagColor\?: "red" \| "blue"/);
  assert.match(runtime, /runBlock/);
  assert.match(vision, /lite_mobilenet_v2/);
  assert.match(vision, /scanThreshold/);
  assert.match(vision, /analyzeThreshold/);
  assert.match(styles, /\.manual-flight-pad/);
  assert.match(styles, /\.manual-flight-pad\.above-console/);
  assert.match(vision, /scanAprilTags/);
  assert.match(vision, /centerOnAprilTag/);
  assert.match(vision, /centerOnObject/);
  assert.match(vision, /seesAnyObject/);
  assert.match(vision, /binaryAt/);
  assert.match(vision, /normalizedCoordinateToPixel/);
  assert.match(vision, /this\.scanned\("custom"/);
  assert.match(vision, /safeLostTagSearches/);
  assert.match(vision, /AprilTag centering: tag/);
  assert.match(vision, /await drone\.rotate/);
  assert.match(vision, /detectionCenterCoordinate/);
  assert.match(vision, /lastObjectCoordinates/);
  assert.match(vision, /loadCustomModel/);
  assert.match(vision, /async capturePhoto\(maxWidth = 960\)/);
  assert.match(vision, /canvas\.toBlob/);
  assert.match(vision, /desktop\/local app or connect through the camera proxy/);
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
  assert.match(blockly, /vision_center_object/);
  assert.match(blockly, /POWER: numberShadow\(15\)/);
  assert.doesNotMatch(blockly, /YAW_POWER/);
  assert.match(blockly, /LOST_SEARCHES/);
  assert.match(blockly, /RESCAN_DELAY/);
  assert.match(blockly, /rescan after roll\/pitch/);
  assert.doesNotMatch(blockly, /vision_sees_color/);
  assert.match(blockly, /vision_sees_custom_label/);
  assert.match(blockly, /vision_sees_any_object/);
  assert.match(blockly, /vision\.seesAnyObject/);
  assert.match(blockly, /vision_object_coordinate/);
  assert.match(component, /VIEW ALL \{COCO_OBJECT_LABELS\.length\} BUILT-IN LABELS/);
  assert.match(component, /role="dialog"/);
  assert.match(styles, /\.coco-label-dialog/);
  assert.match(blockly, /minidrone_takeoff/);
  assert.match(blockly, /message0: "take and store photo"/);
  assert.match(blockly, /await drone\.takePicture\(\)/);
  assert.match(
    blockly,
    /Fly forward for 2 seconds at 15% power\.[\s\S]*?<next>[\s\S]*?<block type="minidrone_land">[\s\S]*?Land safely at the end of the mission\./,
  );
  assert.match(blockly, /activeStatement/);
  assert.match(blockly, /activeExpression/);
  assert.match(blockly, /class SingleBlockDragStrategy/);
  assert.match(blockly, /shouldHealStack\([^)]*\)[\s\S]*?return true/);
  assert.match(blockly, /enableSingleBlockDragging\(workspace\)/);
  assert.match(blockly, /workspace\.isDragging\(\)/);
  assert.match(blockly, /getDragStrategy\(\) instanceof SingleBlockDragStrategy/);
  assert.match(blockly, /Blockly\.Events\.BLOCK_DRAG/);
  assert.match(blockly, /isStart === false/);
  assert.match(component, /property === "takePicture"/);
  assert.match(component, /captureAndStorePhoto/);
  assert.match(component, /MISSION PHOTOS/);
  assert.match(component, /CLEAR ALL/);
  assert.match(component, /URL\.revokeObjectURL/);
  assert.match(component, /missionPhotos\.map/);
  assert.match(styles, /--header: #001b3a/);
  assert.match(styles, /--red: #008c95/);
  assert.match(blockly, /new URL\("blockly\/media\/", document\.baseURI\)/);
  assert.doesNotThrow(() => new Function(serviceWorker));
  assert.match(serviceWorker, /HARD_REFRESH/);
  assert.match(serviceWorker, /request\.mode === "navigate"/);
  assert.match(serviceWorker, /cachedNavigation/);
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
  for (const lessonPath of informationLessonPaths) {
    const slug = lessonPath.split("/").at(-1).replace(/\.html$/, "");
    assert.ok(generatedLessons.includes(slug), `${slug} is bundled into the Information reader`);
    assert.ok(serviceWorker.includes(lessonPath), `${lessonPath} is cached by the offline worker`);
    assert.ok(offlineManifest.assets.includes(lessonPath), `${lessonPath} is in the offline manifest`);
  }
  assert.match(styles, /activeBlockGlow/);
  assert.match(styles, /sim-pitch-reference/);
  assert.match(styles, /visionScanSweep/);
  assert.match(styles, /threshold-camera-overlay/);
  assert.match(styles, /apriltag-overlay/);
  assert.match(styles, /rotateX\(var\(--sim-flip-pitch/);
  assert.match(styles, /height: 232px/);
  assert.match(styles, /wrcRefreshSpin/);
  assert.match(styles, /local-pill\.saving/);
  assert.match(styles, /\.js-token-keyword/);
  assert.match(styles, /\.py-token-keyword/);
  assert.match(styles, /\.javascript-highlight/);
  assert.match(styles, /\.python-highlight/);
  assert.match(styles, /\.code-quick-reference/);
  assert.match(styles, /\.information-menu-panel/);
  assert.match(styles, /\.mission-photo-strip/);
  assert.match(styles, /\.sim-capture-flag\.red/);
  assert.match(readme, /start-windows\.bat/);
  assert.match(readme, /local-network access prompt/i);
  assert.match(readme, /Bluetooth flight control is independent/);
  assert.match(readme, /hair drier/);
  assert.match(readme, /Altitude telemetry/);
  assert.match(readme, /Use the simulated drone/);
  assert.match(readme, /Use Hopper Studio offline/);
  assert.match(readme, /codingOptions/);
  assert.match(readme, /enabledEditors/);
  assert.match(readme, /OpenMoji/);
  assert.match(readme, /Standard model versus embedded model/);
  assert.match(packageJson, /"build:student"/);
  assert.match(packageJson, /"build:pages"/);
  assert.match(packageJson, /"apriltag"/);
  assert.match(brandingModule, /config\/branding\.json/);
  assert.match(brandingModule, /DEFAULT_EDITOR_MODE/);
  assert.match(brandingModule, /ENABLED_EDITOR_MODES/);
  assert.match(javascriptHighlighting, /export function tokenizeJavaScript/);
  assert.match(pythonSurface, /export function tokenizePython/);
  assert.match(pythonSurface, /export function transpilePython/);
  assert.match(pythonSurface, /PYTHON_STARTER_PROGRAM/);
  assert.match(desktopBuilder, /config\/branding\.json/);
  assert.match(desktopBuilder, /productName: studioName/);
  assert.match(desktopMain, /new URL\(value\)\.protocol === "https:"/);
  assert.match(desktopMain, /shell\.openExternal\(value\)/);
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
    access(new URL("../public/sim-assets/marine-digicam.png", import.meta.url)),
    access(new URL("../public/sw.js", import.meta.url)),
    access(new URL("../scripts/write-offline-manifest.mjs", import.meta.url)),
    ...informationLessonPaths.flatMap((lessonPath) => [
      access(new URL(`../public/${lessonPath}`, import.meta.url)),
      access(new URL(`../student-build/${lessonPath}`, import.meta.url)),
    ]),
  ]);
  await assert.rejects(access(new URL("app/_sites-preview", root)));
});

test("generates nine semantic, self-contained HTML information lessons", async () => {
  const pages = await Promise.all(
    informationLessonPaths.map(async (lessonPath) => ({
      lessonPath,
      html: await readFile(new URL(`../public/${lessonPath}`, import.meta.url), "utf8"),
    })),
  );
  const lessonCss = await readFile(
    new URL("../public/information/assets/lesson.css", import.meta.url),
    "utf8",
  );
  const combined = pages.map(({ html }) => html).join("\n");

  for (const { lessonPath, html } of pages) {
    assert.match(html, /<!doctype html>/i, `${lessonPath} is a complete HTML document`);
    assert.match(html, /<html lang="en">/i, `${lessonPath} declares its language`);
    assert.match(html, /<meta name="viewport"/i, `${lessonPath} is responsive`);
    assert.equal((html.match(/<h1\b/gi) ?? []).length, 1, `${lessonPath} has one h1`);
    assert.match(html, /<main class="lesson-main">/i, `${lessonPath} has a semantic main region`);
    assert.match(html, /<nav class="lesson-toc"/i, `${lessonPath} has lesson navigation`);
    assert.match(html, /class="lesson-mobile-toc"/i, `${lessonPath} has compact mobile navigation`);
    assert.match(html, /Sources and verification/i, `${lessonPath} identifies its sources`);
    assert.doesNotMatch(html, /<(?:script|link)[^>]+(?:unpkg|jsdelivr|cdnjs|fonts\.googleapis)/i);
    assert.doesNotMatch(html, /(?:src|href)="[^"]*sensor_map\.jpeg/i);
    assert.doesNotMatch(html, /href="[^"]*information\/[^"]+\.pdf/i);

    for (const match of html.matchAll(/src="assets\/images\/([^"]+)"/g)) {
      await access(
        new URL(`../public/information/assets/images/${match[1]}`, import.meta.url),
      );
    }
  }

  assert.match(combined, /<math\b/i, "LaTeX equations are pre-rendered as accessible MathML");
  assert.match(combined, /class="language-javascript"/i);
  assert.match(combined, /class="language-python"/i);
  assert.match(combined, /class="token keyword"/i);
  assert.match(combined, /hopper-underbody-generated\.jpg/i);
  assert.match(combined, /x-quadrotor-top-generated\.jpg/i);
  assert.doesNotMatch(
    combined,
    /<aside class="lesson-callout[^"]*">\s*<span/i,
    "callouts must not insert an empty grid item before their text",
  );
  assert.match(combined, /class="nn-pipeline"/i);
  assert.match(combined, /Stored inference coefficients[\s\S]*?4,500,927/i);
  assert.match(lessonCss, /\.token\.keyword/);
  assert.match(lessonCss, /\.lesson-callout\s*\{[^}]*position:\s*relative/s);
  assert.match(lessonCss, /\.lesson-callout::before\s*\{[^}]*position:\s*absolute/s);
  assert.match(lessonCss, /@media \(max-width: 760px\)/);
  assert.match(lessonCss, /@media print/);

  const singleFile = await readFile(
    new URL("../student-build/hopper-studio.html", import.meta.url),
    "utf8",
  );
  for (const lessonPath of informationLessonPaths) {
    const slug = lessonPath.split("/").at(-1).replace(/\.html$/, "");
    assert.ok(singleFile.includes(slug), `${slug} is bundled into the single-file app`);
  }
  assert.match(singleFile, /data:image\/png;base64,/);

  const hostedAssetNames = await readdir(
    new URL("../dist/client/assets/", import.meta.url),
  );
  const readerAssetName = hostedAssetNames.find((name) =>
    /^InformationLessonReader-.*\.js$/.test(name)
  );
  assert.ok(readerAssetName, "the hosted lesson reader is emitted as a lazy chunk");
  const hostedReader = await readFile(
    new URL(`../dist/client/assets/${readerAssetName}`, import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    hostedReader,
    /data:image\/(?:png|jpeg);base64,/,
    "the hosted reader reuses cached image files instead of embedding duplicates",
  );
  assert.match(hostedReader, /\/information\/assets\/images\//);
});

test("every highlighted Python and JavaScript lesson example parses in Hopper Studio", async () => {
  const pythonSource = await readFile(new URL("../lib/python.ts", import.meta.url), "utf8");
  const compiledPython = ts.transpileModule(pythonSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const python = await import(
    `data:text/javascript;base64,${Buffer.from(compiledPython).toString("base64")}#lesson-examples`
  );
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const decodeCode = (html) =>
    html
      .replace(/<[^>]+>/g, "")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&quot;", '"')
      .replaceAll("&#039;", "'")
      .replaceAll("&amp;", "&");

  let examples = 0;
  for (const lessonPath of informationLessonPaths) {
    const html = await readFile(new URL(`../public/${lessonPath}`, import.meta.url), "utf8");
    for (const match of html.matchAll(
      /<code class="language-(python|javascript)">([\s\S]*?)<\/code>/g,
    )) {
      const source = decodeCode(match[2]);
      if (match[1] === "python") {
        assert.doesNotThrow(
          () => python.transpilePython(source),
          `${lessonPath} contains a Python example the classroom transpiler rejects`,
        );
      } else {
        assert.doesNotThrow(
          () => new AsyncFunction("drone", "vision", "runtime", "console", source),
          `${lessonPath} contains invalid JavaScript`,
        );
      }
      examples += 1;
    }
  }
  assert.ok(examples >= 15, "all documented code examples were discovered");
});

test("tokenizes JavaScript for safe source-preserving syntax highlighting", async () => {
  const source = await readFile(
    new URL("../lib/javascript-highlighting.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const highlighting = await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
  const program = [
    "// mission",
    "const retries = 2;",
    "const result = await drone.takePicture();",
    "console.log(`photo ${result ?? 1}`);",
  ].join("\n");
  const tokens = highlighting.tokenizeJavaScript(program);

  assert.equal(tokens.map((token) => token.text).join(""), program);
  assert.ok(tokens.some((token) => token.kind === "comment"));
  assert.ok(tokens.some((token) => token.kind === "keyword" && token.text.includes("await")));
  assert.ok(tokens.some((token) => token.kind === "function" && token.text.includes("takePicture")));
  assert.ok(tokens.some((token) => token.kind === "string"));
  assert.ok(tokens.some((token) => token.kind === "number"));
});

test("highlights and translates the classroom Python surface to the async runtime", async () => {
  const source = await readFile(new URL("../lib/python.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const python = await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}#python`
  );
  const starterJavascript = python.transpilePython(python.PYTHON_STARTER_PROGRAM);
  const starterSteps = [
    "await drone.takeOff()",
    "await drone.wait(2)",
    'await drone.fly("forward", 2, 15)',
    "await drone.takePicture()",
    'await drone.rotate(180, "clockwise")',
    'await drone.fly("forward", 2, 15)',
  ];
  let previousStarterStep = -1;
  for (const step of starterSteps) {
    const stepIndex = starterJavascript.indexOf(step, previousStarterStep + 1);
    assert.ok(stepIndex > previousStarterStep, `Starter mission is missing or reorders: ${step}`);
    previousStarterStep = stepIndex;
  }
  assert.match(python.PYTHON_STARTER_PROGRAM, /15% power/);
  assert.match(python.PYTHON_STARTER_PROGRAM, /180 degrees/);
  assert.match(
    python.transpilePython('fly("forward")'),
    /await drone\.fly\("forward", 1, 15\);/,
  );
  assert.match(
    python.transpilePython('fly("forward", 2)'),
    /await drone\.fly\("forward", 2, 15\);/,
  );
  assert.match(
    python.transpilePython('binary_at("white", x=100, y=100)'),
    /await vision\.binaryAt\("white", 100, 100\);/,
  );
  assert.match(
    python.transpilePython('center_on_binary("white", coverage=15)'),
    /await vision\.centerOnBinary\(drone, "white", 60, 15\);/,
  );
  assert.match(
    python.transpilePython('center_on_object("person", rescan_delay=0.8)'),
    /await vision\.centerOnObject\(drone, "person", 10, 0\.55, 5, 3, 0\.8\);/,
  );
  assert.match(
    python.transpilePython("center_on_april_tag(id=7)"),
    /await vision\.centerOnAprilTag\(drone, 7\);/,
  );

  const program = [
    "# safe search",
    "def search(steps):",
    "    photos = 0",
    "    for step in range(steps):",
    "        fly(\"forward\", seconds=0.1, power=12)",
    "        photos += 1",
    "    return photos",
    "",
    "take_off()",
    "try:",
    "    result = search(2)",
    "    if result == 2 and not stopped():",
    "        take_photo()",
    "finally:",
    "    land()",
  ].join("\n");
  const tokens = python.tokenizePython(program);
  assert.equal(tokens.map((token) => token.text).join(""), program);
  assert.ok(tokens.some((token) => token.kind === "keyword" && token.text.includes("for")));
  assert.ok(tokens.some((token) => token.kind === "function" && token.text.includes("fly")));
  assert.ok(tokens.some((token) => token.kind === "comment"));
  assert.ok(tokens.some((token) => token.kind === "string"));

  const javascript = python.transpilePython(program);
  assert.match(javascript, /async function search/);
  assert.match(javascript, /await drone\.fly\("forward", 0\.1, 12\)/);
  assert.match(javascript, /await runtime\.tick\(\)/);
  assert.match(javascript, /await drone\.takePicture\(\)/);
  const calls = [];
  const drone = {
    async takeOff() { calls.push("takeoff"); },
    async fly(direction, seconds, power) { calls.push(["fly", direction, seconds, power]); },
    async takePicture() { calls.push("photo"); },
    async land() { calls.push("land"); },
  };
  const runtime = {
    stopped: false,
    async tick() { calls.push("tick"); },
  };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction("drone", "vision", "runtime", "console", javascript)(
    drone,
    {},
    runtime,
    console,
  );
  assert.deepEqual(calls, [
    "takeoff",
    ["fly", "forward", 0.1, 12],
    "tick",
    ["fly", "forward", 0.1, 12],
    "tick",
    "photo",
    "land",
  ]);
  assert.throws(
    () => python.transpilePython("take_off()\n  land()"),
    /Python line 2: unexpected indentation/,
  );
});

test("captures real and simulated camera frames as session JPEG photos", async () => {
  const source = await readFile(new URL("../lib/vision.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(
    /^import \{ detectAprilTags \} from "\.\/apriltags";$/m,
    "const detectAprilTags = () => [];",
  );
  const visionModule = await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}#photo`
  );
  const originalDocument = globalThis.document;
  const originalImageElement = globalThis.HTMLImageElement;
  const originalCanvasElement = globalThis.HTMLCanvasElement;

  class MockImage {
    naturalWidth = 1280;
    naturalHeight = 720;
  }

  class MockCanvas {
    width = 640;
    height = 360;
    securityError = false;

    getContext() {
      return { drawImage() {} };
    }

    toBlob(callback, type) {
      if (this.securityError) throw new DOMException("Blocked", "SecurityError");
      callback(new Blob(["jpeg"], { type }));
    }
  }

  globalThis.HTMLImageElement = MockImage;
  globalThis.HTMLCanvasElement = MockCanvas;
  globalThis.document = { createElement: () => new MockCanvas() };

  try {
    const noOp = () => undefined;
    let cameraSource = new MockImage();
    const runtime = new visionModule.VisionRuntime(
      () => cameraSource,
      () => null,
      noOp,
      noOp,
      noOp,
      noOp,
      noOp,
      noOp,
      noOp,
      noOp,
    );
    const realPhoto = await runtime.capturePhoto();
    assert.equal(realPhoto.width, 960);
    assert.equal(realPhoto.height, 540);
    assert.equal(realPhoto.blob.type, "image/jpeg");

    cameraSource = new MockCanvas();
    const simulatedPhoto = await runtime.capturePhoto();
    assert.equal(simulatedPhoto.width, 640);
    assert.equal(simulatedPhoto.height, 360);

    const missingRuntime = new visionModule.VisionRuntime(
      () => null,
      () => null,
      noOp,
      noOp,
      noOp,
      noOp,
      noOp,
      noOp,
      noOp,
      noOp,
    );
    await assert.rejects(
      missingRuntime.capturePhoto(),
      /Connect the camera feed before taking and storing a photo/,
    );

    globalThis.document = {
      createElement: () => {
        const canvas = new MockCanvas();
        canvas.securityError = true;
        return canvas;
      },
    };
    cameraSource = new MockImage();
    await assert.rejects(
      runtime.capturePhoto(),
      /desktop\/local app or connect through the camera proxy/,
    );
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalImageElement === undefined) delete globalThis.HTMLImageElement;
    else globalThis.HTMLImageElement = originalImageElement;
    if (originalCanvasElement === undefined) delete globalThis.HTMLCanvasElement;
    else globalThis.HTMLCanvasElement = originalCanvasElement;
  }
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
  const serviceWorkerListeners = new Map();
  const serviceWorkerSelf = {
    registration: { scope: "https://hopper.test/" },
    clients: { claim: async () => undefined },
    skipWaiting: async () => undefined,
    addEventListener(type, listener) {
      serviceWorkerListeners.set(type, listener);
    },
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

  const cachedLessonUrl = "https://hopper.test/information/01-hopper-sensor-suite.html";
  const cachedLesson = await activeCache.match(new Request(cachedLessonUrl));
  assert.equal(await cachedLesson.text(), "asset");
  unavailablePath = "/information/01-hopper-sensor-suite.html";
  const offlineLessonRequest = new Request(cachedLessonUrl);
  Object.defineProperty(offlineLessonRequest, "mode", { value: "navigate" });
  let offlineLessonResponse;
  serviceWorkerListeners.get("fetch")({
    request: offlineLessonRequest,
    respondWith(response) {
      offlineLessonResponse = Promise.resolve(response);
    },
    waitUntil() {},
  });
  assert.ok(offlineLessonResponse);
  assert.equal(await (await offlineLessonResponse).text(), "asset");

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
  assert.deepEqual(visionMath.normalizedCoordinateToPixel({ x: 0, y: 0 }, 101, 101), {
    x: 50,
    y: 50,
  });
  assert.deepEqual(visionMath.normalizedCoordinateToPixel({ x: 100, y: 100 }, 101, 101), {
    x: 100,
    y: 0,
  });
  assert.deepEqual(visionMath.binaryCentroid(binary, "white"), {
    x: 0,
    y: 0,
    coverage: 50,
  });

  const noOp = () => undefined;
  const centeringLogs = [];
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
    (message) => centeringLogs.push(message),
  );
  runtime.scanThreshold = async () => binary;
  assert.equal(await runtime.binaryAt("white", 100, 100, 60, false), true);
  assert.equal(await runtime.binaryAt("black", -100, 100, 60, false), true);
  const binaryScanSequence = [
    { ...binary, frameWidth: 10, frameHeight: 10, binaryData: new Uint8ClampedArray(400).fill(255) },
    binary,
  ];
  runtime.scanThreshold = async () => binaryScanSequence.shift() ?? binary;
  const binaryCommands = [];
  const binaryDrone = {
    cancelRunFlag: false,
    setAxis(axis, power) { binaryCommands.push(["axis", axis, power]); },
    reset() { binaryCommands.push(["reset"]); },
    async wait(seconds) { binaryCommands.push(["wait", seconds]); },
  };
  assert.equal(await runtime.centerOnBinary(binaryDrone, "white", 60, 10, 8, 5, 3, 0.5), true);

  let objectScans = 0;
  runtime.detectObjects = async () => {
    objectScans += 1;
    return [{ class: "bottle", score: 0.97 }];
  };
  assert.equal(await runtime.seesObject("bottle", 0.55), true);
  assert.equal(await runtime.seesAnyObject(0.95), true);
  runtime.detectObjects = async () => {
    objectScans += 1;
    return [{ class: "bottle", score: 0.54 }];
  };
  assert.equal(await runtime.seesAnyObject(0.55), false);
  assert.equal(objectScans, 3, "camera sees object blocks perform their own scans");

  const objectScanSequence = [
    [{ class: "person", score: 0.97, centerX: -18, centerY: 0 }],
    [],
    [{ class: "person", score: 0.97, centerX: 0, centerY: 12 }],
    [{ class: "person", score: 0.97, centerX: 0, centerY: 0 }],
  ];
  runtime.detectObjects = async () => objectScanSequence.shift() ?? [];
  const objectCommands = [];
  const objectDrone = {
    cancelRunFlag: false,
    setAxis(axis, power) { objectCommands.push(["axis", axis, power]); },
    reset() { objectCommands.push(["reset"]); },
    async wait(seconds) { objectCommands.push(["wait", seconds]); },
  };
  assert.equal(await runtime.centerOnObject(objectDrone, "person", 8, 0.55, 5, 3, 0.5), true);
  assert.ok(objectCommands.some((command) => command[0] === "axis" && command[1] === "roll" && command[2] === -8));
  assert.ok(objectCommands.some((command) => command[0] === "axis" && command[1] === "pitch" && command[2] === 8));
  assert.equal(objectCommands.some((command) => command[1] === "yaw"), false);
  assert.ok(objectCommands.some((command) => command[0] === "wait" && command[1] === 0.5));
  assert.ok(centeringLogs.some((message) => message.includes("yaw was not changed")));

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
    [{ id: 7, centerX: 0, centerY: 12, yaw: 0 }],
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
  assert.ok(commands.some((command) => command[0] === "axis" && command[1] === "pitch" && command[2] === 7));
  assert.ok(commands.some((command) => command[0] === "wait" && command[1] === 0.3));
  assert.ok(commands.some((command) => command[0] === "wait" && command[1] === 0.5));
  assert.ok(commands.some((command) => command[0] === "rotate" && command[1] === 20 && command[2] === "clockwise"));
  assert.ok(centeringLogs.some((message) => message.includes("tag 7 detected")));
  assert.ok(centeringLogs.some((message) => message.includes("moving right")));
  assert.ok(centeringLogs.some((message) => message.includes("moving forward")));
  assert.ok(centeringLogs.some((message) => message.includes("yawing clockwise 20°")));
  assert.ok(centeringLogs.some((message) => message.includes("centered and aligned")));
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
      )
      .replace(
        /^import \{ STUDIO_NAME \} from "\.\/branding";$/m,
        `const STUDIO_NAME = ${JSON.stringify(branding.studioName)};`,
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

test("sends real-drone flips on the acknowledged BLE channel and safely retries", async () => {
  const source = await readFile(new URL("../lib/drone.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const droneModule = await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
  const previousWindow = globalThis.window;
  const previousCustomEvent = globalThis.CustomEvent;
  const writes = [];
  let controller;
  globalThis.window = {
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    dispatchEvent() {},
  };
  globalThis.CustomEvent = class {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  };
  globalThis.window.CustomEvent = globalThis.CustomEvent;

  try {
    const characteristic = {
      async writeValue(value) {
        const packet = Uint8Array.from(new Uint8Array(value));
        writes.push([...packet]);
        if (writes.length === 2) {
          setTimeout(() => {
            const ack = Uint8Array.from([1, 0, packet[1]]);
            controller.receivePacket(new DataView(ack.buffer));
          }, 0);
        }
      },
    };
    const gattServer = {
      connected: true,
      disconnect() {},
      async connect() { return this; },
      async getPrimaryService() {
        return {
          async getCharacteristic() {
            return characteristic;
          },
        };
      },
    };
    controller = new droneModule.MamboController({
      id: "test-hopper",
      name: "Hopper test",
      gatt: gattServer,
      addEventListener() {},
    });
    controller.gattServer = gattServer;
    controller.wait = async () => undefined;

    await controller.flip("left");
    controller.abortRun();

    assert.equal(writes.length, 2, "a missing first ACK retries the same flip packet once");
    assert.deepEqual(writes[0], [4, 0, 2, 4, 0, 0, 3, 0, 0, 0]);
    assert.deepEqual(writes[1], writes[0], "retries reuse the sequence so the drone can deduplicate");
  } finally {
    controller?.abortRun();
    globalThis.window = previousWindow;
    globalThis.CustomEvent = previousCustomEvent;
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
    performance,
  };
  globalThis.CustomEvent = class {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  };
  globalThis.window.CustomEvent = globalThis.CustomEvent;

  try {
    const controller = new simulation.SimulatedDroneController();
    controller.connect();
    controller.setSceneObjects([
      { id: "landed-apple", label: "apple", x: 1.25, y: 1.2, size: 0.56, rotation: 0, kind: "object" },
      { id: "landed-tag", label: "AprilTag 23", x: 1.25, y: 1.2, size: 0.62, rotation: 22, kind: "apriltag", tagId: 23 },
    ]);
    assert.equal(controller.getSnapshot().z, 0);
    const landedObjects = controller.getSyntheticDetections(640, 360);
    assert.equal(landedObjects.length, 1, "object testing detects a floor target while the drone is landed");
    assert.equal(landedObjects[0].class, "apple");
    const landedTags = controller.getSyntheticAprilTags(640, 360);
    assert.equal(landedTags.length, 1, "AprilTag testing detects a floor marker while the drone is landed");
    assert.equal(landedTags[0].id, 23);
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
