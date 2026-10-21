import data from "./locales.const.json" with { type: "json" };
import plain from "./plain.json" with { type: "json" };
import bom from "./bom.const.json" with { type: "json" };
import "./duplicate.const.json" with { type: "json" };

type Locale = (typeof data.appLocales)[number];
export const ok: Locale = "FR";
export const notALocale: Locale = "DE";
data.appLocales.push("X");
export const one: 1 = data.nested.n;
export const negative: -2.5 = data.nested.neg;
export const nil: null = data.nested.nil;
export const widened: "FR" = plain.appLocales[0];
export const withBom: readonly ["with bom"] = bom;

// Known limitation: a native .json import without `with { type: "json" }` gets TS1543 under nodenext,
// but a mapped file does not. This line documents that; if TypeScript starts reporting it, update the README.
import withoutAttribute from "./locales.const.json";
export { withoutAttribute };
