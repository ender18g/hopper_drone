# Hopper Studio

Hopper Studio is a fully local block-coding, JavaScript, Bluetooth flight-control, and camera-vision app for the FTW Hopper drone. It preserves the FTW Code / Parrot Mambo command protocol and adds camera color blocks, local COCO-SSD object detection, and support for custom Teachable Machine image classifiers.

## What is included

- Blockly workspace with the original flight, battery, event, logic, loop, math, variable, function, and accessory capabilities.
- JavaScript editor for advanced students.
- Web Bluetooth control for Hopper, FTW, Mambo, Travis, and Mars device names.
- Simultaneous Bluetooth flight control and Wi-Fi camera display.
- Separate Bluetooth and Hopper Wi-Fi indicators. The Wi-Fi indicator checks whether `192.168.2.1` actually responds; select it to check again immediately.
- A draggable Telemetry panel divider. Drag it left to enlarge the camera and live readouts, or right to give Blockly more room. The Left and Right arrow keys also work when the divider is focused.
- Editable red, green, and blue RGB profiles with live frame coverage.
- Paired drag sliders and numeric inputs for every RGB minimum/maximum, plus a live center-reticle pixel readout for tuning colors against the real camera image.
- `camera sees color` and `color coverage` blocks.
- Optional local COCO-SSD blocks and live labels. The neural network is stored locally and loads only when requested.
- Object results include confidence and centered X/Y coordinates on a signed `-100` to `+100` scale. `(0, 0)` is the frame center; right and up are positive.
- A local file loader and block for standard Teachable Machine image classifiers.
- Local project autosave, JSON import, and JSON export.
- An emergency Stop & Land action plus a separately confirmed motor cutoff.

## Start the full local app (recommended)

The full local app includes a camera proxy. That proxy is important because browsers normally let a page *display* the drone camera but may block the page from reading its pixels. Pixel access is required by the color, COCO-SSD, and custom-model blocks.

Requirements: Node.js 22.13 or newer and current desktop Chrome or Edge. Web Bluetooth is not available in Firefox or Safari.

### Windows

1. Copy the entire `local_site` folder to the student's computer.
2. Double-click `start-windows.bat`.
3. The first run installs the already-declared packages. Later runs start immediately.
4. Chrome or Edge opens `http://localhost:3000`.

### macOS or Linux

From this folder, run:

```bash
npm install
npm run dev
```

Then open `http://localhost:3000` in Chrome or Edge.

## Connect the drone

1. Turn on the Hopper drone.
2. Open Hopper Studio from `http://localhost:3000`.
3. Select **Connect drone** and choose the Hopper in the Bluetooth picker.
4. Join the drone Wi-Fi network without closing Hopper Studio. Bluetooth remains connected while Wi-Fi supplies video.
5. Confirm that the separate Wi-Fi box turns green. It checks for a response from `192.168.2.1` and is independent of Bluetooth.
6. In **Telemetry**, keep `http://192.168.2.1/` and select **Connect**.
7. Build the program, place the drone in a safe open area, and select **Run Program**.

The local camera proxy accepts only `192.168.2.1`; it cannot be used as a general web proxy.

## How Color Tracker controls the color blocks

Telemetry is both a live sensor panel **and** the configuration panel used by the purple camera blocks.

- The red, green, and blue tabs each hold one RGB range.
- Every pixel is considered a match only when its R, G, and B values are all between that profile's Min and Max values.
- `red` in the `camera sees red over ... %` block uses the exact red slider/number values shown in Color Tracker. Green and blue work the same way.
- `red coverage %` returns the percentage of pixels in the current camera frame that match the red profile.
- `camera sees red over 12%` returns true when red coverage is at least 12%. The percentage socket in the block is the coverage threshold; it is not an RGB value.
- The calculation is inclusive on all six limits: a pixel matches only when its red, green, and blue values are each between that profile's minimum and maximum.
- **Scan Frame** and the continuous Color Tracker toggle use the same `VisionRuntime` calculation as the blocks, so they are good ways to tune a profile before flight.
- RGB profiles are saved in this browser's local storage and are reused by later projects on the same computer.

Lighting, camera auto-exposure, shadows, and a colored target's size all affect coverage. Tune the ranges with the real target and classroom lighting before using a vision result to change flight.

The `x/y coordinate of [object]` block returns the center of the matching COCO bounding box. It rescans when needed, returns the last known coordinate when an object temporarily disappears, and returns `0` until that label has been detected once. Coordinates range from `-100` to `+100`: left/down are negative and right/up are positive.

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

- never loads during ordinary block coding or color tracking;
- loads from `public/models/coco-ssd`, not from the internet;
- runs once when a purple object block is evaluated; or
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
2. In **Telemetry → Object Detector → Teachable Machine**, select **Load Model**.
3. In the file picker, select `model.json`, `weights.bin`, and `metadata.json` together.
4. Telemetry lists every custom label it read from the model. Use **Scan Once** to test the current camera frame.
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

Students can double-click `hopper-studio.html` in Chrome or Edge for the block editor, JavaScript editor, project files, Bluetooth controls (where Chrome permits Web Bluetooth on `file:` pages), direct camera display, and local custom-model file picker. Browser security may prevent color/object analysis or Web Bluetooth on a double-clicked file. For the complete and reliable experience, distribute the whole folder and use `start-windows.bat`.

## Safety

- Test new programs with propellers removed or the drone restrained.
- Keep students, faces, loose clothing, and fragile objects out of the flight area.
- The normal red Stop button stops the program and repeatedly sends an emergency landing command.
- The warning-triangle button immediately cuts motor power and asks for confirmation first. Use it only when landing would be less safe.
- Programs automatically send a landing command when their main sequence finishes.
- Treat camera classifications as uncertain sensor readings. Require multiple consistent readings and conservative confidence thresholds before changing flight.

## Production checks

```bash
npm run build
npm run build:student
```

Both builds are local. No deployment, account, analytics, or cloud service is required.
