#!/usr/bin/env node
// Keeps server.json (the MCP registry manifest) on the package version. Runs in npm's `version` step,
// which semantic-release triggers before it commits the release.
import { readFileSync, writeFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const manifest = JSON.parse(readFileSync("server.json", "utf8"));
manifest.version = version;
for (const pkg of manifest.packages ?? []) pkg.version = version;
writeFileSync("server.json", `${JSON.stringify(manifest, null, 2)}\n`);
