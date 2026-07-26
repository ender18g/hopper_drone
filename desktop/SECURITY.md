# Hopper Studio desktop security profile

This desktop build is intentionally a small, local wrapper around Hopper Studio.
It does not request administrator access and does not install a background
service, startup item, updater, browser extension, kernel driver, or system
driver.

## Capabilities used

- Bluetooth Low Energy is activated only after the student selects **Connect
  drone**. The desktop picker shows only device names beginning with Hopper,
  Mambo, FTW, Travis, or Mars.
- Outbound HTTP is restricted by the local camera proxy to
  `http://192.168.2.1:80`. This is the Hopper camera on the drone's Wi-Fi
  network.
- A random loopback port on `127.0.0.1` serves the packaged app to Electron.
  It is not reachable from another computer. Camera API requests also require
  an unguessable, HTTP-only, same-site session cookie.
- Student-selected project and model files use Chromium's normal file chooser.
  The app has no direct filesystem API.

## Capabilities denied

The renderer has no Node.js, Electron, shell, subprocess, IPC, webview,
external-navigation, arbitrary popup, camera, microphone, location,
notification, screen-capture, or generic permission access. It runs with
context isolation, Chromium renderer sandboxing, web security, a content
security policy, and navigation restrictions.

Packaged builds disable Electron's run-as-Node, Node options, and inspector
entry points. They enable encrypted cookies, ASAR integrity validation, and
ASAR-only application loading. The website bundle is stored inside that ASAR.

## Operating-system trust

These controls reduce the app's privileges, but operating-system download
warnings are based primarily on publisher identity and reputation:

- Configure `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` as GitHub repository
  secrets to Authenticode-sign the Windows executable.
- Configure `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`,
  `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` to sign and notarize the
  macOS app.

Without those certificates, the workflow still produces usable builds, but
Windows SmartScreen or macOS Gatekeeper may warn or block them. A school IT
administrator can review this file, the workflow, and `main.mjs` before
allow-listing a signed release.
