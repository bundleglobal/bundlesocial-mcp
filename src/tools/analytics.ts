import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AnalyticsGetSocialAccountAnalyticsData } from "bundlesocial";
import { type ServerContext, resolveTeamId } from "../client";
import { McpToolError, errorSummary, jsonResult } from "../errors";
import { isAnalyticsPlatform, normalizeAnalyticsPlatform } from "../platforms";
import { registerTool } from "../register-tool";

type AnalyticsPlatform = AnalyticsGetSocialAccountAnalyticsData["platformType"];

const teamIdSchema = z
  .string()
  .min(1)
  .optional()
  .describe("bundle.social team id. Optional when the organization has a single team or BUNDLESOCIAL_TEAM_ID is configured.");

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
      description: "Get engagement metrics (impressions, views, likes, comments, …) for a single post by its bundle.social id. Optionally limit to one platform. Set `raw: true` for the unprocessed provider payload.",
      inputSchema: {
        id: z.string().min(1).describe("Post id."),
        platform: z.string().optional().describe("Limit to a single platform name/alias (e.g. instagram, tiktok, youtube). Analytics are not available for X/Twitter, Discord or Slack."),
        raw: z.boolean().optional().default(false).describe("If true, return the raw provider analytics payload instead of the normalized metrics."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ id, platform, raw }) => {
      const platformType = platform ? normalizeAnalyticsPlatform(platform) : undefined;
      const response = raw
        ? await ctx.client.analytics.analyticsGetPostAnalyticsRaw({ postId: id, platformType })
        : await ctx.client.analytics.analyticsGetPostAnalytics({ postId: id, platformType });
      return jsonResult(response);
    },
  );

  registerTool(
    server,
    "get_account_analytics",
    {
      title: "Get social-account analytics",
      description:
        "Get the analytics time-series (followers, impressions, likes, …) for a connected account on the given platform. Analytics are available on TIKTOK, YOUTUBE, INSTAGRAM, FACEBOOK, THREADS, REDDIT, PINTEREST, MASTODON, LINKEDIN, BLUESKY, GOOGLE_BUSINESS. Set `raw: true` for the unprocessed provider payload.",
      inputSchema: {
        platform: z.string().min(1).describe("Platform name/alias."),
        teamId: teamIdSchema,
        raw: z.boolean().optional().default(false).describe("If true, return the raw provider analytics payload."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ platform, teamId, raw }) => {
      const id = await resolveTeamId(ctx, teamId);
      const platformType = normalizeAnalyticsPlatform(platform);
      const response = raw
        ? await ctx.client.analytics.analyticsGetSocialAccountAnalyticsRaw({ teamId: id, platformType })
        : await ctx.client.analytics.analyticsGetSocialAccountAnalytics({ teamId: id, platformType });
      return jsonResult(response);
    },
  );

  registerTool(
    server,
    "get_bulk_post_analytics",
    {
      title: "Get analytics for multiple posts",
      description: "Get analytics for up to 60 posts in one request (paginated, 20 per page) for a single platform.",
      inputSchema: {
        postIds: z.array(z.string().min(1)).min(1).max(60).describe("Post ids (max 60)."),
        platform: z.string().min(1).describe("Platform name/alias the posts belong to."),
        page: z.number().int().positive().optional().describe("Page (1-based)."),
        limit: z.number().int().positive().max(20).optional().describe("Page size (max 20)."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ postIds, platform, page, limit }) =>
      jsonResult(
        await ctx.client.analytics.analyticsGetBulkPostAnalytics({
          postIds,
          platformType: normalizeAnalyticsPlatform(platform),
          page,
          limit,
        }),
      ),
  );

  registerTool(
    server,
    "refresh_analytics",
    {
      title: "Force-refresh analytics",
      description:
        "Force an immediate analytics refresh. Pass `postId` to refresh that post's analytics; otherwise pass `platform` to refresh a connected account's analytics for the team.",
      inputSchema: {
        postId: z.string().optional().describe("Post id to refresh analytics for."),
        importedPostId: z.string().optional().describe("Imported-post id to refresh analytics for (alternative to postId)."),
        platform: z.string().optional().describe("Platform name/alias to refresh a social-account's analytics for (used when postId/importedPostId are omitted)."),
        teamId: teamIdSchema,
      },
      annotations: { openWorldHint: true },
    },
    async ({ postId, importedPostId, platform, teamId }) => {
      if (postId || importedPostId) {
        return jsonResult(
          await ctx.client.analytics.analyticsForcePostAnalytics({
            requestBody: {
              postId: postId ?? null,
              importedPostId: importedPostId ?? null,
              platformType: platform ? normalizeAnalyticsPlatform(platform) : null,
            },
          }),
        );
      }
      if (!platform) {
        throw new McpToolError("REFRESH_TARGET_REQUIRED", "Pass either `postId`/`importedPostId` (to refresh a post) or `platform` (to refresh a social account).");
      }
      const id = await resolveTeamId(ctx, teamId);
      return jsonResult(await ctx.client.analytics.analyticsForceSocialAccountAnalytics({ requestBody: { teamId: id, platformType: normalizeAnalyticsPlatform(platform) } }));
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
