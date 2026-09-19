import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  // Sourcemaps embed sourceContent and would fail the "@anaxer/schemas" dist grep gate.
  sourcemap: false,
  // Inline private workspace types so published .d.ts has no @anaxer/schemas imports.
  noExternal: [/^@anaxer\/schemas/],
  external: ["ws"],
});
