import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { randomBytes } from "node:crypto";

const CAMERA_HOST = "192.168.2.1";
const CAMERA_ORIGIN = `http://${CAMERA_HOST}`;
const CAMERA_DEFAULT_URL = `${CAMERA_ORIGIN}/`;

const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".cur", "image/x-icon"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".mp3", "audio/mpeg"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".wasm", "application/wasm"],
]);

const SECURITY_HEADERS = {
  "Cache-Control": "no-cache",
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: http://192.168.2.1",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    "connect-src 'self' http://192.168.2.1",
    "worker-src 'self' blob:",
  ].join("; "),
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function writeJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    ...SECURITY_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(value));
}

function parseCameraUrl(rawValue) {
  let cameraUrl;
  try {
    cameraUrl = new URL(rawValue || CAMERA_DEFAULT_URL);
  } catch {
    return null;
  }

  const usesAllowedPort = cameraUrl.port === "" || cameraUrl.port === "80";
  if (
    cameraUrl.protocol !== "http:"
    || cameraUrl.hostname !== CAMERA_HOST
    || !usesAllowedPort
    || cameraUrl.username
    || cameraUrl.password
  ) {
    return null;
  }
  return cameraUrl;
}

function hasSessionCookie(request, sessionToken) {
  const cookies = String(request.headers.cookie || "").split(";");
  return cookies.some((cookie) => cookie.trim() === `hopper_session=${sessionToken}`);
}

async function proxyCamera(request, response, requestUrl, cameraFetch) {
  const cameraUrl = parseCameraUrl(requestUrl.searchParams.get("url"));
  if (!cameraUrl) {
    writeJson(response, 403, {
      error: `Camera proxy only allows ${CAMERA_ORIGIN}:80`,
    });
    return;
  }

  const controller = new AbortController();
  response.once("close", () => controller.abort());

  try {
    const cameraResponse = await cameraFetch(cameraUrl, {
      headers: { Accept: "multipart/x-mixed-replace,image/jpeg,image/*" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!cameraResponse.ok || !cameraResponse.body) {
      writeJson(response, 502, { error: `Camera returned ${cameraResponse.status}` });
      return;
    }

    response.writeHead(200, {
      ...SECURITY_HEADERS,
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Content-Type":
        cameraResponse.headers.get("content-type")
        || "multipart/x-mixed-replace",
    });
    Readable.fromWeb(cameraResponse.body).pipe(response);
  } catch {
    if (!response.headersSent) {
      writeJson(response, 502, {
        error: "Camera is unreachable. Join the Hopper Wi-Fi and try again.",
      });
    } else {
      response.destroy();
    }
  }
}

async function cameraStatus(response, cameraFetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);

  try {
    const cameraResponse = await cameraFetch(CAMERA_DEFAULT_URL, {
      headers: { Accept: "multipart/x-mixed-replace,image/jpeg,image/*" },
      cache: "no-store",
      signal: controller.signal,
    });
    await cameraResponse.body?.cancel().catch(() => undefined);
    writeJson(response, 200, {
      connected: cameraResponse.ok,
      host: CAMERA_HOST,
      ...(cameraResponse.ok ? {} : { status: cameraResponse.status }),
    });
  } catch {
    writeJson(response, 200, { connected: false, host: CAMERA_HOST });
  } finally {
    clearTimeout(timeout);
  }
}

async function serveStatic(response, requestUrl, staticRoot, sessionToken) {
  let pathname;
  try {
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch {
    writeJson(response, 400, { error: "Invalid URL" });
    return;
  }

  const relativePath = pathname === "/" ? "hopper-studio.html" : pathname.slice(1);
  const absolutePath = resolve(staticRoot, relativePath);
  const rootPrefix = staticRoot.endsWith(sep) ? staticRoot : `${staticRoot}${sep}`;
  if (absolutePath !== staticRoot && !absolutePath.startsWith(rootPrefix)) {
    writeJson(response, 403, { error: "Forbidden" });
    return;
  }

  try {
    const file = await stat(absolutePath);
    if (!file.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      ...SECURITY_HEADERS,
      "Content-Length": file.size,
      "Content-Type": CONTENT_TYPES.get(extname(absolutePath).toLowerCase())
        || "application/octet-stream",
      ...(relativePath === "hopper-studio.html"
        ? {
            "Set-Cookie":
              `hopper_session=${sessionToken}; HttpOnly; SameSite=Strict; Path=/`,
          }
        : {}),
    });
    createReadStream(absolutePath).pipe(response);
  } catch {
    writeJson(response, 404, { error: "Not found" });
  }
}

export async function startDesktopServer({
  staticRoot,
  cameraFetch = globalThis.fetch,
  listenHost = "127.0.0.1",
} = {}) {
  if (!staticRoot) throw new Error("A desktop static root is required.");
  if (typeof cameraFetch !== "function") throw new Error("A fetch implementation is required.");

  const resolvedStaticRoot = resolve(staticRoot);
  const sessionToken = randomBytes(24).toString("hex");
  let allowedHost = "";

  const server = createServer((request, response) => {
    void (async () => {
      if (request.method !== "GET") {
        writeJson(response, 405, { error: "Method not allowed" });
        return;
      }
      if (request.headers.host !== allowedHost) {
        writeJson(response, 403, { error: "Invalid host" });
        return;
      }

      const requestUrl = new URL(request.url || "/", `http://${allowedHost}`);
      if (requestUrl.pathname.startsWith("/api/")) {
        if (!hasSessionCookie(request, sessionToken)) {
          writeJson(response, 403, { error: "Invalid desktop session" });
          return;
        }
        if (requestUrl.pathname === "/api/camera/status") {
          await cameraStatus(response, cameraFetch);
          return;
        }
        if (requestUrl.pathname === "/api/camera") {
          await proxyCamera(request, response, requestUrl, cameraFetch);
          return;
        }
        writeJson(response, 404, { error: "Not found" });
        return;
      }

      await serveStatic(response, requestUrl, resolvedStaticRoot, sessionToken);
    })().catch(() => {
      if (!response.headersSent) writeJson(response, 500, { error: "Internal error" });
      else response.destroy();
    });
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, listenHost, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Desktop server did not receive a loopback port.");
  }
  allowedHost = `${listenHost}:${address.port}`;

  return {
    origin: `http://${allowedHost}`,
    close: () =>
      new Promise((resolveClose, rejectClose) => {
        server.closeAllConnections?.();
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
      }),
  };
}

export const desktopCameraPolicy = Object.freeze({
  host: CAMERA_HOST,
  origin: CAMERA_ORIGIN,
  port: 80,
});
