#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer, VERSION } from "./server";
import { DASHBOARD_API_KEYS_URL } from "./client";

/** Read a `--flag value` pair from argv (CLI overrides for the env vars). */
function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1 && index + 1 < process.argv.length) return process.argv[index + 1];
  const inline = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return inline ? inline.slice(`--${name}=`.length) : undefined;
}

function log(message: string): void {
  // stdio transport owns stdout — all logging must go to stderr.
  process.stderr.write(`bundlesocial-mcp: ${message}\n`);
}

async function main(): Promise<void> {
  if (process.argv.includes("--version") || process.argv.includes("-v")) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    process.stdout.write(
      `bundlesocial-mcp ${VERSION} — Model Context Protocol server for the bundle.social API.\n\n` +
        `Usage: bundlesocial-mcp [--api-key <key>] [--api-url <url>] [--team-id <id>]\n\n` +
        `Reads BUNDLESOCIAL_API_KEY (required), BUNDLESOCIAL_API_URL and BUNDLESOCIAL_TEAM_ID from the environment;\n` +
        `the flags above override them. Communicates over stdio (MCP). Create an API key at ${DASHBOARD_API_KEYS_URL}\n`,
    );
    return;
  }

  const apiKey = readFlag("api-key") ?? process.env.BUNDLESOCIAL_API_KEY;
  if (!apiKey) {
    log(`missing API key. Set BUNDLESOCIAL_API_KEY (or pass --api-key). Create one at ${DASHBOARD_API_KEYS_URL}`);
    process.exit(1);
  }

  const server = createServer({
    apiKey,
    apiUrl: readFlag("api-url") ?? process.env.BUNDLESOCIAL_API_URL,
    defaultTeamId: readFlag("team-id") ?? process.env.BUNDLESOCIAL_TEAM_ID,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("running on stdio");

  const shutdown = () => {
    void server.close().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  log(`fatal: ${(error as Error)?.stack ?? error}`);
  process.exit(1);
});
