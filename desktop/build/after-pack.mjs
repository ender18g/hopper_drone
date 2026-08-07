import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  flipFuses,
  FuseV1Options,
  FuseVersion,
} from "@electron/fuses";
import plist from "plist";

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

async function requireNonemptyFile(filePath, description) {
  try {
    const file = await stat(filePath);
    if (file.isFile() && file.size > 0) return;
  } catch {
    // The actionable packaging error below is clearer than the platform error.
  }
  throw new Error(`Windows package is missing ${description}: ${filePath}`);
}

export async function verifyWindowsRuntimeFiles(context) {
  if (context.electronPlatformName !== "win32") return;
  await requireNonemptyFile(
    join(context.appOutDir, "locales", "en-US.pak"),
    "the required en-US Electron locale pack",
  );
  await requireNonemptyFile(
    join(context.appOutDir, "resources", "app.asar"),
    "the Hopper Studio application archive",
  );
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
  await verifyWindowsRuntimeFiles(context);
  await flipFuses(packagedExecutable(context), {
    version: FuseVersion.V1,
    strictlyRequireAllFuses: true,
    // Keep unsigned Apple Silicon builds launchable. electron-builder replaces
    // this ad-hoc signature later when a real signing identity is configured.
    resetAdHocDarwinSignature: context.electronPlatformName === "darwin",
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
    [FuseV1Options.WasmTrapHandlers]: true,
  });
}
