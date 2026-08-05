import { chmod, copyFile, cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(projectRoot, "student-build");
const releaseRoot = resolve(projectRoot, "local-server-release");
const destination = resolve(releaseRoot, "Hopper-Studio-Local-Server");
const mongooseRoot = resolve(projectRoot, "mongoose");

await rm(releaseRoot, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });

for (const file of [
  "mongoose.exe",
  "mongoose_macos",
  "Start Local Server.bat",
  "Start Local Server.command",
  "LOCAL-SERVER-README.txt",
]) {
  await copyFile(resolve(mongooseRoot, file), resolve(destination, file));
}

await chmod(resolve(destination, "mongoose_macos"), 0o755);
await chmod(resolve(destination, "Start Local Server.command"), 0o755);

console.log(`Prepared the no-install local server in ${destination}`);
