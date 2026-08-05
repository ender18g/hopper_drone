import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("local server build packages the static site and both Mongoose binaries", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  const prepareScript = await read("scripts/prepare-local-server.mjs");
  const workflow = await read(".github/workflows/release-desktop.yml");

  assert.match(packageJson.scripts["build:local-server"], /build:pages/);
  assert.match(packageJson.scripts["build:local-server"], /prepare-local-server\.mjs/);
  assert.match(prepareScript, /Hopper-Studio-Local-Server/);
  assert.match(prepareScript, /mongoose\.exe/);
  assert.match(prepareScript, /mongoose_macos/);
  assert.match(workflow, /name: Local server ZIP/);
  assert.match(workflow, /Hopper-Studio-Local-Server\.zip/);
  assert.match(workflow, /needs: \[windows, macos, local-server\]/);

  const windowsBinary = await readFile(new URL("../mongoose/mongoose.exe", import.meta.url));
  const macBinary = await readFile(new URL("../mongoose/mongoose_macos", import.meta.url));
  assert.deepEqual([...windowsBinary.subarray(0, 2)], [0x4d, 0x5a]);
  assert.deepEqual([...macBinary.subarray(0, 4)], [0xcf, 0xfa, 0xed, 0xfe]);
  assert.ok((await stat(new URL("../mongoose/mongoose_macos", import.meta.url))).mode & 0o100);
});
