export type JavaScriptTokenKind =
  | "plain"
  | "comment"
  | "string"
  | "keyword"
  | "literal"
  | "number"
  | "function"
  | "operator";

export type JavaScriptToken = {
  kind: JavaScriptTokenKind;
  text: string;
};

const KEYWORDS = new Set([
  "as",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "finally",
  "for",
  "from",
  "function",
  "get",
  "if",
  "import",
  "in",
  "instanceof",
  "let",
  "new",
  "of",
  "return",
  "set",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

const LITERALS = new Set([
  "false",
  "Infinity",
  "NaN",
  "null",
  "true",
  "undefined",
]);

const OPERATORS = [
  ">>>=",
  "===",
  "!==",
  "**=",
  "&&=",
  "||=",
  "??=",
  ">>>",
  "...",
  "=>",
  "==",
  "!=",
  "<=",
  ">=",
  "++",
  "--",
  "&&",
  "||",
  "??",
  "?.",
  "**",
  "<<",
  ">>",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "&=",
  "|=",
  "^=",
] as const;

const NUMBER_PATTERN =
  /(?:0[xX][\da-fA-F](?:_?[\da-fA-F])*n?|0[bB][01](?:_?[01])*n?|0[oO][0-7](?:_?[0-7])*n?|(?:\d(?:_?\d)*)?\.\d(?:_?\d)*(?:[eE][+-]?\d(?:_?\d)*)?|(?:\d(?:_?\d)*)(?:\.(?:\d(?:_?\d)*)?)?(?:[eE][+-]?\d(?:_?\d)*)?n?)/y;

const isIdentifierStart = (character: string) =>
  /[A-Za-z_$]/.test(character);

const isIdentifierPart = (character: string) =>
  /[\w$]/.test(character);

const isDigit = (character: string) =>
  character >= "0" && character <= "9";

const pushToken = (
  tokens: JavaScriptToken[],
  kind: JavaScriptTokenKind,
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

const findQuotedStringEnd = (
  source: string,
  start: number,
  quote: "'" | "\"" | "`",
) => {
  let cursor = start + 1;
  while (cursor < source.length) {
    if (source[cursor] === "\\") {
      cursor = Math.min(source.length, cursor + 2);
      continue;
    }
    if (source[cursor] === quote) return cursor + 1;
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
 * Splits JavaScript source into presentation-only tokens without evaluating it
 * or producing HTML. Concatenating every token's text always recreates source.
 */
export function tokenizeJavaScript(source: string): JavaScriptToken[] {
  const tokens: JavaScriptToken[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    if (cursor === 0 && source.startsWith("#!", cursor)) {
      const end = findLineEnd(source, cursor);
      pushToken(tokens, "comment", source.slice(cursor, end));
      cursor = end;
      continue;
    }

    if (source.startsWith("//", cursor)) {
      const end = findLineEnd(source, cursor);
      pushToken(tokens, "comment", source.slice(cursor, end));
      cursor = end;
      continue;
    }

    if (source.startsWith("/*", cursor)) {
      const closing = source.indexOf("*/", cursor + 2);
      const end = closing === -1 ? source.length : closing + 2;
      pushToken(tokens, "comment", source.slice(cursor, end));
      cursor = end;
      continue;
    }

    const character = source[cursor];
    if (character === "'" || character === "\"" || character === "`") {
      const end = findQuotedStringEnd(source, cursor, character);
      pushToken(tokens, "string", source.slice(cursor, end));
      cursor = end;
      continue;
    }

    if (isDigit(character) || (character === "." && isDigit(source[cursor + 1] ?? ""))) {
      NUMBER_PATTERN.lastIndex = cursor;
      const number = NUMBER_PATTERN.exec(source);
      if (number) {
        pushToken(tokens, "number", number[0]);
        cursor = NUMBER_PATTERN.lastIndex;
        continue;
      }
    }

    if (isIdentifierStart(character)) {
      let end = cursor + 1;
      while (end < source.length && isIdentifierPart(source[end])) end += 1;
      const identifier = source.slice(cursor, end);
      const kind: JavaScriptTokenKind = KEYWORDS.has(identifier)
        ? "keyword"
        : LITERALS.has(identifier)
          ? "literal"
          : findNextNonWhitespace(source, end) === "("
            ? "function"
            : "plain";
      pushToken(tokens, kind, identifier);
      cursor = end;
      continue;
    }

    const compoundOperator = OPERATORS.find((operator) =>
      source.startsWith(operator, cursor));
    if (compoundOperator) {
      pushToken(tokens, "operator", compoundOperator);
      cursor += compoundOperator.length;
      continue;
    }

    if (/[+\-*/%=&|^!~<>?:.]/.test(character)) {
      pushToken(tokens, "operator", character);
      cursor += 1;
      continue;
    }

    pushToken(tokens, "plain", character);
    cursor += 1;
  }

  return tokens;
}
