import { defineConfig } from "tsup";
import { cpSync } from "node:fs";

export default defineConfig({
  entry: {
    "bin/mcpkit": "bin/mcpkit.ts",
  },
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
  onSuccess: async () => {
    cpSync("src/inspector/dashboard", "dist/dashboard", { recursive: true });
    cpSync("src/scaffolder/templates", "dist/templates", { recursive: true });
  },
});
