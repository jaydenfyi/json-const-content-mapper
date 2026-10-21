import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";

export default defineConfig({
  env: core.env,
  extends: [core],
  // Fixtures are deliberately malformed input; linting them breaks what they test.
  ignorePatterns: [...core.ignorePatterns, "**/test/fixtures/**"],
  overrides: [
    {
      // Trailing comments are the notation in the examples (expected errors, inferred
      // types) and the sanity markers in the test tables.
      files: ["example/**", "test/**"],
      rules: {
        "no-inline-comments": "off",
      },
    },
  ],
  rules: {
    // Project style: named function declarations over arrow-function consts.
    "func-style": ["error", "declaration"],
    // A for-loop afterthought is unambiguous; the statement form is handled per file.
    "no-plusplus": ["error", { allowForLoopAfterthoughts: true }],
  },
});
