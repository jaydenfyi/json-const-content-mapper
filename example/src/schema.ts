import type { FromSchema } from "json-schema-to-ts";

import userSchema from "./user.schema.const.json" with { type: "json" };

// No `as const` needed: the mapper already types the import as a deeply readonly literal,
// which is exactly what FromSchema expects. The resulting type is mutable, like a hand-written one.
export type User = FromSchema<typeof userSchema>;
// { id: number; name: string; role: "admin" | "editor" | "viewer"; tags: string[];
//   manager?: { id: number; name: string; ... } }

export const ok: User = { id: 1, name: "Ada", role: "admin", tags: ["dev"] };

// Expected errors:
export const badRole: User = { id: 1, name: "Ada", role: "owner", tags: [] }; // "owner" is not in the enum
export const missingTags: User = { id: 1, name: "Ada", role: "viewer" }; // tags is required
