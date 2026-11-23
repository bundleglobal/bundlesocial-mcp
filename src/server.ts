import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import pkg from "../package.json";
import { type ServerContext, type ServerMode, DEFAULT_API_URL, createClient } from "./client";
import { registerAllTools } from "./tools";

export const VERSION: string = pkg.version;

export interface CreateServerOptions {
  apiKey: string;
  apiUrl?: string;
  /** Default team id (from BUNDLESOCIAL_TEAM_ID / --team-id). */
  defaultTeamId?: string;
  /** "hosted" refuses local file paths and fetches CSV URLs through a public-only guard. Default "stdio". */
  mode?: ServerMode;
  /** Sent to the API as `x-bundle-client`. Default `mcp/<version>` (`mcp-hosted/<version>` when hosted). */
  clientId?: string;
  /** Register only tools marked `readOnlyHint` (a read-only OAuth connection). */
  readOnly?: boolean;
}

// Drops every tool that isn't marked read-only; the API enforces the same rule.
function readOnlyView(server: McpServer): McpServer {
  return new Proxy(server, {
    get(target, property, receiver) {
      if (property === "registerTool") {
        const register = target.registerTool.bind(target) as (...args: unknown[]) => unknown;
        return (name: string, config: { annotations?: { readOnlyHint?: boolean } }, handler: unknown) =>
          config?.annotations?.readOnlyHint ? register(name, config, handler) : undefined;
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

const INSTRUCTIONS =
  "Tools for the bundle.social API: posting and scheduling to 14+ social platforms, comments, media uploads, analytics, team and integration management, and bulk/history imports (post history, comments, CSV). " +
  "check_setup reports whether the credentials, organization access and team resolution work. list_integrations returns connected accounts and their ids. " +
  "create_post / schedule_post target platforms by name (x, tiktok, instagram, youtube, facebook, threads, linkedin, pinterest, reddit, mastodon, discord, slack, gbp) or by integration id; platform-required fields (Reddit `sr`, Pinterest `boardName`, TikTok `privacy`, YouTube `madeForKids`/`privacyStatus`) go under `platformSettings` keyed by platform. " +
  "describe_platform returns the exact per-platform `data.<PLATFORM>` field schema for posts and comments; the same fields are documented at https://docs.bundle.social/api-reference/platform-parameters. " +
  "Team-scoped tools take an optional `teamId` (a team id or exact team name), resolved automatically when the organization has one team or a default team is configured; an organization may have many teams, one per client. " +
  "Errors come back as { error: { code, message, details } } with isError: true.";

const HOSTED_NOTE =
  " This server runs remotely and cannot read local file paths: media and CSV sources must be public https:// URLs. To send a file from the user's machine, a client with a shell can call init_large_upload, PUT the bytes to the returned url (for example with curl --upload-file), then call finalize_large_upload.";

/** Build an MCP server exposing the bundle.social tools. Transport-agnostic. */
export function createServer(options: CreateServerOptions): McpServer {
  const mode: ServerMode = options.mode ?? "stdio";
  const server = new McpServer(
    { name: "bundlesocial", version: VERSION },
    {
      capabilities: { tools: {} },
      instructions: mode === "hosted" ? INSTRUCTIONS + HOSTED_NOTE : INSTRUCTIONS,
    },
  );

  const clientId = options.clientId ?? `${mode === "hosted" ? "mcp-hosted" : "mcp"}/${VERSION}`;
  const ctx: ServerContext = {
    client: createClient(options.apiKey, options.apiUrl ?? DEFAULT_API_URL, clientId),
    mode,
    defaultTeamId: options.defaultTeamId,
  };
  registerAllTools(options.readOnly ? readOnlyView(server) : server, ctx);
  return server;
}
