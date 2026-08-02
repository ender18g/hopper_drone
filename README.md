# Hopper Studio

> Building for iPad? Follow the complete device-testing, TestFlight, and App
> Store guide in [README-IPAD.md](README-IPAD.md).

Hopper Studio is a fully local Python, block-coding, JavaScript, Bluetooth flight-control, and camera-vision app for the FTW Hopper drone. It preserves the FTW Code / Parrot Mambo command protocol and adds binary thresholding, tag36h11 AprilTag detection and 2D pose alignment, local COCO-SSD object detection, and support for custom Teachable Machine image classifiers.

To rename the app and its subtitle everywhere in the web and desktop builds,
edit `config/branding.json`. The desktop executable/app name, window titles,
web metadata, visible header, simulator title, and release title all read from
that shared file. The `codingOptions` object in the same file controls the
student coding surface:

- `defaultEditor` accepts `"python"`, `"blocks"`, or `"javascript"`.
- `enabledEditors` controls which tabs are visible and their order. Remove
  `"javascript"` from that list before building when students should not see
  the JavaScript editor. Keep at least one editor enabled.

Python is the default. Hopper Studio translates its documented classroom
Python subset locally into the existing asynchronous JavaScript flight runtime;
students do not install Python and do not write `await`.

## Download the desktop app

Every push to `main` runs `.github/workflows/release-desktop.yml` and creates a
new GitHub Release with both student downloads:

- `Hopper-Studio-Windows-x64-*.exe` is a portable Windows app. It does not
  install anything and does not ask for administrator access.
- `Hopper-Studio-macOS-arm64-*.zip` contains the Hopper Studio `.app` for
  Apple Silicon Macs.
- `Hopper-Studio-macOS-x64-*.zip` contains the Hopper Studio `.app` for Intel
  Macs.

The desktop app includes the complete website, local vision models, Blockly
media, and the restricted Hopper camera proxy. Students do not need Node.js or
a browser. **Connect drone** opens a Hopper-only Bluetooth chooser, and
**Connect simulated drone** opens the flight room in its own desktop window.

The desktop shell is sandboxed and has no Node.js or Electron API in the web
page. It denies generic browser permissions and external navigation, binds its
local server only to `127.0.0.1`, and permits the camera proxy to contact only
`http://192.168.2.1:80`. See `desktop/SECURITY.md` for the school IT review
profile.

Unsigned apps can still trigger Windows SmartScreen or macOS Gatekeeper even
when they request minimal permissions. To publish trusted builds, add these
GitHub Actions repository secrets:

- Windows: `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`
- macOS signing: `MAC_CSC_LINK` and `MAC_CSC_KEY_PASSWORD`
- macOS notarization: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and
  `APPLE_TEAM_ID`

Certificates and passwords belong only in GitHub Actions secrets; never commit
them to the repository. If the secrets are absent, the workflow deliberately
builds unsigned downloads instead of failing.

## What is included

- Blockly workspace with the original flight, battery, event, logic, loop, math, variable, function, and accessory capabilities. Newly dragged `fly forward` blocks default to 15% power.
- Python editor (the default view) with source-preserving syntax highlighting, automatic indentation, familiar loops and decisions, snake_case Hopper commands, and line-numbered translation errors.
- JavaScript editor for advanced students. Both text editors include a searchable, syntax-highlighted Hopper API guide in their left column.
- Web Bluetooth control for Hopper, FTW, Mambo, Travis, and Mars device names.
- A 10 m × 7 m simulated flight room with damped pitch/roll physics, wall crashes, a flight-path trail, side-view attitude, and a downward camera that uses the same blocks as the real Hopper. New rooms include a rotated AprilTag 0 floor marker.
- A live execution glow that follows each active flight, wait, accessory, and camera-vision block on both simulated and physical Hopper runs.
- Drag, duplicate, delete, upload, and resize floor targets for search-pattern and computer-vision labs.
- Simultaneous Bluetooth flight control and Wi-Fi camera display.
- Separate Bluetooth and Hopper Wi-Fi indicators. The Wi-Fi indicator checks whether `192.168.2.1` actually responds; select it to check again immediately.
- A draggable Vision Testing panel divider. Drag it left to enlarge the camera and live readouts, or right to give Blockly more room. The Left and Right arrow keys also work when the divider is focused.
- A 0–100% binary brightness threshold, an invert option, white/black frame coverage, and an X 0 / Y 0 center-pixel readout.
- `camera sees binary white/black` frame-coverage and X/Y pixel blocks. Pixel coordinates run from `-100` to `+100`; `(0, 0)` is center and `(100, 100)` is the top right.
- A local tag36h11 AprilTag generator/detector with ID, centered X/Y coordinates, tag-axis overlays, and yaw alignment.
- A full-page printable US Letter PDF generator for every tag36h11 ID; the PDF opens in a separate browser tab and remains vector-sharp when printed.
- `scan for april tags`, `camera sees april tag with ID`, and `center on april tag` blocks. The centering block has adjustable roll/pitch power, while its grouped settings edit center/angle tolerances, the post-correction rescan delay, and the missed-scan limit.
- `center on object [label]` centers the drone over the matching object-detection bounding box with roll/pitch corrections only. It does not change yaw. Its grouped settings control confidence, center tolerance, rescan delay, and the missed-scan limit.
- Optional local COCO-SSD blocks and live labels. The neural network is stored locally and loads only when requested.
- Object results include confidence and centered X/Y coordinates on a signed `-100` to `+100` scale. `(0, 0)` is the frame center; right and up are positive.
- A local file loader and block for standard Teachable Machine image classifiers.
- Local project autosave, JSON import, and JSON export.
- A BLOCKS-view manual flight pad for temporary forward/back/left/right corrections. The arrow keys trigger the same controls, and Spacebar always triggers Stop & Land while a program is running.
- An emergency Stop & Land action plus a separately confirmed motor cutoff.

## Start the full local app (recommended)

The full local app includes a camera proxy. That proxy is important because browsers normally let a page *display* the drone camera but may block the page from reading its pixels. Pixel access is required by the threshold, AprilTag, COCO-SSD, and custom-model blocks.

Requirements: Node.js 22.13 or newer and current desktop Chrome or Edge. Web Bluetooth is not available in Firefox or Safari.

### Windows

1. Copy the entire `local_site` folder to the student's computer.
2. Double-click `start-windows.bat`.
3. If prompted, install the current Node.js LTS release and double-click the launcher again.
4. The first run installs the already-declared packages. Later runs start immediately.
5. Chrome or Edge opens `http://localhost:3000`.

Keep the terminal window open while using Hopper Studio. Close it when the session is finished.

### macOS or Linux

From this folder, run:

```bash
npm install
npm run dev
```

Then open `http://localhost:3000` in Chrome or Edge.

Hopper Studio keeps this port fixed because browser Bluetooth permissions belong to a specific origin. If startup says port 3000 is already in use, use the already-open Hopper Studio window or close the older server before starting another one.

## Connect the drone

1. Turn on the Hopper drone.
2. Open Hopper Studio from `http://localhost:3000`.
3. Select **Connect drone** and choose the Hopper in the Bluetooth picker.
4. Join the drone Wi-Fi network without closing Hopper Studio. Bluetooth remains connected while Wi-Fi supplies video.
5. Confirm that the separate Wi-Fi box turns green. It checks for a response from `192.168.2.1` and is independent of Bluetooth.
6. In **Vision Testing**, keep `http://192.168.2.1/` and select **Connect**.
7. Build the program, place the drone in a safe open area, and select **Run Program**.

Bluetooth flight control is independent of the current Wi-Fi network. The **Wi-Fi offline** camera indicator does not disable **Connect drone**. Hopper Studio checks the camera only when you select the Wi-Fi box or connect the video feed, so being on another Wi-Fi network does not create camera errors during Bluetooth-only use.

The local camera proxy accepts only `192.168.2.1`; it cannot be used as a general web proxy.

## Use the simulated drone

Select **Connect simulated drone** beside the Bluetooth button. On a desktop with a mouse, the flight room opens in a separate browser window that you can move beside the coding workspace. Simulator physics, waits, and events use that visible window's timing loop so flight continues when the coding window is behind it. If the browser blocks the window, allow pop-ups for Hopper Studio and select the button again. On iPad and other touch devices the room stays inline: iPadOS may suspend a background coding tab when a popup becomes a full tab, so inline mode is the reliable way to keep code and simulation synchronized. The blue connected state means **Run Program** is sending the current Blockly, Python, or JavaScript program to the simulator. Switching between the simulator and a real Hopper never clears the workspace.

The room starts with airplane, car, banana, and apple targets plus one plain white sheet at the center of the dark floor. Drag them anywhere on the floor, select one to resize or rotate, duplicate or delete it, or upload a local image. Choose a tag36h11 ID from the AprilTag dropdown and add as many printable floor tags as the lab needs. A translucent red X-axis arrow rotates with each simulated tag to make visual alignment easy; that helper is intentionally omitted from the simulated drone camera. Drag the Hopper marker itself whenever you want to reposition its starting point; the simulator stops its horizontal motion and continues from the new location. The simulated downward camera feeds the same threshold, object, AprilTag, coordinate, and custom-model blocks used by the physical camera.

The Object Detector panel can generate a full-page US Letter PDF for every built-in simulator target, including person, knife, stop sign, laptop, truck, flags, car, airplane, banana, apple, and white paper. The PDF uses the same PNG, emoji, or drawn target art as the simulator so it can be printed at 100% scale for hardware-camera testing.

The simulator camera remains in **VISION IDLE** during ordinary flight unless a Vision Testing toggle is enabled. A scan block animates a green line down the image and shows that scan's result: binary white/black percentages, object labels and boxes, or AprilTag IDs, boxes, and pose axes. Panel testing also refreshes those annotations continuously, even while the simulated drone is landed and no program is running. The 5°, 10°, and 15° manual attitude checks are useful for demonstrating acceleration and damping before students encode a lawnmower search in blocks.

Flight power uses a classroom-friendly response curve: 5% produces a visible slow crawl, 20% gives roughly 4.3° of pitch or roll for a more useful search speed, and 100% still tops out at 15°. While a program runs, the active action block has a cyan glowing border for the full command duration. Vision blocks take over that glow while an image is being processed, then the glow returns to the surrounding flight action when appropriate. Loop containers remain unhighlighted so students can follow the concrete drone and camera operations.

The side-view instrument updates directly from every simulation frame, independently of the heavier room and camera rendering. Its altitude, vertical-speed readout, shadow, pitch, roll, and heading stay tied to the same physics snapshot. The taller air field uses a compressed altitude scale, keeping ordinary multi-metre climbs visible instead of pinning the drone to the ceiling. The red nose marker identifies the front of the drone: forward pitch visibly lowers that nose, backward pitch raises it, and the status label states the current attitude. Forward, backward, left, and right flip blocks now perform an in-place 360° rotation, hold the current position and altitude, and show the complete maneuver in both the top and side views.

The included transparent floor-object PNGs are by [OpenMoji](https://openmoji.org/), the open-source emoji and icon project, and are distributed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

The tag36h11 codebook and marker renderer come from the MIT-licensed [`apriltag`](https://github.com/veggiedefender/apriltag-js) package. The browser detector in `lib/apriltags.ts` performs local thresholding, square-candidate extraction, codebook matching, and 2D orientation estimation without uploading camera images.

## Use Hopper Studio offline

Open Hopper Studio once while the computer can reach its hosting site or local server. The top status changes from **LOCAL · SAVING OFFLINE** to **LOCAL · OFFLINE READY** after the app saves the complete current page, generated JavaScript and CSS bundles, Blockly media, simulator images, and the local object-detection model. When the computer later joins the Hopper camera Wi-Fi, refreshing the page first checks the server briefly and then opens the saved copy when that server is unavailable. Camera proxy requests are never cached.

The circular arrow on the WRC logo is the **hard refresh** control. Select it while the hosting site or local server is reachable to download a complete fresh set of application files before joining the drone Wi-Fi. Local development stylesheets are requested explicitly as CSS, matching the browser's normal stylesheet request. Each refresh is saved into a separate temporary cache and becomes active only after every required file succeeds, so an interrupted or unavailable refresh cannot replace the previous complete copy. Projects remain in local storage throughout either refresh.

Offline caching requires HTTPS or `http://localhost`, as required by browser service-worker security. The first offline save includes the approximately 18 MB local COCO-SSD model, so keep the page open until the console reports that the offline app copy is ready.

## Vision testing and scan blocks

The three Vision Testing toggles are mutually exclusive: thresholding, object detection, or AprilTag detection can run continuously for setup, but never more than one at a time. Panel tests use the same camera and algorithms as flight blocks and are independent of flight execution: they continue while the drone is landed, while no program is running, during a program, and after Stop & Land. Program scans no longer switch off the selected panel test.

- Threshold 0% makes almost every pixel white; increasing the threshold requires more brightness for white. **Invert** swaps the binary output after thresholding.
- `camera sees binary white with threshold at 60%, invert false, in 10% of frame` scans once and returns true when at least 10% of the processed frame is white. Its dropdown can check black instead.
- `camera sees binary white/black at x [0] y [0]` performs the same scan but checks one requested pixel. Choose white or black directly; this coordinate block does not need a separate invert control. `(0, 0)` is the reticle, `(100, 100)` is the top right, and `(-100, -100)` is the bottom left.
- On a dark carpet, tune the threshold in the panel until a white sheet remains cleanly white, then use the binary coverage or X/Y pixel block to decide when to land.
- `scan for objects` refreshes COCO results explicitly. The `camera sees [object]` predicate also performs a fresh object scan every time it is evaluated; the X/Y-coordinate block reads the most recently detected position.
- `scan for april tags` refreshes tag36h11 IDs and 2D poses. `camera sees april tag with ID` also performs a fresh AprilTag scan every time it is evaluated, so it works directly inside an `if` without a preceding scan block; the ID dropdown includes `any`.
- In AprilTag Detection, choose an ID under **Print a real tag** and select **Generate PDF**. Hopper Studio opens a full-page US Letter PDF in a new tab for printing; allow pop-ups if the browser asks.
- `center on object [label]` runs a fresh object scan, pulses roll or pitch toward the center of the matching bounding box, levels the drone, waits 0.5 seconds by default, and scans again. It never changes yaw. It succeeds inside ±5% of frame center by default.
- `center on binary white/black with threshold at [60]% in [10]% of frame` finds the geometric centroid of all pixels of the selected binary color, then pulses roll or pitch until that centroid is centered. The selected color must cover at least the requested percentage of the frame. It never changes yaw.
- `center on april tag` rescans after every movement while it centers X/Y and aligns the drone's forward axis with the tag x axis. Roll/pitch defaults to 10% power and uses a 0.30-second correction pulse, then levels the drone and waits 0.5 seconds before rescanning so tilt does not distort the measured image position. Yaw uses the measured tag angle as a complete clockwise or counterclockwise `rotate` command, then scans the tag again. The program console reports each detection, lost-tag retry, translation direction, yaw correction, and completion result. It succeeds inside ±5% of frame center and ±5° by default. Select either centering block's gear to open clearly separated settings for tolerances, post-roll/pitch rescan delay, and consecutive lost scans. A 30-second overall timeout prevents either centering block from becoming trapped forever.
- Every `camera sees`, `custom model sees`, and explicit `scan` block captures a fresh frame and shows the scan sweep. Saved detection state is still available to coordinate blocks after that scan.

Lighting, camera auto-exposure, shadows, print quality, and target size affect vision. Tune with the real target and classroom lighting before flight. For AprilTags, print tag36h11 markers with a clean white margin and keep them flat.

The `x/y coordinate of [object]` block returns the center of the matching COCO bounding box from the latest object scan and returns `0` until that label has been detected. Coordinates range from `-100` to `+100`: left/down are negative and right/up are positive.

## COCO-SSD object labels

The included neural network recognizes these 80 COCO labels. Use the label exactly as shown in the `camera sees [label] at ... % confidence` block; matching is case-insensitive.

1. person
2. bicycle
3. car
4. motorcycle
5. airplane
6. bus
7. train
8. truck
9. boat
10. traffic light
11. fire hydrant
12. stop sign
13. parking meter
14. bench
15. bird
16. cat
17. dog
18. horse
19. sheep
20. cow
21. elephant
22. bear
23. zebra
24. giraffe
25. backpack
26. umbrella
27. handbag
28. tie
29. suitcase
30. frisbee
31. skis
32. snowboard
33. sports ball
34. kite
35. baseball bat
36. baseball glove
37. skateboard
38. surfboard
39. tennis racket
40. bottle
41. wine glass
42. cup
43. fork
44. knife
45. spoon
46. bowl
47. banana
48. apple
49. sandwich
50. orange
51. broccoli
52. carrot
53. hot dog
54. pizza
55. donut
56. cake
57. chair
58. couch
59. potted plant
60. bed
61. dining table
62. toilet
63. tv
64. laptop
65. mouse
66. remote
67. keyboard
68. cell phone
69. microwave
70. oven
71. toaster
72. sink
73. refrigerator
74. book
75. clock
76. vase
77. scissors
78. teddy bear
79. hair drier
80. toothbrush

`pencil` is not a COCO label. Small, thin objects are also difficult for this lightweight model even when their category is present. Use a custom Teachable Machine model for classroom-specific whole-frame categories such as `pencil`, `red landing pad`, or `clear floor`.

The COCO-SSD model:

- never loads during ordinary block coding or threshold/AprilTag testing;
- loads from `public/models/coco-ssd`, not from the internet;
- runs once when either the purple `scan for objects` or `camera sees [object]` block is evaluated; or
- runs at a deliberately slow 1.8-second interval only when the Object Detector toggle is enabled.

## Use a custom Teachable Machine image model

Yes. Hopper Studio can load a **standard Teachable Machine Image Project exported as TensorFlow.js files**. It performs whole-frame classification: it says which trained class best matches the current camera view. It does not draw a bounding box or locate multiple objects the way COCO-SSD does.

### Train and export a standard image model

1. Open [Teachable Machine](https://teachablemachine.withgoogle.com/train) and choose **Image Project → Standard image model**.
2. Create clearly named classes. Include a negative/background class such as `none` or `clear floor`; otherwise the model must choose one of the object classes even when none is present.
3. Capture examples from the Hopper camera angle if possible. Include different distances, rotations, floors, shadows, and classroom lighting.
4. Train and test the model in Teachable Machine.
5. Select **Export Model → TensorFlow.js → Download my model**.
6. Unzip the download. It should contain `model.json`, `weights.bin`, and `metadata.json`.

Google's Teachable Machine image library documents those three browser files and its local-file loader in the [official image-library guide](https://github.com/googlecreativelab/teachablemachine-community/tree/master/libraries/image#loading-the-model---browser-files).

### Load and use it in Hopper Studio

1. Start Hopper Studio with the local server and connect the camera.
2. In **Vision Testing → Object Detector → Teachable Machine**, select **Load Model**.
3. In the file picker, select `model.json`, `weights.bin`, and `metadata.json` together.
4. Vision Testing lists every custom label it read from the model. Use **Scan Once** to test the current camera frame.
5. Add the purple `custom model sees [label] at [confidence] %` block. Enter one of the listed class names. Matching is case-insensitive.
6. Reload the three model files after a page refresh. Browsers intentionally do not grant a site permanent access to previously selected local files.

The custom model and its library run locally; model files are not uploaded to a server or Google. For reliable camera pixel access, use `start-windows.bat` or `npm run dev` rather than double-clicking the single HTML file.

### Standard model versus embedded model

- **Standard image model:** export **TensorFlow.js** and use the three-file Hopper Studio loader above. This is the supported browser format.
- **Embedded model:** designed for constrained microcontrollers and exported as TensorFlow Lite / TensorFlow Lite for Microcontrollers. Google's [official embedded-model guide](https://github.com/googlecreativelab/teachablemachine-community/blob/master/snippets/markdown/tiny_image/GettingStarted.md) describes this smaller model and Arduino workflow. Its `.tflite` model or generated C array cannot be loaded by Hopper Studio's browser loader.
- To use embedded inference, run it on the supported microcontroller and write a separate bridge that sends its class result to Hopper Studio. For the simple local browser workflow, train/export a standard image model instead.

## Altitude telemetry

Reliable altitude is **not exposed by the connection paths currently used by Hopper Studio**, so the app does not add a fake `read altitude` block.

- Hopper Studio's flight link is Parrot MiniDrone BLE. It receives the battery percentage and flight-state events used by the existing blocks and status strip.
- The Wi-Fi connection in this app is an HTTP camera stream at `192.168.2.1`; it is not an ARSDK Wi-Fi telemetry session.
- PyParrot's MiniDrone telemetry documentation marks `altitude` as **Wi-Fi only** and notes that Parrot sends more state over Wi-Fi than BLE. See [PyParrot MiniDrone commands and sensors](https://pyparrot.readthedocs.io/en/latest/minidronecommands.html).
- The `set altitude` flight block means vertical motor command (`gaz`); it controls up/down power and does not read height.

The underlying Parrot command transport is described in the [official Parrot ARSDK protocols reference](https://developer.parrot.com/docs/SDK3/ARSDK_Protocols.pdf). A real bang-bang altitude controller would first require a tested ARSDK Wi-Fi telemetry connection supported by this exact Hopper hardware, or a separate range/altitude sensor. Once a dependable measurement exists, a numeric altitude block can safely feed comparisons that command `fly up`, `fly down`, or `hover`. Do not estimate altitude from elapsed motor time; drift, battery level, and ground effect make that unsafe.

## Build the student copy

Run:

```bash
npm run build:student
```

The result is `student-build/hopper-studio.html`. Application JavaScript, CSS, React, Blockly, TensorFlow code, the Teachable Machine loader, and the WRC logo are embedded in that single HTML file. The `student-build/models` and `student-build/blockly` folders are also copied for optional model/media support when the build is served locally.

Students can double-click `hopper-studio.html` in Chrome or Edge for the block editor, JavaScript editor, project files, Bluetooth controls (where Chrome permits Web Bluetooth on `file:` pages), direct camera display, and local custom-model file picker. Browser security may prevent threshold/object/AprilTag analysis or Web Bluetooth on a double-clicked file. For the complete and reliable experience, distribute the whole folder and use `start-windows.bat`.

## Deploy with GitHub Pages

The repository includes `.github/workflows/deploy-pages.yml`. Every push to `main` builds the standalone app and deploys it to GitHub Pages. You can also run it manually from the repository's **Actions** tab.

The workflow runs:

```bash
npm run build:pages
```

That command bundles the application JavaScript and CSS into the single HTML entry point `student-build/index.html`. The copied `models` and `blockly` directories are supporting data for COCO-SSD and Blockly; there is only one HTML file in the deployed build. Every workflow run also publishes that file as the `hopper-studio-single-html` artifact, available from the run's **Artifacts** section.

Before the first deployment, open the GitHub repository's **Settings → Pages** screen and set **Source** to **GitHub Actions**. No repository secret is required. If the default branch is renamed, update the branch under `on.push.branches` in the workflow.

GitHub Pages is a static HTTPS host, so it cannot run Hopper Studio's `/api/camera` proxy. Current Chrome and Edge releases can display the feed directly after the user grants the site's local-network access prompt. Join the Hopper Wi-Fi, select **Connect**, and choose **Allow** when the browser asks to find devices on the local network.

The direct feed is cross-origin, so the hosted page cannot safely read its pixels unless the drone itself supplies suitable CORS headers. Thresholding, AprilTag, COCO-SSD, and custom-model analysis therefore still require the local app (`start-windows.bat` or `npm run dev`). If the user previously denied local-network access, reset that permission from the icon beside the address bar and reconnect.

## Safety

- Test new programs with propellers removed or the drone restrained.
- Keep students, faces, loose clothing, and fragile objects out of the flight area.
- The normal red Stop button invalidates the entire run, unregisters its keyboard/drone events, clears buffered movement and flight pings, waits briefly for active vision/actions to settle, and repeatedly sends an emergency landing command. A new run cannot begin while this cleanup is in progress.
- While a BLOCKS program is flying, the on-screen direction pad or keyboard arrow keys temporarily replace its flight output with a 30% correction pulse, then release control back to the latest program command. The red LAND control and Spacebar use the same full Stop & Land cleanup as the top-right button.
- The warning-triangle button immediately cuts motor power and asks for confirmation first. Use it only when landing would be less safe.
- Programs automatically send a landing command when their main sequence finishes.
- Treat camera classifications as uncertain sensor readings. Require multiple consistent readings and conservative confidence thresholds before changing flight.

## Production checks

```bash
npm run build
npm run build:student
npm run build:pages
```

All builds run locally. GitHub Pages deployment only occurs in the checked-in workflow after a push to `main`, or when manually started from GitHub Actions.
