# Example workspace

A workspace for trying json-const-content-mapper in VS Code. It's separate from the package itself and isn't published.

```sh
nub run --cwd .. build     # build the mapper's dist/
nub install                # installs the local mapper from .. and TypeScript 7.1
nub run typecheck          # tsc --runExternalCode: shows the expected errors in src/
```

Then open this folder (not the repository root) in VS Code with the TypeScript 7 extension (`TypeScriptTeam.native-preview` 1.0.1 or later, which needs VS Code 1.126 or later).

1. **Trust the workspace.** If the title bar says _Restricted Mode_, run **Workspaces: Manage Workspace Trust** and trust this folder. Content mappers never run in untrusted workspaces.
2. **Use the workspace TypeScript.** The extension bundles TypeScript 7.0, which has no content mappers. Accept the "This workspace has a TypeScript 7 tsdk configured" prompt, or run **Select TypeScript Version...** and choose **Use Workspace Version** (7.1).
3. **Check it worked.** In the _TypeScript 7_ output channel, the first line should say `Resolved to …/example/node_modules/…`, not `…/extensions/typescriptteam.native-preview-…/lib/tsc`. If you see `unknown method 'custom/setContentMapperContributions'`, the bundled 7.0 server is still running.

## Schema → type inference

`src/schema.ts` shows the payoff with [`json-schema-to-ts`](https://github.com/ThomasAribart/json-schema-to-ts):

```ts
import type { FromSchema } from "json-schema-to-ts";
import userSchema from "./user.schema.const.json" with { type: "json" };

export type User = FromSchema<typeof userSchema>;
```

Normally this needs `as const` on a JS literal to keep the schema's literals (`"enum"` values, `required` names). Here the `.const.json` import is already a deeply readonly literal type, so the schema file itself is the source of truth and a schema edit immediately changes `User`.

Other files, each ending with one or two deliberate errors:

| File | Shows |
| --- | --- |
| `src/main.ts` | a value list and its union, plus deep readonly |
| `src/schema.ts` | JSON Schema → `FromSchema` type |
| `src/openapi.ts` | OpenAPI paths, methods and parameter names as literal constraints |
| `src/messages.ts` | locale message text → typed interpolation arguments |
