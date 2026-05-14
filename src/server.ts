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
        "Tools for the bundle.social API: posting/scheduling to 14+ social platforms, comments, media uploads, analytics, team & integration management, and bulk/history imports (post-history, comment, CSV). Run check_setup first to verify the API key, org access and team. Use list_integrations to see connected accounts and their ids. create_post / schedule_post target platforms by name (x, tiktok, instagram, youtube, facebook, threads, linkedin, pinterest, reddit, mastodon, discord, slack, gbp) or by integration id; put platform-required fields (Reddit `sr`, Pinterest `boardName`, TikTok `privacy`, YouTube `madeForKids`/`privacyStatus`) under `platformSettings` keyed by platform — per-platform fields are documented at https://docs.bundle.social/api-reference/platform-parameters. Team-scoped tools take an optional `teamId` (resolved automatically when the org has one team or BUNDLESOCIAL_TEAM_ID is set). Errors come back as { error: { code, message, details } } with isError: true.",
    },
  );

  const ctx: ServerContext = {
    client: createClient(options.apiKey, options.apiUrl ?? DEFAULT_API_URL),
    defaultTeamId: options.defaultTeamId,
  };
  registerAllTools(server, ctx);
  return server;
}
