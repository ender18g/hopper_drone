import { readdir, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const clientDirectory = resolve(projectRoot, "dist/client");
const outputPath = resolve(clientDirectory, "offline-assets.json");
const excluded = new Set([".assetsignore", "_headers", "offline-assets.json"]);

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".vite") continue;
      files.push(...await collectFiles(absolutePath));
    } else {
      const assetPath = relative(clientDirectory, absolutePath).split(sep).join("/");
      if (!excluded.has(assetPath)) files.push(assetPath);
    }
  }
  return files;
}

const assets = (await collectFiles(clientDirectory)).sort();
await writeFile(
  outputPath,
  `${JSON.stringify({ version: 1, assets }, null, 2)}\n`,
  "utf8",
);
console.log(`Offline asset manifest contains ${assets.length} files.`);
