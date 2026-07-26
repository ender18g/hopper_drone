import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  flipFuses,
  FuseV1Options,
  FuseVersion,
} from "@electron/fuses";
import plist from "plist";

const FUSE_SENTINEL = Buffer.from("dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX");
// Electron 43 has nine V1 fuses. The ninth byte disables WasmTrapHandlers so
// WebAssembly uses explicit memory bounds checks instead of process signals.
const EXPECTED_FUSE_WIRE = Buffer.from("010011000");

function packagedExecutable(context) {
  const name = context.packager.appInfo.productFilename;
  if (context.electronPlatformName === "darwin") {
    return join(context.appOutDir, `${name}.app`);
  }
  if (context.electronPlatformName === "win32") {
    return join(context.appOutDir, `${name}.exe`);
  }
  return join(context.appOutDir, name);
}

function fuseBinary(context) {
  const executable = packagedExecutable(context);
  if (context.electronPlatformName !== "darwin") return executable;
  return join(
    executable,
    "Contents",
    "Frameworks",
    "Electron Framework.framework",
    "Electron Framework",
  );
}

async function setAndVerifyCompleteFuseWire(context) {
  const binaryPath = fuseBinary(context);
  const binary = await readFile(binaryPath);
  let sentinelIndex = binary.indexOf(FUSE_SENTINEL);
  let updatedSlices = 0;

  while (sentinelIndex !== -1) {
    const wireHeader = sentinelIndex + FUSE_SENTINEL.length;
    const version = binary[wireHeader];
    const wireLength = binary[wireHeader + 1];
    if (version !== 1 || wireLength !== EXPECTED_FUSE_WIRE.length) {
      throw new Error(
        `Unexpected Electron fuse schema: V${version} with ${wireLength} fuses.`,
      );
    }
    EXPECTED_FUSE_WIRE.copy(binary, wireHeader + 2);
    updatedSlices += 1;
    sentinelIndex = binary.indexOf(FUSE_SENTINEL, wireHeader + 2 + wireLength);
  }

  if (updatedSlices === 0) throw new Error("Electron fuse sentinel was not found.");
  await writeFile(binaryPath, binary);

  const verified = await readFile(binaryPath);
  let verifiedIndex = verified.indexOf(FUSE_SENTINEL);
  while (verifiedIndex !== -1) {
    const wireStart = verifiedIndex + FUSE_SENTINEL.length + 2;
    if (!verified.subarray(wireStart, wireStart + EXPECTED_FUSE_WIRE.length)
      .equals(EXPECTED_FUSE_WIRE)) {
      throw new Error("Electron fuse verification failed.");
    }
    verifiedIndex = verified.indexOf(
      FUSE_SENTINEL,
      wireStart + EXPECTED_FUSE_WIRE.length,
    );
  }
}

async function restrictMacInfoPlist(context) {
  if (context.electronPlatformName !== "darwin") return;
  const appName = context.packager.appInfo.productFilename;
  const infoPath = join(context.appOutDir, `${appName}.app`, "Contents", "Info.plist");
  const info = plist.parse(await readFile(infoPath, "utf8"));

  delete info.NSAudioCaptureUsageDescription;
  delete info.NSBluetoothPeripheralUsageDescription;
  delete info.NSCameraUsageDescription;
  delete info.NSMicrophoneUsageDescription;
  info.NSAppTransportSecurity = {
    NSAllowsArbitraryLoads: false,
    NSAllowsLocalNetworking: true,
    NSExceptionDomains: {
      "127.0.0.1": {
        NSExceptionAllowsInsecureHTTPLoads: true,
        NSIncludesSubdomains: false,
      },
      localhost: {
        NSExceptionAllowsInsecureHTTPLoads: true,
        NSIncludesSubdomains: false,
      },
    },
  };

  await writeFile(infoPath, plist.build(info));
}

export default async function hardenDesktopPackage(context) {
  await restrictMacInfoPlist(context);
  await flipFuses(packagedExecutable(context), {
    version: FuseVersion.V1,
    strictlyRequireAllFuses: false,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  });
  await setAndVerifyCompleteFuseWire(context);
  if (context.electronPlatformName === "darwin") {
    // Re-apply an ad-hoc signature after changing the framework binary. A real
    // Developer ID signature replaces this later when CI signing is configured.
    await flipFuses(packagedExecutable(context), {
      version: FuseVersion.V1,
      resetAdHocDarwinSignature: true,
    });
  }
}
