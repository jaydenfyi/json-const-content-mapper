import messages from "./messages.const.json" with { type: "json" };

export type MessageKey = keyof typeof messages; // "greeting" | "cart" | "plain"

// Pull the {placeholders} out of the literal message text.
type Placeholders<S extends string> =
  S extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholders<Rest> : never;

export type Args<K extends MessageKey> = Placeholders<(typeof messages)[K]>;
// Args<"cart"> = "count" | "place", Args<"plain"> = never

export declare function t<K extends MessageKey>(key: K, args: Record<Args<K>, string>): string;

export const a = t("cart", { count: "2", place: "Paris" });
export const b = t("plain", {}); // no placeholders, no args required

// Expected errors:
export const missingArg = t("cart", { count: "2" }); // "place" is missing
export const extraArg = t("greeting", { name: "Ada", title: "Dr" }); // "title" is not in "name"
