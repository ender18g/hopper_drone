"use client";

import { useMemo, useState } from "react";
import { tokenizeJavaScript } from "../lib/javascript-highlighting";
import { tokenizePython } from "../lib/python";

type ReferenceLanguage = "python" | "javascript";

type ReferenceArgument = {
  name: string;
  type: string;
  accepted?: string;
  defaultValue?: string;
  detail: string;
};

type ReferenceReturn = {
  type: string;
  detail: string;
};

type ReferenceEntry = {
  signature: string;
  detail: string;
  arguments: ReferenceArgument[];
  returns: ReferenceReturn;
};

type ReferenceSection = {
  id: string;
  title: string;
  entries: ReferenceEntry[];
};

const arg = (
  name: string,
  type: string,
  accepted: string | undefined,
  defaultValue: string | undefined,
  detail: string,
): ReferenceArgument => ({ name, type, accepted, defaultValue, detail });

const result = (type: string, detail: string): ReferenceReturn => ({ type, detail });
const pythonNone = result("None", "Completes the action but does not return a value.");
const javascriptVoid = result(
  "Promise<void>",
  "Await the Promise to finish the action; the resolved value is undefined.",
);
const noArguments: ReferenceArgument[] = [];

const direction = (defaultValue?: string) => arg(
  "direction",
  "string",
  "\"forward\" | \"backward\" | \"left\" | \"right\" | \"up\" | \"down\"",
  defaultValue,
  "The direction the drone should travel.",
);
const horizontalDirection = arg(
  "direction",
  "string",
  "\"forward\" | \"backward\" | \"left\" | \"right\"",
  undefined,
  "The flip direction.",
);
const color = arg(
  "color",
  "string",
  "\"white\" | \"black\"",
  undefined,
  "Which binary pixel color should count as a match.",
);
const threshold = arg(
  "threshold",
  "number",
  "0–100",
  "60",
  "Brightness cutoff in percent. Higher values require a brighter pixel to become white.",
);
const invert = arg(
  "invert",
  "boolean",
  "True or False",
  "False",
  "When true, swaps the processed white and black pixels.",
);
const invertJavaScript = { ...invert, accepted: "true | false", defaultValue: "false" };
const confidence = arg(
  "confidence",
  "number",
  "0.0–1.0",
  "0.55",
  "Minimum model confidence as a fraction. Use 0.55 for 55%, not 55.",
);
const confidenceJavaScript = { ...confidence, name: "minimumConfidence" };
const label = arg(
  "label",
  "string",
  "A supported object label such as \"person\", \"bottle\", or \"apple\"",
  undefined,
  "Case-insensitive exact object-detection label.",
);
const centerPower = arg(
  "power",
  "number",
  "0–100",
  "10",
  "Roll/pitch correction power in percent.",
);
const centerPowerJavaScript = { ...centerPower, name: "translationPower" };
const centerSlack = arg(
  "center_slack",
  "number",
  "1–35",
  "5",
  "Allowed X and Y error in percent before the target counts as centered.",
);
const centerSlackJavaScript = { ...centerSlack, name: "centerSlack" };
const lostSearches = arg(
  "lost_searches",
  "integer",
  "1–20",
  "3",
  "Consecutive scans without the target before the function gives up.",
);
const rescanDelay = arg(
  "rescan_delay",
  "number",
  "0–5 seconds",
  "0.5",
  "Wait after leveling from a roll/pitch correction before scanning again.",
);
const rescanDelayJavaScript = { ...rescanDelay, name: "rescanDelay" };
const tagId = arg(
  "id",
  "integer or string",
  "0–586 or \"any\"",
  "\"any\"",
  "The tag36h11 ID to find. \"any\" chooses the visible tag nearest image center.",
);

const PYTHON_REFERENCE: ReferenceSection[] = [
  {
    id: "flight",
    title: "Flight + timing",
    entries: [
      {
        signature: "take_off()",
        detail: "Take off and wait until the drone is stable.",
        arguments: noArguments,
        returns: pythonNone,
      },
      {
        signature: "land()",
        detail: "Zero movement, land, and wait for the landing interval.",
        arguments: noArguments,
        returns: pythonNone,
      },
      {
        signature: "hover()",
        detail: "Level the drone, stop all motion axes, and hold for 1 second.",
        arguments: noArguments,
        returns: pythonNone,
      },
      {
        signature: "wait(seconds)",
        detail: "Pause the program without changing the current motion command.",
        arguments: [
          arg("seconds", "number", "0 or greater", undefined, "How long to wait."),
        ],
        returns: pythonNone,
      },
      {
        signature: "fly(direction, seconds=1, power=15)",
        detail: "Fly in one named direction, stop that axis, and settle.",
        arguments: [
          direction(),
          arg("seconds", "number", "0 or greater", "1", "How long to apply the movement."),
          arg("power", "number", "0–100 normally", "15", "Movement power in percent."),
        ],
        returns: pythonNone,
      },
      {
        signature: "rotate(degrees=0, direction=\"clockwise\")",
        detail: "Rotate around the yaw axis and settle.",
        arguments: [
          arg("degrees", "number", "0 or greater", "0", "Requested turn angle."),
          arg(
            "direction",
            "string",
            "\"clockwise\" | \"counterclockwise\"",
            "\"clockwise\"",
            "Direction of the turn.",
          ),
        ],
        returns: pythonNone,
      },
      {
        signature: "flip(direction)",
        detail: "Perform a flip only when there is instructor-approved clearance.",
        arguments: [horizontalDirection],
        returns: pythonNone,
      },
      {
        signature: "set_axis(axis, power)",
        detail: "Set one motion axis continuously until reset_motion() or another command changes it.",
        arguments: [
          arg(
            "axis",
            "string",
            "\"pitch\" | \"roll\" | \"yaw\" | \"gaz\" | \"altitude\"",
            undefined,
            "\"altitude\" is an alias for the gaz/throttle-like axis.",
          ),
          arg("power", "number", "−100–100", undefined, "Signed axis power in percent."),
        ],
        returns: pythonNone,
      },
      {
        signature: "reset_motion()",
        detail: "Set pitch, roll, yaw, and gaz to zero. This does not land.",
        arguments: noArguments,
        returns: pythonNone,
      },
    ],
  },
  {
    id: "state",
    title: "State + accessories",
    entries: [
      {
        signature: "battery_level()",
        detail: "Read the latest reported battery level.",
        arguments: noArguments,
        returns: result(
          "number or None",
          "Battery percentage from 0–100, or None before telemetry is available.",
        ),
      },
      {
        signature: "is_flying()",
        detail: "Check the controller's current flight state.",
        arguments: noArguments,
        returns: result("bool", "True when flying; otherwise False."),
      },
      {
        signature: "is_landed()",
        detail: "Check the controller's current landed state.",
        arguments: noArguments,
        returns: result("bool", "True when landed; otherwise False."),
      },
      {
        signature: "wait_for_battery_change()",
        detail: "Wait until new battery telemetry changes the whole-number percentage.",
        arguments: noArguments,
        returns: pythonNone,
      },
      {
        signature: "take_photo()",
        detail: "Capture the current real or simulated camera frame into Mission Photos.",
        arguments: noArguments,
        returns: pythonNone,
      },
      {
        signature: "open_grabber() / close_grabber()",
        detail: "Open or close the physical claw accessory.",
        arguments: noArguments,
        returns: pythonNone,
      },
      {
        signature: "fire_gun()",
        detail: "Fire the physical cannon accessory.",
        arguments: noArguments,
        returns: pythonNone,
      },
      {
        signature: "emergency_cutoff()",
        detail: "Emergency only: stop the motors immediately without a controlled landing.",
        arguments: noArguments,
        returns: pythonNone,
      },
      {
        signature: "print(*values)",
        detail: "Write one or more values to the Studio console.",
        arguments: [
          arg("values", "any values", "strings, numbers, booleans, lists, or objects", undefined, "Values are separated by spaces."),
        ],
        returns: pythonNone,
      },
      {
        signature: "stopped()",
        detail: "Check whether Stop has been requested.",
        arguments: noArguments,
        returns: result("bool", "True after Stop; otherwise False."),
      },
      {
        signature: "key_pressed(key)",
        detail: "Check a keyboard key while the program is running.",
        arguments: [
          arg(
            "key",
            "string",
            "\"a\"–\"z\" | \"ArrowUp\" | \"ArrowDown\" | \"ArrowLeft\" | \"ArrowRight\" | \"Space\"",
            undefined,
            "The exact key name to check.",
          ),
        ],
        returns: result("bool", "True while that key is held; otherwise False."),
      },
    ],
  },
  {
    id: "vision-bool",
    title: "Camera booleans + centering",
    entries: [
      {
        signature: "sees_binary(color, threshold=60, invert=False, coverage=10)",
        detail: "Scan a fresh frame and compare whole-frame white or black coverage.",
        arguments: [
          color,
          threshold,
          invert,
          arg("coverage", "number", "0–100", "10", "Minimum matching area as a percent of the full frame."),
        ],
        returns: result(
          "bool",
          "True when the selected color covers at least coverage percent; otherwise False.",
        ),
      },
      {
        signature: "binary_at(color, x=0, y=0, threshold=60, invert=False)",
        detail: "Scan a fresh frame and check one normalized X/Y pixel.",
        arguments: [
          color,
          arg("x", "number", "−100–100", "0", "Horizontal pixel position: left −100, center 0, right 100."),
          arg("y", "number", "−100–100", "0", "Vertical pixel position: bottom −100, center 0, top 100."),
          threshold,
          invert,
        ],
        returns: result(
          "bool",
          "True when the sampled pixel is the selected color; otherwise False.",
        ),
      },
      {
        signature: "sees_object(label, confidence=0.55)",
        detail: "Run a fresh object-detection scan and look for one exact label.",
        arguments: [label, confidence],
        returns: result(
          "bool",
          "True when a matching box meets the confidence threshold; otherwise False.",
        ),
      },
      {
        signature: "sees_april_tag(id=\"any\")",
        detail: "Run a fresh tag36h11 scan.",
        arguments: [tagId],
        returns: result("bool", "True when the requested tag is detected; otherwise False."),
      },
      {
        signature: "sees_custom_label(label, confidence=0.75)",
        detail: "Classify a fresh frame with the loaded Teachable Machine model.",
        arguments: [
          arg("label", "string", "An exact label from the loaded custom model", undefined, "Matching is case-insensitive."),
          { ...confidence, defaultValue: "0.75" },
        ],
        returns: result(
          "bool",
          "True when the label's probability meets the confidence threshold; otherwise False.",
        ),
      },
      {
        signature: "center_on_object(label, power=10, confidence=0.55, center_slack=5, lost_searches=3, rescan_delay=0.5)",
        detail: "Center the matching object's bounding box with roll/pitch only. Yaw is never changed.",
        arguments: [label, centerPower, confidence, centerSlack, lostSearches, rescanDelay],
        returns: result(
          "bool",
          "True when X and Y are inside center_slack; False if the target is lost, Stop is pressed, or 30 seconds elapse.",
        ),
      },
      {
        signature: "center_on_april_tag(id=\"any\", power=10, center_slack=5, angle_slack=5, lost_searches=3, rescan_delay=0.5)",
        detail: "Center the requested tag in X/Y, then align the drone with its image-plane yaw.",
        arguments: [
          tagId,
          centerPower,
          centerSlack,
          arg("angle_slack", "number", "1–45 degrees", "5", "Allowed yaw error before alignment is complete."),
          lostSearches,
          rescanDelay,
        ],
        returns: result(
          "bool",
          "True when center and yaw errors are inside tolerance; False if the tag is lost, Stop is pressed, or 30 seconds elapse.",
        ),
      },
    ],
  },
  {
    id: "vision-data",
    title: "Camera scans + coordinates",
    entries: [
      {
        signature: "scan_threshold(threshold=60, invert=False)",
        detail: "Process a fresh frame into white and black pixels.",
        arguments: [threshold, invert],
        returns: result(
          "ThresholdResult",
          "Object with whiteCoverage, blackCoverage, centerWhite, frameWidth, frameHeight, threshold, invert, and binaryData.",
        ),
      },
      {
        signature: "load_object_model()",
        detail: "Load and cache the local COCO-SSD object detector.",
        arguments: noArguments,
        returns: result("ObjectDetection", "The loaded COCO-SSD model instance."),
      },
      {
        signature: "scan_objects(confidence=0.55) / detect_objects(confidence=0.55)",
        detail: "Run a fresh object-detection scan. Both names do the same thing.",
        arguments: [confidence],
        returns: result(
          "list[VisionDetection]",
          "Matching boxes with class, score, bbox, frame size, centerX, and centerY.",
        ),
      },
      {
        signature: "object_coordinate(label, axis, confidence=0.55)",
        detail: "Read one coordinate from the latest stored matching detection; no fresh scan.",
        arguments: [
          label,
          arg("axis", "string", "\"x\" | \"y\"", undefined, "Which bounding-box center coordinate to return."),
          confidence,
        ],
        returns: result(
          "number",
          "Stored coordinate from −100 to 100. Returns 0 before a match or when stored confidence is too low.",
        ),
      },
      {
        signature: "object_x(label, confidence=0.55)",
        detail: "Convenience form of object_coordinate(label, \"x\", confidence).",
        arguments: [label, confidence],
        returns: result("number", "Stored X coordinate from −100 to 100, or 0 without a valid match."),
      },
      {
        signature: "object_y(label, confidence=0.55)",
        detail: "Convenience form of object_coordinate(label, \"y\", confidence).",
        arguments: [label, confidence],
        returns: result("number", "Stored Y coordinate from −100 to 100, or 0 without a valid match."),
      },
      {
        signature: "scan_april_tags()",
        detail: "Run a fresh tag36h11 scan.",
        arguments: noArguments,
        returns: result(
          "list[AprilTagDetection]",
          "Detected IDs with corners, bbox, centerX, centerY, image-plane yaw, and hamming.",
        ),
      },
      {
        signature: "scan_custom_model()",
        detail: "Classify a fresh frame with the loaded Teachable Machine model.",
        arguments: noArguments,
        returns: result(
          "list[CustomPrediction]",
          "Every custom class name and its probability from 0.0–1.0.",
        ),
      },
    ],
  },
  {
    id: "flow",
    title: "Decisions + loops",
    entries: [
      {
        signature: "if condition:\n    fly(\"forward\", 1, 15)\nelif other_condition:\n    hover()\nelse:\n    land()",
        detail: "Run only the first branch whose condition is true.",
        arguments: [
          arg("condition", "bool", "True | False", undefined, "A camera, drone-state, comparison, or combined boolean expression."),
        ],
        returns: result("None", "Controls which statements run; it does not produce a value."),
      },
      {
        signature: "for step in range(4):\n    rotate(90)\n    wait(0.5)",
        detail: "Repeat a block a known number of times.",
        arguments: [
          arg("range(4)", "integer sequence", "range(stop) or range(start, stop, step)", undefined, "Here it produces 0, 1, 2, and 3."),
        ],
        returns: result("None", "Runs the loop body once per sequence value."),
      },
      {
        signature: "while not stopped():\n    if sees_object(\"person\"):\n        break\n    rotate(20)",
        detail: "Repeat while a condition stays true. Include waits, awaited commands, or a clear exit.",
        arguments: [
          arg("condition", "bool", "True | False", undefined, "Checked before every loop iteration."),
        ],
        returns: result("None", "Stops when the condition is false or break runs."),
      },
      {
        signature: "True  False  and  or  not",
        detail: "Boolean values and operators used to combine decisions.",
        arguments: [
          arg("values", "bool", "True | False", undefined, "and requires both; or requires either; not reverses one value."),
        ],
        returns: result("bool", "The combined True or False result."),
      },
    ],
  },
];

const JAVASCRIPT_REFERENCE: ReferenceSection[] = [
  {
    id: "flight",
    title: "Flight + timing",
    entries: [
      {
        signature: "await drone.takeOff()",
        detail: "Take off and wait until the drone is stable.",
        arguments: noArguments,
        returns: javascriptVoid,
      },
      {
        signature: "await drone.land()",
        detail: "Zero movement, land, and wait for the landing interval.",
        arguments: noArguments,
        returns: javascriptVoid,
      },
      {
        signature: "await drone.hover()",
        detail: "Level the drone, stop all motion axes, and hold for 1 second.",
        arguments: noArguments,
        returns: javascriptVoid,
      },
      {
        signature: "await drone.wait(seconds)",
        detail: "Pause the program without changing the current motion command.",
        arguments: [
          arg("seconds", "number", "0 or greater", undefined, "How long to wait."),
        ],
        returns: javascriptVoid,
      },
      {
        signature: "await drone.fly(direction, seconds = 0, power = 0)",
        detail: "Fly in one named direction, stop that axis, and settle.",
        arguments: [
          direction(),
          arg("seconds", "number", "0 or greater", "0", "How long to apply the movement."),
          arg("power", "number", "0–100 normally", "0", "Movement power in percent."),
        ],
        returns: javascriptVoid,
      },
      {
        signature: "await drone.rotate(degrees = 0, direction = \"clockwise\")",
        detail: "Rotate around the yaw axis and settle.",
        arguments: [
          arg("degrees", "number", "0 or greater", "0", "Requested turn angle."),
          arg(
            "direction",
            "string",
            "\"clockwise\" | \"counterclockwise\"",
            "\"clockwise\"",
            "Direction of the turn.",
          ),
        ],
        returns: javascriptVoid,
      },
      {
        signature: "await drone.flip(direction)",
        detail: "Perform a flip only when there is instructor-approved clearance.",
        arguments: [horizontalDirection],
        returns: javascriptVoid,
      },
      {
        signature: "drone.setAxis(axis, power)",
        detail: "Set one motion axis continuously until drone.reset() or another command changes it.",
        arguments: [
          arg(
            "axis",
            "string",
            "\"pitch\" | \"roll\" | \"yaw\" | \"gaz\" | \"altitude\"",
            undefined,
            "\"altitude\" is an alias for the gaz/throttle-like axis.",
          ),
          arg("power", "number", "−100–100", undefined, "Signed axis power in percent."),
        ],
        returns: result("void", "Changes controller state and returns undefined immediately."),
      },
      {
        signature: "drone.reset()",
        detail: "Set pitch, roll, yaw, and gaz to zero. This does not land.",
        arguments: noArguments,
        returns: result("void", "Changes controller state and returns undefined."),
      },
    ],
  },
  {
    id: "state",
    title: "State + accessories",
    entries: [
      {
        signature: "drone.getBatteryLevel()",
        detail: "Read the latest reported battery level.",
        arguments: noArguments,
        returns: result(
          "number | null",
          "Battery percentage from 0–100, or null before telemetry is available.",
        ),
      },
      {
        signature: "drone.isFlying()",
        detail: "Check the controller's current flight state.",
        arguments: noArguments,
        returns: result("boolean", "true when flying; otherwise false."),
      },
      {
        signature: "drone.isLanded()",
        detail: "Check the controller's current landed state.",
        arguments: noArguments,
        returns: result("boolean", "true when landed; otherwise false."),
      },
      {
        signature: "await drone.waitUntilBatteryLevelChanges()",
        detail: "Wait until new battery telemetry changes the whole-number percentage.",
        arguments: noArguments,
        returns: javascriptVoid,
      },
      {
        signature: "await drone.takePicture()",
        detail: "Capture the current real or simulated camera frame into Mission Photos.",
        arguments: noArguments,
        returns: javascriptVoid,
      },
      {
        signature: "await drone.grabber(action)",
        detail: "Open or close the physical claw accessory.",
        arguments: [
          arg("action", "string", "\"OPEN\" | \"CLOSE\"", undefined, "Accessory action; use uppercase values."),
        ],
        returns: javascriptVoid,
      },
      {
        signature: "await drone.fireGun()",
        detail: "Fire the physical cannon accessory.",
        arguments: noArguments,
        returns: javascriptVoid,
      },
      {
        signature: "await drone.cutoff()",
        detail: "Emergency only: stop the motors immediately without a controlled landing.",
        arguments: noArguments,
        returns: javascriptVoid,
      },
      {
        signature: "console.log(...values)",
        detail: "Write one or more values to the Studio console.",
        arguments: [
          arg("values", "unknown[]", "strings, numbers, booleans, arrays, or objects", undefined, "One or more values to display."),
        ],
        returns: result("void", "Writes the line and returns undefined."),
      },
      {
        signature: "runtime.stopped",
        detail: "Read whether Stop has been requested.",
        arguments: noArguments,
        returns: result("boolean", "true after Stop; otherwise false."),
      },
      {
        signature: "runtime.keyIsPressed(key)",
        detail: "Check a keyboard key while the program is running.",
        arguments: [
          arg(
            "key",
            "string",
            "\"a\"–\"z\" | \"ArrowUp\" | \"ArrowDown\" | \"ArrowLeft\" | \"ArrowRight\" | \"Space\"",
            undefined,
            "The exact key name to check.",
          ),
        ],
        returns: result("boolean", "true while that key is held; otherwise false."),
      },
    ],
  },
  {
    id: "vision-bool",
    title: "Camera booleans + centering",
    entries: [
      {
        signature: "await vision.seesBinary(color, threshold = 60, invert = false, minimumCoverage = 10)",
        detail: "Scan a fresh frame and compare whole-frame white or black coverage.",
        arguments: [
          color,
          threshold,
          invertJavaScript,
          arg("minimumCoverage", "number", "0–100", "10", "Minimum matching area as a percent of the full frame."),
        ],
        returns: result(
          "Promise<boolean>",
          "Resolves true when the selected color covers at least coverage percent; otherwise false.",
        ),
      },
      {
        signature: "await vision.binaryAt(color, x = 0, y = 0, threshold = 60, invert = false)",
        detail: "Scan a fresh frame and check one normalized X/Y pixel.",
        arguments: [
          color,
          arg("x", "number", "−100–100", "0", "Horizontal pixel position: left −100, center 0, right 100."),
          arg("y", "number", "−100–100", "0", "Vertical pixel position: bottom −100, center 0, top 100."),
          threshold,
          invertJavaScript,
        ],
        returns: result(
          "Promise<boolean>",
          "Resolves true when the sampled pixel is the selected color; otherwise false.",
        ),
      },
      {
        signature: "await vision.seesObject(label, minimumConfidence = 0.55)",
        detail: "Run a fresh object-detection scan and look for one exact label.",
        arguments: [label, confidenceJavaScript],
        returns: result(
          "Promise<boolean>",
          "Resolves true when a matching box meets the confidence threshold; otherwise false.",
        ),
      },
      {
        signature: "await vision.seesAprilTag(id = \"any\")",
        detail: "Run a fresh tag36h11 scan.",
        arguments: [tagId],
        returns: result(
          "Promise<boolean>",
          "Resolves true when the requested tag is detected; otherwise false.",
        ),
      },
      {
        signature: "await vision.seesCustomLabel(label, minimumConfidence = 0.75)",
        detail: "Classify a fresh frame with the loaded Teachable Machine model.",
        arguments: [
          arg("label", "string", "An exact label from the loaded custom model", undefined, "Matching is case-insensitive."),
          { ...confidenceJavaScript, defaultValue: "0.75" },
        ],
        returns: result(
          "Promise<boolean>",
          "Resolves true when the label's probability meets the confidence threshold; otherwise false.",
        ),
      },
      {
        signature: "await vision.centerOnObject(drone, label, translationPower = 10, minimumConfidence = 0.55, centerSlack = 5, lostObjectSearches = 3, rescanDelay = 0.5)",
        detail: "Center the matching object's bounding box with roll/pitch only. Yaw is never changed.",
        arguments: [
          arg("drone", "DroneController", "the injected drone object", undefined, "Pass the Studio's drone variable."),
          label,
          centerPowerJavaScript,
          confidenceJavaScript,
          centerSlackJavaScript,
          { ...lostSearches, name: "lostObjectSearches" },
          rescanDelayJavaScript,
        ],
        returns: result(
          "Promise<boolean>",
          "Resolves true when X and Y are inside centerSlack; false if the target is lost, Stop is pressed, or 30 seconds elapse.",
        ),
      },
      {
        signature: "await vision.centerOnAprilTag(drone, id = \"any\", translationPower = 10, centerSlack = 5, angleSlack = 5, lostTagSearches = 3, rescanDelay = 0.5)",
        detail: "Center the requested tag in X/Y, then align the drone with its image-plane yaw.",
        arguments: [
          arg("drone", "DroneController", "the injected drone object", undefined, "Pass the Studio's drone variable."),
          tagId,
          centerPowerJavaScript,
          centerSlackJavaScript,
          arg("angleSlack", "number", "1–45 degrees", "5", "Allowed yaw error before alignment is complete."),
          { ...lostSearches, name: "lostTagSearches" },
          rescanDelayJavaScript,
        ],
        returns: result(
          "Promise<boolean>",
          "Resolves true when center and yaw errors are inside tolerance; false if the tag is lost, Stop is pressed, or 30 seconds elapse.",
        ),
      },
    ],
  },
  {
    id: "vision-data",
    title: "Camera scans + coordinates",
    entries: [
      {
        signature: "await vision.scanThreshold(threshold = 60, invert = false, announceScan = true)",
        detail: "Process a fresh frame into white and black pixels.",
        arguments: [
          threshold,
          invertJavaScript,
          arg("announceScan", "boolean", "true | false", "true", "Show the Studio scan animation and event."),
        ],
        returns: result(
          "Promise<ThresholdResult>",
          "Resolves to whiteCoverage, blackCoverage, centerWhite, frameWidth, frameHeight, threshold, invert, and binaryData.",
        ),
      },
      {
        signature: "await vision.loadObjectModel()",
        detail: "Load and cache the local COCO-SSD object detector.",
        arguments: noArguments,
        returns: result(
          "Promise<ObjectDetection>",
          "Resolves to the loaded COCO-SSD model instance.",
        ),
      },
      {
        signature: "await vision.detectObjects(minimumConfidence = 0.55, announceScan = true)",
        detail: "Run a fresh object-detection scan.",
        arguments: [
          confidenceJavaScript,
          arg("announceScan", "boolean", "true | false", "true", "Show the Studio scan animation and event."),
        ],
        returns: result(
          "Promise<VisionDetection[]>",
          "Resolves to matching boxes with class, score, bbox, frame size, centerX, and centerY.",
        ),
      },
      {
        signature: "vision.objectCoordinate(label, axis, minimumConfidence = 0.55)",
        detail: "Read one coordinate from the latest stored matching detection; no fresh scan.",
        arguments: [
          label,
          arg("axis", "string", "\"x\" | \"y\"", undefined, "Which bounding-box center coordinate to return."),
          confidenceJavaScript,
        ],
        returns: result(
          "number",
          "Stored coordinate from −100 to 100. Returns 0 before a match or when stored confidence is too low.",
        ),
      },
      {
        signature: "await vision.scanAprilTags(announceScan = true)",
        detail: "Run a fresh tag36h11 scan.",
        arguments: [
          arg("announceScan", "boolean", "true | false", "true", "Show the Studio scan animation and event."),
        ],
        returns: result(
          "Promise<AprilTagDetection[]>",
          "Resolves to detected IDs with corners, bbox, centerX, centerY, image-plane yaw, and hamming.",
        ),
      },
      {
        signature: "await vision.classifyCustomModel(announceScan = true)",
        detail: "Classify a fresh frame with the loaded Teachable Machine model.",
        arguments: [
          arg("announceScan", "boolean", "true | false", "true", "Show the Studio scan animation and event."),
        ],
        returns: result(
          "Promise<CustomPrediction[]>",
          "Resolves to every custom class name and its probability from 0.0–1.0.",
        ),
      },
    ],
  },
  {
    id: "flow",
    title: "Decisions + loops",
    entries: [
      {
        signature: "if (condition) {\n  await drone.fly(\"forward\", 1, 15);\n} else {\n  await drone.land();\n}",
        detail: "Run one branch when the condition is true and the other when it is false.",
        arguments: [
          arg("condition", "boolean", "true | false", undefined, "A camera, drone-state, comparison, or combined boolean expression."),
        ],
        returns: result("void", "Controls which statements run; it does not produce a value."),
      },
      {
        signature: "for (let step = 0; step < 4; step += 1) {\n  await drone.rotate(90);\n  await drone.wait(0.5);\n}",
        detail: "Repeat a block a known number of times.",
        arguments: [
          arg("step", "number", "0, 1, 2, 3", "0", "Loop counter; the loop runs while step < 4."),
        ],
        returns: result("void", "Runs the loop body four times."),
      },
      {
        signature: "while (!runtime.stopped) {\n  if (await vision.seesObject(\"person\")) break;\n  await drone.rotate(20);\n}",
        detail: "Repeat while a condition stays true. Include awaited commands or a clear exit.",
        arguments: [
          arg("condition", "boolean", "true | false", undefined, "Checked before every loop iteration."),
        ],
        returns: result("void", "Stops when the condition is false or break runs."),
      },
      {
        signature: "true  false  &&  ||  !",
        detail: "Boolean values and operators used to combine decisions.",
        arguments: [
          arg("values", "boolean", "true | false", undefined, "&& requires both; || requires either; ! reverses one value."),
        ],
        returns: result("boolean", "The combined true or false result."),
      },
    ],
  },
];

const referenceFor = (language: ReferenceLanguage) =>
  language === "python" ? PYTHON_REFERENCE : JAVASCRIPT_REFERENCE;

const searchableEntryText = (entry: ReferenceEntry) => [
  entry.signature,
  entry.detail,
  entry.returns.type,
  entry.returns.detail,
  ...entry.arguments.flatMap((argument) => [
    argument.name,
    argument.type,
    argument.accepted ?? "",
    argument.defaultValue ?? "",
    argument.detail,
  ]),
].join(" ").toLowerCase();

const returnTone = (returnType: string) => {
  if (/bool/i.test(returnType)) return "bool";
  if (/none|void/i.test(returnType)) return "none";
  if (/number/i.test(returnType)) return "number";
  return "data";
};

function HighlightedCode({
  language,
  source,
}: {
  language: ReferenceLanguage;
  source: string;
}) {
  const tokens = language === "python"
    ? tokenizePython(source)
    : tokenizeJavaScript(source);
  const prefix = language === "python" ? "py" : "js";
  return (
    <code>
      {tokens.map((token, index) => (
        <span className={`${prefix}-token-${token.kind}`} key={`${index}-${token.kind}`}>
          {token.text}
        </span>
      ))}
    </code>
  );
}

function EntryContract({ entry }: { entry: ReferenceEntry }) {
  return (
    <div className="reference-contract">
      <section className="reference-arguments" aria-label="Parameters">
        <h3>Parameters:</h3>
        {entry.arguments.length === 0 ? (
          <p className="reference-none">
            {entry.signature === "runtime.stopped"
              ? "None. Read this property without parentheses."
              : "None."}
          </p>
        ) : (
          <dl>
            {entry.arguments.map((argument) => (
              <div key={argument.name}>
                <dt>
                  <code>{argument.name}</code>
                  <span>
                    {" : "}<i>{argument.type}</i>
                    {argument.accepted && <> · <code>{argument.accepted}</code></>}
                    {argument.defaultValue !== undefined && (
                      <> · default=<code>{argument.defaultValue}</code></>
                    )}
                  </span>
                </dt>
                <dd>{argument.detail}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
      <section className={`reference-result ${returnTone(entry.returns.type)}`} aria-label="Returns">
        <h3>Returns:</h3>
        <code>{entry.returns.type}</code>
        <p>{entry.returns.detail}</p>
      </section>
    </div>
  );
}

export default function CodeQuickReference({ language }: { language: ReferenceLanguage }) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const sections = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return referenceFor(language);
    return referenceFor(language)
      .map((section) => ({
        ...section,
        entries: section.entries.filter((entry) =>
          searchableEntryText(entry).includes(normalized)
        ),
      }))
      .filter((section) => section.entries.length > 0);
  }, [language, query]);

  return (
    <aside
      className={`code-quick-reference ${collapsed ? "collapsed" : ""}`}
      aria-label={`${language === "python" ? "Python" : "JavaScript"} quick documentation`}
    >
      <header className="code-reference-header">
        <div>
          <span>HOPPER API</span>
          <b>{language === "python" ? "Python" : "JavaScript"} quick guide</b>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          aria-label={collapsed ? "Open quick documentation" : "Collapse quick documentation"}
          title={collapsed ? "Open API guide" : "Collapse API guide"}
        >
          {collapsed ? "API ›" : "‹"}
        </button>
      </header>
      {!collapsed && (
        <>
          <label className="code-reference-search">
            <span>SEARCH COMMANDS, TYPES, OR VALUES</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try “white”, “string”, or “bool”"
            />
          </label>
          <nav className="code-reference-nav" aria-label="Quick guide sections">
            {referenceFor(language).map((section) => (
              <a href={`#${language}-reference-${section.id}`} key={section.id}>{section.title}</a>
            ))}
          </nav>
          <div className="code-reference-sections">
            {sections.length === 0 ? (
              <p className="code-reference-empty">No commands match “{query}”.</p>
            ) : sections.map((section) => (
              <section id={`${language}-reference-${section.id}`} key={section.id}>
                <h2>{section.title}</h2>
                {section.entries.map((entry) => (
                  <article key={entry.signature}>
                    <div className="reference-signature">
                      <pre><HighlightedCode language={language} source={entry.signature} /></pre>
                    </div>
                    <p className="reference-summary">{entry.detail}</p>
                    <EntryContract entry={entry} />
                  </article>
                ))}
              </section>
            ))}
          </div>
        </>
      )}
    </aside>
  );
}
