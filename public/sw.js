const CACHE_NAME = "hopper-studio-offline-v1";
const SCOPE_URL = new URL(self.registration.scope);
const APP_SHELL_URL = new URL("./", SCOPE_URL).href;
const MANIFEST_URL = new URL("offline-assets.json", SCOPE_URL).href;
const NETWORK_TIMEOUT_MS = 2400;

const FALLBACK_ASSETS = [
  "favicon.png",
  "og.png",
  "sim-assets/airplane.png",
  "sim-assets/apple.png",
  "sim-assets/banana.png",
  "sim-assets/car.png",
  "blockly/media/1x1.gif",
  "blockly/media/click.mp3",
  "blockly/media/delete-icon.svg",
  "blockly/media/delete.mp3",
  "blockly/media/disconnect.mp3",
  "blockly/media/drop.mp3",
  "blockly/media/dropdown-arrow.svg",
  "blockly/media/foldout-icon.svg",
  "blockly/media/handclosed.cur",
  "blockly/media/handdelete.cur",
  "blockly/media/handopen.cur",
  "blockly/media/pilcrow.png",
  "blockly/media/quote0.png",
  "blockly/media/quote1.png",
  "blockly/media/resize-handle.svg",
  "blockly/media/sprites.svg",
  "models/coco-ssd/model.json",
  "models/coco-ssd/group1-shard1of5",
  "models/coco-ssd/group1-shard2of5",
  "models/coco-ssd/group1-shard3of5",
  "models/coco-ssd/group1-shard4of5",
  "models/coco-ssd/group1-shard5of5",
];

const canonicalRequest = (value) => new Request(new URL(value, SCOPE_URL).href, { method: "GET" });

const cacheableResponse = (response) =>
  Boolean(response && response.ok && response.type !== "opaque");

async function fetchWithTimeout(request, timeout = NETWORK_TIMEOUT_MS, cacheMode = "no-store") {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(new Request(request, { cache: cacheMode, signal: controller.signal }));
  } finally {
    clearTimeout(timeoutId);
  }
}

function discoverDocumentAssets(html) {
  const assets = new Set();
  for (const match of html.matchAll(/(?:src|href)=["']([^"'#]+)["']/gi)) {
    try {
      const url = new URL(match[1], SCOPE_URL);
      if (url.origin === SCOPE_URL.origin) assets.add(url.href);
    } catch {
      // Ignore malformed and non-network URLs.
    }
  }
  return assets;
}

function discoverNestedAssets(text, sourceUrl) {
  const assets = new Set();
  const patterns = [
    /(?:import\s*\(|from\s*|url\s*\()["']([^"']+)["']/g,
    /["']((?:\.\/|\/)?assets\/[^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      try {
        const url = new URL(match[1], sourceUrl);
        if (url.origin === SCOPE_URL.origin) assets.add(url.href);
      } catch {
        // Ignore strings that are not valid asset URLs.
      }
    }
  }
  return assets;
}

async function readBuildManifest() {
  try {
    const response = await fetch(new Request(MANIFEST_URL, { cache: "reload" }));
    if (!cacheableResponse(response)) return [];
    const manifest = await response.json();
    return Array.isArray(manifest.assets)
      ? manifest.assets.map((asset) => new URL(asset, SCOPE_URL).href)
      : [];
  } catch {
    return [];
  }
}

async function cacheAssetTree(cache, startingAssets, strict) {
  const queued = [...startingAssets];
  const visited = new Set();
  while (queued.length > 0) {
    const batch = [];
    while (queued.length > 0 && batch.length < 6) {
      const assetUrl = queued.shift();
      if (!assetUrl || visited.has(assetUrl) || assetUrl === APP_SHELL_URL) continue;
      visited.add(assetUrl);
      batch.push(assetUrl);
    }
    const nestedAssetGroups = await Promise.all(batch.map(async (assetUrl) => {
      try {
        const response = await fetch(new Request(assetUrl, { cache: "reload" }));
        if (!cacheableResponse(response)) {
          if (strict) throw new Error(`Static asset unavailable: ${assetUrl}`);
          return [];
        }
        await cache.put(canonicalRequest(assetUrl), response.clone());
        const contentType = response.headers.get("content-type") || "";
        return contentType.includes("javascript") || contentType.includes("text/css")
          ? [...discoverNestedAssets(await response.text(), assetUrl)]
          : [];
      } catch (error) {
        if (strict) throw error;
        return [];
      }
    }));
    nestedAssetGroups.flat().forEach((nestedAsset) => queued.push(nestedAsset));
  }
  return visited;
}

async function refreshAppCache({ strict = false } = {}) {
  const cache = await caches.open(CACHE_NAME);
  let shellResponse;
  try {
    shellResponse = await fetchWithTimeout(APP_SHELL_URL, strict ? 8000 : 5000, "reload");
    if (!cacheableResponse(shellResponse)) return { status: "offline" };
  } catch {
    return { status: "offline" };
  }

  const html = await shellResponse.clone().text();
  const assets = discoverDocumentAssets(html);
  FALLBACK_ASSETS.forEach((asset) => assets.add(new URL(asset, SCOPE_URL).href));
  (await readBuildManifest()).forEach((asset) => assets.add(asset));

  try {
    const currentAssets = await cacheAssetTree(cache, assets, strict);
    await cache.put(canonicalRequest(APP_SHELL_URL), shellResponse);

    if (strict) {
      const currentAssetPaths = new Set(
        [...currentAssets].map((asset) => new URL(asset).pathname),
      );
      const cachedRequests = await cache.keys();
      await Promise.all(cachedRequests.map((request) => {
        const url = new URL(request.url);
        return url.pathname.includes("/assets/") && !currentAssetPaths.has(url.pathname)
          ? cache.delete(request)
          : Promise.resolve(false);
      }));
    }
    return { status: "updated", assets: currentAssets.size };
  } catch {
    return { status: "offline" };
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await refreshAppCache({ strict: false });
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "HARD_REFRESH") {
    event.waitUntil((async () => {
      const result = await refreshAppCache({ strict: true });
      event.ports[0]?.postMessage(result);
    })());
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== SCOPE_URL.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetchWithTimeout(request);
        if (cacheableResponse(response)) {
          const cache = await caches.open(CACHE_NAME);
          event.waitUntil(cache.put(canonicalRequest(APP_SHELL_URL), response.clone()));
          return response;
        }
      } catch {
        // The router/server is unavailable; use the complete saved app shell.
      }
      const cachedShell = await caches.match(canonicalRequest(APP_SHELL_URL));
      return cachedShell || new Response("Hopper Studio has not finished saving its offline copy yet.", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: false });
    if (cached) {
      event.waitUntil((async () => {
        try {
          const response = await fetchWithTimeout(request);
          if (cacheableResponse(response)) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response);
          }
        } catch {
          // Keep the cached asset while offline.
        }
      })());
      return cached;
    }
    try {
      const response = await fetch(request);
      if (cacheableResponse(response)) {
        const cache = await caches.open(CACHE_NAME);
        event.waitUntil(cache.put(request, response.clone()));
      }
      return response;
    } catch {
      return new Response("Offline asset unavailable", { status: 503 });
    }
  })());
});
