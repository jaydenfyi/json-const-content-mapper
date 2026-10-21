import messages from "./messages.const.json" with { type: "json" };

export type MessageKey = keyof typeof messages; // "greeting" | "cart" | "plain"

// Pull the {placeholders} out of the literal message text.
type Placeholders<TText extends string> =
  TText extends `${string}{${infer TName}}${infer TRest}`
    ? TName | Placeholders<TRest>
    : never;

export type Args<TKey extends MessageKey> = Placeholders<
  (typeof messages)[TKey]
>;
// Args<"cart"> = "count" | "place", Args<"plain"> = never

export declare function t<TKey extends MessageKey>(
  key: TKey,
  args: Record<Args<TKey>, string>
): string;

export const a = t("cart", { count: "2", place: "Paris" });
export const b = t("plain", {}); // no placeholders, no args required

// Expected errors:
export const missingArg = t("cart", { count: "2" }); // "place" is missing
export const extraArg = t("greeting", { name: "Ada", title: "Dr" }); // "title" is not in "name"
