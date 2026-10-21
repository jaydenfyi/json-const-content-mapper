import locales from "./locales.const.json" with { type: "json" };
import settings from "./settings.jsonc" with { type: "json" };

// Hover these: the types are literal and deeply readonly.
type Locale = (typeof locales.appLocales)[number]; // "FR" | "BE"
export const { retries } = locales; // 3
export const { theme } = settings; // "dark"

// Expected errors:
export const notALocale: Locale = "DE"; // "DE" is not assignable to "BE" | "FR"
locales.appLocales.push("NL"); // push does not exist on a readonly tuple
export const light: "light" = settings.theme; // "dark" is not assignable to "light"

// Try: go to definition on `appLocales` or `theme`, rename `retries`, or completions after `locales.`
