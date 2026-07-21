const CACHE_PREFIX = "hopper-studio-offline-v2";
const CACHE_REGISTRY_NAME = `${CACHE_PREFIX}-registry`;
const ACTIVE_CACHE_POINTER_URL = new URL("__hopper-active-cache__", self.registration.scope).href;
const LEGACY_CACHE_NAMES = ["hopper-studio-offline-v1"];
const SCOPE_URL = new URL(self.registration.scope);
const APP_SHELL_URL = new URL("./", SCOPE_URL).href;
const MANIFEST_URL = new URL("offline-assets.json", SCOPE_URL).href;
const NETWORK_TIMEOUT_MS = 2400;
let refreshInFlight = null;

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

const refreshRequest = (value) => {
  const url = new URL(value, SCOPE_URL);
  const headers = new Headers();
  if (url.pathname.endsWith(".css")) headers.set("Accept", "text/css,*/*;q=0.1");
  return new Request(url.href, { method: "GET", cache: "reload", headers });
};

const cacheableResponse = (response) =>
  Boolean(response && response.ok && response.type !== "opaque");

const isLocalDevelopmentAsset = (url) => {
  const localHost = SCOPE_URL.hostname === "localhost" || SCOPE_URL.hostname === "127.0.0.1";
  return localHost && ["/@", "/app/", "/components/", "/lib/", "/logos/", "/node_modules/"].some(
    (prefix) => url.pathname.startsWith(prefix),
  );
};

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
  const normalizedText = text
    .replace(/\/\/# sourceMappingURL=data:[^\r\n]*/g, "")
    .replace(/\/\*# sourceMappingURL=data:[\s\S]*?\*\//g, "")
    .replaceAll('\\"', '"')
    .replaceAll("\\u0026", "&");
  const patterns = [
    /(?:import\s*\(|(?:import|export)\s+[^"']*?\sfrom\s*|url\s*\()\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /["']((?:\.\/|\/)?assets\/[^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of normalizedText.matchAll(pattern)) {
      try {
        const url = new URL(match[1], sourceUrl);
        const hasFileExtension = /\.[a-z0-9]+$/i.test(url.pathname);
        const isViteVirtualModule = url.pathname.startsWith("/@");
        if (url.origin === SCOPE_URL.origin && (hasFileExtension || isViteVirtualModule)) {
          assets.add(url.href);
        }
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
        const response = await fetch(refreshRequest(assetUrl));
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

async function readActiveCacheName() {
  try {
    const registry = await caches.open(CACHE_REGISTRY_NAME);
    const pointer = await registry.match(canonicalRequest(ACTIVE_CACHE_POINTER_URL), { ignoreVary: true });
    const pointedName = pointer ? await pointer.text() : "";
    if (pointedName && await caches.has(pointedName)) return pointedName;
  } catch {
    // Fall back to a previous complete cache when no pointer has been stored yet.
  }

  const cacheNames = await caches.keys();
  const latestSnapshot = cacheNames
    .filter((name) => name.startsWith(`${CACHE_PREFIX}-snapshot-`))
    .sort()
    .at(-1);
  if (latestSnapshot) return latestSnapshot;
  return LEGACY_CACHE_NAMES.find((name) => cacheNames.includes(name)) || null;
}

async function matchActiveCache(request) {
  const cacheName = await readActiveCacheName();
  if (!cacheName) return undefined;
  const cache = await caches.open(cacheName);
  return cache.match(request, { ignoreSearch: false, ignoreVary: true });
}

async function promoteCache(cacheName) {
  const registry = await caches.open(CACHE_REGISTRY_NAME);
  await registry.put(
    canonicalRequest(ACTIVE_CACHE_POINTER_URL),
    new Response(cacheName, { headers: { "content-type": "text/plain", "cache-control": "no-store" } }),
  );
  const cacheNames = await caches.keys();
  await Promise.all(cacheNames.map((name) => {
    const isOldSnapshot = name.startsWith(`${CACHE_PREFIX}-snapshot-`) && name !== cacheName;
    const isLegacy = LEGACY_CACHE_NAMES.includes(name);
    return isOldSnapshot || isLegacy ? caches.delete(name) : Promise.resolve(false);
  }));
}

async function performAppCacheRefresh({ strict = true } = {}) {
  let shellResponse;
  try {
    shellResponse = await fetchWithTimeout(APP_SHELL_URL, strict ? 8000 : 5000, "reload");
    if (!cacheableResponse(shellResponse)) return { status: "offline" };
  } catch {
    return { status: "offline" };
  }

  const shellForCache = shellResponse.clone();
  const html = await shellResponse.text();
  const assets = discoverDocumentAssets(html);
  FALLBACK_ASSETS.forEach((asset) => assets.add(new URL(asset, SCOPE_URL).href));
  (await readBuildManifest()).forEach((asset) => assets.add(asset));

  const snapshotName = `${CACHE_PREFIX}-snapshot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const cache = await caches.open(snapshotName);
  try {
    const currentAssets = await cacheAssetTree(cache, assets, strict);
    await cache.put(canonicalRequest(APP_SHELL_URL), shellForCache);
    await promoteCache(snapshotName);
    return { status: "updated", assets: currentAssets.size };
  } catch {
    await caches.delete(snapshotName);
    return { status: "offline" };
  }
}

function refreshAppCache(options = {}) {
  if (!refreshInFlight) {
    refreshInFlight = performAppCacheRefresh(options).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await refreshAppCache({ strict: true });
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
          event.waitUntil(refreshAppCache({ strict: true }));
          return response;
        }
      } catch {
        // The router/server is unavailable; use the complete saved app shell.
      }
      const cachedShell = await matchActiveCache(canonicalRequest(APP_SHELL_URL));
      return cachedShell || new Response("Hopper Studio has not finished saving its offline copy yet.", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await matchActiveCache(request);
    if (isLocalDevelopmentAsset(url)) {
      try {
        const response = await fetchWithTimeout(request);
        if (cacheableResponse(response)) return response;
      } catch {
        // The local development server is unavailable; use the saved module or stylesheet.
      }
      return cached || new Response("Offline development asset unavailable", { status: 503 });
    }
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (cacheableResponse(response)) {
        const activeCacheName = await readActiveCacheName();
        if (activeCacheName) {
          const activeCache = await caches.open(activeCacheName);
          event.waitUntil(activeCache.put(canonicalRequest(request.url), response.clone()));
        }
      }
      return response;
    } catch {
      return new Response("Offline asset unavailable", { status: 503 });
    }
  })());
});
