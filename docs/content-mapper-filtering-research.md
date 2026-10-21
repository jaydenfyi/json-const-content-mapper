# Content-mapper filtering: focused research

## Decision

**Defer general include/exclude globs for explicitly opted-in `.const.*` mappers until a concrete user need appears.** Filename registration already supplies a simple, compiler-owned selection boundary. Treat reduced inference and editor-safety limits as separate features, not as synonyms for excluding a file.

This recommendation is a proposal, not an ecosystem requirement. I inspected three native TypeScript content mappers. Their inspected option parsers expose no per-file include/exclude or configurable inference-size threshold. This is a bounded finding, not a claim about every mapper or every internal code path.

## Observations: actual TypeScript content mappers

### 1. `css-modules-content-mapper`

At revision `1fbe8c7`, [`openProject`](https://github.com/remcohaszing/css-modules-content-mapper/blob/1fbe8c77c697426170f3b8f512d49a2a7f7f6fc3/lib/content-mapper.js) reads only `localsConvention`. Its `transform` parses the supplied CSS, collects exported names, and returns `.cts` declarations. There is no filename filter, input-size guard, or in-file opt-out in that inspected implementation. Selector parsing failures omit affected properties; they do not delegate the file back to TypeScript. This is extension-selected mapping, not glob filtering.

### 2. `mdx-content-mapper`

At revision `c794ef8`, [`normalizeOptions`](https://github.com/remcohaszing/mdx-content-mapper/blob/c794ef8ad8ef76eab8d682e980e43b9832f933dd/lib/util/projects.js) accepts checking flags, Markdown extensions, plugin arrays, presets and provider settings. It accepts no include/exclude or size setting.

Its [`transform`](https://github.com/remcohaszing/mdx-content-mapper/blob/c794ef8ad8ef76eab8d682e980e43b9832f933dd/lib/requests/transform.js) demonstrates **semantic controls without excluding files**:

- `checkMdx` controls insertion of `// @ts-check` into generated JSX.
- `checkCodeBlocks` controls creation of supplemental virtual code for fenced examples.
- `mdExtensions` chooses Markdown versus MDX parsing; it does not remove files from mapper registration.
- On transformation failure, it returns a diagnostic, empty mappings and fallback JSX containing a component export. It does not return an empty module or native-file passthrough.

The inspected options and transform contain no built-in filename exclusion or size-based widening. Configurable third-party plugins were not audited.

### 3. Vize's native TypeScript content mapper

At revision `477cfcb`, the [mapper option parser](https://github.com/ubugeeei/vize/blob/477cfcb83ee19d5f69d13d980451275136af435b/crates/vize/src/commands/content_mapper/project.rs#L94-L150) recognizes only `optionsApi`; unknown mapper options receive diagnostics. Other Vue checks come from project configuration, as its [mapper guide](https://github.com/ubugeeei/vize/blob/477cfcb83ee19d5f69d13d980451275136af435b/docs/content/guide/content-mapper.md) explains.

Vize has genuine **in-file diagnostic controls**: `@vue-ignore`, `@vue-expect-error`, and block-scoped `@vue-skip`. The [implementation](https://github.com/ubugeeei/vize/blob/477cfcb83ee19d5f69d13d980451275136af435b/crates/vize_canon/src/batch/virtual_project/content_mapper_directives.rs#L24-L90) projects their target ranges into protocol diagnostic directives. These suppress diagnostics; they are not evidence that the compiler stops mapping or inferring the file.

Its [server](https://github.com/ubugeeei/vize/blob/477cfcb83ee19d5f69d13d980451275136af435b/crates/vize/src/commands/content_mapper.rs#L182-L252) rejects incoming protocol bodies over **64 MiB**, with an **8 KiB header** limit. This is transport hardening: oversized frames cause server failure, not graceful size-based inference fallback. Do not present it as a configurable large-source-file inference limit.

## Related tooling

- **MDX Rollup/Vite plugin:** its [official README](https://github.com/mdx-js/mdx/blob/main/packages/rollup/readme.md) exposes `include`/`exclude` picomatch patterns. These filter bundler transforms, not `mdx-content-mapper` requests.
- **CSS Modules Kit:** the inspected [Volar language plugin](https://github.com/mizdra/css-modules-kit/blob/382b0fbfe89c2e5ad1fea621419f115fb6392509/packages/ts-plugin/src/language-plugin.ts#L25-L47) checks `matchesPattern`. Nonmatching CSS gets a virtual-code object with the original snapshot and no mappings, explicitly to prevent tsserver treating CSS as TypeScript. This is a language-service-plugin example, not an implementation of the native content-mapper protocol.

Standalone CLI root globs likewise select discovery inputs; they do not establish that an imported file bypasses a compiler mapper.

## Applying this to our collection: proposals and alternatives

Existing [documentation](../README.md#choose-files) recommends `.const.json`/`.const.jsonc` registration; [the server](../src/server.ts) currently rejects options. A local compiler probe verified that top-level tsconfig `exclude` does not block imported files. Returning virtual `.json` widens types, while `.ts` plus `as const` narrows them on the pinned host.

1. **Keep explicit suffix opt-in first.** Leave large ordinary JSON unrenamed; narrow only files that need literal types. This requires no additional mapper configuration.
2. **If users cannot rename files, consider an explicit widening policy.** A pattern-selected JSON fallback can preserve useful native JSON shape rather than yielding `any`. Call it “widening,” not “bypass”: the file remains mapped. Define path base, normalization and cache/project identity before adding globs. JSONC needs separate normalization/validation investigation before a `.json` fallback is promised.
3. **Handle editor safety independently.** Measure representative large files before choosing any size diagnostic threshold. A diagnostic alone may warn without preventing expensive inference; specify whether exceeding it warns, fails, or deliberately widens. Do not silently change literal/readonly semantics at an arbitrary default threshold.
4. **Avoid empty output as an exclusion mechanism.** It discards the module's useful export contract. In-file directives are also a poor default for strict JSON, which cannot contain comments.

No implementation, dependencies, or specification changes were made. External implementations were inspected, not executed.
