import * as Blockly from "blockly";
import { javascriptGenerator, Order } from "blockly/javascript";

const DRONE = "#17212b";
const GENERAL = "#d8444e";
const VISION = "#6b4eff";

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
      colour: "#2f9d66",
    },
    {
      type: "repeat_seconds",
      message0: "repeat for %1 seconds",
      args0: [{ type: "input_value", name: "SECONDS", check: "Number" }],
      message1: "%1",
      args1: [{ type: "input_statement", name: "DO" }],
      previousStatement: null,
      nextStatement: null,
      colour: "#2f9d66",
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
      message0: "take drone picture",
      previousStatement: null,
      nextStatement: null,
      colour: DRONE,
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
      type: "vision_sees_color",
      message0: "camera sees %1 over %2 %%",
      args0: [
        {
          type: "field_dropdown",
          name: "PROFILE",
          options: [
            ["red", "red"],
            ["green", "green"],
            ["blue", "blue"],
          ],
        },
        { type: "input_value", name: "COVERAGE", check: "Number" },
      ],
      output: "Boolean",
      inputsInline: true,
      colour: VISION,
      tooltip: "True when enough camera pixels fall inside the editable RGB profile.",
    },
    {
      type: "vision_color_coverage",
      message0: "%1 coverage %%",
      args0: [
        {
          type: "field_dropdown",
          name: "PROFILE",
          options: [
            ["red", "red"],
            ["green", "green"],
            ["blue", "blue"],
          ],
        },
      ],
      output: "Number",
      colour: VISION,
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
      tooltip: "Runs the local COCO-SSD model only when this block is evaluated.",
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
      tooltip: "Classifies the current camera frame with the Teachable Machine model loaded in Telemetry.",
    },
  ]);

  const value = (block: Blockly.Block, name: string, fallback = "0") =>
    javascriptGenerator.valueToCode(block, name, Order.ATOMIC) || fallback;

  javascriptGenerator.forBlock.program_start = (block, generator) =>
    generator.statementToCode(block, "DO");
  javascriptGenerator.forBlock.stop_program = () => "runtime.stop();\nreturn;\n";
  javascriptGenerator.forBlock.wait = (block) =>
    `await drone.wait(${value(block, "SECONDS")});\n`;
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
  javascriptGenerator.forBlock.minidrone_takeoff = () => "await drone.takeOff();\n";
  javascriptGenerator.forBlock.minidrone_land = () => "await drone.land();\n";
  javascriptGenerator.forBlock.minidrone_hover = () => "await drone.hover();\n";
  javascriptGenerator.forBlock.minidrone_cutoff = () => "await drone.cutoff();\n";
  javascriptGenerator.forBlock.minidrone_fly = (block) =>
    `await drone.fly("${block.getFieldValue("DIRECTION")}", ${value(block, "SECONDS")}, ${value(block, "POWER")});\n`;
  javascriptGenerator.forBlock.minidrone_rotate = (block) =>
    `await drone.rotate(${value(block, "DEGREES")}, "${block.getFieldValue("DIRECTION")}");\n`;
  javascriptGenerator.forBlock.minidrone_flip = (block) =>
    `await drone.flip("${block.getFieldValue("DIRECTION")}");\n`;
  javascriptGenerator.forBlock.minidrone_set_direction = (block) =>
    `drone.setAxis("${block.getFieldValue("AXIS")}", ${value(block, "POWER")});\n`;
  javascriptGenerator.forBlock.minidrone_reset = () => "drone.reset();\n";
  javascriptGenerator.forBlock.minidrone_take_picture = () => "await drone.takePicture();\n";
  javascriptGenerator.forBlock.minidrone_fire_bb = () => "await drone.fireGun();\n";
  javascriptGenerator.forBlock.minidrone_grabber = (block) =>
    `await drone.grabber("${block.getFieldValue("ACTION")}");\n`;
  javascriptGenerator.forBlock.minidrone_get_battery_level = () => [
    "drone.getBatteryLevel()",
    Order.FUNCTION_CALL,
  ];
  javascriptGenerator.forBlock.minidrone_flying_state = (block) => [
    block.getFieldValue("STATE") === "flying" ? "drone.isFlying()" : "drone.isLanded()",
    Order.FUNCTION_CALL,
  ];
  javascriptGenerator.forBlock.minidrone_wait_until_battery_changes = () =>
    "await drone.waitUntilBatteryLevelChanges();\n";
  javascriptGenerator.forBlock.event_when_minidrone_state = (block, generator) => {
    const state = block.getFieldValue("STATE");
    const statements = generator.statementToCode(block, "DO");
    return `runtime.registerDrone("${state}", async () => {\n${statements}});\n`;
  };
  javascriptGenerator.forBlock.vision_sees_color = (block) => [
    `await vision.seesColor("${block.getFieldValue("PROFILE")}", ${value(block, "COVERAGE", "12")})`,
    Order.AWAIT,
  ];
  javascriptGenerator.forBlock.vision_color_coverage = (block) => [
    `vision.colorCoverage("${block.getFieldValue("PROFILE")}")`,
    Order.FUNCTION_CALL,
  ];
  javascriptGenerator.forBlock.vision_detect_objects = () =>
    "await vision.detectObjects();\n";
  javascriptGenerator.forBlock.vision_sees_object = (block) => [
    `await vision.seesObject(${value(block, "LABEL", '"bottle"')}, ${value(block, "CONFIDENCE", "55")} / 100)`,
    Order.AWAIT,
  ];
  javascriptGenerator.forBlock.vision_object_coordinate = (block) => [
    `await vision.objectCoordinate(${value(block, "LABEL", '"apple"')}, "${block.getFieldValue("AXIS")}", ${value(block, "CONFIDENCE", "55")} / 100)`,
    Order.AWAIT,
  ];
  javascriptGenerator.forBlock.vision_sees_custom_label = (block) => [
    `await vision.seesCustomLabel(${value(block, "LABEL", '"my label"')}, ${value(block, "CONFIDENCE", "75")} / 100)`,
    Order.AWAIT,
  ];

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
              inputs: { SECONDS: numberShadow(1), POWER: numberShadow(40) },
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
          type: "vision_sees_color",
          inputs: { COVERAGE: numberShadow(12) },
        },
        { kind: "block", type: "vision_color_coverage" },
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
        <next>
          <block type="wait">
            <value name="SECONDS"><shadow type="math_number"><field name="NUM">2</field></shadow></value>
            <next>
              <block type="minidrone_land"></block>
            </next>
          </block>
        </next>
      </block>
    </statement>
  </block>
</xml>`;

export function createHopperWorkspace(container: HTMLElement) {
  registerHopperBlocks();
  const media = new URL("blockly/media/", document.baseURI).href;
  const theme = Blockly.Theme.defineTheme("hopper", {
    name: "hopper",
    base: Blockly.Themes.Classic,
    componentStyles: {
      workspaceBackgroundColour: "#f7f6f2",
      toolboxBackgroundColour: "#ffffff",
      toolboxForegroundColour: "#24313a",
      flyoutBackgroundColour: "#f0efea",
      flyoutForegroundColour: "#24313a",
      flyoutOpacity: 1,
      scrollbarColour: "#c1c6c8",
      scrollbarOpacity: 0.65,
      insertionMarkerColour: "#f04d59",
      insertionMarkerOpacity: 0.45,
      cursorColour: "#6b4eff",
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
    grid: { spacing: 24, length: 2, colour: "#d9dad5", snap: true },
    zoom: { controls: true, wheel: true, startScale: 0.92, maxScale: 1.5, minScale: 0.45 },
  });
  loadDefaultWorkspace(workspace);
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
