// Strict RFC 8259 validation. TypeScript parses the mapped JSON as a TypeScript expression, which would
// silently accept comments, trailing commas, unquoted keys and other non-JSON syntax, so the mapper rejects
// them here. In JSONC mode (https://jsonc.org), `//` and `/* */` comments and trailing commas are allowed.
// Offsets are UTF-16 indices into the validated text.

// pos++ is the idiom in the character scanner; a comment per site would bury the parser.
/* oxlint-disable no-plusplus */

import type { MapperDiagnostic } from "./protocol.ts";

// The const and its same-named type are declaration merging, not a redeclaration.
// oxlint-disable-next-line no-redeclare
export const JsonErrorCode = {
  Comment: 1004,
  ControlCharacter: 1007,
  InvalidEscape: 1006,
  InvalidNumber: 1005,
  TrailingComma: 1003,
  TrailingContent: 1010,
  UnexpectedEnd: 1002,
  UnexpectedToken: 1001,
  UnquotedString: 1009,
  UnterminatedComment: 1011,
  UnterminatedString: 1008,
} as const;

export type JsonErrorCode = (typeof JsonErrorCode)[keyof typeof JsonErrorCode];

class JsonError {
  readonly diagnostic: MapperDiagnostic;
  constructor(diagnostic: MapperDiagnostic) {
    this.diagnostic = diagnostic;
  }
}

function fail(
  code: JsonErrorCode,
  start: number,
  length: number,
  messageText: string
): never {
  throw new JsonError({ code, length, messageText, start });
}

const identifierStart = /[\p{ID_Start}$_]/u;
const identifierPart = /[\p{ID_Continue}$_\u200C\u200D]/u;
const numberPart = /[0-9A-Za-z_.+-]/u;
const hexDigit = /[0-9A-Fa-f]/u;
const simpleEscapes = '"\\/bfnrt';

/** The [start, end) range of a JSONC comment. */
export type CommentRange = readonly [start: number, end: number];

export type ValidateResult =
  | { error: MapperDiagnostic }
  | { error?: never; comments: CommentRange[] };

/** Checks that text is exactly one valid JSON (or JSONC) value, returning the first error or the comment ranges. */
export function validateJson(
  text: string,
  { jsonc }: { jsonc: boolean }
): ValidateResult {
  let pos = 0;
  const comments: CommentRange[] = [];

  function skipComment(): void {
    const start = pos;
    if (text[pos + 1] === "/") {
      const lineEnd = text.slice(pos).search(/[\n\r]/u);
      pos = lineEnd === -1 ? text.length : pos + lineEnd;
    } else {
      const end = text.indexOf("*/", pos + 2);
      if (end === -1) {
        fail(
          JsonErrorCode.UnterminatedComment,
          pos,
          text.length - pos,
          "Unterminated comment."
        );
      }
      pos = end + 2;
    }
    comments.push([start, pos]);
  }

  function skipWhitespace(): void {
    while (pos < text.length) {
      const ch = text[pos];
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
        pos++;
      } else if (
        ch === "/" &&
        (text[pos + 1] === "/" || text[pos + 1] === "*")
      ) {
        if (!jsonc) {
          fail(
            JsonErrorCode.Comment,
            pos,
            2,
            "Comments are not allowed in JSON."
          );
        }
        skipComment();
      } else {
        return;
      }
    }
  }

  function expectMore(): void {
    if (pos >= text.length) {
      fail(
        JsonErrorCode.UnexpectedEnd,
        pos,
        0,
        "Unexpected end of JSON input."
      );
    }
  }

  function codePointAt(index: number): string {
    // Callers bound index to text.length before calling.
    // oxlint-disable-next-line no-non-null-assertion
    return String.fromCodePoint(text.codePointAt(index)!);
  }

  /** Returns the end of the run of characters matching pattern that starts at index. */
  function runEnd(index: number, pattern: RegExp): number {
    let i = index;
    while (i < text.length) {
      const ch = codePointAt(i);
      if (!pattern.test(ch)) {
        break;
      }
      i += ch.length;
    }
    return i;
  }

  function failUnexpectedCharacter(messageSuffix = ""): never {
    const ch = codePointAt(pos);
    // ch comes from codePointAt(), so it is never empty.
    // oxlint-disable-next-line no-non-null-assertion
    const code = ch.codePointAt(0)!;
    const shown =
      code >= 0x21 && code <= 0x7e
        ? `'${ch}'`
        : `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
    fail(
      JsonErrorCode.UnexpectedToken,
      pos,
      ch.length,
      `Unexpected character ${shown}.${messageSuffix}`
    );
  }

  function failUnquoted(): never {
    const length = text[pos] === "'" ? 1 : runEnd(pos, identifierPart) - pos;
    fail(
      JsonErrorCode.UnquotedString,
      pos,
      length,
      "Strings and property names must use double quotes in JSON."
    );
  }

  function parseString(): void {
    // Consume the opening quote.
    const start = pos++;
    while (true) {
      if (pos >= text.length) {
        fail(
          JsonErrorCode.UnterminatedString,
          start,
          pos - start,
          "Unterminated string."
        );
      }
      const ch = text[pos];
      if (ch === '"') {
        pos++;
        return;
      }
      if (ch === "\\") {
        const escape = text[pos + 1];
        if (escape === undefined) {
          fail(
            JsonErrorCode.UnterminatedString,
            start,
            text.length - start,
            "Unterminated string."
          );
        }
        if (simpleEscapes.includes(escape)) {
          pos += 2;
        } else if (escape === "u") {
          const digits = text.slice(pos + 2, pos + 6);
          if (
            digits.length < 4 ||
            ![...digits].every((d) => hexDigit.test(d))
          ) {
            fail(
              JsonErrorCode.InvalidEscape,
              pos,
              Math.min(6, text.length - pos),
              "Invalid Unicode escape sequence. Expected '\\u' followed by four hex digits."
            );
          }
          pos += 6;
        } else {
          fail(JsonErrorCode.InvalidEscape, pos, 2, "Invalid escape sequence.");
        }
      } else if (ch < " ") {
        fail(
          JsonErrorCode.ControlCharacter,
          pos,
          1,
          "Control characters must be escaped in JSON strings."
        );
      } else {
        pos++;
      }
    }
  }

  function parseNumber(): void {
    const start = pos;
    function invalid(): never {
      return fail(
        JsonErrorCode.InvalidNumber,
        start,
        runEnd(start, numberPart) - start,
        "Invalid number."
      );
    }
    function digits(): number {
      const digitsStart = pos;
      while (text[pos] >= "0" && text[pos] <= "9") {
        pos++;
      }
      return pos - digitsStart;
    }

    if (text[pos] === "-") {
      pos++;
    }
    if (text[pos] === "0") {
      pos++;
    } else if (digits() === 0) {
      invalid();
    }
    if (text[pos] === ".") {
      pos++;
      if (digits() === 0) {
        invalid();
      }
    }
    if (text[pos] === "e" || text[pos] === "E") {
      pos++;
      if (text[pos] === "+" || text[pos] === "-") {
        pos++;
      }
      if (digits() === 0) {
        invalid();
      }
    }
    if (pos < text.length && numberPart.test(text[pos])) {
      invalid();
    }
  }

  function parseKeyword(): void {
    const end = runEnd(pos, identifierPart);
    const word = text.slice(pos, end);
    if (word !== "true" && word !== "false" && word !== "null") {
      fail(
        JsonErrorCode.UnexpectedToken,
        pos,
        end - pos,
        `Unexpected token '${word}'. JSON does not allow this value.`
      );
    }
    pos = end;
  }

  /** Parses `item (, item)*` up to `close`, starting at the opening bracket. */
  function parseList(close: "}" | "]", parseItem: () => void): void {
    // Consume the opening brace or bracket.
    pos++;
    skipWhitespace();
    if (text[pos] === close) {
      pos++;
      return;
    }
    while (true) {
      parseItem();
      skipWhitespace();
      expectMore();
      if (text[pos] === close) {
        pos++;
        return;
      }
      if (text[pos] !== ",") {
        failUnexpectedCharacter(` Expected ',' or '${close}'.`);
      }
      const comma = pos++;
      skipWhitespace();
      if (text[pos] === close) {
        if (!jsonc) {
          fail(
            JsonErrorCode.TrailingComma,
            comma,
            1,
            "Trailing commas are not allowed in JSON."
          );
        }
        pos++;
        return;
      }
    }
  }

  function parseMember(): void {
    skipWhitespace();
    expectMore();
    if (text[pos] !== '"') {
      if (text[pos] === "'" || identifierStart.test(codePointAt(pos))) {
        failUnquoted();
      }
      failUnexpectedCharacter(" Expected a double-quoted property name.");
    }
    parseString();
    skipWhitespace();
    expectMore();
    if (text[pos] !== ":") {
      failUnexpectedCharacter(" Expected ':' after the property name.");
    }
    pos++;
    // Mutual recursion with parseValue: either order leaves one forward reference.
    // oxlint-disable-next-line no-use-before-define
    parseValue();
  }

  function parseValue(): void {
    skipWhitespace();
    expectMore();
    const ch = text[pos];
    if (ch === "{") {
      parseList("}", parseMember);
    } else if (ch === "[") {
      parseList("]", parseValue);
    } else if (ch === '"') {
      parseString();
    } else if (
      ch === "-" ||
      ch === "+" ||
      ch === "." ||
      (ch >= "0" && ch <= "9")
    ) {
      parseNumber();
    } else if (ch === "'") {
      failUnquoted();
    } else if (identifierStart.test(codePointAt(pos))) {
      parseKeyword();
    } else {
      failUnexpectedCharacter();
    }
  }

  function run(): ValidateResult {
    try {
      parseValue();
      skipWhitespace();
      if (pos < text.length) {
        fail(
          JsonErrorCode.TrailingContent,
          pos,
          1,
          "Unexpected content after the JSON value."
        );
      }
      return { comments };
    } catch (error) {
      if (error instanceof JsonError) {
        return { error: error.diagnostic };
      }
      throw error;
    }
  }

  return run();
}
