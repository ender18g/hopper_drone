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

test("ships the local flight, vision, and student-build surfaces", async () => {
  const [component, drone, vision, blockly, readme, packageJson] = await Promise.all([
    readFile(new URL("../components/HopperStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/drone.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/vision.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/blockly.ts", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(component, /TELEMETRY/);
  assert.doesNotMatch(component, /DRONE TELEMETRY/);
  assert.doesNotMatch(component, /SENSOR HEALTH/);
  assert.match(component, /Connect drone/);
  assert.match(component, /STOP &amp; LAND/);
  assert.match(component, /Wi-Fi ready/);
  assert.match(component, /Resize Telemetry panel/);
  assert.match(component, /ALLAN ELSBERRY/);
  assert.match(component, /TEACHABLE MACHINE/);
  assert.match(component, /CENTER TARGET PIXEL/);
  assert.match(component, /type="range"/);
  assert.match(component, /detection\.confidence/);
  assert.match(component, /batteryTone/);
  assert.match(drone, /9a66fa00-0800-9191-11e4-012d1540cb8e/);
  assert.match(drone, /HOPPER/);
  assert.doesNotMatch(drone, /sensorHealth|linkRssi/);
  assert.match(vision, /lite_mobilenet_v2/);
  assert.match(vision, /colorCoverage/);
  assert.match(vision, /detectionCenterCoordinate/);
  assert.match(vision, /lastObjectCoordinates/);
  assert.match(vision, /loadCustomModel/);
  assert.match(blockly, /vision_sees_color/);
  assert.match(blockly, /vision_sees_custom_label/);
  assert.match(blockly, /vision_object_coordinate/);
  assert.match(blockly, /minidrone_takeoff/);
  assert.match(readme, /start-windows\.bat/);
  assert.match(readme, /hair drier/);
  assert.match(readme, /Altitude telemetry/);
  assert.match(readme, /Standard model versus embedded model/);
  assert.match(packageJson, /"build:student"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await Promise.all([
    access(new URL("../public/models/coco-ssd/model.json", import.meta.url)),
    access(new URL("../student-build/hopper-studio.html", import.meta.url)),
    access(new URL("../public/og.png", import.meta.url)),
    access(new URL("../app/api/camera/status/route.ts", import.meta.url)),
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
