import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startDesktopServer } from "../desktop/server.mjs";

async function withDesktopServer(callback) {
  const staticRoot = await mkdtemp(join(tmpdir(), "hopper-desktop-test-"));
  await writeFile(join(staticRoot, "hopper-studio.html"), "<!doctype html><title>Hopper</title>");
  await mkdir(join(staticRoot, "information"));
  await writeFile(
    join(staticRoot, "information", "01-hopper-sensor-suite.pdf"),
    "%PDF-1.4\n% Hopper information test\n",
  );
  const cameraRequests = [];
  const server = await startDesktopServer({
    staticRoot,
    cameraFetch: async (url) => {
      cameraRequests.push(String(url));
      return new Response("camera", {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      });
    },
  });
  try {
    await callback({ ...server, cameraRequests });
  } finally {
    await server.close();
    await rm(staticRoot, { recursive: true, force: true });
  }
}

test("desktop server binds a loopback origin and serves the app securely", async () => {
  await withDesktopServer(async ({ origin }) => {
    assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    const response = await fetch(`${origin}/?desktop=1`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Hopper/);
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    assert.match(response.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);

    const pdfResponse = await fetch(`${origin}/information/01-hopper-sensor-suite.pdf`);
    assert.equal(pdfResponse.status, 200);
    assert.equal(pdfResponse.headers.get("content-type"), "application/pdf");
    assert.match(await pdfResponse.text(), /^%PDF-1\.4/);
  });
});

test("camera API requires the unguessable desktop session cookie", async () => {
  await withDesktopServer(async ({ origin, cameraRequests }) => {
    const denied = await fetch(`${origin}/api/camera/status`);
    assert.equal(denied.status, 403);
    assert.equal(cameraRequests.length, 0);
  });
});

test("camera proxy allows only the Hopper camera on HTTP port 80", async () => {
  await withDesktopServer(async ({ origin, cameraRequests }) => {
    const appResponse = await fetch(`${origin}/`);
    const cookie = appResponse.headers.get("set-cookie").split(";", 1)[0];

    const allowed = await fetch(
      `${origin}/api/camera?url=${encodeURIComponent("http://192.168.2.1/stream")}`,
      { headers: { Cookie: cookie } },
    );
    assert.equal(allowed.status, 200);
    assert.equal(await allowed.text(), "camera");
    assert.deepEqual(cameraRequests, ["http://192.168.2.1/stream"]);

    for (const blockedUrl of [
      "https://192.168.2.1/",
      "http://192.168.2.1:8080/",
      "http://127.0.0.1/",
      "http://example.com/",
    ]) {
      const blocked = await fetch(
        `${origin}/api/camera?url=${encodeURIComponent(blockedUrl)}`,
        { headers: { Cookie: cookie } },
      );
      assert.equal(blocked.status, 403);
    }
    assert.equal(cameraRequests.length, 1);
  });
});
