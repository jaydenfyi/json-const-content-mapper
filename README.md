# json-const-content-mapper

A [TypeScript 7.1+ content mapper](https://devblogs.microsoft.com/typescript/announcing-typescript-7-1-beta/#content-mappers)
that types JSON imports **as const**: deeply `readonly`, with literal types. This is what
[microsoft/TypeScript#32063](https://github.com/microsoft/TypeScript/issues/32063) asks for, with no codegen step and
no compiler patch.

```jsonc
// src/locales.const.json
{ "appLocales": ["FR", "BE"], "retries": 3 }
```

```ts
import config from "./locales.const.json" with { type: "json" };

config.appLocales; // readonly ["FR", "BE"]
config.retries;    // 3
type Locale = (typeof config.appLocales)[number]; // "FR" | "BE"
```

## What people use it for

Every case below is a request from [microsoft/TypeScript#32063](https://github.com/microsoft/TypeScript/issues/32063),
the issue this mapper answers.

**Keep a runtime list and its union in sync.** The original ask (@slorber): one JSON file lists the values, and the
type is derived from it, so the two can't drift. `type Locale = (typeof config.appLocales)[number]` instead of
repeating `"FR" | "BE"` in a `.d.json.ts` by hand (@djibarian), or leaving a block-category list unenforceable
(@mikeselander).

**JSON Schema → TypeScript type.** Mapped-type libraries need literal `type` and `required` values, so they can't
read a widened JSON import (@Hawkbat, @slifty with `ajv`'s `JSONSchemaType`, @ThomasAribart with
[`json-schema-to-ts`](https://github.com/ThomasAribart/json-schema-to-ts)). With the mapper the schema file is the
type:

```ts
import type { FromSchema } from "json-schema-to-ts";
import userSchema from "./user.schema.const.json" with { type: "json" };

export type User = FromSchema<typeof userSchema>; // no `as const` needed
```

See [`example/src/schema.ts`](example/src/schema.ts) for a working schema and its two expected errors.

**API documents → typed clients.** OpenAPI, Prismic model, or custom-element manifests, imported as-is and used to
parameterise a generator (@varanauskas with [`oatx`](https://github.com/varanauskas/oatx), @adlerfaulkner with
[standard-sdk](https://github.com/comake/standard-sdk-js), @willmartian, @ScreamZ). Widened imports are why @adlerfaulkner
hit ``Type 'string' is not assignable to type '"path" | "header" | "query" | "cookie"'``; literals make the spec
usable as a constraint:

```ts
import spec from "./petstore.const.json" with { type: "json" };
type Paths = typeof spec.paths;

export type Path = keyof Paths; // "/pets" | "/pets/{id}"
export type Method<P extends Path> = keyof Paths[P]; // "get" | "post"

declare function request<P extends Path, M extends Method<P>>(
  path: P,
  method: M,
  params: Partial<Record<ParamName<P, M>, string>>,
): Promise<unknown>;

request("/pet", "get", {}); // error: "/pet" is not one of the spec's paths
```

Full version, including `ParamName`, in [`example/src/openapi.ts`](example/src/openapi.ts).

**Infer types from the data instead of declaring them twice.** Static config and environment-variable key lists
(@Ustice), or a VS Code extension's `package.json` as the source of truth for its command and view names
(@spellitkit). Locale files go further: the message text yields the interpolation arguments (@daniellwdb).

```ts
import messages from "./messages.const.json" with { type: "json" };

type Placeholders<S extends string> =
  S extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholders<Rest> : never;
export type Args<K extends keyof typeof messages> = Placeholders<(typeof messages)[K]>;

t("cart", { count: "2" }); // error: "place" is missing
```

Full version in [`example/src/messages.ts`](example/src/messages.ts).

**Drop the codegen step.** People currently emit `.d.json.ts` files (@amannn, as Next.js does for next-intl), run a
CLI that writes a `.ts` per JSON file (@roninjin10, @jtannas' `json2const`), or patch `tsc` itself (@james-pre). A
content mapper needs none of that — but note the [limitations](#limitations): very large files are still expensive
to narrow, and this only covers files on disk, not remote JSON (@ClaudiuCeia imports schemas over HTTPS in Deno).

## Setup

```sh
nub add --save-dev json-const-content-mapper
```

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "resolveJsonModule": true
    // ...
  },
  "contentMappers": [
    { "package": "json-const-content-mapper", "extensions": [".const.json"] }
  ]
}
```

```sh
tsc --runExternalCode
```

In VS Code, content mappers run only in trusted workspaces.

### Build output

`tsc` does not copy mapped JSON files into `outDir`. Your build must copy the JSON assets that the emitted
JavaScript imports.

For `rootDir: "src"` and `outDir: "dist"` on macOS/Linux:

```sh
tsc --runExternalCode && cp src/locales.const.json dist/locales.const.json
```

Use your build tool's copy step for multiple files. Preserve paths relative to `rootDir`, including nested
directories. Bundler projects can use their existing JSON handling.

## Choose files

Content mappers cannot register `.json` itself. Rename files to `*.const.json` to opt in. You can register other
extensions ending in `.json`, such as `.schema.json` or `.locale.json`.

Because the file still ends in `.json`, runtimes and bundlers load it as normal JSON. Without the mapper (older
TypeScript, tools that don't run content mappers, or no `--runExternalCode`), it type-checks as ordinary widened JSON.

## JSONC

Add `.jsonc` to `extensions` to narrow [JSONC](https://jsonc.org) files as well:

```jsonc
"contentMappers": [
  { "package": "json-const-content-mapper", "extensions": [".const.json", ".jsonc"] }
]
```

Files ending in `.jsonc` may contain `//` and `/* */` comments and trailing commas. The mapper requires strict
JSON for other filenames. TypeScript lets you register `.jsonc` because it is not a built-in extension. Register
`.const.jsonc` instead if you want to opt in per file.

The mapper ignores comments, including `// @ts-expect-error` and `// @ts-ignore`.

Most runtimes cannot import `.jsonc` files. Node rejects them, and bundlers need a plugin. If you read the file
with a JSONC parser at runtime, import only its type:

```ts
import type settings from "./settings.jsonc";
type Settings = typeof settings;
```

For library publishing, see [Limitations](#limitations).

## Semantics

The file's type is exactly what `as const` would give the same literal in TypeScript:

| JSON | Type |
|---|---|
| `"FR"` | `"FR"` |
| `-2.5`, `true`, `null` | `-2.5`, `true`, `null` |
| `["FR", "BE"]` | `readonly ["FR", "BE"]` |
| `{ "a": 1 }` | `{ readonly a: 1 }` |

For files that do not end in `.jsonc`, the mapper requires RFC 8259 JSON. It reports invalid input and gives
importers the type `any` to avoid cascading errors.

TypeScript reports duplicate keys as errors (TS1117).

## Limitations

- **Default import only.** `import { appLocales } from "./x.const.json"` is an error. This matches Node's ESM JSON
  modules, but it's stricter than TypeScript's native JSON under `bundler` resolution.
- **A missing import attribute isn't caught.** Under `module: nodenext`, TypeScript reports TS1543 when a JSON import
  has no `with { type: "json" }`. It doesn't report this for mapped files, so add the attribute yourself.
- **Composite projects must list the files explicitly**, e.g. `"include": ["src", "src/**/*.const.json"]`, because
  wildcard `include` patterns don't match `.json` files (TS6307).
- **Publishing narrowed types:** `.const.json` consumers still need the mapper. `--declaration` emits
  `x.d.const.json.ts`, but TypeScript expects `x.const.d.json.ts`. For `.jsonc`, it emits `settings.d.jsonc.ts`.
  Consumers with `allowArbitraryExtensions` can use those `.jsonc` declarations without the mapper.
- `as const` on very large files is expensive to type-check. Only rename the files that need narrowing.

## Diagnostics

The mapper reports invalid JSON as syntax errors. If any file has a syntax error, `tsc` does not report type errors.

<details>
<summary>Diagnostic codes</summary>

| Code | Meaning |
|---|---|
| `json-const1001` | Unexpected token or character |
| `json-const1002` | Unexpected end of input |
| `json-const1003` | Trailing comma (strict JSON only) |
| `json-const1004` | Comment (strict JSON only) |
| `json-const1005` | Invalid number |
| `json-const1006` | Invalid escape sequence |
| `json-const1007` | Unescaped control character in a string |
| `json-const1008` | Unterminated string |
| `json-const1009` | Single-quoted or unquoted string or property name |
| `json-const1010` | Content after the JSON value |
| `json-const1011` | Unterminated `/* */` comment (JSONC) |
| `json-const2001` | Unsupported `options` (this mapper takes none) |

</details>

## Trying it in VS Code

[`example/`](example) is a ready-made workspace. It needs the TypeScript 7 extension
(`TypeScriptTeam.native-preview` 1.0.1 or later) and a trusted workspace. See its README.

## Development

Development uses [Nub](https://nubjs.com/) with `nub.lock`.

```sh
nub install --frozen-lockfile
nub run test       # builds dist/, then runs unit, protocol, and end-to-end tests (real tsc)
nub run typecheck
```

Release automation uses Knope change files and npm trusted publishing. See [Releasing](docs/releasing.md)
for change-file instructions and the one-time activation checklist. Publishing is disabled while the
repository is private and until explicitly enabled.

Set `TS_CONTENT_MAPPER_DEBUG=1` when running `tsc` to log the JSON-RPC traffic. Bump `version` whenever the output
changes: TypeScript uses `name@version` as the cache identity for `--incremental` and `--build`.
