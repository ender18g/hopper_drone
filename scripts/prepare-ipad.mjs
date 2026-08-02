import { copyFile } from "node:fs/promises";
import { resolve } from "node:path";

const buildDirectory = resolve(import.meta.dirname, "..", "student-build");
const modelDirectory = resolve(buildDirectory, "models", "coco-ssd");
const modelShards = [
  "group1-shard1of5",
  "group1-shard2of5",
  "group1-shard3of5",
  "group1-shard4of5",
  "group1-shard5of5",
];

await copyFile(
  resolve(buildDirectory, "hopper-studio.html"),
  resolve(buildDirectory, "index.html"),
);
await Promise.all(modelShards.map((shard) => copyFile(
  resolve(modelDirectory, shard),
  resolve(modelDirectory, `${shard}.bin`),
)));

console.log("Prepared the iPad web entry point and binary model shards.");
