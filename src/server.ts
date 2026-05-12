import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import pkg from "../package.json";
import { type ServerContext, DEFAULT_API_URL, createClient } from "./client";
import { registerAllTools } from "./tools";

export const VERSION: string = pkg.version;

export interface CreateServerOptions {
  apiKey: string;
  apiUrl?: string;
  /** Default team id (from BUNDLESOCIAL_TEAM_ID / --team-id). */
  defaultTeamId?: string;
}

/** Build an MCP server exposing the bundle.social tools. Transport-agnostic. */
export function createServer(options: CreateServerOptions): McpServer {
  const server = new McpServer(
    { name: "bundlesocial", version: VERSION },
    {
      capabilities: { tools: {} },
      instructions:
        "Tools for posting to and reading from 14+ social platforms via the bundle.social API. Start with list_integrations to see connected accounts and their ids. create_post / schedule_post target platforms by name (x, tiktok, instagram, youtube, facebook, threads, linkedin, pinterest, reddit, mastodon, discord, slack, gbp) or by integration id; put platform-required fields (Reddit `sr`, Pinterest `boardName`, TikTok `privacy`, YouTube `madeForKids`/`privacyStatus`) under `platformSettings` keyed by platform. Errors come back as { error: { code, message, details } } with isError: true.",
    },
  );

  const ctx: ServerContext = {
    client: createClient(options.apiKey, options.apiUrl ?? DEFAULT_API_URL),
    defaultTeamId: options.defaultTeamId,
  };
  registerAllTools(server, ctx);
  return server;
}
