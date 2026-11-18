import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type ServerContext, resolveTeamId } from "../client";
import { jsonResult } from "../errors";
import { TIKTOK_AUTHORIZATION_DAYS, listIntegrationTools, runIntegrationTool, runTiktokAdAuthorization } from "../integration-tools";
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
        "List the read-only platform helper tools callable via trigger_integration_tool — e.g. fetch subreddit flairs, YouTube categories/playlists/regions, LinkedIn mentions, Instagram locations, Google Business categories, TikTok trending music, the Spark Ads code of a TikTok post. Each entry has a `method` id and the params it accepts. Use these to discover values the API needs (flair ids, category ids, mention URNs, …).",
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
        'Call one of the read-only platform helper tools (see list_integration_tools), e.g. method "reddit:flairs" with params {"subreddit":"r/test"}. Returns the raw result.',
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

  registerTool(
    server,
    "manage_tiktok_ad_authorization",
    {
      title: "Manage TikTok Spark Ads authorization",
      description:
        'Turn ad authorization of a public TikTok post on ("enable", accepts TikTok\'s Advertising Content Terms for the post), add days to its code or issue a new one after it was turned off ("extend"), or turn it off ("disable"; TikTok refuses while the post runs in an active Spark Ad). enable and extend return the Spark Ads code to share with an advertiser. Address the post with exactly one of postId (bundle.social post) or platformPostId (TikTok item_id). Read the current code with trigger_integration_tool method "tiktok:ad-authorization".',
      inputSchema: {
        action: z.enum(["enable", "extend", "disable"]).describe("enable, extend or disable."),
        postId: z.string().min(1).optional().describe("bundle.social post published to TikTok. Pass this or platformPostId."),
        platformPostId: z
          .string()
          .min(1)
          .optional()
          .describe("TikTok post ID (item_id) of a public post on the team's TikTok account. Pass this or postId."),
        authorizationDays: z
          .number()
          .int()
          .optional()
          .describe(`enable/extend only: code validity in days, one of ${TIKTOK_AUTHORIZATION_DAYS.join(", ")}. Default 30.`),
        teamId: teamIdSchema,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ action, teamId, ...params }) => {
      const id = await resolveTeamId(ctx, teamId);
      return jsonResult(await runTiktokAdAuthorization(ctx.client, id, action, params));
    },
  );
}
