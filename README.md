# json-const-content-mapper

> [!WARNING]
> The TypeScript team tightened extension validation after our pinned nightly, breaking the `.const.json` compound-extension workaround in `7.1.0-beta` ([upstream issue](https://github.com/microsoft/TypeScript/issues/64917)). I'd recommend using [motherload](https://github.com/colinhacks/motherload) with `.json5` files as the next-best workaround.

Import JSON with **literal types and readonly properties**, as if you wrote `as const`. Requires [TypeScript 7.1+ content mappers](https://devblogs.microsoft.com/typescript/announcing-typescript-7-1-beta/#content-mappers). No code generation or compiler patch needed.

Use your JSON data to define the allowed values:

```jsonc
// src/pricing.const.json
{ "plans": ["free", "pro", "team"] }
```

```ts
import pricing from "./pricing.const.json" with { type: "json" };

// Without mapper:
// { plans: string[] }

// With mapper:
// { readonly plans: readonly ["free", "pro", "team"] }
```

## Setup

Install the mapper:

```sh
npm install -D json-const-content-mapper
```

Register the file extension in `tsconfig.json`:

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "resolveJsonModule": true,
    // ...
  },
  "contentMappers": [
    { "package": "json-const-content-mapper", "extensions": [".const.json"] },
  ],
}
```

Allow TypeScript to run the mapper:

```sh
tsc --runExternalCode
```

In VS Code, content mappers run only in trusted workspaces.

## Choose files

Content mappers cannot register `.json` itself. Rename files to `*.const.json` to opt in. You can register other extensions ending in `.json`, such as `.schema.json` or `.locale.json`.

Because the file still ends in `.json`, runtimes and bundlers load it as normal JSON. Without the mapper (older TypeScript, tools that don't run content mappers, or no `--runExternalCode`), it type-checks as ordinary widened JSON.

## JSONC

Add `.jsonc` to `extensions` to narrow [JSONC](https://jsonc.org) files as well:

```jsonc
"contentMappers": [
  { "package": "json-const-content-mapper", "extensions": [".const.json", ".jsonc"] }
]
```

Files ending in `.jsonc` may contain `//` and `/* */` comments and trailing commas. The mapper requires strict JSON for other filenames. TypeScript lets you register `.jsonc` because it is not a built-in extension. Register `.const.jsonc` instead if you want to opt in per file.

The mapper ignores comments, including `// @ts-expect-error` and `// @ts-ignore`.

Most runtimes cannot import `.jsonc` files. Node rejects them, and bundlers need a plugin. If you read the file with a JSONC parser at runtime, import only its type:

```ts
import type settings from "./settings.jsonc";
type Settings = typeof settings;
```

For library publishing, see [Limitations](#limitations).

## Limitations

### Building with `tsc`

If you use `tsc` to generate JavaScript in an output directory, copy mapped JSON files to their matching output paths. TypeScript leaves the imports in the generated JavaScript but does not copy the JSON files.

Most bundlers include JSON data in their output without a copy step (e.g. Vite, esbuild, and Rollup with `@rollup/plugin-json`).

### Import the whole JSON value

Use `import config from "./config.const.json"`, then read `config.appLocales`. You cannot import a property with `import { appLocales }`. This restriction also applies with `moduleResolution: "bundler"`.

### Keep the JSON import attribute for Node.js

Node.js requires `with { type: "json" }` on JSON imports in ES modules. With this mapper, TypeScript does not warn if you omit it. Your code can pass type checking but fail when you run it in Node.js.

### Include JSON files in composite projects

If your project uses `composite: true`, add `"src/**/*.const.json"` to your existing `include` list. Adjust the pattern to match your files. Without it, TypeScript can report TS6307 because the imported JSON file is missing from the project's file list.

### Publishing a library with JSON imports

If your library's declarations reference `.const.json`, consumers need the mapper to retain the literal types. TypeScript emits `config.d.const.json.ts`, but looks for `config.const.d.json.ts`, so consumers cannot use the generated declaration as-is.

For `.jsonc`, TypeScript emits the expected filename, such as `settings.d.jsonc.ts`. Consumers can use that declaration without the mapper if they enable `allowArbitraryExtensions`.

## Diagnostics

For files other than `.jsonc`, the mapper requires RFC 8259 JSON. It reports invalid JSON as syntax errors and gives importers the type `any` to avoid cascading errors. If any file has a syntax error, `tsc` does not report type errors.

TypeScript reports duplicate keys as errors (TS1117).

<details>
<summary>Diagnostic codes</summary>

| Code             | Meaning                                           |
| ---------------- | ------------------------------------------------- |
| `json-const1001` | Unexpected token or character                     |
| `json-const1002` | Unexpected end of input                           |
| `json-const1003` | Trailing comma (strict JSON only)                 |
| `json-const1004` | Comment (strict JSON only)                        |
| `json-const1005` | Invalid number                                    |
| `json-const1006` | Invalid escape sequence                           |
| `json-const1007` | Unescaped control character in a string           |
| `json-const1008` | Unterminated string                               |
| `json-const1009` | Single-quoted or unquoted string or property name |
| `json-const1010` | Content after the JSON value                      |
| `json-const1011` | Unterminated `/* */` comment (JSONC)              |
| `json-const2001` | Unsupported `options` (this mapper takes none)    |

</details>

## Development

Development uses Node.js 24 and [Nub](https://nubjs.com/) with `nub.lock`.

```sh
nub install --frozen-lockfile
nub run test       # builds dist/, then runs unit, protocol, and end-to-end tests (real tsc)
nub run typecheck
```

For changes that need a release, run `nub run changeset` and commit the generated file with your code. See [release notes for contributors](docs/releasing.md).

Set `TS_CONTENT_MAPPER_DEBUG=1` when running `tsc` to log JSON-RPC traffic. Release a new version after mapper output changes. TypeScript caches results by `name@version` for `--incremental` and `--build`.

## Examples

- [Value lists](example/src/main.ts): derive a union from JSON values.
- [JSON Schema](example/src/schema.ts): infer a type with `json-schema-to-ts`.
- [OpenAPI](example/src/openapi.ts): constrain paths, methods, and parameter names from a spec.
- [Translations](example/src/messages.ts): require arguments from placeholders in message text.

The examples include deliberate type errors to show which mistakes TypeScript catches.

## Related projects

- [motherload](https://github.com/colinhacks/motherload)
