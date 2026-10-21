import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";

export default defineConfig({
  env: core.env,
  extends: [core],
  // Fixtures are deliberately malformed input; linting them breaks what they test.
  ignorePatterns: [...core.ignorePatterns, "**/test/fixtures/**"],
  rules: {
    // Project style: named function declarations over arrow-function consts.
    "func-style": ["error", "declaration"],
  },
});
