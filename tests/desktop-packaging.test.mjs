import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { verifyWindowsRuntimeFiles } from "../desktop/build/after-pack.mjs";

const require = createRequire(import.meta.url);
const desktopBuild = require("../desktop/electron-builder.config.cjs");

test("desktop packages retain a locale that exists on each platform", () => {
  assert.equal(desktopBuild.electronLanguages, undefined);
  assert.deepEqual(desktopBuild.win.electronLanguages, ["en-US"]);
  assert.deepEqual(desktopBuild.mac.electronLanguages, ["en"]);
});

test("Windows packaging rejects a missing runtime locale", async () => {
  const appOutDir = await mkdtemp(join(tmpdir(), "hopper-win-package-test-"));
  await mkdir(join(appOutDir, "resources"));
  await writeFile(join(appOutDir, "resources", "app.asar"), "asar");

  try {
    await assert.rejects(
      verifyWindowsRuntimeFiles({ electronPlatformName: "win32", appOutDir }),
      /required en-US Electron locale pack/,
    );
  } finally {
    await rm(appOutDir, { recursive: true, force: true });
  }
});

test("Windows packaging accepts its required runtime files", async () => {
  const appOutDir = await mkdtemp(join(tmpdir(), "hopper-win-package-test-"));
  await mkdir(join(appOutDir, "locales"));
  await mkdir(join(appOutDir, "resources"));
  await writeFile(join(appOutDir, "locales", "en-US.pak"), "locale");
  await writeFile(join(appOutDir, "resources", "app.asar"), "asar");

  try {
    await verifyWindowsRuntimeFiles({ electronPlatformName: "win32", appOutDir });
  } finally {
    await rm(appOutDir, { recursive: true, force: true });
  }
});
