import assert from "node:assert/strict";
import test from "node:test";

import { JsonErrorCode, validateJson } from "../src/validate.ts";

function errorOf(text: string, jsonc = false) {
  return validateJson(text, { jsonc }).error;
}

const valid = [
  "{}",
  "[]",
  " \t\r\n{ } \n",
  "null",
  "true",
  "false",
  "0",
  "-0",
  "1e-7",
  "-12.5E+3",
  "123456789012345678901234567890",
  '""',
  '"\\" \\\\ \\/ \\b \\f \\n \\r \\t \\u00e9 \\uD83D\\uDE00"',
  '"\u2028\u2029"',
  '"😀"',
  '{ "__proto__": { "x": 1 }, "y": 2 }',
  '{ "a": [1, "two", null, true, { "b": [] }] }',
  '{ "a": 1, "a": 2 }',
  "[".repeat(500) + "]".repeat(500),
];

for (const text of valid) {
  test(`accepts ${JSON.stringify(text.slice(0, 40))}`, () => {
    JSON.parse(text); // sanity check the table itself
    assert.equal(errorOf(text), undefined);
  });
}

// [text, code, start, length]
const invalid: [string, JsonErrorCode, number, number][] = [
  ["", JsonErrorCode.UnexpectedEnd, 0, 0],
  ["   ", JsonErrorCode.UnexpectedEnd, 3, 0],
  ["{", JsonErrorCode.UnexpectedEnd, 1, 0],
  ['{ "a": 1', JsonErrorCode.UnexpectedEnd, 8, 0],
  ["[1,", JsonErrorCode.UnexpectedEnd, 3, 0],
  ["// c\n{}", JsonErrorCode.Comment, 0, 2],
  ["{ /* c */ }", JsonErrorCode.Comment, 2, 2],
  ['{ "a": 1, }', JsonErrorCode.TrailingComma, 8, 1],
  ["[1, 2,]", JsonErrorCode.TrailingComma, 5, 1],
  ["{ a: 1 }", JsonErrorCode.UnquotedString, 2, 1],
  ["{ 'a': 1 }", JsonErrorCode.UnquotedString, 2, 1],
  ["['x']", JsonErrorCode.UnquotedString, 1, 1],
  ["{ [k]: 1 }", JsonErrorCode.UnexpectedToken, 2, 1],
  ["NaN", JsonErrorCode.UnexpectedToken, 0, 3],
  ["[Infinity]", JsonErrorCode.UnexpectedToken, 1, 8],
  ["undefined", JsonErrorCode.UnexpectedToken, 0, 9],
  ["True", JsonErrorCode.UnexpectedToken, 0, 4],
  ["nul", JsonErrorCode.UnexpectedToken, 0, 3],
  ["0x1F", JsonErrorCode.InvalidNumber, 0, 4],
  ["0o7", JsonErrorCode.InvalidNumber, 0, 3],
  ["0b1", JsonErrorCode.InvalidNumber, 0, 3],
  ["+1", JsonErrorCode.InvalidNumber, 0, 2],
  ["01", JsonErrorCode.InvalidNumber, 0, 2],
  [".5", JsonErrorCode.InvalidNumber, 0, 2],
  ["5.", JsonErrorCode.InvalidNumber, 0, 2],
  ["1e", JsonErrorCode.InvalidNumber, 0, 2],
  ["-", JsonErrorCode.InvalidNumber, 0, 1],
  ["1_000", JsonErrorCode.InvalidNumber, 0, 5],
  ["[1n]", JsonErrorCode.InvalidNumber, 1, 2],
  ["{\u00A0}", JsonErrorCode.UnexpectedToken, 1, 1],
  ["[\u2028]", JsonErrorCode.UnexpectedToken, 1, 1],
  ["\uFEFF{}", JsonErrorCode.UnexpectedToken, 0, 1],
  ['"a\tb"', JsonErrorCode.ControlCharacter, 2, 1],
  ['"a\nb"', JsonErrorCode.ControlCharacter, 2, 1],
  ['"\\x41"', JsonErrorCode.InvalidEscape, 1, 2],
  ['"\\0"', JsonErrorCode.InvalidEscape, 1, 2],
  ['"\\v"', JsonErrorCode.InvalidEscape, 1, 2],
  ['"a\\\nb"', JsonErrorCode.InvalidEscape, 2, 2],
  ['"\\u12G4"', JsonErrorCode.InvalidEscape, 1, 6],
  ['"\\u12"', JsonErrorCode.InvalidEscape, 1, 5],
  ['"abc', JsonErrorCode.UnterminatedString, 0, 4],
  ['"ab\\', JsonErrorCode.UnterminatedString, 0, 4],
  ['{ "a" 1 }', JsonErrorCode.UnexpectedToken, 6, 1],
  ['{ "a": 1 "b": 2 }', JsonErrorCode.UnexpectedToken, 9, 1],
  ["[1 2]", JsonErrorCode.UnexpectedToken, 3, 1],
  ["{} {}", JsonErrorCode.TrailingContent, 3, 1],
  ["1 2", JsonErrorCode.TrailingContent, 2, 1],
  ['{ "😀": x }', JsonErrorCode.UnexpectedToken, 8, 1],
  ["{ ünï: 1 }", JsonErrorCode.UnquotedString, 2, 3],
];

for (const [text, code, start, length] of invalid) {
  test(`rejects ${JSON.stringify(text)}`, () => {
    assert.throws(() => JSON.parse(text)); // sanity check the table itself
    const error = errorOf(text);
    assert.ok(error, "expected an error");
    assert.deepEqual(
      { code: error.code, length: error.length, start: error.start },
      { code, length, start },
      error.messageText
    );
  });
}

test("messages name the offending text", () => {
  assert.equal(
    errorOf("[NaN]")?.messageText,
    "Unexpected token 'NaN'. JSON does not allow this value."
  );
  assert.equal(
    errorOf("{\u00A0}")?.messageText,
    "Unexpected character U+00A0. Expected a double-quoted property name."
  );
  assert.equal(
    errorOf("[1;]")?.messageText,
    "Unexpected character ';'. Expected ',' or ']'."
  );
});

const validJsonc = [
  "// leading\n{}",
  "{} // trailing, no newline",
  '{ /* inline */ "a": /* before value */ 1 /* after */ }',
  "/* multi\n   line */ [1, 2]",
  '{ "url": "http://example.com/*not a comment*/" }',
  '{ "a": 1, }',
  "[1, 2, ]",
  '{ "a": [1,], // why not\n}',
  "/**/ 1 /***/",
];

for (const text of validJsonc) {
  test(`accepts JSONC ${JSON.stringify(text.slice(0, 40))}`, () => {
    assert.equal(errorOf(text, true), undefined);
  });
}

const invalidJsonc: [string, JsonErrorCode, number, number][] = [
  ["/* never closed", JsonErrorCode.UnterminatedComment, 0, 15],
  ["{ /* a /* b */ */ }", JsonErrorCode.UnexpectedToken, 15, 1],
  ["# hash\n{}", JsonErrorCode.UnexpectedToken, 0, 1],
  ["{ , }", JsonErrorCode.UnexpectedToken, 2, 1],
  ["[,]", JsonErrorCode.UnexpectedToken, 1, 1],
  ["[1,,]", JsonErrorCode.UnexpectedToken, 3, 1],
  ["{ a: 1 }", JsonErrorCode.UnquotedString, 2, 1],
  ["[NaN]", JsonErrorCode.UnexpectedToken, 1, 3],
];

for (const [text, code, start, length] of invalidJsonc) {
  test(`rejects JSONC ${JSON.stringify(text)}`, () => {
    const error = errorOf(text, true);
    assert.ok(error, "expected an error");
    assert.deepEqual(
      { code: error.code, length: error.length, start: error.start },
      { code, length, start },
      error.messageText
    );
  });
}

test("returns the range of every JSONC comment", () => {
  assert.deepEqual(validateJson("/*a*/ [1, // b\n2]", { jsonc: true }), {
    comments: [
      [0, 5],
      [10, 14],
    ],
  });
  assert.deepEqual(validateJson("[1]", { jsonc: false }), { comments: [] });
});
