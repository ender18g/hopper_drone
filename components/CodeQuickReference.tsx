"use client";

import { useMemo, useState } from "react";
import { tokenizeJavaScript } from "../lib/javascript-highlighting";
import { tokenizePython } from "../lib/python";

type ReferenceLanguage = "python" | "javascript";

type ReferenceEntry = {
  signature: string;
  detail: string;
  returns?: "bool" | "number" | "data";
};

type ReferenceSection = {
  id: string;
  title: string;
  entries: ReferenceEntry[];
};

const PYTHON_REFERENCE: ReferenceSection[] = [
  {
    id: "flight",
    title: "Flight + timing",
    entries: [
      { signature: "take_off()", detail: "Take off and wait until stable." },
      { signature: "land()", detail: "Stop motion and land." },
      { signature: "hover()", detail: "Level the drone and hold for 1 second." },
      { signature: "wait(seconds)", detail: "Pause without changing motion." },
      { signature: "fly(direction, seconds=1, power=15)", detail: "forward, backward, left, right, up, or down." },
      { signature: "rotate(degrees=0, direction=\"clockwise\")", detail: "Turn clockwise or counterclockwise." },
      { signature: "flip(direction)", detail: "Flip forward, backward, left, or right." },
      { signature: "set_axis(axis, power)", detail: "Set pitch, roll, yaw, gaz, or altitude until reset." },
      { signature: "reset_motion()", detail: "Set every motion axis to zero; does not land." },
    ],
  },
  {
    id: "state",
    title: "State + accessories",
    entries: [
      { signature: "battery_level()", detail: "Latest battery percentage.", returns: "number" },
      { signature: "is_flying()", detail: "True when the controller reports flight.", returns: "bool" },
      { signature: "is_landed()", detail: "True when the controller reports landed.", returns: "bool" },
      { signature: "wait_for_battery_change()", detail: "Wait for new battery telemetry." },
      { signature: "take_photo()", detail: "Save the current camera view to Mission Photos." },
      { signature: "open_grabber() / close_grabber()", detail: "Control the claw accessory." },
      { signature: "fire_gun()", detail: "Fire the cannon accessory." },
      { signature: "emergency_cutoff()", detail: "Emergency only: stop motors immediately." },
      { signature: "print(*values)", detail: "Write values to the Studio console." },
      { signature: "stopped()", detail: "True after Stop has been requested.", returns: "bool" },
      { signature: "key_pressed(key)", detail: "Read a letter, arrow, or Space key.", returns: "bool" },
    ],
  },
  {
    id: "vision-bool",
    title: "Camera booleans + centering",
    entries: [
      { signature: "sees_binary(color, threshold=60, invert=False, coverage=10)", detail: "Fresh scan; test white/black frame coverage.", returns: "bool" },
      { signature: "binary_at(color, x=0, y=0, threshold=60, invert=False)", detail: "Fresh scan at X/Y. Center is 0,0; top right is 100,100.", returns: "bool" },
      { signature: "sees_object(label, confidence=0.55)", detail: "Fresh object scan and exact label match.", returns: "bool" },
      { signature: "sees_april_tag(id=\"any\")", detail: "Fresh tag scan for any tag or one ID.", returns: "bool" },
      { signature: "sees_custom_label(label, confidence=0.75)", detail: "Fresh Teachable Machine classification.", returns: "bool" },
      { signature: "center_on_object(label, power=10, confidence=0.55, center_slack=5, lost_searches=3, rescan_delay=0.5)", detail: "Center the label's box with roll/pitch only; no yaw.", returns: "bool" },
      { signature: "center_on_april_tag(id=\"any\", power=10, center_slack=5, angle_slack=5, lost_searches=3, rescan_delay=0.5)", detail: "Center X/Y, then align tag yaw.", returns: "bool" },
    ],
  },
  {
    id: "vision-data",
    title: "Camera scans + coordinates",
    entries: [
      { signature: "scan_threshold(threshold=60, invert=False)", detail: "Return binary pixels and white/black coverage.", returns: "data" },
      { signature: "load_object_model()", detail: "Load the local COCO-SSD detector.", returns: "data" },
      { signature: "scan_objects(confidence=0.55)", detail: "Fresh object scan; detect_objects is an alias.", returns: "data" },
      { signature: "object_coordinate(label, axis, confidence=0.55)", detail: "Read stored x or y from −100 to 100.", returns: "number" },
      { signature: "object_x(label, confidence=0.55)", detail: "Read the stored bounding-box center X.", returns: "number" },
      { signature: "object_y(label, confidence=0.55)", detail: "Read the stored bounding-box center Y.", returns: "number" },
      { signature: "scan_april_tags()", detail: "Fresh tag36h11 scan.", returns: "data" },
      { signature: "scan_custom_model()", detail: "Fresh custom-model predictions.", returns: "data" },
    ],
  },
  {
    id: "flow",
    title: "Decisions + loops",
    entries: [
      { signature: "if condition:\n    fly(\"forward\", 1, 15)\nelif other_condition:\n    hover()\nelse:\n    land()", detail: "Only the first true branch runs." },
      { signature: "for step in range(4):\n    rotate(90)\n    wait(0.5)", detail: "Repeat a known number of times." },
      { signature: "while not stopped():\n    if sees_object(\"person\"):\n        break\n    rotate(20)", detail: "Repeat until stopped, detected, or break." },
      { signature: "True  False  and  or  not", detail: "Combine boolean camera and drone facts.", returns: "bool" },
    ],
  },
];

const JAVASCRIPT_REFERENCE: ReferenceSection[] = [
  {
    id: "flight",
    title: "Flight + timing",
    entries: [
      { signature: "await drone.takeOff()", detail: "Take off and wait until stable." },
      { signature: "await drone.land()", detail: "Stop motion and land." },
      { signature: "await drone.hover()", detail: "Level the drone and hold for 1 second." },
      { signature: "await drone.wait(seconds)", detail: "Pause without changing motion." },
      { signature: "await drone.fly(direction, seconds = 1, power = 15)", detail: "forward, backward, left, right, up, or down." },
      { signature: "await drone.rotate(degrees = 0, direction = \"clockwise\")", detail: "Turn clockwise or counterclockwise." },
      { signature: "await drone.flip(direction)", detail: "Flip forward, backward, left, or right." },
      { signature: "drone.setAxis(axis, power)", detail: "Set pitch, roll, yaw, gaz, or altitude until reset." },
      { signature: "drone.reset()", detail: "Set every motion axis to zero; does not land." },
    ],
  },
  {
    id: "state",
    title: "State + accessories",
    entries: [
      { signature: "drone.getBatteryLevel()", detail: "Latest battery percentage.", returns: "number" },
      { signature: "drone.isFlying()", detail: "True when the controller reports flight.", returns: "bool" },
      { signature: "drone.isLanded()", detail: "True when the controller reports landed.", returns: "bool" },
      { signature: "await drone.waitUntilBatteryLevelChanges()", detail: "Wait for new battery telemetry." },
      { signature: "await drone.takePicture()", detail: "Save the current camera view to Mission Photos." },
      { signature: "await drone.grabber(\"OPEN\" | \"CLOSE\")", detail: "Control the claw accessory." },
      { signature: "await drone.fireGun()", detail: "Fire the cannon accessory." },
      { signature: "await drone.cutoff()", detail: "Emergency only: stop motors immediately." },
      { signature: "console.log(...values)", detail: "Write values to the Studio console." },
      { signature: "runtime.stopped", detail: "True after Stop has been requested.", returns: "bool" },
      { signature: "runtime.keyIsPressed(key)", detail: "Read a letter, arrow, or Space key.", returns: "bool" },
    ],
  },
  {
    id: "vision-bool",
    title: "Camera booleans + centering",
    entries: [
      { signature: "await vision.seesBinary(color, threshold = 60, invert = false, coverage = 10)", detail: "Fresh scan; test white/black frame coverage.", returns: "bool" },
      { signature: "await vision.binaryAt(color, x = 0, y = 0, threshold = 60, invert = false)", detail: "Fresh scan at X/Y. Center is 0,0; top right is 100,100.", returns: "bool" },
      { signature: "await vision.seesObject(label, confidence = 0.55)", detail: "Fresh object scan and exact label match.", returns: "bool" },
      { signature: "await vision.seesAprilTag(id = \"any\")", detail: "Fresh tag scan for any tag or one ID.", returns: "bool" },
      { signature: "await vision.seesCustomLabel(label, confidence = 0.75)", detail: "Fresh Teachable Machine classification.", returns: "bool" },
      { signature: "await vision.centerOnObject(drone, label, power = 10, confidence = 0.55, centerSlack = 5, lostSearches = 3, rescanDelay = 0.5)", detail: "Center the label's box with roll/pitch only; no yaw.", returns: "bool" },
      { signature: "await vision.centerOnAprilTag(drone, id = \"any\", power = 10, centerSlack = 5, angleSlack = 5, lostSearches = 3, rescanDelay = 0.5)", detail: "Center X/Y, then align tag yaw.", returns: "bool" },
    ],
  },
  {
    id: "vision-data",
    title: "Camera scans + coordinates",
    entries: [
      { signature: "await vision.scanThreshold(threshold = 60, invert = false)", detail: "Return binary pixels and white/black coverage.", returns: "data" },
      { signature: "await vision.loadObjectModel()", detail: "Load the local COCO-SSD detector.", returns: "data" },
      { signature: "await vision.detectObjects(confidence = 0.55)", detail: "Fresh object scan.", returns: "data" },
      { signature: "vision.objectCoordinate(label, axis, confidence = 0.55)", detail: "Read stored x or y from −100 to 100.", returns: "number" },
      { signature: "await vision.scanAprilTags()", detail: "Fresh tag36h11 scan.", returns: "data" },
      { signature: "await vision.classifyCustomModel()", detail: "Fresh custom-model predictions.", returns: "data" },
    ],
  },
  {
    id: "flow",
    title: "Decisions + loops",
    entries: [
      { signature: "if (condition) {\n  await drone.fly(\"forward\", 1, 15);\n} else {\n  await drone.land();\n}", detail: "Run one branch based on a boolean." },
      { signature: "for (let step = 0; step < 4; step += 1) {\n  await drone.rotate(90);\n  await drone.wait(0.5);\n}", detail: "Repeat a known number of times." },
      { signature: "while (!runtime.stopped) {\n  if (await vision.seesObject(\"person\")) break;\n  await drone.rotate(20);\n}", detail: "Repeat until stopped, detected, or break." },
      { signature: "true  false  &&  ||  !", detail: "Combine boolean camera and drone facts.", returns: "bool" },
    ],
  },
];

const referenceFor = (language: ReferenceLanguage) =>
  language === "python" ? PYTHON_REFERENCE : JAVASCRIPT_REFERENCE;

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
          `${entry.signature} ${entry.detail} ${entry.returns ?? ""}`.toLowerCase().includes(normalized)
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
            <span>SEARCH COMMANDS</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try “center” or “bool”"
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
                    <div>
                      {entry.returns && <span className={`reference-return ${entry.returns}`}>{entry.returns}</span>}
                      <pre><HighlightedCode language={language} source={entry.signature} /></pre>
                    </div>
                    <p>{entry.detail}</p>
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
