import assert from "node:assert/strict";
import test from "node:test";

import { fallbackText, prefix, suffix, transform } from "../src/transform.ts";
import { JsonErrorCode } from "../src/validate.ts";

/** Asserts that every mapping is verbatim, and returns the original text the mappings cover. */
function mappedText(fileName: string, content: string): string {
  const result = transform(fileName, content);
  assert.equal(result.diagnostics, undefined);
  assert.ok(result.mappings);
  let covered = "";
  for (const [
    virtualStart,
    virtualLength,
    originalStart,
    originalLength,
    kind,
  ] of result.mappings) {
    assert.equal(kind, 0);
    assert.equal(virtualLength, originalLength);
    const original = content.slice(
      originalStart,
      originalStart + originalLength
    );
    assert.equal(
      result.text.slice(virtualStart, virtualStart + virtualLength),
      original
    );
    covered += original;
  }
  return covered;
}

test("wraps valid JSON in a const-asserted default export", () => {
  const result = transform("a.json", '{ "a": [1] }');
  assert.equal(result.extension, ".ts");
  assert.equal(result.text, 'export default ({ "a": [1] }) as const;\n');
});

test("maps all of the JSON verbatim, including a trailing newline", () => {
  for (const content of [
    '{ "a": [1] }',
    '{ "a": [1] }\n',
    '\r\n[ "😀", "\\u00e9" ]\r\n',
  ]) {
    assert.equal(mappedText("a.json", content), content);
  }
});

test("strips a BOM and maps from just after it", () => {
  const result = transform("a.json", '\uFEFF{ "a": 1 }');
  assert.ok(!result.text.includes("\uFEFF"));
  assert.equal(result.mappings?.[0]?.[2], 1);
  assert.equal(mappedText("a.json", '\uFEFF{ "a": 1 }'), '{ "a": 1 }');
});

test("reports invalid JSON against the original content and falls back to any", () => {
  const result = transform("a.json", '\uFEFF{ "a": 1, }');
  assert.equal(result.text, fallbackText);
  assert.equal(result.mappings, undefined);
  assert.deepEqual(
    result.diagnostics?.map(({ code, start, length }) => ({
      code,
      length,
      start,
    })),
    [{ code: JsonErrorCode.TrailingComma, length: 1, start: 9 }]
  );
});

test("JSONC: blanks comments, keeps line breaks, and maps only the JSON between them", () => {
  const content =
    '// @ts-expect-error\r\n{ "a": [1,], /* b\n c */ "d": 2 } // end';
  const { text } = transform("a.jsonc", content);
  const body = text.slice(prefix.length, text.length - suffix.length);

  assert.ok(text.startsWith(prefix) && text.endsWith(suffix));
  assert.equal(body.length, content.length);
  assert.doesNotMatch(body, /@ts-expect-error|\/\*|\*\/|\/\/|end/u);
  assert.deepEqual(
    [...body.matchAll(/[\r\n]/gu)].map((m) => m.index),
    [...content.matchAll(/[\r\n]/gu)].map((m) => m.index)
  );
  assert.equal(mappedText("a.jsonc", content), '\r\n{ "a": [1,],  "d": 2 } ');
});

test("only files ending in .jsonc (any case) are parsed as JSONC", () => {
  const content = "// c\n[1,]";
  assert.equal(transform("/p/settings.jsonc", content).diagnostics, undefined);
  assert.equal(transform("/p/Settings.JSONC", content).diagnostics, undefined);
  assert.equal(
    transform("/p/data.const.json", content).diagnostics?.[0]?.code,
    JsonErrorCode.Comment
  );
  assert.equal(
    transform("/p/data.jsonc.json", content).diagnostics?.[0]?.code,
    JsonErrorCode.Comment
  );
});
