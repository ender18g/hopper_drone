import * as Blockly from "blockly";
import { javascriptGenerator, Order } from "blockly/javascript";

const DRONE = "#00205b";
const GENERAL = "#008c95";
const VISION = "#006b78";
const APRIL_TAG_OPTIONS = [
  ["any", "any"],
  ...Array.from({ length: 587 }, (_, id) => [String(id), String(id)]),
];

let registered = false;

export function registerHopperBlocks() {
  if (registered) return;
  registered = true;

  Blockly.defineBlocksWithJsonArray([
    {
      type: "program_start",
      message0: "when program starts",
      message1: "%1",
      args1: [{ type: "input_statement", name: "DO" }],
      colour: GENERAL,
      tooltip: "Commands inside this block run when the green Run button is pressed.",
    },
    {
      type: "stop_program",
      message0: "stop program",
      previousStatement: null,
      colour: GENERAL,
    },
    {
      type: "wait",
      message0: "wait %1 seconds",
      args0: [{ type: "input_value", name: "SECONDS", check: "Number" }],
      previousStatement: null,
      nextStatement: null,
      inputsInline: true,
      colour: GENERAL,
    },
    {
      type: "custom_print",
      message0: "print %1",
      args0: [{ type: "input_value", name: "MESSAGE" }],
      previousStatement: null,
      nextStatement: null,
      inputsInline: true,
      colour: GENERAL,
    },
    {
      type: "continue_if",
      message0: "continue if %1",
      args0: [{ type: "input_value", name: "CONDITION", check: "Boolean" }],
      previousStatement: null,
      nextStatement: null,
      inputsInline: true,
      colour: GENERAL,
      tooltip: "Stops the current program or event unless the condition is true.",
    },
    {
      type: "event_when_key_pressed",
      message0: "when %1 key is %2",
      args0: [
        {
          type: "field_dropdown",
          name: "KEY",
          options: [
            ["↑", "ArrowUp"],
            ["↓", "ArrowDown"],
            ["←", "ArrowLeft"],
            ["→", "ArrowRight"],
            ["space", "Space"],
            ..."abcdefghijklmnopqrstuvwxyz".split("").map((letter) => [letter, letter]),
          ],
        },
        {
          type: "field_dropdown",
          name: "KIND",
          options: [
            ["pressed", "pressed"],
            ["released", "released"],
          ],
        },
      ],
      message1: "%1",
      args1: [{ type: "input_statement", name: "DO" }],
      colour: GENERAL,
    },
    {
      type: "is_key_pressed",
      message0: "%1 key is pressed",
      args0: [
        {
          type: "field_dropdown",
          name: "KEY",
          options: [
            ["↑", "ArrowUp"],
            ["↓", "ArrowDown"],
            ["←", "ArrowLeft"],
            ["→", "ArrowRight"],
            ["space", "Space"],
            ..."abcdefghijklmnopqrstuvwxyz".split("").map((letter) => [letter, letter]),
          ],
        },
      ],
      output: "Boolean",
      colour: GENERAL,
    },
    {
      type: "repeat_forever",
      message0: "repeat forever",
      message1: "%1",
      args1: [{ type: "input_statement", name: "DO" }],
      previousStatement: null,
      nextStatement: null,
      colour: "#9a7820",
    },
    {
      type: "repeat_seconds",
      message0: "repeat for %1 seconds",
      args0: [{ type: "input_value", name: "SECONDS", check: "Number" }],
      message1: "%1",
      args1: [{ type: "input_statement", name: "DO" }],
      previousStatement: null,
      nextStatement: null,
      colour: "#9a7820",
    },
    {
      type: "minidrone_takeoff",
      message0: "take off",
      previousStatement: null,
      nextStatement: null,
      colour: DRONE,
    },
    {
      type: "minidrone_land",
      message0: "land",
      previousStatement: null,
      nextStatement: null,
      colour: DRONE,
    },
    {
      type: "minidrone_hover",
      message0: "hover",
      previousStatement: null,
      nextStatement: null,
      colour: DRONE,
    },
    {
      type: "minidrone_cutoff",
      message0: "⚠ cut off motors",
      previousStatement: null,
      nextStatement: null,
      colour: "#a51f2d",
      tooltip: "Emergency only: immediately stops the motors.",
    },
    {
      type: "minidrone_fly",
      message0: "fly %1 for %2 seconds at %3 %% power",
      args0: [
        {
          type: "field_dropdown",
          name: "DIRECTION",
          options: [
            ["forward", "forward"],
            ["backward", "backward"],
            ["left", "left"],
            ["right", "right"],
            ["up", "up"],
            ["down", "down"],
          ],
        },
        { type: "input_value", name: "SECONDS", check: "Number" },
        { type: "input_value", name: "POWER", check: "Number" },
      ],
      previousStatement: null,
      nextStatement: null,
      inputsInline: true,
      colour: DRONE,
    },
    {
      type: "minidrone_rotate",
      message0: "rotate %1° %2",
      args0: [
        { type: "input_value", name: "DEGREES", check: "Number" },
        {
          type: "field_dropdown",
          name: "DIRECTION",
          options: [
            ["clockwise", "clockwise"],
            ["counterclockwise", "counterclockwise"],
          ],
        },
      ],
      previousStatement: null,
      nextStatement: null,
      inputsInline: true,
      colour: DRONE,
    },
    {
      type: "minidrone_flip",
      message0: "flip %1",
      args0: [
        {
          type: "field_dropdown",
          name: "DIRECTION",
          options: [
            ["forward", "forward"],
            ["backward", "backward"],
            ["left", "left"],
            ["right", "right"],
          ],
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: DRONE,
    },
    {
      type: "minidrone_set_direction",
      message0: "set %1 to %2 %%",
      args0: [
        {
          type: "field_dropdown",
          name: "AXIS",
          options: [
            ["pitch", "pitch"],
            ["roll", "roll"],
            ["yaw", "yaw"],
            ["altitude", "gaz"],
          ],
        },
        { type: "input_value", name: "POWER", check: "Number" },
      ],
      previousStatement: null,
      nextStatement: null,
      inputsInline: true,
      colour: DRONE,
    },
    {
      type: "minidrone_reset",
      message0: "reset movement",
      previousStatement: null,
      nextStatement: null,
      colour: DRONE,
    },
    {
      type: "minidrone_take_picture",
      message0: "take and store photo",
      previousStatement: null,
      nextStatement: null,
      colour: DRONE,
      tooltip: "Capture the current camera view and store it in this session's mission photo gallery.",
    },
    {
      type: "minidrone_fire_bb",
      message0: "fire cannon",
      previousStatement: null,
      nextStatement: null,
      colour: DRONE,
    },
    {
      type: "minidrone_grabber",
      message0: "%1 grabber",
      args0: [
        {
          type: "field_dropdown",
          name: "ACTION",
          options: [
            ["open", "OPEN"],
            ["close", "CLOSE"],
          ],
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: DRONE,
    },
    {
      type: "minidrone_get_battery_level",
      message0: "battery level",
      output: "Number",
      colour: DRONE,
    },
    {
      type: "minidrone_flying_state",
      message0: "drone is %1",
      args0: [
        {
          type: "field_dropdown",
          name: "STATE",
          options: [
            ["flying", "flying"],
            ["landed", "landed"],
          ],
        },
      ],
      output: "Boolean",
      colour: DRONE,
    },
    {
      type: "minidrone_wait_until_battery_changes",
      message0: "wait until battery changes",
      previousStatement: null,
      nextStatement: null,
      colour: DRONE,
    },
    {
      type: "event_when_minidrone_state",
      message0: "when drone %1",
      args0: [
        {
          type: "field_dropdown",
          name: "STATE",
          options: [
            ["starts flying", "flying"],
            ["lands", "landed"],
            ["crashes", "crashed"],
            ["battery changes", "batteryLevelChanged"],
          ],
        },
      ],
      message1: "%1",
      args1: [{ type: "input_statement", name: "DO" }],
      colour: DRONE,
    },
    {
      type: "vision_sees_binary",
      message0: "camera sees binary %1 with threshold at %2 %% invert %3 in %4 %% of frame",
      args0: [
        {
          type: "field_dropdown",
          name: "COLOR",
          options: [
            ["white", "white"],
            ["black", "black"],
          ],
        },
        { type: "input_value", name: "THRESHOLD", check: "Number" },
        { type: "field_checkbox", name: "INVERT", checked: false },
        { type: "input_value", name: "COVERAGE", check: "Number" },
      ],
      output: "Boolean",
      inputsInline: true,
      colour: VISION,
      tooltip: "Scans a binary frame. Brightness at or above the threshold is white unless invert is checked.",
    },
    {
      type: "vision_binary_center",
      message0: "camera sees binary %1 at x %2 y %3 with threshold at %4 %% invert %5",
      args0: [
        {
          type: "field_dropdown",
          name: "COLOR",
          options: [
            ["white", "white"],
            ["black", "black"],
          ],
        },
        { type: "input_value", name: "X", check: "Number" },
        { type: "input_value", name: "Y", check: "Number" },
        { type: "input_value", name: "THRESHOLD", check: "Number" },
        { type: "field_checkbox", name: "INVERT", checked: false },
      ],
      output: "Boolean",
      inputsInline: true,
      colour: VISION,
      tooltip:
        "Scans and checks one X/Y pixel. The center is 0,0; the top right is 100,100; the bottom left is -100,-100.",
    },
    {
      type: "vision_detect_objects",
      message0: "scan for objects",
      previousStatement: null,
      nextStatement: null,
      colour: VISION,
      tooltip: "Runs the optional local neural network once.",
    },
    {
      type: "vision_sees_object",
      message0: "camera sees %1 at %2 %% confidence",
      args0: [
        { type: "input_value", name: "LABEL", check: "String" },
        { type: "input_value", name: "CONFIDENCE", check: "Number" },
      ],
      output: "Boolean",
      inputsInline: true,
      colour: VISION,
      tooltip: "Scans a fresh camera frame, then checks it for the requested object.",
    },
    {
      type: "vision_object_coordinate",
      message0: "%1 coordinate of %2 at %3 %% confidence",
      args0: [
        {
          type: "field_dropdown",
          name: "AXIS",
          options: [
            ["x", "x"],
            ["y", "y"],
          ],
        },
        { type: "input_value", name: "LABEL", check: "String" },
        { type: "input_value", name: "CONFIDENCE", check: "Number" },
      ],
      output: "Number",
      inputsInline: true,
      colour: VISION,
      tooltip:
        "Returns the center of the latest matching object box from -100 to +100. The frame center is 0,0; right and up are positive. If the object is lost, its last position is kept; before the first detection the value is 0.",
    },
    {
      type: "vision_sees_custom_label",
      message0: "custom model sees %1 at %2 %% confidence",
      args0: [
        { type: "input_value", name: "LABEL", check: "String" },
        { type: "input_value", name: "CONFIDENCE", check: "Number" },
      ],
      output: "Boolean",
      inputsInline: true,
      colour: VISION,
      tooltip: "Classifies the current camera frame with the Teachable Machine model loaded in Vision Testing.",
    },
    {
      type: "vision_scan_apriltags",
      message0: "scan for april tags",
      previousStatement: null,
      nextStatement: null,
      colour: VISION,
      tooltip: "Scans once for tag36h11 AprilTags and saves their IDs and poses.",
    },
    {
      type: "vision_sees_apriltag",
      message0: "camera sees april tag with ID %1",
      args0: [
        {
          type: "field_dropdown",
          name: "TAG_ID",
          options: APRIL_TAG_OPTIONS,
        },
      ],
      output: "Boolean",
      colour: VISION,
      tooltip: "Scans a fresh camera frame, then checks it for the requested tag36h11 ID.",
    },
  ]);

  const settingsIcon = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="white" d="M19.4 13a7.7 7.7 0 0 0 .1-1 7.7 7.7 0 0 0-.1-1l2.1-1.6-2-3.4-2.5 1a7.9 7.9 0 0 0-1.7-1L15 3.3h-4L10.6 6a7.9 7.9 0 0 0-1.7 1L6.4 6l-2 3.4L6.5 11a7.7 7.7 0 0 0-.1 1 7.7 7.7 0 0 0 .1 1l-2.1 1.6 2 3.4 2.5-1a7.9 7.9 0 0 0 1.7 1l.4 2.7h4l.4-2.7a7.9 7.9 0 0 0 1.7-1l2.5 1 2-3.4L19.4 13ZM13 15.5A3.5 3.5 0 1 1 13 8a3.5 3.5 0 0 1 0 7.5Z"/></svg>',
  )}`;
  const toggleSettings = (
    field: Blockly.FieldImage,
    inputNames: string[],
  ) => {
    const source = field.getSourceBlock();
    const inputs = inputNames
      .map((name) => source?.getInput(name))
      .filter((input): input is Blockly.Input => Boolean(input));
    const show = !inputs[0]?.isVisible();
    inputs.forEach((input) => input.setVisible(show));
    (source as Blockly.BlockSvg | null)?.render();
  };
  const appendSettingsButton = (
    block: Blockly.Block,
    inputNames: string[],
    label: string,
  ) => {
    block.appendDummyInput("SETTINGS_TOGGLE")
      .appendField(new Blockly.FieldImage(settingsIcon, 18, 18, label, (field) => {
        toggleSettings(field, inputNames);
      }))
      .appendField("settings");
  };

  Blockly.Blocks.vision_center_object = {
    init() {
      this.appendValueInput("LABEL")
        .setCheck("String")
        .appendField("center on object");
      this.appendValueInput("POWER")
        .setCheck("Number")
        .appendField("roll/pitch power");
      this.appendDummyInput("SETTINGS_HEADING")
        .appendField("CENTERING SETTINGS")
        .setVisible(false);
      this.appendDummyInput("CONFIDENCE_SETTING")
        .appendField("— detection confidence")
        .appendField(new Blockly.FieldNumber(55, 1, 100, 1), "CONFIDENCE")
        .appendField("%")
        .setVisible(false);
      this.appendDummyInput("CENTER_SETTING")
        .appendField("— center tolerance")
        .appendField(new Blockly.FieldNumber(5, 1, 35, 1), "CENTER_SLACK")
        .appendField("%")
        .setVisible(false);
      this.appendDummyInput("RESCAN_SETTING")
        .appendField("— rescan after roll/pitch")
        .appendField(new Blockly.FieldNumber(0.5, 0, 5, 0.1), "RESCAN_DELAY")
        .appendField("seconds")
        .setVisible(false);
      this.appendDummyInput("LOST_SETTING")
        .appendField("— give up after")
        .appendField(new Blockly.FieldNumber(3, 1, 20, 1), "LOST_SEARCHES")
        .appendField("lost object scans")
        .setVisible(false);
      appendSettingsButton(
        this,
        [
          "SETTINGS_HEADING",
          "CONFIDENCE_SETTING",
          "CENTER_SETTING",
          "RESCAN_SETTING",
          "LOST_SETTING",
        ],
        "Object centering settings",
      );
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setInputsInline(false);
      this.setColour(DRONE);
      this.setTooltip(
        "Centers the requested object-detection bounding box with roll and pitch only. It never changes yaw. The settings control confidence, exit tolerance, post-correction rescan delay, and missed scans.",
      );
    },
  };

  Blockly.Blocks.vision_center_apriltag = {
    init() {
      this.appendDummyInput()
        .appendField("center on april tag")
        .appendField(new Blockly.FieldDropdown(APRIL_TAG_OPTIONS as [string, string][]), "TAG_ID");
      this.appendValueInput("POWER")
        .setCheck("Number")
        .appendField("roll/pitch power");
      this.appendDummyInput("SETTINGS_HEADING")
        .appendField("CENTERING SETTINGS")
        .setVisible(false);
      this.appendDummyInput("CENTER_SETTING")
        .appendField("— center tolerance")
        .appendField(new Blockly.FieldNumber(5, 1, 35, 1), "CENTER_SLACK")
        .appendField("%")
        .setVisible(false);
      this.appendDummyInput("ANGLE_SETTING")
        .appendField("— yaw tolerance")
        .appendField(new Blockly.FieldNumber(5, 1, 45, 1), "ANGLE_SLACK")
        .appendField("°")
        .setVisible(false);
      this.appendDummyInput("RESCAN_SETTING")
        .appendField("— rescan after roll/pitch")
        .appendField(new Blockly.FieldNumber(0.5, 0, 5, 0.1), "RESCAN_DELAY")
        .appendField("seconds")
        .setVisible(false);
      this.appendDummyInput("LOST_SETTING")
        .appendField("— give up after")
        .appendField(new Blockly.FieldNumber(3, 1, 20, 1), "LOST_SEARCHES")
        .appendField("lost tag scans")
        .setVisible(false);
      appendSettingsButton(
        this,
        [
          "SETTINGS_HEADING",
          "CENTER_SETTING",
          "ANGLE_SETTING",
          "RESCAN_SETTING",
          "LOST_SETTING",
        ],
        "AprilTag centering settings",
      );
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setInputsInline(false);
      this.setColour(DRONE);
      this.setTooltip(
        "Centers the tag, waits for a level image after roll/pitch, then aligns yaw. The settings control both tolerances, rescan delay, and missed scans.",
      );
    },
  };

  const value = (block: Blockly.Block, name: string, fallback = "0") =>
    javascriptGenerator.valueToCode(block, name, Order.ATOMIC) || fallback;
  const fieldNumber = (block: Blockly.Block, name: string, fallback: number) => {
    const raw = block.getFieldValue(name);
    if (raw === null || raw === undefined || raw === "") return fallback;
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : fallback;
  };
  const activeStatement = (block: Blockly.Block, statement: string) =>
    `await runtime.runBlock(${JSON.stringify(block.id)}, async () => {\n${statement}});\n`;
  const activeExpression = (block: Blockly.Block, expression: string) => [
    `await runtime.runBlock(${JSON.stringify(block.id)}, async () => (${expression}))`,
    Order.AWAIT,
  ] as [string, Order];

  javascriptGenerator.forBlock.program_start = (block, generator) =>
    generator.statementToCode(block, "DO");
  javascriptGenerator.forBlock.stop_program = (block) =>
    `${activeStatement(block, "runtime.stop();\n")}return;\n`;
  javascriptGenerator.forBlock.wait = (block) => activeStatement(
    block,
    `await drone.wait(${value(block, "SECONDS")});\n`,
  );
  javascriptGenerator.forBlock.custom_print = (block) =>
    `console.log(${value(block, "MESSAGE", '""')});\n`;
  javascriptGenerator.forBlock.continue_if = (block) =>
    `if (!(${value(block, "CONDITION", "false")})) return;\n`;
  javascriptGenerator.forBlock.event_when_key_pressed = (block, generator) => {
    const key = block.getFieldValue("KEY");
    const kind = block.getFieldValue("KIND");
    const statements = generator.statementToCode(block, "DO");
    return `runtime.registerKey("${kind}", "${key}", async () => {\n${statements}});\n`;
  };
  javascriptGenerator.forBlock.is_key_pressed = (block) => [
    `runtime.keyIsPressed("${block.getFieldValue("KEY")}")`,
    Order.FUNCTION_CALL,
  ];
  javascriptGenerator.forBlock.repeat_forever = (block, generator) => {
    const statements = generator.statementToCode(block, "DO");
    return `while (!runtime.stopped) {\n${statements}await runtime.tick();\n}\n`;
  };
  javascriptGenerator.forBlock.repeat_seconds = (block, generator) => {
    const statements = generator.statementToCode(block, "DO");
    return `await runtime.repeatForSeconds(${value(block, "SECONDS")}, async () => {\n${statements}});\n`;
  };
  javascriptGenerator.forBlock.minidrone_takeoff = (block) =>
    activeStatement(block, "await drone.takeOff();\n");
  javascriptGenerator.forBlock.minidrone_land = (block) =>
    activeStatement(block, "await drone.land();\n");
  javascriptGenerator.forBlock.minidrone_hover = (block) =>
    activeStatement(block, "await drone.hover();\n");
  javascriptGenerator.forBlock.minidrone_cutoff = (block) =>
    activeStatement(block, "await drone.cutoff();\n");
  javascriptGenerator.forBlock.minidrone_fly = (block) => activeStatement(
    block,
    `await drone.fly("${block.getFieldValue("DIRECTION")}", ${value(block, "SECONDS")}, ${value(block, "POWER")});\n`,
  );
  javascriptGenerator.forBlock.minidrone_rotate = (block) => activeStatement(
    block,
    `await drone.rotate(${value(block, "DEGREES")}, "${block.getFieldValue("DIRECTION")}");\n`,
  );
  javascriptGenerator.forBlock.minidrone_flip = (block) => activeStatement(
    block,
    `await drone.flip("${block.getFieldValue("DIRECTION")}");\n`,
  );
  javascriptGenerator.forBlock.minidrone_set_direction = (block) => activeStatement(
    block,
    `drone.setAxis("${block.getFieldValue("AXIS")}", ${value(block, "POWER")});\n`,
  );
  javascriptGenerator.forBlock.minidrone_reset = (block) =>
    activeStatement(block, "drone.reset();\n");
  javascriptGenerator.forBlock.minidrone_take_picture = (block) =>
    activeStatement(block, "await drone.takePicture();\n");
  javascriptGenerator.forBlock.minidrone_fire_bb = (block) =>
    activeStatement(block, "await drone.fireGun();\n");
  javascriptGenerator.forBlock.minidrone_grabber = (block) => activeStatement(
    block,
    `await drone.grabber("${block.getFieldValue("ACTION")}");\n`,
  );
  javascriptGenerator.forBlock.minidrone_get_battery_level = () => [
    "drone.getBatteryLevel()",
    Order.FUNCTION_CALL,
  ];
  javascriptGenerator.forBlock.minidrone_flying_state = (block) => [
    block.getFieldValue("STATE") === "flying" ? "drone.isFlying()" : "drone.isLanded()",
    Order.FUNCTION_CALL,
  ];
  javascriptGenerator.forBlock.minidrone_wait_until_battery_changes = (block) =>
    activeStatement(block, "await drone.waitUntilBatteryLevelChanges();\n");
  javascriptGenerator.forBlock.event_when_minidrone_state = (block, generator) => {
    const state = block.getFieldValue("STATE");
    const statements = generator.statementToCode(block, "DO");
    return `runtime.registerDrone("${state}", async () => {\n${statements}});\n`;
  };
  javascriptGenerator.forBlock.vision_sees_binary = (block) => activeExpression(
    block,
    `await vision.seesBinary("${block.getFieldValue("COLOR")}", ${value(block, "THRESHOLD", "60")}, ${block.getFieldValue("INVERT") === "TRUE"}, ${value(block, "COVERAGE", "10")})`,
  );
  javascriptGenerator.forBlock.vision_binary_center = (block) => activeExpression(
    block,
    `await vision.binaryAt("${block.getFieldValue("COLOR")}", ${value(block, "X", "0")}, ${value(block, "Y", "0")}, ${value(block, "THRESHOLD", "60")}, ${block.getFieldValue("INVERT") === "TRUE"})`,
  );
  javascriptGenerator.forBlock.vision_detect_objects = (block) =>
    activeStatement(block, "await vision.detectObjects();\n");
  javascriptGenerator.forBlock.vision_sees_object = (block) => activeExpression(
    block,
    `await vision.seesObject(${value(block, "LABEL", '"bottle"')}, ${value(block, "CONFIDENCE", "55")} / 100)`,
  );
  javascriptGenerator.forBlock.vision_object_coordinate = (block) => activeExpression(
    block,
    `await vision.objectCoordinate(${value(block, "LABEL", '"apple"')}, "${block.getFieldValue("AXIS")}", ${value(block, "CONFIDENCE", "55")} / 100)`,
  );
  javascriptGenerator.forBlock.vision_sees_custom_label = (block) => activeExpression(
    block,
    `await vision.seesCustomLabel(${value(block, "LABEL", '"my label"')}, ${value(block, "CONFIDENCE", "75")} / 100)`,
  );
  javascriptGenerator.forBlock.vision_scan_apriltags = (block) =>
    activeStatement(block, "await vision.scanAprilTags();\n");
  javascriptGenerator.forBlock.vision_sees_apriltag = (block) => activeExpression(
    block,
    `await vision.seesAprilTag(${JSON.stringify(block.getFieldValue("TAG_ID"))})`,
  );
  javascriptGenerator.forBlock.vision_center_object = (block) => activeStatement(
    block,
    `await vision.centerOnObject(drone, ${value(block, "LABEL", '"person"')}, ${value(block, "POWER", "10")}, ${fieldNumber(block, "CONFIDENCE", 55) / 100}, ${fieldNumber(block, "CENTER_SLACK", 5)}, ${fieldNumber(block, "LOST_SEARCHES", 3)}, ${Math.max(0, fieldNumber(block, "RESCAN_DELAY", 0.5))});\n`,
  );
  javascriptGenerator.forBlock.vision_center_apriltag = (block) => activeStatement(
    block,
    `await vision.centerOnAprilTag(drone, ${JSON.stringify(block.getFieldValue("TAG_ID"))}, ${value(block, "POWER", "10")}, ${fieldNumber(block, "CENTER_SLACK", 5)}, ${fieldNumber(block, "ANGLE_SLACK", 5)}, ${fieldNumber(block, "LOST_SEARCHES", 3)}, ${Math.max(0, fieldNumber(block, "RESCAN_DELAY", 0.5))});\n`,
  );

  const asyncProcedureDefinition = (
    block: Blockly.Block,
    generator: typeof javascriptGenerator,
  ) => {
    const procedureName = generator.getProcedureName(block.getFieldValue("NAME"));
    const parameters = block
      .getVarModels()
      .map((variable) => generator.getVariableName(variable.getId()));
    const statements = block.getInput("STACK") ? generator.statementToCode(block, "STACK") : "";
    const returnValue = block.getInput("RETURN")
      ? generator.valueToCode(block, "RETURN", Order.NONE)
      : "";
    const returnLine = returnValue ? `${generator.INDENT}return ${returnValue};\n` : "";
    const definition = `async function ${procedureName}(${parameters.join(", ")}) {\n${statements}${returnLine}}`;
    (generator as typeof javascriptGenerator & { definitions_: Record<string, string> })
      .definitions_[`%${procedureName}`] = definition;
    return null;
  };

  javascriptGenerator.forBlock.procedures_defnoreturn = asyncProcedureDefinition;
  javascriptGenerator.forBlock.procedures_defreturn = asyncProcedureDefinition;
  javascriptGenerator.forBlock.procedures_callreturn = (block, generator) => {
    const procedureName = generator.getProcedureName(block.getFieldValue("NAME"));
    const parameters = block
      .getVarModels()
      .map((_, index) => generator.valueToCode(block, `ARG${index}`, Order.NONE) || "null");
    return [`await ${procedureName}(${parameters.join(", ")})`, Order.AWAIT];
  };
  javascriptGenerator.forBlock.procedures_callnoreturn = (block, generator) => {
    const result = javascriptGenerator.forBlock.procedures_callreturn(block, generator);
    return `${Array.isArray(result) ? result[0] : result};\n`;
  };
}

const numberShadow = (value: number) => ({
  shadow: { type: "math_number", fields: { NUM: value } },
});

export const hopperToolbox: Blockly.utils.toolbox.ToolboxDefinition = {
  kind: "categoryToolbox",
  contents: [
    {
      kind: "category",
      name: "START & EVENTS",
      colour: GENERAL,
      contents: [
        { kind: "block", type: "program_start" },
        { kind: "block", type: "stop_program" },
        { kind: "block", type: "event_when_key_pressed" },
        { kind: "block", type: "is_key_pressed" },
        { kind: "block", type: "wait", inputs: { SECONDS: numberShadow(1) } },
        {
          kind: "block",
          type: "custom_print",
          inputs: { MESSAGE: { shadow: { type: "text", fields: { TEXT: "Hello, Hopper!" } } } },
        },
        {
          kind: "block",
          type: "continue_if",
          inputs: { CONDITION: { shadow: { type: "logic_boolean", fields: { BOOL: "TRUE" } } } },
        },
      ],
    },
    {
      kind: "category",
      name: "MINI DRONE",
      colour: DRONE,
      contents: [
        {
          kind: "category",
          name: "Flight",
          colour: DRONE,
          contents: [
            { kind: "block", type: "minidrone_takeoff" },
            { kind: "block", type: "minidrone_land" },
            { kind: "block", type: "minidrone_hover" },
            {
              kind: "block",
              type: "minidrone_fly",
              inputs: { SECONDS: numberShadow(1), POWER: numberShadow(15) },
            },
            {
              kind: "block",
              type: "vision_center_apriltag",
              inputs: { POWER: numberShadow(10) },
            },
            {
              kind: "block",
              type: "vision_center_object",
              inputs: {
                LABEL: { shadow: { type: "text", fields: { TEXT: "person" } } },
                POWER: numberShadow(10),
              },
            },
            {
              kind: "block",
              type: "minidrone_rotate",
              inputs: { DEGREES: numberShadow(90) },
            },
            { kind: "block", type: "minidrone_flip" },
            {
              kind: "block",
              type: "minidrone_set_direction",
              inputs: { POWER: numberShadow(0) },
            },
            { kind: "block", type: "minidrone_reset" },
            { kind: "block", type: "minidrone_cutoff" },
          ],
        },
        {
          kind: "category",
          name: "Sensors & events",
          colour: DRONE,
          contents: [
            { kind: "block", type: "minidrone_get_battery_level" },
            { kind: "block", type: "minidrone_flying_state" },
            { kind: "block", type: "minidrone_wait_until_battery_changes" },
            { kind: "block", type: "event_when_minidrone_state" },
          ],
        },
        {
          kind: "category",
          name: "Accessories",
          colour: DRONE,
          contents: [
            { kind: "block", type: "minidrone_take_picture" },
            { kind: "block", type: "minidrone_grabber" },
            { kind: "block", type: "minidrone_fire_bb" },
          ],
        },
      ],
    },
    {
      kind: "category",
      name: "CAMERA VISION",
      colour: VISION,
      contents: [
        {
          kind: "block",
          type: "vision_sees_binary",
          inputs: { THRESHOLD: numberShadow(60), COVERAGE: numberShadow(10) },
        },
        {
          kind: "block",
          type: "vision_binary_center",
          inputs: {
            X: numberShadow(0),
            Y: numberShadow(0),
            THRESHOLD: numberShadow(60),
          },
        },
        { kind: "block", type: "vision_detect_objects" },
        {
          kind: "block",
          type: "vision_sees_object",
          inputs: {
            LABEL: { shadow: { type: "text", fields: { TEXT: "bottle" } } },
            CONFIDENCE: numberShadow(55),
          },
        },
        {
          kind: "block",
          type: "vision_object_coordinate",
          inputs: {
            LABEL: { shadow: { type: "text", fields: { TEXT: "apple" } } },
            CONFIDENCE: numberShadow(55),
          },
        },
        {
          kind: "block",
          type: "vision_sees_custom_label",
          inputs: {
            LABEL: { shadow: { type: "text", fields: { TEXT: "my label" } } },
            CONFIDENCE: numberShadow(75),
          },
        },
        { kind: "block", type: "vision_scan_apriltags" },
        { kind: "block", type: "vision_sees_apriltag" },
      ],
    },
    {
      kind: "category",
      name: "LOGIC",
      categorystyle: "logic_category",
      contents: [
        { kind: "block", type: "controls_if" },
        { kind: "block", type: "logic_compare" },
        { kind: "block", type: "logic_operation" },
        { kind: "block", type: "logic_negate" },
        { kind: "block", type: "logic_boolean" },
        { kind: "block", type: "logic_ternary" },
      ],
    },
    {
      kind: "category",
      name: "LOOPS",
      categorystyle: "loop_category",
      contents: [
        { kind: "block", type: "repeat_forever" },
        {
          kind: "block",
          type: "repeat_seconds",
          inputs: { SECONDS: numberShadow(5) },
        },
        {
          kind: "block",
          type: "controls_repeat_ext",
          inputs: { TIMES: numberShadow(10) },
        },
        { kind: "block", type: "controls_whileUntil" },
        { kind: "block", type: "controls_for" },
        { kind: "block", type: "controls_flow_statements" },
      ],
    },
    {
      kind: "category",
      name: "MATH",
      categorystyle: "math_category",
      contents: [
        { kind: "block", type: "math_number" },
        { kind: "block", type: "math_arithmetic" },
        { kind: "block", type: "math_single" },
        { kind: "block", type: "math_trig" },
        { kind: "block", type: "math_round" },
        { kind: "block", type: "math_modulo" },
        { kind: "block", type: "math_random_int" },
        { kind: "block", type: "math_random_float" },
      ],
    },
    { kind: "category", name: "VARIABLES", custom: "VARIABLE", colour: "#a55b80" },
    { kind: "category", name: "FUNCTIONS", custom: "PROCEDURE", colour: "#995ba5" },
  ],
};

export const defaultWorkspaceXml = `
<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="program_start" x="42" y="42">
    <statement name="DO">
      <block type="minidrone_takeoff">
        <comment pinned="false">Take off and wait until the drone is ready.</comment>
        <next>
          <block type="wait">
            <comment pinned="false">Wait for 2 seconds.</comment>
            <value name="SECONDS"><shadow type="math_number"><field name="NUM">2</field></shadow></value>
            <next>
              <block type="minidrone_fly">
                <comment pinned="false">Fly forward for 2 seconds at 15% power.</comment>
                <field name="DIRECTION">forward</field>
                <value name="SECONDS"><shadow type="math_number"><field name="NUM">2</field></shadow></value>
                <value name="POWER"><shadow type="math_number"><field name="NUM">15</field></shadow></value>
                <next>
                  <block type="minidrone_take_picture">
                    <comment pinned="false">Take and store a photo from the current camera view.</comment>
                    <next>
                      <block type="minidrone_rotate">
                        <comment pinned="false">Turn clockwise by 180 degrees.</comment>
                        <value name="DEGREES"><shadow type="math_number"><field name="NUM">180</field></shadow></value>
                        <field name="DIRECTION">clockwise</field>
                        <next>
                          <block type="minidrone_fly">
                            <comment pinned="false">Fly forward for 2 seconds at 15% power.</comment>
                            <field name="DIRECTION">forward</field>
                            <value name="SECONDS"><shadow type="math_number"><field name="NUM">2</field></shadow></value>
                            <value name="POWER"><shadow type="math_number"><field name="NUM">15</field></shadow></value>
                            <next>
                              <block type="minidrone_land">
                                <comment pinned="false">Land safely at the end of the mission.</comment>
                              </block>
                            </next>
                          </block>
                        </next>
                      </block>
                    </next>
                  </block>
                </next>
              </block>
            </next>
          </block>
        </next>
      </block>
    </statement>
  </block>
</xml>`;

class SingleBlockDragStrategy extends Blockly.dragging.BlockDragStrategy {
  protected override shouldHealStack() {
    return true;
  }
}

function enableSingleBlockDragging(workspace: Blockly.WorkspaceSvg) {
  let configureScheduled = false;

  const configureBlocks = () => {
    configureScheduled = false;
    if (workspace.isDragging()) return;

    for (const block of workspace.getAllBlocks(false)) {
      if (
        block instanceof Blockly.BlockSvg &&
        !(block.getDragStrategy() instanceof SingleBlockDragStrategy)
      ) {
        block.setDragStrategy(new SingleBlockDragStrategy(block));
      }
    }
  };

  const configureBlocksWhenIdle = () => {
    if (configureScheduled) return;
    configureScheduled = true;
    window.setTimeout(configureBlocks, 0);
  };

  workspace.addChangeListener((event) => {
    const blockDragEnded =
      event.type === Blockly.Events.BLOCK_DRAG &&
      (event as Blockly.Events.BlockDrag).isStart === false;
    if (event.type === Blockly.Events.BLOCK_CREATE || blockDragEnded) {
      configureBlocksWhenIdle();
    }
  });
  configureBlocks();
}

export function createHopperWorkspace(container: HTMLElement) {
  registerHopperBlocks();
  const media = new URL("blockly/media/", document.baseURI).href;
  const theme = Blockly.Theme.defineTheme("hopper", {
    name: "hopper",
    base: Blockly.Themes.Classic,
    componentStyles: {
      workspaceBackgroundColour: "#eef3f5",
      toolboxBackgroundColour: "#ffffff",
      toolboxForegroundColour: "#0c284a",
      flyoutBackgroundColour: "#e7eef1",
      flyoutForegroundColour: "#0c284a",
      flyoutOpacity: 1,
      scrollbarColour: "#9cafb9",
      scrollbarOpacity: 0.65,
      insertionMarkerColour: "#00a3a8",
      insertionMarkerOpacity: 0.45,
      cursorColour: "#c9a227",
    },
    fontStyle: { family: "Arial, sans-serif", weight: "600", size: 12 },
  });

  const workspace = Blockly.inject(container, {
    toolbox: hopperToolbox,
    media,
    renderer: "zelos",
    theme,
    trashcan: true,
    sounds: false,
    move: { scrollbars: true, drag: true, wheel: true },
    grid: { spacing: 24, length: 2, colour: "#cbd7dc", snap: true },
    zoom: { controls: true, wheel: true, startScale: 0.92, maxScale: 1.5, minScale: 0.45 },
  });
  loadDefaultWorkspace(workspace);
  enableSingleBlockDragging(workspace);
  return workspace;
}

export function loadDefaultWorkspace(workspace: Blockly.Workspace) {
  workspace.clear();
  const dom = Blockly.utils.xml.textToDom(defaultWorkspaceXml);
  Blockly.Xml.domToWorkspace(dom, workspace);
}

export function generateWorkspaceCode(workspace: Blockly.Workspace) {
  javascriptGenerator.INFINITE_LOOP_TRAP = "await runtime.tick();\n";
  return javascriptGenerator.workspaceToCode(workspace);
}

export function saveWorkspace(workspace: Blockly.Workspace) {
  return Blockly.serialization.workspaces.save(workspace);
}

export function restoreWorkspace(workspace: Blockly.Workspace, state: object) {
  Blockly.serialization.workspaces.load(state, workspace);
}

export { Blockly };
