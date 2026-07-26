import { copyFile, cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(projectRoot, "student-build");
const destination = resolve(projectRoot, "desktop", "student-build");
const brandingSource = resolve(projectRoot, "config", "branding.json");
const brandingDestination = resolve(projectRoot, "desktop", "branding.json");

await rm(destination, { recursive: true, force: true });
await mkdir(dirname(destination), { recursive: true });
await cp(source, destination, { recursive: true });
await copyFile(brandingSource, brandingDestination);

console.log("Prepared the integrity-checked desktop web bundle and shared branding.");
