import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  // Fixtures are deliberately malformed input; formatting them breaks what they test.
  ignorePatterns: [...ultracite.ignorePatterns, "**/test/fixtures/**"],
});
