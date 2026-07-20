import { rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const outputDirectory = resolve(projectRoot, "student-build");

await rename(
  resolve(outputDirectory, "hopper-studio.html"),
  resolve(outputDirectory, "index.html"),
);

console.log("GitHub Pages bundle ready: student-build/index.html");
