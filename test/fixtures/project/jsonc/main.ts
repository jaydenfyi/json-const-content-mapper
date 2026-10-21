import settings from "./settings.jsonc" with { type: "json" };
export const theme: "light" = settings.theme;
settings.rulers.push(1);
