import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PostImportCreateData } from "bundlesocial";
import { type ServerContext, resolveTeamId } from "../client";
import { jsonResult } from "../errors";
import { normalizePlatform } from "../platforms";
import { registerTool } from "../register-tool";

type PostImportPlatform = NonNullable<PostImportCreateData["requestBody"]>["socialAccountType"];

const platformSchema = z.string().min(1).describe("Platform name/alias. Post-history import is available on FACEBOOK, INSTAGRAM, THREADS, TIKTOK, YOUTUBE, LINKEDIN, PINTEREST, REDDIT, MASTODON, BLUESKY.");

export function registerPostImportTools(server: McpServer, ctx: ServerContext): void {
  registerTool(
    server,
    "create_post_import",
    {
      title: "Import post history",
      description:
        "Start an async import of a connected account's recent posts (optionally with analytics) for one platform. Poll list_post_imports / get_post_import for status and list_imported_posts for the imported posts.",
      inputSchema: {
        platform: platformSchema,
        count: z.number().int().positive().describe("How many recent posts to import."),
        withAnalytics: z.boolean().optional().describe("Also fetch analytics for the imported posts."),
        importCarousels: z.boolean().optional().describe("Include carousel/album posts (Instagram)."),
        surface: z.enum(["PROFILE_GRID", "NON_GRID", "STORY", "ALL"]).optional().describe("Which surface to import from (Instagram)."),
        mediaType: z.enum(["VIDEO", "IMAGE"]).optional().describe("Restrict to one media type."),
        teamId: z.string().min(1).optional().describe("bundle.social team id. Optional when the organization has a single team or BUNDLESOCIAL_TEAM_ID is configured."),
      },
      annotations: { openWorldHint: true },
    },
    async ({ platform, count, withAnalytics, importCarousels, surface, mediaType, teamId }) => {
      const id = await resolveTeamId(ctx, teamId);
      return jsonResult(
        await ctx.client.postImport.postImportCreate({
          requestBody: {
            teamId: id,
            socialAccountType: normalizePlatform(platform) as PostImportPlatform,
            count,
            ...(withAnalytics !== undefined ? { withAnalytics } : {}),
            ...(importCarousels !== undefined ? { importCarousels } : {}),
            ...(surface ? { surface } : {}),
            ...(mediaType ? { mediaType } : {}),
          },
        }),
      );
    },
  );

  registerTool(
    server,
    "list_post_imports",
    {
      title: "List post-history imports",
      description: "List post-history import jobs for a team, optionally filtered by platform.",
      inputSchema: {
        teamId: z.string().min(1).optional().describe("bundle.social team id. Optional when the organization has a single team or BUNDLESOCIAL_TEAM_ID is configured."),
        platform: z.string().optional().describe("Filter by platform name/alias."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ teamId, platform }) => {
      const id = await resolveTeamId(ctx, teamId);
      return jsonResult(await ctx.client.postImport.postImportGetStatus({ teamId: id, socialAccountType: platform ? (normalizePlatform(platform) as PostImportPlatform) : undefined }));
    },
  );

  registerTool(
    server,
    "get_post_import",
    {
      title: "Get a post-history import by id",
      description: "Fetch a single post-history import job by its id, including its status and counts.",
      inputSchema: { importId: z.string().min(1).describe("Post import id.") },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ importId }) => jsonResult(await ctx.client.postImport.postImportGetById({ importId })),
  );

  registerTool(
    server,
    "list_imported_posts",
    {
      title: "List imported posts for a platform",
      description: "List the posts imported (with analytics, when available) for a connected account on the given platform.",
      inputSchema: {
        platform: platformSchema,
        teamId: z.string().min(1).optional().describe("bundle.social team id. Optional when the organization has a single team or BUNDLESOCIAL_TEAM_ID is configured."),
        limit: z.number().int().positive().max(100).optional(),
        offset: z.number().int().nonnegative().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ platform, teamId, limit, offset }) => {
      const id = await resolveTeamId(ctx, teamId);
      return jsonResult(await ctx.client.postImport.postImportGetImportedPosts({ teamId: id, socialAccountType: normalizePlatform(platform) as PostImportPlatform, limit, offset: offset ?? null }));
    },
  );

  registerTool(
    server,
    "delete_imported_posts",
    {
      title: "Delete imported posts",
      description: "Bulk-delete imported posts (and their analytics) by id. Destructive.",
      inputSchema: {
        postIds: z.array(z.string().min(1)).min(1).describe("Imported-post ids to delete."),
        teamId: z.string().min(1).optional().describe("bundle.social team id. Optional when the organization has a single team or BUNDLESOCIAL_TEAM_ID is configured."),
      },
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    async ({ postIds, teamId }) => {
      const id = await resolveTeamId(ctx, teamId);
      return jsonResult(await ctx.client.postImport.postImportDeleteImportedPosts({ requestBody: { teamId: id, postIds } }));
    },
  );

  registerTool(
    server,
    "retry_post_import",
    {
      title: "Retry a post-history import",
      description: "Retry a post-history import job that ended in FAILED / RATE_LIMITED.",
      inputSchema: {
        importId: z.string().min(1).describe("Post import id."),
        teamId: z.string().min(1).optional().describe("bundle.social team id. Optional when the organization has a single team or BUNDLESOCIAL_TEAM_ID is configured."),
      },
      annotations: { openWorldHint: true },
    },
    async ({ importId, teamId }) => {
      const id = await resolveTeamId(ctx, teamId);
      return jsonResult(await ctx.client.postImport.postImportRetryImport({ importId, requestBody: { teamId: id } }));
    },
  );
}
