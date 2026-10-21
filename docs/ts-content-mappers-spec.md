# ts-content-mappers: collection spec

Status: proposed implementation spec. Only the JSON mapper exists today. Follow the stage prerequisites below. Implement the catalogue in separate releases.

## Goal

Give TypeScript types and diagnostics for files that a project already maintains, without a separate declaration-generation command.

The root becomes a private `ts-content-mappers` Nub workspace collection. Each mapper remains an independently installable package. Keep the existing `json-const-content-mapper` public name.

New public names use the proposed `@ts-content-mappers/*` scope. Check ownership before publishing. Package identifiers below describe workspace responsibilities.

## Package catalogue

| Package | Recommended extensions | TypeScript view | Release status |
| --- | --- | --- | --- |
| `json-const` | `.const.json`, `.jsonc` | Literal values and readonly objects/tuples | Existing. Preserve compatibility |
| `yaml` | `.const.yaml`, `.const.yml` | Literal values and readonly objects/tuples | Next release |
| `frontmatter` | `.content.md` | Literal metadata and a `string` body | Next after YAML |
| `toml` | `.const.toml` | Typed configuration, including explicit date/integer rules | Follow-on |
| `csv` | `.const.csv`, `.const.tsv` | Readonly tuples of records with string cells | Follow-on |
| `json-schema` | `.schema.json` | Types for data described by a schema | Prototype before committing a package |
| `openapi` | `.openapi.yaml`, `.openapi.yml`, `.openapi.json` | API paths, components, and operations types | Prototype before release |
| `graphql` | `.operation.graphql` | Operation result and variables types | Depends on cross-file tracking proof |
| `i18n` | `.messages.json` | Message keys and argument types | Prototype before release |
| `markdown-check` | `.examples.md` | Typechecking for opted-in TypeScript fences | Prototype before release |

The table recommends registrations. Consumers select extensions in `contentMappers`. Consumers may select ordinary YAML, TOML, CSV, or Markdown extensions for broader coverage.

One mapper owns each file. For example, the OpenAPI mapper parses YAML itself through a shared parser helper. TypeScript does not run a YAML-to-OpenAPI mapper pipeline.

## Common contract

### Compilation and runtime

- Target TypeScript 7.1 content mappers and Node 22 or newer. Pin the compiler used by integration tests.
- Ship compiled JavaScript. Keep Node as the mapper executable and test runner.
- Keep transformations deterministic for the input content and declared project configuration.
- Run no user code from documents. Fetch no remote schemas or references during compiler/editor requests.
- Keep runtime loading separate. A content mapper supplies TypeScript's view, not a runtime loader or asset-copy step.
- Document `import type` for contracts. For values, demonstrate a runtime parser with matching semantics and exported shape.
- Document copying JSON assets when applications emit JavaScript with `tsc` and `outDir`.
- Bump each affected mapper version when its virtual output or diagnostics change. The compiler uses mapper identity for caching.

### Diagnostics and mappings

Keep UTF-16 positions. Give each package its own diagnostic source and stable codes. Validate its options during project opening.

Return a source diagnostic for invalid input or an unsupported construct. An error fallback must also carry an error diagnostic. Unsupported schemas must not appear successful through a silent `any` fallback.

Use verbatim mappings only for unchanged source text. Generated types require atomic mappings where the parser provides trustworthy source ranges. Do not fabricate navigation for generators that discard those ranges.

Keep parser/compiler messages specific. Remove document comments from generated executable syntax unless the package exists to check embedded TypeScript.

### Cross-file dependencies

Before any package reads external references or configured files, prove that the compiler tracks their changes and deletions.

The proof must cover an unchanged entry document whose referenced file changes during watch mode and an editor session. Include unsaved editor buffers, transitive references, retargeting, and file creation/deletion/rename. Reading through Node's filesystem API alone does not establish compiler invalidation.

Check dependency-watching and configuration-identity mechanisms against the pinned host protocol. The current local protocol types include only the fields used by JSON. Do not assume supplemental virtual outputs register input dependencies.

Use supported host mechanisms or TypeScript-visible imports after checking their behavior. Do not invent protocol fields. Until this proof passes, support only self-contained documents with internal references, or keep the package experimental.

Resolve permitted local references relative to their owning document. Diagnose missing references and cycles that the selected compiler cannot represent. Keep remote reference resolution disabled. Do not silently use stale results after a dependency fails.

## Workspace and implementation structure

Use a private root with mapper members under `packages/` and private consumer examples under `examples/`. Declare both groups as workspaces and keep one root `nub.lock`. Preserve resolved versions when consolidating the existing lockfiles.

Keep format-neutral shared source under `internal/`. Share protocol framing, request validation, lifecycle handling, and the compiler integration harness when the second mapper needs them.

Keep parser adapters in the format workspace that declares their dependencies. Frontmatter reuses the YAML adapter through a relative source import. Both published packages declare `yaml`, because each ships code that imports it. Share the dependency-free literal-type emitter through `internal/`.

When an adapter first needs an asynchronous compiler, make the shared server await transform results before encoding responses. Keep responses associated with their request IDs. Preserve lifecycle ordering before adding request concurrency.

Compile shared source into each mapper's own distribution using the existing `tsc` build. Use relative source imports, a repository-wide `rootDir`, and a package-local `outDir`.

This produces nested output: a package entry lives under `dist/packages/<mapper>/src/`, with helpers under `dist/internal/`. Update each mapper's executable path and publish its full local `dist`. Accept the nesting to avoid a new bundler or copy pipeline.

A private workspace dependency that resolves only inside the repository is not a valid published runtime dependency. Prove package independence with packed-tarball tests. Preserve the JSON mapper's zero-runtime-dependency distribution.

Keep the host compiler separate from generator implementation dependencies. Some generators require an older TypeScript AST/printer package. Resolve that compatible dependency inside the affected mapper rather than replacing the TypeScript 7.1 test host.

Do not publish a general mapper SDK or an all-in-one dependency bundle in the initial release.

## Package specifications

### 1. JSON const

**Use:** derive unions, literal settings, and readonly structures from JSON configuration and catalogues.

**Contract:** preserve the existing default export, JSONC behavior, diagnostic codes, and extension configuration.

**Implementation:** retain the strict JSON validator and verbatim mapping strategy. Move the package without changing its compiler-facing behavior.

**Acceptance:** the existing tests pass after migration. The packed package works outside the workspace with no sibling source directories. Keep the compile-copy-run test and existing declaration limitations documented.

### 2. YAML

**Use:** typed navigation, localization catalogues, shared configuration, and small static datasets.

**Contract:** one default export with literal scalars and deeply readonly objects/tuples. Start with one YAML 1.2 core-schema document and JSON-compatible values.

**Implementation:** use `yaml` and its document AST. Read parser errors and node ranges before converting values. Emit explicit type declarations from the parsed values. Quote property names and strings through a serializer, never source interpolation.

Support string keys, finite numbers, booleans, null, arrays, and objects. Support flow collections and block strings. Reject aliases, merge keys, custom tags, non-string keys, duplicate keys, and multiple documents in the first release. Configure alias expansion limits as a second safeguard.

Empty YAML represents null. Emit a valid null declaration rather than applying an invalid top-level const assertion. Preserve YAML 1.2 interpretation: an unquoted `yes` is a string.

**Runtime:** the example parses the file with the same `yaml` schema and options. The mapper does not enable native YAML imports in Node.

**Acceptance:** prove literal inference, readonly tuples, escaped strings, null roots, invalid syntax locations, unsupported constructs, BOM/CRLF offsets, and non-ASCII mappings. Test runtime value agreement and declaration consumption.

### 3. Markdown frontmatter

**Use:** typed article metadata, documentation navigation, content labels, and publishing flags.

**Contract:** default export `{ readonly frontmatter: Metadata; readonly body: string }`. Metadata uses the YAML mapper's supported value rules. Body text remains `string`, not a potentially huge literal type.

Recognize a YAML frontmatter block only at the beginning of the file, after an optional BOM. Opening and closing delimiters are lines containing `---`. Without a block, metadata is an empty object and the body is the original text. An opening delimiter without a closing delimiter is an error.

**Implementation:** use a small line-based delimiter scanner and the shared YAML parser helper. Treat an empty block as an empty metadata object. Require a mapping for nonempty metadata. Translate YAML diagnostic positions by the block's source offset. Preserve body bytes, including line endings, after the closing delimiter line.

Keep executable frontmatter engines disabled. JavaScript, CoffeeScript, custom tags, and additional frontmatter syntaxes are outside the first release.

**Runtime:** demonstrate a parser that returns the same `{ frontmatter, body }` shape. Document that framework loaders may expose a different shape.

**Acceptance:** cover absent/empty metadata, nested values, an unterminated block, non-mapping metadata, BOM/CRLF offsets, and fenced code containing delimiter-like text. Verify body content and declaration output.

Metadata-schema validation is a later feature. It must identify an explicit schema and satisfy the cross-file dependency gate.

### 4. TOML

**Use:** application settings, tool metadata, and configuration shared with Rust or Python projects.

**Contract:** default export with readonly properties and literal values where the parser preserves them. Date/time objects widen to `Date`. Readonly properties do not prevent mutation through Date methods.

**Implementation candidate:** `smol-toml`, with legacy Date values enabled and integers parsed as BigInt when needed for precision. Emit bigint literal types for those values. Emit `number` for TOML's non-finite numbers, because TypeScript has no corresponding numeric literal types.

Use the parser for tables, dotted keys, arrays of tables, and duplicate-key checks. Do not reinterpret dates as strings or large integers as imprecise numbers.

**Acceptance:** prove runtime agreement for date/time forms, large integers, non-finite floats, dotted keys, and arrays of tables. Record the supported TOML specification version from the selected parser release. Check parser error locations before committing to fine-grained mappings.

### 5. CSV and TSV

**Use:** small lookup tables, identifiers, supported regions, and reference catalogues.

**Contract:** one readonly tuple of readonly records. The first record supplies column names. Keep cell values as literal strings, including leading zeros and empty cells.

**Implementation:** use `csv-parse/sync`. Choose comma or tab from the registered filename suffix. Disable implicit casting and trimming. Validate unique, nonempty headers and consistent record widths before creating objects. Handle dangerous property names without prototype mutation.

Support quoted delimiters, embedded newlines, BOMs, and escaped quotes. Ignore blank records outside quoted fields. Reject an empty file with no header. A header-only file produces an empty tuple.

**Acceptance:** prove string preservation, malformed quoting diagnostics, duplicate headers, inconsistent widths, CRLF, and embedded newlines. Convert byte-based parser positions to UTF-16 before reporting them. Keep large-file use opt-in and benchmark tuple growth.

### 6. JSON Schema

**Use:** types for configuration contracts, form data, events, and API payloads.

**Contract:** a dedicated mapper, if justified, exports `Value`, the type of data described by the root schema. It does not export an instance of that data. Consumers use type-only imports.

**First action:** test the existing JSON mapper with `json-schema-to-ts` and `FromSchema<typeof schema>`. Prefer this documented recipe when it satisfies the use case. Record its documented recursion limits and its union approximation of `oneOf`.

Prototype a dedicated adapter only for demonstrated gaps such as recursive definitions, generated type names, performance, or diagnostics. Evaluate `json-schema-to-typescript` through its in-memory `compile` function. Supply editor-provided content rather than rereading the entry document through `compileFromFile`.

The prototype must name its tested dialect and keyword subset. A `$schema` value does not prove that the generator implements that dialect. Cover objects, required properties, arrays, literals, unions, and internal references before expanding.

Diagnose unsupported structural keywords. Document constraints that TypeScript cannot enforce, such as numeric bounds and string patterns. Runtime validation remains separate.

External references require the cross-file gate. Disable filesystem/network resolvers for the self-contained MVP. Reject custom TypeScript snippets such as `tsType` and executable resolver hooks.

**Acceptance:** compare the recipe and adapter on the same fixtures. Check nullable values, optional properties, recursive definitions, unsupported keywords, and emitted declarations. Record cold/warm transform time and compiler memory for small and larger schemas. Publish a package only if the comparison establishes a concrete benefit.

### 7. OpenAPI

**Use:** typed clients, request handlers, mocks, and response fixtures.

**Contract:** type-only exports for `paths`, `components`, and `operations`, following the selected generator's established output. The package generates no HTTP client or runtime validator.

**Implementation candidate:** call `openapi-typescript` with an in-memory object and print its returned AST through `astToString`. Use supplied document content, not a URL input that rereads the file. YAML input uses the same restricted parser helper as the YAML package.

Start with OpenAPI 3.1 and a self-contained document. The generator also documents 3.0 support, which can follow after fixtures establish compatibility.

Preserve established generator behavior rather than introducing custom naming and transformation hooks. Supply explicit resolver configuration, without implicit project-config discovery. Check resolver behavior to prohibit network and external file reads in the MVP. Local external references remain gated on compiler/editor invalidation.

The prototype must resolve the generator's TypeScript AST/printer requirements alongside the native TypeScript 7.1 host. Leave generator output unmapped until a tested mapping strategy establishes source locations.

**Acceptance:** typecheck one client or handler example. Wrong paths, parameters, request bodies, and response shapes must fail. Test internal references, missing references, cyclic schemas, a larger API document, and declaration consumption. Establish diagnostic mapping limits before promising schema navigation.

### 8. GraphQL operations

**Use:** result and variables types for a checked query or mutation.

**Contract proposal:** one named operation per file, with exported `Result` and `Variables` types. Fragments may appear in the same file. A runtime DocumentNode export is outside the initial contract.

**Implementation candidates:** `graphql` for parsing and validation, plus established GraphQL Code Generator plugins for type generation. Declare the local schema source in mapper project options. Typecheck operations against that schema.

This package cannot ship before configured-schema updates pass the cross-file gate. Keep remote introspection and external fragment imports outside the first release.

**Acceptance:** check variables, nullability, selections, fragments, invalid fields, schema changes, and schema deletion. Prove agreement with a runtime GraphQL parser. Select custom-scalar mappings before promising types beyond the built-in scalars.

### 9. Localization messages

**Use:** checked message keys and formatting arguments for ICU-style catalogues.

**Contract proposal:** default export of the readonly catalogue plus an exported `MessageArgs` type indexed by message key. Start with a flat object of message strings.

**Implementation candidate:** `@formatjs/icu-messageformat-parser`. Parse messages rather than searching them with regular expressions. Derive named arguments and numeric plural arguments. Treat a message's referenced arguments as required, including arguments used in branches.

Define accepted formatter value types in the contract. Keep rich-text tags and custom formatters outside the first release. Diagnose unsupported syntax rather than produce misleading argument types.

Cross-locale key and placeholder parity is a separate feature. It requires an explicit reference catalogue and the cross-file gate.

**Acceptance:** check missing keys, missing arguments, wrong numeric arguments, nested plurals, escaped braces, invalid ICU syntax, and source offsets within JSON strings. Prove that the documented runtime formatter accepts the inferred argument shapes.

### 10. Markdown code checking

**Use:** compiler-checked examples in documentation without executing those examples.

**Contract proposal:** check only fenced blocks marked `ts check`. Combine them into one virtual TypeScript module in source order. Checked blocks in a file share context. Other fences and prose do not participate.

**Implementation candidate:** a maintained Markdown AST parser. Extract opted-in blocks and translate their positions into source mappings. Preserve TypeScript comments, including expected-error directives. Emit no rendered Markdown or runtime module.

Support top-level imports in checked blocks. Document shared context so repeated declarations produce understandable errors. Independent per-block module contexts require a separate prototype of supported host capabilities.

**Acceptance:** map a type error into the correct fence with CRLF, indentation, and non-ASCII text. Check imports, shared declarations, expected errors, and ignored fences. Check that the examples never execute. Keep this extension distinct from frontmatter mapping.

## Release checks

Each new package must complete this path before release:

1. Parse supported and rejected fixtures through the public transform.
2. Check inferred types and diagnostics with the pinned real compiler under NodeNext and bundler resolution.
3. Exercise the editor protocol for mappings and any external dependencies the package uses.
4. Pack the mapper. Install it into a clean project outside the workspace.
5. Test runtime-parser agreement for value packages, or type-only consumption for contract packages.
6. Check declaration consumption without the mapper. Document failures, especially compound JSON extension resolution.
7. Record transform time, typechecking cost, and memory for representative input sizes. Set a measured release budget before claiming large-file support.
8. Run frozen Nub installs and the affected package tests. Re-run the compiler compatibility suite on TypeScript upgrades.

Keep nesting, alias expansion, parser input limits, and reference traversal bounded. Choose limits from measured fixtures and document them. Avoid source maps that turn missing range information into invented precision.

## Implementation order

| Stage | Deliverable | Genuine prerequisite |
| --- | --- | --- |
| 1 | Private workspace root and unchanged, independently packed JSON package | None |
| 2 | YAML mapper and only the shared infrastructure it needs | Stage 1 |
| 3 | Frontmatter mapper and runtime-shape example | Stage 2's YAML helper |
| 4 | TOML and CSV packages, implemented independently | Stage 1 and the value-type emitter |
| 5 | JSON Schema recipe comparison and OpenAPI prototype | Can start against the current package |
| 6 | Supported schema/OpenAPI releases | Their prototypes and cross-file proof for any external references |
| 7 | GraphQL, i18n, and Markdown-check prototypes | An explicit consumer use case. Cross-file proof where required |

The first implementation batch is stages 1 and 2. The catalogue defines follow-on contracts, not a commitment to release ten packages together.

Keep framework component mappers, MDX rendering, generated clients, filesystem asset copying, and a public mapper SDK outside this collection's initial scope.

## Evidence and remaining decisions

The existing package verifies JSON narrowing, JSONC comments, compiler diagnostics, declaration behavior, and the asset-copy requirement. These checks do not establish support for the other formats.

A prior smoke check found TS1355 for top-level `null` in the current JSON output. Keep its regression fix separate from the behavior-preserving workspace migration.

Check exact parser/compiler versions during each package's prototype. Candidate library APIs and dialect support are not a compatibility promise until the integration tests pass.

Primary references:

- [TypeScript 7.1 content mappers](https://devblogs.microsoft.com/typescript/announcing-typescript-7-1-beta/#content-mappers)
- [Content mapper protocol](https://github.com/microsoft/typescript-go/pull/4712)
- [YAML document parsing](https://github.com/eemeli/yaml/blob/main/docs/04_documents.md)
- [YAML source ranges](https://github.com/eemeli/yaml/blob/main/docs/05_content_nodes.md)
- [Smol TOML value types and options](https://github.com/squirrelchat/smol-toml)
- [CSV parser](https://csv.js.org/parse/)
- [JSON Schema inference and limitations](https://github.com/ThomasAribart/json-schema-to-ts)
- [JSON Schema compiler API and options](https://github.com/bcherny/json-schema-to-typescript)
- [Schema reference resolver controls](https://github.com/APIDevTools/json-schema-ref-parser/blob/main/docs/options.md)
- [OpenAPI in-memory API](https://openapi-ts.dev/node)
- [OpenAPI generator requirements](https://github.com/openapi-ts/openapi-typescript/blob/main/packages/openapi-typescript/package.json)
