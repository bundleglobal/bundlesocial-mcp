import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AnalyticsGetSocialAccountAnalyticsData } from "bundlesocial";
import { type ServerContext, resolveTeamId } from "../client";
import { errorSummary, jsonResult } from "../errors";
import { isAnalyticsPlatform, normalizeAnalyticsPlatform } from "../platforms";
import { registerTool } from "../register-tool";

type AnalyticsPlatform = AnalyticsGetSocialAccountAnalyticsData["platformType"];

function withinRange(value: string | null | undefined, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  if (!value) return false;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return false;
  if (from && time < new Date(from).getTime()) return false;
  if (to && time > new Date(to).getTime()) return false;
  return true;
}

export function registerAnalyticsTools(server: McpServer, ctx: ServerContext): void {
  registerTool(
    server,
    "get_post_analytics",
    {
      title: "Get post analytics",
      description: "Get engagement metrics (impressions, views, likes, comments, …) for a single post by its bundle.social id. Optionally limit to one platform.",
      inputSchema: {
        id: z.string().min(1).describe("Post id."),
        platform: z.string().optional().describe("Limit to a single platform name/alias (e.g. instagram, tiktok, youtube). Analytics are not available for X/Twitter, Discord or Slack."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ id, platform }) => {
      const response = await ctx.client.analytics.analyticsGetPostAnalytics({
        postId: id,
        platformType: platform ? normalizeAnalyticsPlatform(platform) : undefined,
      });
      return jsonResult(response);
    },
  );

  registerTool(
    server,
    "get_analytics_summary",
    {
      title: "Get analytics summary",
      description:
        "Organization-level analytics summary: posts/comments/uploads usage quotas for the organization, plus the latest analytics snapshot (followers, impressions, likes, …) for each connected integration on the team. Use `from`/`to` to select the snapshot from a date range.",
      inputSchema: {
        teamId: z
          .string()
          .min(1)
          .optional()
          .describe("bundle.social team id. Optional when the organization has a single team or BUNDLESOCIAL_TEAM_ID is configured."),
        from: z.string().optional().describe("Start of the range used to select analytics snapshots (ISO 8601)."),
        to: z.string().optional().describe("End of the range used to select analytics snapshots (ISO 8601)."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ teamId, from, to }) => {
      const id = await resolveTeamId(ctx, teamId);
      const [organization, team, postsUsage, commentsUsage, uploadsUsage] = await Promise.all([
        ctx.client.organization.organizationGetOrganization(),
        ctx.client.team.teamGetTeam({ id }),
        ctx.client.organization.organizationGetPostsUsage().catch(() => null),
        ctx.client.organization.organizationGetCommentsUsage().catch(() => null),
        ctx.client.organization.organizationGetUploadsUsage().catch(() => null),
      ]);

      const accounts = team.socialAccounts ?? [];
      const integrations: Array<Record<string, unknown>> = [];
      for (const account of accounts) {
        const base = { id: account.id, type: account.type, username: account.username ?? null };
        if (!isAnalyticsPlatform(account.type)) {
          integrations.push({ ...base, analytics: null, note: "analytics not available for this platform" });
          continue;
        }
        try {
          const result = await ctx.client.analytics.analyticsGetSocialAccountAnalytics({
            teamId: id,
            platformType: account.type as AnalyticsPlatform,
          });
          const items = (result.items ?? []).filter((item) => withinRange(item.createdAt, from, to));
          integrations.push({ ...base, latest: items[items.length - 1] ?? null, dataPoints: items.length });
        } catch (error) {
          integrations.push({ ...base, analytics: null, error: errorSummary(error) });
        }
      }

      return jsonResult({
        organization: { id: organization.id, name: organization.name ?? null },
        team: { id: team.id, name: team.name },
        range: { from: from ?? null, to: to ?? null },
        usage: { posts: postsUsage, comments: commentsUsage, uploads: uploadsUsage },
        integrations,
      });
    },
  );
}
