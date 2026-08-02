# Hopper Studio for iPad

This repository now contains an iPadOS app in `ios/`. The app packages the
complete Hopper Studio site for offline use and keeps all three operating
modes:

- native Bluetooth Low Energy flight control for a real Hopper/Mambo;
- native access to the Hopper Wi-Fi camera at `http://192.168.2.1/`, including
  readable frames for thresholding, COCO-SSD, AprilTags, and custom models;
- the connection-free simulated room and simulated downward camera.

The iPad app is not a remote web page. Its web bundle, lessons, models, Blockly
assets, simulator assets, and native bridges ship inside the app. The native
camera bridge rejects every host except `192.168.2.1` on HTTP port 80.

## What you need

- A Mac with the full current release of Xcode. Capacitor 8 requires Xcode 26
  or newer and iOS/iPadOS 15 or newer. Do not rely on the standalone Apple
  Command Line Tools.
- Node.js 22.13 or newer and npm.
- An iPad running iPadOS 15 or newer, a USB cable for initial pairing, and an
  Apple Account.
- A paid [Apple Developer Program](https://developer.apple.com/programs/)
  membership to use TestFlight or publish in the App Store. A free Personal
  Team can install directly on your own iPad for development, but its signing
  is temporary and it cannot publish to the store.

Apple's current Capacitor prerequisites and commands are documented in the
[Capacitor iOS guide](https://capacitorjs.com/docs/ios). Apple changes upload
requirements over time, so check the current
[App Store submission requirements](https://developer.apple.com/app-store/submitting/)
before the final archive.

## One-time Mac and project setup

1. Install Xcode from the Mac App Store, open it once, accept its license, and
   let it install the requested platform components.

2. If Terminal is still using Command Line Tools, select the full Xcode app:

   ```bash
   sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
   xcodebuild -version
   ```

3. In this `local_site` folder, install the locked JavaScript dependencies:

   ```bash
   npm install
   ```

4. Choose a permanent, globally unique bundle identifier. The repository
   starts with `org.usna.hopperstudio`. Change `appId` in
   `capacitor.config.ts`, then open Xcode after the first build and set the same
   identifier under **App target > Signing & Capabilities > Bundle Identifier**.
   Do this before creating the App Store Connect record; bundle identifiers
   cannot be changed for an existing store app.

5. Build the local web app and sync it into Xcode:

   ```bash
   npm run build:ipad
   ```

6. Open the native project:

   ```bash
   npm run ipad:open
   ```

   `ipad:open` also rebuilds and syncs the web app. You can open the project
   directly later with `open ios/App/App.xcodeproj`, but run
   `npm run build:ipad` after every web-code or asset change.

7. In Xcode, select the **App** target, open **Signing & Capabilities**, enable
   **Automatically manage signing**, and choose your Team. Confirm that the
   deployment target and **iPad** device family are correct.

## Install and test on a personal iPad

1. Connect the iPad to the Mac, unlock it, tap **Trust** if prompted, and select
   the iPad in Xcode's run-destination menu. If iPadOS asks for Developer Mode,
   enable it under **Settings > Privacy & Security > Developer Mode**, restart
   the iPad, and confirm the prompt.

2. With the **App** scheme and your iPad selected, press **Run** (the triangular
   play button). The first signing build can take several minutes. A free
   Personal Team may also require trusting the developer profile in the iPad's
   device-management settings.

3. Test simulation first, with no drone connection:

   - Tap **Connect simulated drone**.
   - Confirm the room stays inline on the iPad.
   - Run a takeoff, movement, vision scan, and landing program.
   - Confirm simulated threshold, object, and AprilTag results appear.
   - Disconnect the simulator and confirm the project remains loaded.

4. Test a real Hopper in a safe, open area:

   - Power on the Hopper and tap **Connect drone**.
   - Allow Bluetooth access. After the three-second scan, select the correct
     named Hopper in the native picker.
   - Confirm battery telemetry changes and test Stop & Land before takeoff.
   - On the iPad, join the Hopper's Wi-Fi network. Stay connected if iPadOS says
     the network has no internet.
   - Return to Hopper Studio and allow **Local Network** access.
   - In **Vision Testing**, leave the address as `http://192.168.2.1/` and tap
     **Connect**.
   - Confirm live video, a threshold scan, an AprilTag scan, an object scan, and
     a stored mission photo before performing a short flight test.

5. Test switching both ways: real Hopper → simulator → real Hopper. The code
   workspace should remain unchanged and only the active controller should
   receive commands.

The iOS Simulator cannot validate Bluetooth or the drone's Wi-Fi network.
Those checks require a physical iPad. If a permission was denied, re-enable
Bluetooth and Local Network for Hopper Studio in iPad Settings, or delete and
reinstall the development app to see the first-use prompts again.

## Checks to run before every release

From `local_site`:

```bash
npm test
npm run build:ipad
```

Then build the Xcode project without relying on an attached device:

```bash
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -sdk iphonesimulator \
  -configuration Debug \
  -derivedDataPath /tmp/hopper-studio-derived \
  CODE_SIGNING_ALLOWED=NO \
  build
```

Finally repeat the physical-iPad simulation, Bluetooth, camera, and Stop & Land
smoke tests. Treat real-drone testing as mandatory: a simulator build can prove
that Swift compiles, but not that the Hopper firmware's GATT services behave as
expected.

## Prepare the App Store listing

1. Replace the placeholder app icon in
   `ios/App/App/Assets.xcassets/AppIcon.appiconset`. Supply a square 1024 × 1024
   icon with no transparency. Also replace the generated splash images if you
   want a branded launch screen.

2. In the Apple Developer account, register the exact bundle identifier and
   enable no capabilities beyond those actually used. Bluetooth and local
   network access are declared with purpose strings in `Info.plist`; they do
   not require a special entitlement.

3. In [App Store Connect](https://appstoreconnect.apple.com/), create a new app:

   - Platform: iOS (the Xcode target is restricted to iPad devices).
   - Name: your final public name.
   - Primary language, SKU, and bundle ID: choose the permanent values.

4. Complete the listing: description, support URL, category, age-rating
   questionnaire, copyright, review contact, and the iPad screenshots requested
   by App Store Connect. Screenshot requirements can change; use Apple's current
   [screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications/).

5. Complete **App Privacy** truthfully. In the current repository, projects,
   images, code, Bluetooth data, and camera frames remain on the device and no
   analytics or account system is included. That normally supports a
   data-not-collected disclosure, but re-check every dependency and any future
   services before answering. Add a public privacy-policy URL even if your
   organization does not collect data; it makes the local-only behavior clear.

6. Answer export-compliance questions based on the final binary and your legal
   guidance. The Hopper integration itself uses Bluetooth LE and unencrypted
   local HTTP, and this project contains no custom cryptographic algorithm. Do
   not copy an old answer without checking the final dependencies.

7. Prepare useful App Review notes. Explain that:

   - no login is required;
   - **Connect simulated drone** gives reviewers a complete hardware-free path;
   - physical control uses a Hopper/Parrot Mambo-compatible BLE accessory;
   - the camera is only available while joined to that accessory's Wi-Fi at
     `192.168.2.1`;
   - all curriculum, coding, simulation, and vision processing is bundled and
     runs locally.

   Give reviewers a short simulation test script. If possible, attach a demo
   video showing the real Bluetooth and Wi-Fi accessory paths because Apple is
   unlikely to have the classroom drone.

## Upload a TestFlight build

1. In Xcode **App target > General**, set the public **Version** (for example,
   `1.0.0`) and increment **Build** for every upload. App Store Connect rejects a
   reused build number for the same version.

2. Run `npm run build:ipad`, reopen Xcode if necessary, and select a generic
   physical iOS device destination such as **Any iOS Device (arm64)**. A
   simulator destination cannot be archived for the store.

3. Choose **Product > Archive**. When Organizer opens, select the archive, then
   choose **Distribute App > App Store Connect > Upload**. Keep automatic
   signing unless your organization manages distribution profiles manually.

4. Wait for Apple to process the build. Apple documents the supported upload
   methods and processing flow in
   [Upload builds](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/).

5. In App Store Connect, open **TestFlight**, resolve export-compliance or other
   warnings, add the build to an internal testing group, and install it from the
   TestFlight app on the iPad. Re-run all smoke tests from the release checklist.
   External testers require Beta App Review; internal testers do not.

## Submit to the App Store

1. In App Store Connect, open the prepared app version and select the tested
   build.
2. Finish every required metadata, privacy, age-rating, availability, and review
   field.
3. Choose the desired release behavior: manual, automatic after approval, or a
   scheduled release where available.
4. Click **Add for Review**, inspect the draft submission, and then **Submit for
   Review**. Apple's current two-step submission flow is described in
   [Submit an app](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app).
5. Monitor App Review messages. If Apple asks how to test without the accessory,
   point them to the simulated-room steps and the real-hardware demo video.

## Updating the app later

For each web or native change:

```bash
npm install
npm test
npm run build:ipad
npm run ipad:open
```

Increment the Xcode build number, test on a physical iPad, create a new archive,
and upload it. Commit the source under `ios/`, but do not commit generated
`ios/App/App/public/` assets, signing certificates, provisioning profiles,
Apple passwords, or App Store Connect API private keys.

## Native implementation map

- `capacitor.config.ts` — app ID, app name, iPad web bundle, and Capacitor setup.
- `lib/ipad-native.ts` — TypeScript adapter that presents native Core Bluetooth
  with the GATT surface already expected by `MamboController`, plus camera-frame
  events.
- `ios/App/App/HopperNativePlugin.swift` — Core Bluetooth picker/GATT operations
  and the restricted `192.168.2.1` MJPEG stream reader.
- `ios/App/App/Info.plist` — Bluetooth, local-network, and local-HTTP purpose and
  transport declarations.
- `npm run build:ipad` — rebuilds the standalone app and syncs it into Xcode.
