/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");
const branding = require("../config/branding.json");

const studioName = branding.studioName || "Drone Studio";
const artifactName = studioName
  .trim()
  .replace(/[^a-z0-9]+/gi, "-")
  .replace(/^-+|-+$/g, "") || "Drone-Studio";
const entitlementsPath = path.join(__dirname, "build", "entitlements.mac.plist");

module.exports = {
  appId: "org.wrc.hopperstudio",
  productName: studioName,
  asar: true,
  afterPack: "desktop/build/after-pack.mjs",
  electronLanguages: ["en"],
  electronVersion: "43.2.0",
  directories: {
    output: "../desktop-release",
    buildResources: "build",
  },
  files: [
    "branding.json",
    "main.mjs",
    "server.mjs",
    "student-build/**/*",
    "package.json",
  ],
  mac: {
    target: [
      {
        target: "zip",
        arch: ["arm64", "x64"],
      },
    ],
    artifactName: `${artifactName}-macOS-\${arch}-\${version}.\${ext}`,
    category: "public.app-category.education",
    hardenedRuntime: false,
    icon: "build/icon.png",
    entitlements: entitlementsPath,
    entitlementsInherit: entitlementsPath,
    extendInfo: {
      NSAudioCaptureUsageDescription: null,
      NSBluetoothAlwaysUsageDescription:
        `${studioName} uses Bluetooth only when a student chooses a compatible Hopper classroom drone.`,
      NSBluetoothPeripheralUsageDescription: null,
      NSCameraUsageDescription: null,
      NSMicrophoneUsageDescription: null,
    },
  },
  win: {
    target: [
      {
        target: "portable",
        arch: ["x64"],
      },
    ],
    artifactName: `${artifactName}-Windows-x64-\${version}.\${ext}`,
    icon: "build/icon.png",
    requestedExecutionLevel: "asInvoker",
  },
  portable: {
    artifactName: `${artifactName}-Windows-x64-\${version}.\${ext}`,
    requestExecutionLevel: "user",
    unpackDirName: false,
  },
};
