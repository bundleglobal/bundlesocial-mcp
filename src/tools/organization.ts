import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type ServerContext, resolveTeamId } from "../client";
import { errorSummary, jsonResult } from "../errors";
import { normalizePlatform } from "../platforms";
import { registerTool } from "../register-tool";

const teamIdSchema = z
  .string()
  .min(1)
  .optional()
  .describe("bundle.social team id. Optional when the organization has a single team or BUNDLESOCIAL_TEAM_ID is configured.");

export function registerOrganizationTools(server: McpServer, ctx: ServerContext): void {
  registerTool(
    server,
    "get_organization",
    {
      title: "Get the organization",
      description: "Fetch the current organization — its id, name, API-access flag, plan limits and the list of teams.",
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => jsonResult(await ctx.client.organization.organizationGetOrganization()),
  );

  registerTool(
    server,
    "get_usage",
    {
      title: "Get usage quotas",
      description:
        "Organization usage quotas: posts, comments and uploads (used/limit/remaining), plus a paginated per-social-account breakdown of post-history import usage. Use the pagination/filter args for the imports breakdown.",
      inputSchema: {
        teamId: teamIdSchema,
        platform: z.string().optional().describe("Filter the imports breakdown to one platform name/alias (e.g. instagram, tiktok)."),
        socialAccountId: z.string().optional().describe("Filter the imports breakdown to one social-account id."),
        page: z.number().int().positive().optional().describe("Page of the imports breakdown (1-based)."),
        pageSize: z.number().int().positive().max(100).optional().describe("Page size of the imports breakdown."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ teamId, platform, socialAccountId, page, pageSize }) => {
      const id = teamId ?? ctx.defaultTeamId;
      const resolvedTeamId = id ?? (await resolveTeamId(ctx, teamId).catch(() => undefined));
      const [posts, comments, uploads, imports] = await Promise.all([
        ctx.client.organization.organizationGetPostsUsage().catch((error) => ({ error: errorSummary(error) })),
        ctx.client.organization.organizationGetCommentsUsage().catch((error) => ({ error: errorSummary(error) })),
        ctx.client.organization.organizationGetUploadsUsage().catch((error) => ({ error: errorSummary(error) })),
        ctx.client.organization
          .organizationGetImportsUsage({
            page,
            pageSize,
            teamId: resolvedTeamId,
            socialAccountType: platform ? normalizePlatform(platform) : undefined,
            socialAccountId,
          })
          .catch((error) => ({ error: errorSummary(error) })),
      ]);
      return jsonResult({ posts, comments, uploads, imports });
    },
  );

  registerTool(
    server,
    "get_daily_limits_usage",
    {
      title: "Get a connected account's daily limits",
      description:
        "How much of one connected account's daily post and comment allowance has been used on a given day (defaults to today, UTC). Use it before bulk-scheduling to avoid hitting a per-account daily cap.",
      inputSchema: {
        socialAccountId: z.string().min(1).describe("Connected social account id (see list_integrations)."),
        date: z.string().optional().describe("Day to report on, YYYY-MM-DD. Defaults to today."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ socialAccountId, date }) =>
      jsonResult(
        await ctx.client.organization.organizationGetDailyLimitsUsage({
          socialAccountId,
          ...(date ? { date } : {}),
        }),
      ),
  );
}
