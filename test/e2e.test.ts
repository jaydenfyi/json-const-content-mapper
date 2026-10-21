// Runs the real TypeScript compiler against test/fixtures/project with this package as its content mapper.
// `nub run test` builds dist/ first; the fixture resolves the package through a node_modules symlink.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const fixture = path.join(root, "test/fixtures/project");
const tsc = path.join(root, "node_modules/.bin/tsc");
const outDir = path.join(root, ".e2e-out");

const link = path.join(fixture, "node_modules/json-const-content-mapper");
if (!existsSync(link)) {
  mkdirSync(path.join(fixture, "node_modules"), { recursive: true });
  symlinkSync(root, link, "dir");
}

function run(
  args: string[],
  env: Record<string, string> = {}
): { lines: string[]; stderr: string; status: number | null } {
  const result = spawnSync(tsc, [...args, "--pretty", "false"], {
    cwd: fixture,
    encoding: "utf-8",
    env: { ...process.env, ...env },
  });
  return {
    lines: result.stdout.split("\n").filter(Boolean),
    status: result.status,
    stderr: result.stderr,
  };
}

const expectedMainErrors = [
  "src/duplicate.const.json(1,11): error TS1117: An object literal cannot have multiple properties with the same name.",
  `src/main.ts(8,14): error TS2322: Type '"DE"' is not assignable to type '"BE" | "FR"'.`,
  `src/main.ts(9,17): error TS2339: Property 'push' does not exist on type 'readonly ["FR", "BE"]'.`,
  `src/main.ts(13,14): error TS2322: Type 'string' is not assignable to type '"FR"'.`,
];

test("narrows .const.json imports under nodenext and leaves plain .json widened", () => {
  const { lines, status } = run(["-p", ".", "--runExternalCode"]);
  assert.deepEqual(lines, expectedMainErrors);
  assert.equal(status, 2);
});

test("behaves the same under bundler resolution", () => {
  assert.deepEqual(
    run(["-p", "tsconfig.bundler.json", "--runExternalCode"]).lines,
    expectedMainErrors
  );
});

test("reports invalid JSON at its location in the .const.json file", () => {
  assert.deepEqual(run(["-p", "invalid", "--runExternalCode"]).lines, [
    "invalid/invalid.const.json(2,9): error json-const1003: Trailing commas are not allowed in JSON.",
  ]);
});

test("requires --runExternalCode, and .const.json falls back to native JSON without it", () => {
  // Without the mapper the files are ordinary JSON: widened types, and TS1543 for the import that has no
  // `with { type: "json" }` (which the mapped run above does not report; see the README's limitations).
  assert.deepEqual(run(["-p", "."]).lines, [
    "src/main.ts(10,14): error TS2322: Type 'number' is not assignable to type '1'.",
    "src/main.ts(11,14): error TS2322: Type 'number' is not assignable to type '-2.5'.",
    `src/main.ts(13,14): error TS2322: Type 'string' is not assignable to type '"FR"'.`,
    `src/main.ts(14,14): error TS2322: Type 'string[]' is not assignable to type 'readonly ["with bom"]'.`,
    "  Target requires 1 element(s) but source may have fewer.",
    `src/main.ts(18,30): error TS1543: Importing a JSON file into an ECMAScript module requires a 'type: "json"' import attribute when 'module' is set to 'NodeNext'.`,
    "tsconfig.json(4,3): error TS18068: Content mappers require the '--runExternalCode' command line flag to be enabled.",
  ]);
});

test("emits declarations and skips the mapper when a build is up to date", () => {
  rmSync(outDir, { force: true, recursive: true });
  const first = run(["-b", "clean", "--runExternalCode"]);
  assert.deepEqual(first.lines, []);
  assert.equal(first.status, 0);

  const declaration = readFileSync(
    path.join(outDir, "clean/locales.d.const.json.ts"),
    "utf-8"
  );
  assert.match(declaration, /readonly appLocales: readonly \["FR", "BE"\];/u);
  assert.match(declaration, /readonly neg: -2\.5;/u);

  const second = run(["-b", "clean", "--runExternalCode", "--verbose"], {
    TS_CONTENT_MAPPER_DEBUG: "1",
  });
  const output = second.lines.join("\n") + second.stderr;
  assert.match(output, /is up to date/u);
  assert.doesNotMatch(
    output,
    /content mapper: json-const-content-mapper\] send:/u
  );
});

test("runs emitted JavaScript after copying the mapped JSON asset", () => {
  const out = path.join(outDir, "runtime");
  rmSync(out, { force: true, recursive: true });
  const compiled = run([
    "-p",
    "clean",
    "--runExternalCode",
    "--emitDeclarationOnly",
    "false",
    "--outDir",
    out,
  ]);
  assert.deepEqual(compiled.lines, []);
  assert.equal(compiled.status, 0, compiled.stderr);

  copyFileSync(
    path.join(fixture, "clean/locales.const.json"),
    path.join(out, "locales.const.json")
  );
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      'import { locales } from "./main.js"; console.log(JSON.stringify(locales));',
    ],
    { cwd: out, encoding: "utf-8" }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '["FR","BE"]\n');
});

test("narrows .jsonc imports, and comments never act as TypeScript directives", () => {
  // settings.jsonc has a `// @ts-expect-error` comment above a duplicate key; the key is still reported.
  assert.deepEqual(run(["-p", "jsonc", "--runExternalCode"]).lines, [
    `jsonc/main.ts(2,14): error TS2322: Type '"dark"' is not assignable to type '"light"'.`,
    "jsonc/main.ts(3,17): error TS2339: Property 'push' does not exist on type 'readonly [80, 120]'.",
    "jsonc/settings.jsonc(7,11): error TS1117: An object literal cannot have multiple properties with the same name.",
  ]);
});

test("emits .jsonc declarations where TypeScript looks for them (x.d.jsonc.ts)", () => {
  const out = path.join(outDir, "jsonc");
  run([
    "-p",
    "jsonc",
    "--runExternalCode",
    "--noEmit",
    "false",
    "--declaration",
    "--emitDeclarationOnly",
    "--outDir",
    out,
  ]);
  assert.match(
    readFileSync(path.join(out, "settings.d.jsonc.ts"), "utf-8"),
    /readonly rulers: readonly \[80, 120\];/u
  );
});
