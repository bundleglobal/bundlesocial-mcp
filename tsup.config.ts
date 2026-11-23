import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/lib.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  minify: true,
  sourcemap: true,
  dts: { entry: "src/lib.ts" },
  shims: false,
  // tsup preserves the `#!/usr/bin/env node` shebang from src/index.ts so the
  // published dist/index.js is directly executable as the `bundlesocial-mcp` bin
});
