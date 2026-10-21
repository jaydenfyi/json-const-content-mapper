import { SpanMapKind } from "./protocol.ts";
import type { SpanMapping, TransformResult } from "./protocol.ts";
import { validateJson } from "./validate.ts";

// The parentheses matter: TypeScript does not allow a line break before `as`, and JSON files usually end
// with a newline. An anonymous default export keeps hovers free of internal names: importers see
// `(property) default`, much like the `(property) exports` of a native JSON import.
export const prefix = "export default (";
export const suffix = ") as const;\n";

/** Used for invalid JSON, so that importers see `any` instead of a cascade of errors. */
export const fallbackText = "export default undefined as any;\n";

/**
 * Maps a JSON file to a TypeScript module whose default export is its content `as const`.
 * Files ending in `.jsonc` are parsed as JSONC; everything else is strict JSON.
 */
export function transform(fileName: string, content: string): TransformResult {
  const bomLength = content.charCodeAt(0) === 0xfe_ff ? 1 : 0;
  const json = content.slice(bomLength);
  const result = validateJson(json, {
    jsonc: fileName.toLowerCase().endsWith(".jsonc"),
  });
  if (result.error) {
    return {
      diagnostics: [{ ...result.error, start: result.error.start + bomLength }],
      extension: ".ts",
      text: fallbackText,
    };
  }

  // JSONC comments are blanked to spaces (keeping line breaks, so positions don't move) and left unmapped.
  // Kept verbatim, they would act as TypeScript directives such as `// @ts-expect-error`.
  let body = "";
  const mappings: SpanMapping[] = [];
  function appendJson(start: number, end: number): void {
    if (end > start) {
      mappings.push([
        prefix.length + start,
        end - start,
        bomLength + start,
        end - start,
        SpanMapKind.Verbatim,
      ]);
    }
    body += json.slice(start, end);
  }
  let cursor = 0;
  for (const [start, end] of result.comments) {
    appendJson(cursor, start);
    body += json.slice(start, end).replaceAll(/[^\r\n]/g, " ");
    cursor = end;
  }
  appendJson(cursor, json.length);
  return { extension: ".ts", mappings, text: prefix + body + suffix };
}
