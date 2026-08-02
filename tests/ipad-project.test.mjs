import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("iPad build packages the student app and syncs Capacitor", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  const config = await read("capacitor.config.ts");
  const prepareScript = await read("scripts/prepare-ipad.mjs");

  assert.match(packageJson.scripts["build:ipad"], /build:student/);
  assert.match(packageJson.scripts["build:ipad"], /cap sync ios/);
  assert.match(config, /webDir: "student-build"/);
  assert.match(config, /appId: "org\.usna\.hopperstudio"/);
  assert.match(prepareScript, /hopper-studio\.html/);
  assert.match(prepareScript, /index\.html/);
  assert.match(prepareScript, /group1-shard1of5/);
  assert.match(prepareScript, /`\$\{shard\}\.bin`/);
});

test("iPad native project declares and registers hardware bridges", async () => {
  const info = await read("ios/App/App/Info.plist");
  const plugin = await read("ios/App/App/HopperNativePlugin.swift");
  const scene = await read("ios/App/App/SceneDelegate.swift");
  const project = await read("ios/App/App.xcodeproj/project.pbxproj");

  assert.match(info, /NSBluetoothAlwaysUsageDescription/);
  assert.match(info, /NSLocalNetworkUsageDescription/);
  assert.match(plugin, /import CoreBluetooth/);
  assert.match(plugin, /components\.host == "192\.168\.2\.1"/);
  assert.match(plugin, /components\.port == nil \|\| components\.port == 80/);
  assert.match(plugin, /registerPluginInstance\(HopperNativePlugin\(\)\)/);
  assert.match(scene, /HopperBridgeViewController\(\)/);
  assert.match(project, /HopperNativePlugin\.swift in Sources/);
  assert.match(project, /TARGETED_DEVICE_FAMILY = 2/);
});

test("web runtime selects native iPad Bluetooth and camera paths", async () => {
  const adapter = await read("lib/ipad-native.ts");
  const drone = await read("lib/drone.ts");
  const studio = await read("components/HopperStudio.tsx");
  const vision = await read("lib/vision.ts");

  assert.match(adapter, /Capacitor\.getPlatform\(\) === "ios"/);
  assert.match(adapter, /requestDevice/);
  assert.match(adapter, /cameraFrame/);
  assert.match(drone, /__hopperNativeBluetooth/);
  assert.match(studio, /startNativeCamera/);
  assert.match(studio, /checkNativeCamera/);
  assert.match(studio, /nativeCameraPendingFrameRef/);
  assert.match(studio, /objectModelError/);
  assert.match(vision, /registerLoadRouter/);
  assert.match(vision, /new XMLHttpRequest\(\)/);
  assert.match(vision, /createBundledModelHandler/);
  assert.match(vision, /getModelArtifactsForJSON/);
  assert.match(vision, /stabilizeSingleFrameModelForIPad/);
  assert.match(vision, /replacements !== 8/);
  assert.match(vision, /routeBundledShardsForIPad/);
  assert.match(vision, /replacements !== 5/);
  assert.match(vision, /createObjectDetectionTensor/);
  assert.match(vision, /tf\.tensor3d\(rgb, \[inputSize, inputSize, 3\], "int32"\)/);
  assert.match(vision, /Object scan failed:/);
  assert.match(vision, /const originalInputs = node\.input \?\? \[\]/);
  assert.match(vision, /originalInputs\.map/);
  assert.match(studio, /objectScanSummary/);
  assert.match(vision, /bundledModelShardSizes/);
  assert.match(vision, /usesBundledIPadModel/);
  assert.match(vision, /tf\.setBackend\("cpu"\)/);
});
