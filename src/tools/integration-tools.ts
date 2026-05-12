import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type ServerContext, resolveTeamId } from "../client";
import { jsonResult } from "../errors";
import { listIntegrationTools, runIntegrationTool } from "../integration-tools";
import { registerTool } from "../register-tool";

const teamIdSchema = z
  .string()
  .min(1)
  .optional()
  .describe("bundle.social team id. Optional when the organization has a single team or BUNDLESOCIAL_TEAM_ID is configured.");

export function registerIntegrationToolHelpers(server: McpServer, ctx: ServerContext): void {
  registerTool(
    server,
    "list_integration_tools",
    {
      title: "List integration helper tools",
      description:
        "List the read-only platform helper tools callable via trigger_integration_tool — e.g. fetch subreddit flairs, YouTube categories/playlists/regions, LinkedIn mentions, Instagram locations, Google Business categories, TikTok trending music. Each entry has a `method` id and the params it accepts. Use these to discover values the API needs (flair ids, category ids, mention URNs, …).",
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => jsonResult({ tools: listIntegrationTools() }),
  );

  registerTool(
    server,
    "trigger_integration_tool",
    {
      title: "Call an integration helper tool",
      description:
        'Call one of the platform helper tools (see list_integration_tools), e.g. method "reddit:flairs" with params {"subreddit":"r/test"}. Returns the raw result.',
      inputSchema: {
        method: z.string().min(1).describe('Tool method id, e.g. "reddit:flairs", "youtube:categories", "linkedin:mentions" (call list_integration_tools first).'),
        params: z.record(z.string(), z.unknown()).optional().describe("Parameters for the tool as a JSON object, e.g. {\"subreddit\":\"r/test\"}."),
        teamId: teamIdSchema,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ method, params, teamId }) => {
      const id = await resolveTeamId(ctx, teamId);
      return jsonResult(await runIntegrationTool(ctx.client, id, method, params ?? {}));
    },
  );
}
