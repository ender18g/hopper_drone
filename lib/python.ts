export type PythonTokenKind =
  | "plain"
  | "comment"
  | "string"
  | "keyword"
  | "literal"
  | "number"
  | "function"
  | "operator";

export type PythonToken = {
  kind: PythonTokenKind;
  text: string;
};

export const PYTHON_STARTER_PROGRAM = `# Hopper Studio Python
take_off()  # Take off and wait until the drone is ready.
wait(2)  # Wait for 2 seconds.
fly("forward", 2, 15)  # Fly forward for 2 seconds at 15% power.
take_photo()  # Take and store a photo from the current camera view.
rotate(180, "clockwise")  # Turn clockwise by 180 degrees.
fly("forward", 2, 15)  # Fly forward for 2 seconds at 15% power.
`;

const PYTHON_KEYWORDS = new Set([
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield",
]);

const PYTHON_LITERALS = new Set(["False", "None", "True"]);
const PYTHON_NUMBER_PATTERN =
  /(?:0[xX][\da-fA-F](?:_?[\da-fA-F])*|0[bB][01](?:_?[01])*|0[oO][0-7](?:_?[0-7])*|(?:\d(?:_?\d)*)?\.\d(?:_?\d)*(?:[eE][+-]?\d(?:_?\d)*)?|(?:\d(?:_?\d)*)(?:\.(?:\d(?:_?\d)*)?)?(?:[eE][+-]?\d(?:_?\d)*)?)/y;

const isIdentifierStart = (character: string) => /[A-Za-z_]/.test(character);
const isIdentifierPart = (character: string) => /[\w]/.test(character);
const isDigit = (character: string) => character >= "0" && character <= "9";

const pushToken = (
  tokens: PythonToken[],
  kind: PythonTokenKind,
  text: string,
) => {
  if (!text) return;
  const previous = tokens.at(-1);
  if (previous?.kind === kind) {
    previous.text += text;
    return;
  }
  tokens.push({ kind, text });
};

const findLineEnd = (source: string, start: number) => {
  const newline = source.indexOf("\n", start);
  return newline === -1 ? source.length : newline;
};

const findPythonStringEnd = (
  source: string,
  start: number,
  quote: "'" | "\"",
) => {
  const triple = source.startsWith(quote.repeat(3), start);
  const delimiter = triple ? quote.repeat(3) : quote;
  let cursor = start + delimiter.length;
  while (cursor < source.length) {
    if (source[cursor] === "\\") {
      cursor = Math.min(source.length, cursor + 2);
      continue;
    }
    if (source.startsWith(delimiter, cursor)) return cursor + delimiter.length;
    cursor += 1;
  }
  return source.length;
};

const findNextNonWhitespace = (source: string, start: number) => {
  let cursor = start;
  while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
  return source[cursor];
};

/**
 * Presentation-only Python tokenizer. It never evaluates source and preserves
 * every character exactly when token text is concatenated.
 */
export function tokenizePython(source: string): PythonToken[] {
  const tokens: PythonToken[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    if (source[cursor] === "#") {
      const end = findLineEnd(source, cursor);
      pushToken(tokens, "comment", source.slice(cursor, end));
      cursor = end;
      continue;
    }

    const prefixMatch = source.slice(cursor).match(/^[fFrRbBuU]{0,2}(?=['"])/);
    const prefix = prefixMatch?.[0] ?? "";
    const quoteIndex = cursor + prefix.length;
    const quote = source[quoteIndex];
    if ((quote === "'" || quote === "\"") && (prefix.length > 0 || quoteIndex === cursor)) {
      const end = findPythonStringEnd(source, quoteIndex, quote);
      pushToken(tokens, "string", source.slice(cursor, end));
      cursor = end;
      continue;
    }

    const character = source[cursor];
    if (isDigit(character) || (character === "." && isDigit(source[cursor + 1] ?? ""))) {
      PYTHON_NUMBER_PATTERN.lastIndex = cursor;
      const number = PYTHON_NUMBER_PATTERN.exec(source);
      if (number) {
        pushToken(tokens, "number", number[0]);
        cursor = PYTHON_NUMBER_PATTERN.lastIndex;
        continue;
      }
    }

    if (isIdentifierStart(character)) {
      let end = cursor + 1;
      while (end < source.length && isIdentifierPart(source[end])) end += 1;
      const identifier = source.slice(cursor, end);
      const kind: PythonTokenKind = PYTHON_KEYWORDS.has(identifier)
        ? "keyword"
        : PYTHON_LITERALS.has(identifier)
          ? "literal"
          : findNextNonWhitespace(source, end) === "("
            ? "function"
            : "plain";
      pushToken(tokens, kind, identifier);
      cursor = end;
      continue;
    }

    if (/[+\-*/%=&|^!~<>:@.,]/.test(character)) {
      pushToken(tokens, "operator", character);
      cursor += 1;
      continue;
    }

    pushToken(tokens, "plain", character);
    cursor += 1;
  }

  return tokens;
}

export class PythonSyntaxError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(`Python line ${line}: ${message}`);
    this.name = "PythonSyntaxError";
  }
}

type CallSpec = {
  target?: string;
  asynchronous?: boolean;
  parameters?: string[];
  defaults?: Record<string, string>;
  build?: (argumentsList: string[]) => string;
};

const call = (
  target: string,
  parameters: string[] = [],
  defaults: Record<string, string> = {},
  asynchronous = false,
): CallSpec => ({ target, parameters, defaults, asynchronous });

const PYTHON_CALLS: Record<string, CallSpec> = {
  print: call("console.log"),
  take_off: call("drone.takeOff", [], {}, true),
  land: call("drone.land", [], {}, true),
  hover: call("drone.hover", [], {}, true),
  wait: call("drone.wait", ["seconds"], {}, true),
  fly: call(
    "drone.fly",
    ["direction", "seconds", "power"],
    { seconds: "1", power: "15" },
    true,
  ),
  rotate: call(
    "drone.rotate",
    ["degrees", "direction"],
    { degrees: "0", direction: "\"clockwise\"" },
    true,
  ),
  flip: call("drone.flip", ["direction"], {}, true),
  set_axis: call("drone.setAxis", ["axis", "power"]),
  reset_motion: call("drone.reset"),
  battery_level: call("drone.getBatteryLevel"),
  is_flying: call("drone.isFlying"),
  is_landed: call("drone.isLanded"),
  wait_for_battery_change: call("drone.waitUntilBatteryLevelChanges", [], {}, true),
  take_photo: call("drone.takePicture", [], {}, true),
  open_grabber: {
    asynchronous: true,
    build: () => "drone.grabber(\"OPEN\")",
  },
  close_grabber: {
    asynchronous: true,
    build: () => "drone.grabber(\"CLOSE\")",
  },
  fire_gun: call("drone.fireGun", [], {}, true),
  emergency_cutoff: call("drone.cutoff", [], {}, true),
  scan_threshold: call(
    "vision.scanThreshold",
    ["threshold", "invert"],
    { threshold: "60", invert: "false" },
    true,
  ),
  sees_binary: call(
    "vision.seesBinary",
    ["color", "threshold", "invert", "coverage"],
    { threshold: "60", invert: "false", coverage: "10" },
    true,
  ),
  binary_center: call(
    "vision.binaryCenter",
    ["color", "threshold", "invert"],
    { threshold: "60", invert: "false" },
    true,
  ),
  load_object_model: call("vision.loadObjectModel", [], {}, true),
  scan_objects: call(
    "vision.detectObjects",
    ["confidence"],
    { confidence: "0.55" },
    true,
  ),
  detect_objects: call(
    "vision.detectObjects",
    ["confidence"],
    { confidence: "0.55" },
    true,
  ),
  sees_object: call(
    "vision.seesObject",
    ["label", "confidence"],
    { confidence: "0.55" },
    true,
  ),
  object_coordinate: call(
    "vision.objectCoordinate",
    ["label", "axis", "confidence"],
    { confidence: "0.55" },
  ),
  object_x: {
    parameters: ["label", "confidence"],
    defaults: { confidence: "0.55" },
    build: (argumentsList) =>
      `vision.objectCoordinate(${argumentsList[0]}, "x", ${argumentsList[1] ?? "0.55"})`,
  },
  object_y: {
    parameters: ["label", "confidence"],
    defaults: { confidence: "0.55" },
    build: (argumentsList) =>
      `vision.objectCoordinate(${argumentsList[0]}, "y", ${argumentsList[1] ?? "0.55"})`,
  },
  scan_april_tags: call("vision.scanAprilTags", [], {}, true),
  sees_april_tag: call(
    "vision.seesAprilTag",
    ["id"],
    { id: "\"any\"" },
    true,
  ),
  center_on_april_tag: {
    asynchronous: true,
    parameters: ["id", "power", "center_slack", "angle_slack", "lost_searches"],
    defaults: {
      id: "\"any\"",
      power: "10",
      center_slack: "5",
      angle_slack: "5",
      lost_searches: "3",
    },
    build: (argumentsList) =>
      argumentsList.length > 0
        ? `vision.centerOnAprilTag(drone, ${argumentsList.join(", ")})`
        : "vision.centerOnAprilTag(drone)",
  },
  scan_custom_model: call("vision.classifyCustomModel", [], {}, true),
  sees_custom_label: call(
    "vision.seesCustomLabel",
    ["label", "confidence"],
    { confidence: "0.75" },
    true,
  ),
  stopped: {
    build: () => "runtime.stopped",
  },
  key_pressed: call("runtime.keyIsPressed", ["key"]),
  len: call("__pythonLength", ["value"]),
  range: call("__pythonRange"),
  contains: call("__pythonContains", ["collection", "value"]),
  abs: call("Math.abs", ["value"]),
  min: call("Math.min"),
  max: call("Math.max"),
  round: call("Math.round", ["value"]),
  int: {
    parameters: ["value"],
    build: (argumentsList) => `Math.trunc(Number(${argumentsList[0] ?? "0"}))`,
  },
  float: call("Number", ["value"]),
  str: call("String", ["value"]),
  bool: call("Boolean", ["value"]),
};

const PYTHON_HELPERS = `const __pythonRange = (...values) => {
  const [start, stop, step] = values.length === 1
    ? [0, Number(values[0]), 1]
    : [Number(values[0]), Number(values[1]), values.length > 2 ? Number(values[2]) : 1];
  if (!Number.isFinite(start) || !Number.isFinite(stop) || !Number.isFinite(step) || step === 0) {
    throw new Error("range() needs finite numbers and a non-zero step");
  }
  const output = [];
  if (step > 0) for (let value = start; value < stop; value += step) output.push(value);
  else for (let value = start; value > stop; value += step) output.push(value);
  return output;
};
const __pythonLength = (value) => value == null ? 0 : value.length;
const __pythonContains = (collection, value) =>
  collection instanceof Set || collection instanceof Map
    ? collection.has(value)
    : typeof collection?.includes === "function" && collection.includes(value);
`;

const readQuoted = (source: string, start: number) => {
  const quote = source[start] as "'" | "\"";
  const triple = source.startsWith(quote.repeat(3), start);
  const delimiter = triple ? quote.repeat(3) : quote;
  let cursor = start + delimiter.length;
  while (cursor < source.length) {
    if (source[cursor] === "\\") {
      cursor += 2;
      continue;
    }
    if (source.startsWith(delimiter, cursor)) {
      return { end: cursor + delimiter.length, delimiter };
    }
    cursor += 1;
  }
  return { end: source.length, delimiter };
};

const findClosingParenthesis = (
  source: string,
  openingIndex: number,
  line: number,
) => {
  let depth = 0;
  for (let cursor = openingIndex; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (character === "'" || character === "\"") {
      cursor = readQuoted(source, cursor).end - 1;
      continue;
    }
    if (character === "(" || character === "[" || character === "{") depth += 1;
    else if (character === ")" || character === "]" || character === "}") {
      depth -= 1;
      if (depth === 0) return cursor;
    }
  }
  throw new PythonSyntaxError("missing a closing parenthesis", line);
};

const splitTopLevel = (source: string, line: number) => {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  for (let cursor = 0; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (character === "'" || character === "\"") {
      cursor = readQuoted(source, cursor).end - 1;
      continue;
    }
    if (character === "(" || character === "[" || character === "{") depth += 1;
    else if (character === ")" || character === "]" || character === "}") depth -= 1;
    else if (character === "," && depth === 0) {
      parts.push(source.slice(start, cursor).trim());
      start = cursor + 1;
    }
  }
  if (depth !== 0) throw new PythonSyntaxError("unbalanced brackets", line);
  const finalPart = source.slice(start).trim();
  if (finalPart || parts.length > 0) parts.push(finalPart);
  return parts.filter(Boolean);
};

const splitInlineComment = (source: string) => {
  for (let cursor = 0; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (character === "'" || character === "\"") {
      cursor = readQuoted(source, cursor).end - 1;
      continue;
    }
    if (character === "#") {
      return {
        code: source.slice(0, cursor).trimEnd(),
        comment: source.slice(cursor + 1).trim(),
      };
    }
  }
  return { code: source.trimEnd(), comment: "" };
};

const translateFString = (
  source: string,
  line: number,
  userFunctions: ReadonlySet<string>,
) => {
  const prefixLength = /^[fF]/.test(source) ? 1 : 0;
  const { end, delimiter } = readQuoted(source, prefixLength);
  const body = source.slice(prefixLength + delimiter.length, end - delimiter.length);
  let output = "";
  let cursor = 0;
  while (cursor < body.length) {
    if (body[cursor] === "{" && body[cursor + 1] !== "{") {
      const closing = body.indexOf("}", cursor + 1);
      if (closing === -1) throw new PythonSyntaxError("unclosed expression in f-string", line);
      const expression = body.slice(cursor + 1, closing).trim();
      output += `\${${translateExpression(expression, line, userFunctions)}}`;
      cursor = closing + 1;
      continue;
    }
    if (body.startsWith("{{", cursor)) {
      output += "{";
      cursor += 2;
      continue;
    }
    if (body.startsWith("}}", cursor)) {
      output += "}";
      cursor += 2;
      continue;
    }
    const character = body[cursor];
    output += character === "`" ? "\\`" : character;
    cursor += 1;
  }
  return { text: `\`${output}\``, end };
};

const orderArguments = (
  name: string,
  spec: CallSpec,
  rawArguments: string[],
  line: number,
  userFunctions: ReadonlySet<string>,
) => {
  const parameters = spec.parameters ?? [];
  const positional: string[] = [];
  const named = new Map<string, string>();
  for (const rawArgument of rawArguments) {
    const keyword = rawArgument.match(/^([A-Za-z_]\w*)\s*=(?!=)\s*([\s\S]+)$/);
    if (keyword) {
      if (!parameters.includes(keyword[1])) {
        throw new PythonSyntaxError(
          `${name}() has no "${keyword[1]}" option`,
          line,
        );
      }
      named.set(keyword[1], translateExpression(keyword[2], line, userFunctions));
    } else {
      if (named.size > 0) {
        throw new PythonSyntaxError(
          `put positional values before named options in ${name}()`,
          line,
        );
      }
      positional.push(translateExpression(rawArgument, line, userFunctions));
    }
  }

  if (parameters.length > 0 && positional.length > parameters.length) {
    throw new PythonSyntaxError(`${name}() received too many values`, line);
  }
  if (named.size === 0) {
    const requiredCount = parameters.filter(
      (parameter) => spec.defaults?.[parameter] === undefined,
    ).length;
    if (positional.length < requiredCount) {
      throw new PythonSyntaxError(
        `${name}() needs ${requiredCount} value${requiredCount === 1 ? "" : "s"}`,
        line,
      );
    }
    return positional;
  }

  let lastIndex = positional.length - 1;
  named.forEach((_, parameter) => {
    lastIndex = Math.max(lastIndex, parameters.indexOf(parameter));
  });
  parameters.forEach((parameter, index) => {
    if (
      spec.defaults?.[parameter] === undefined
      && positional[index] === undefined
      && !named.has(parameter)
    ) {
      throw new PythonSyntaxError(`${name}() needs "${parameter}"`, line);
    }
  });
  const ordered = parameters.slice(0, lastIndex + 1).map((parameter, index) =>
    positional[index]
      ?? named.get(parameter)
      ?? spec.defaults?.[parameter]
      ?? "undefined");
  return ordered;
};

function translateExpression(
  source: string,
  line: number,
  userFunctions: ReadonlySet<string> = new Set(),
): string {
  const trimmed = source.trim();
  const notInMatch = trimmed.match(/^(.+?)\s+not\s+in\s+(.+)$/);
  if (notInMatch) {
    return `!__pythonContains(${translateExpression(notInMatch[2], line, userFunctions)}, ${translateExpression(notInMatch[1], line, userFunctions)})`;
  }
  const inMatch = trimmed.match(/^(.+?)\s+in\s+(.+)$/);
  if (inMatch) {
    return `__pythonContains(${translateExpression(inMatch[2], line, userFunctions)}, ${translateExpression(inMatch[1], line, userFunctions)})`;
  }

  let output = "";
  let cursor = 0;
  while (cursor < source.length) {
    const fString =
      (source[cursor] === "f" || source[cursor] === "F")
      && (source[cursor + 1] === "'" || source[cursor + 1] === "\"");
    if (fString) {
      const translated = translateFString(source.slice(cursor), line, userFunctions);
      output += translated.text;
      cursor += translated.end;
      continue;
    }

    const character = source[cursor];
    if (character === "'" || character === "\"") {
      const quoted = readQuoted(source, cursor);
      output += source.slice(cursor, quoted.end);
      cursor = quoted.end;
      continue;
    }

    if (isIdentifierStart(character)) {
      let identifierEnd = cursor + 1;
      while (
        identifierEnd < source.length
        && isIdentifierPart(source[identifierEnd])
      ) identifierEnd += 1;
      const identifier = source.slice(cursor, identifierEnd);
      let next = identifierEnd;
      while (/\s/.test(source[next] ?? "")) next += 1;
      if (source[next] === "(") {
        const closing = findClosingParenthesis(source, next, line);
        const rawArguments = splitTopLevel(source.slice(next + 1, closing), line);
        const spec = PYTHON_CALLS[identifier]
          ?? (userFunctions.has(identifier)
            ? { target: identifier, asynchronous: true }
            : undefined);
        if (!spec) {
          throw new PythonSyntaxError(
            `unknown function "${identifier}()"; use a documented Hopper command or define it with def`,
            line,
          );
        }
        const argumentsList = orderArguments(
          identifier,
          spec,
          rawArguments,
          line,
          userFunctions,
        );
        const invocation = spec.build
          ? spec.build(argumentsList)
          : `${spec.target}(${argumentsList.join(", ")})`;
        output += `${spec.asynchronous ? "await " : ""}${invocation}`;
        cursor = closing + 1;
        continue;
      }

      const words: Record<string, string> = {
        and: "&&",
        False: "false",
        None: "null",
        not: "!",
        or: "||",
        True: "true",
      };
      if (identifier === "await") {
        throw new PythonSyntaxError(
          "commands wait automatically; remove the word await",
          line,
        );
      }
      output += words[identifier] ?? identifier;
      cursor = identifierEnd;
      continue;
    }

    output += character;
    cursor += 1;
  }

  return output
    .replace(/\bis\s+!/g, "!==")
    .replace(/\bis\b/g, "===")
    .trim();
}

type BlockKind =
  | "if"
  | "elif"
  | "else"
  | "while"
  | "for"
  | "function"
  | "try"
  | "catch"
  | "finally";

type BlockEntry = {
  kind: BlockKind;
  sourceIndent: number;
  loop: boolean;
  declarations?: Set<string>;
};

const UNSUPPORTED_STATEMENT =
  /^(?:async|class|del|from|global|import|lambda|nonlocal|with|yield)\b/;

/**
 * Translates Hopper Studio's intentionally small, classroom-oriented Python
 * surface to the existing async JavaScript execution runtime.
 */
export function transpilePython(source: string): string {
  const normalizedSource = source.replace(/\r\n?/g, "\n").replace(/\t/g, "    ");
  const sourceLines = normalizedSource.split("\n");
  const userFunctions = new Set<string>();
  for (const sourceLine of sourceLines) {
    const definition = sourceLine.trim().match(/^def\s+([A-Za-z_]\w*)\s*\(/);
    if (definition) userFunctions.add(definition[1]);
  }

  const output: string[] = [PYTHON_HELPERS.trimEnd()];
  const blocks: BlockEntry[] = [];
  const globalDeclarations = new Set<string>();
  let previousIndent = 0;
  let previousOpenedBlock = false;

  const javascriptIndent = () => "  ".repeat(blocks.length);
  const currentDeclarations = () =>
    [...blocks].reverse().find((block) => block.kind === "function")?.declarations
    ?? globalDeclarations;

  const closeBlocksAtOrAbove = (sourceIndent: number) => {
    let lastClosed: BlockEntry | null = null;
    while (
      blocks.length > 0
      && blocks[blocks.length - 1].sourceIndent >= sourceIndent
    ) {
      const closing = blocks.pop()!;
      if (closing.loop) {
        output.push(`${"  ".repeat(blocks.length + 1)}await runtime.tick();`);
      }
      output.push(`${"  ".repeat(blocks.length)}}`);
      lastClosed = closing;
    }
    return lastClosed;
  };

  sourceLines.forEach((sourceLine, index) => {
    const lineNumber = index + 1;
    const leading = sourceLine.match(/^ */)?.[0].length ?? 0;
    const trimmedLine = sourceLine.slice(leading);
    if (!trimmedLine.trim()) {
      output.push("");
      return;
    }
    if (trimmedLine.trimStart().startsWith("#")) {
      output.push(`${javascriptIndent()}//${trimmedLine.trimStart().slice(1)}`);
      return;
    }
    if (leading > previousIndent && !previousOpenedBlock) {
      throw new PythonSyntaxError(
        "unexpected indentation; only indent after a line ending in :",
        lineNumber,
      );
    }
    if (previousOpenedBlock && leading <= previousIndent) {
      throw new PythonSyntaxError(
        "expected an indented line after the block header",
        lineNumber,
      );
    }

    const lastClosed = closeBlocksAtOrAbove(leading);
    const { code: uncommented, comment } = splitInlineComment(trimmedLine);
    const code = uncommented.trim();
    const commentSuffix = comment ? ` // ${comment}` : "";
    const indent = javascriptIndent();
    let openedBlock = false;

    const ifMatch = code.match(/^if\s+(.+):$/);
    const elifMatch = code.match(/^elif\s+(.+):$/);
    const whileMatch = code.match(/^while\s+(.+):$/);
    const forMatch = code.match(/^for\s+([A-Za-z_]\w*)\s+in\s+(.+):$/);
    const defMatch = code.match(/^def\s+([A-Za-z_]\w*)\s*\((.*)\):$/);
    const exceptMatch = code.match(
      /^except(?:\s+(?:Exception|Error)(?:\s+as\s+([A-Za-z_]\w*))?)?:$/,
    );
    if (lastClosed?.kind === "try" && !exceptMatch && code !== "finally:") {
      throw new PythonSyntaxError(
        "try must be followed by except or finally",
        lineNumber,
      );
    }

    if (ifMatch) {
      output.push(`${indent}if (${translateExpression(ifMatch[1], lineNumber, userFunctions)}) {${commentSuffix}`);
      blocks.push({ kind: "if", sourceIndent: leading, loop: false });
      openedBlock = true;
    } else if (elifMatch) {
      if (!lastClosed || !["if", "elif"].includes(lastClosed.kind)) {
        throw new PythonSyntaxError("elif must immediately follow if or elif", lineNumber);
      }
      output.push(`${indent}else if (${translateExpression(elifMatch[1], lineNumber, userFunctions)}) {${commentSuffix}`);
      blocks.push({ kind: "elif", sourceIndent: leading, loop: false });
      openedBlock = true;
    } else if (code === "else:") {
      if (!lastClosed || !["if", "elif"].includes(lastClosed.kind)) {
        throw new PythonSyntaxError("else must immediately follow if or elif", lineNumber);
      }
      output.push(`${indent}else {${commentSuffix}`);
      blocks.push({ kind: "else", sourceIndent: leading, loop: false });
      openedBlock = true;
    } else if (whileMatch) {
      output.push(`${indent}while (${translateExpression(whileMatch[1], lineNumber, userFunctions)}) {${commentSuffix}`);
      blocks.push({ kind: "while", sourceIndent: leading, loop: true });
      openedBlock = true;
    } else if (forMatch) {
      const declarations = currentDeclarations();
      declarations.add(forMatch[1]);
      output.push(
        `${indent}for (var ${forMatch[1]} of ${translateExpression(forMatch[2], lineNumber, userFunctions)}) {${commentSuffix}`,
      );
      blocks.push({ kind: "for", sourceIndent: leading, loop: true });
      openedBlock = true;
    } else if (defMatch) {
      const parameters = splitTopLevel(defMatch[2], lineNumber);
      parameters.forEach((parameter) => {
        if (!/^[A-Za-z_]\w*$/.test(parameter)) {
          throw new PythonSyntaxError(
            "function parameters must be simple names",
            lineNumber,
          );
        }
      });
      output.push(`${indent}async function ${defMatch[1]}(${parameters.join(", ")}) {${commentSuffix}`);
      blocks.push({
        kind: "function",
        sourceIndent: leading,
        loop: false,
        declarations: new Set(parameters),
      });
      openedBlock = true;
    } else if (code === "try:") {
      output.push(`${indent}try {${commentSuffix}`);
      blocks.push({ kind: "try", sourceIndent: leading, loop: false });
      openedBlock = true;
    } else if (exceptMatch) {
      if (!lastClosed || !["try", "catch"].includes(lastClosed.kind)) {
        throw new PythonSyntaxError("except must immediately follow try", lineNumber);
      }
      output.push(`${indent}catch (${exceptMatch[1] ?? "error"}) {${commentSuffix}`);
      blocks.push({ kind: "catch", sourceIndent: leading, loop: false });
      openedBlock = true;
    } else if (code === "finally:") {
      if (!lastClosed || !["try", "catch"].includes(lastClosed.kind)) {
        throw new PythonSyntaxError("finally must immediately follow try or except", lineNumber);
      }
      output.push(`${indent}finally {${commentSuffix}`);
      blocks.push({ kind: "finally", sourceIndent: leading, loop: false });
      openedBlock = true;
    } else if (code === "break") {
      if (!blocks.some((block) => block.loop)) {
        throw new PythonSyntaxError("break must be inside a loop", lineNumber);
      }
      output.push(`${indent}break;${commentSuffix}`);
    } else if (code === "continue") {
      if (!blocks.some((block) => block.loop)) {
        throw new PythonSyntaxError("continue must be inside a loop", lineNumber);
      }
      output.push(`${indent}await runtime.tick(); continue;${commentSuffix}`);
    } else if (code === "pass") {
      output.push(`${indent}// pass${commentSuffix}`);
    } else if (/^return\b/.test(code)) {
      if (!blocks.some((block) => block.kind === "function")) {
        throw new PythonSyntaxError("return must be inside a function", lineNumber);
      }
      const value = code.slice("return".length).trim();
      output.push(
        `${indent}return${value ? ` ${translateExpression(value, lineNumber, userFunctions)}` : ""};${commentSuffix}`,
      );
    } else if (/^raise\b/.test(code)) {
      const value = code.slice("raise".length).trim();
      const exception = value.match(/^(?:Exception|Error)\((.*)\)$/);
      output.push(
        `${indent}throw new Error(${exception ? translateExpression(exception[1], lineNumber, userFunctions) : JSON.stringify(value || "Python error")});${commentSuffix}`,
      );
    } else if (/^assert\b/.test(code)) {
      const condition = code.slice("assert".length).trim();
      output.push(
        `${indent}if (!(${translateExpression(condition, lineNumber, userFunctions)})) throw new Error("Python assertion failed on line ${lineNumber}");${commentSuffix}`,
      );
    } else if (UNSUPPORTED_STATEMENT.test(code)) {
      throw new PythonSyntaxError(
        "that advanced Python statement is not supported in Hopper Studio",
        lineNumber,
      );
    } else {
      const augmented = code.match(/^([A-Za-z_]\w*)\s*(\+=|-=|\*=|\/=|%=)\s*(.+)$/);
      const assignment = code.match(/^([A-Za-z_]\w*)\s*=(?!=)\s*(.+)$/);
      if (augmented) {
        output.push(
          `${indent}${augmented[1]} ${augmented[2]} ${translateExpression(augmented[3], lineNumber, userFunctions)};${commentSuffix}`,
        );
      } else if (assignment) {
        const declarations = currentDeclarations();
        const declaration = declarations.has(assignment[1]) ? "" : "var ";
        declarations.add(assignment[1]);
        output.push(
          `${indent}${declaration}${assignment[1]} = ${translateExpression(assignment[2], lineNumber, userFunctions)};${commentSuffix}`,
        );
      } else {
        if (code.endsWith(":")) {
          throw new PythonSyntaxError("unsupported block header", lineNumber);
        }
        output.push(
          `${indent}${translateExpression(code, lineNumber, userFunctions)};${commentSuffix}`,
        );
      }
    }

    previousIndent = leading;
    previousOpenedBlock = openedBlock;
  });

  if (previousOpenedBlock) {
    throw new PythonSyntaxError(
      "expected an indented line after the block header",
      Math.max(1, sourceLines.length),
    );
  }
  if (blocks.some((block) => block.kind === "try")) {
    throw new PythonSyntaxError(
      "try must be followed by except or finally",
      Math.max(1, sourceLines.length),
    );
  }
  closeBlocksAtOrAbove(-1);
  return `${output.join("\n").trim()}\n`;
}
