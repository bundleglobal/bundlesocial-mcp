import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PostCreateData, PostGetListData, PostUpdateData } from "bundlesocial";
import { type ServerContext, resolveTeamId } from "../client";
import { McpToolError, jsonResult } from "../errors";
import { normalizePlatform, type Platform } from "../platforms";
import { uploadMediaRefs } from "../media";
import { buildPostData, deriveTitle, platformsFromData, resolveTargetPlatforms, toIsoDate } from "../post-data";
import { registerTool } from "../register-tool";

type PostData = NonNullable<PostCreateData["requestBody"]>["data"];
type PostUpdateBody = NonNullable<PostUpdateData["requestBody"]>;

const teamIdSchema = z
  .string()
  .min(1)
  .optional()
  .describe("bundle.social team id. Optional when the organization has a single team or BUNDLESOCIAL_TEAM_ID is configured.");

const platformsSchema = z
  .array(z.string().min(1))
  .optional()
  .describe(
    'Target platforms — names/aliases (x, tiktok, instagram, youtube, facebook, threads, linkedin, pinterest, reddit, mastodon, discord, slack, gbp) and/or connected integration ids from list_integrations. Required unless "data" is provided with platform keys.',
  );

const mediaSchema = z
  .array(z.string().min(1))
  .optional()
  .describe(
    "Media to attach: public https:// URLs (or local file paths when this server runs in stdio mode). Uploaded automatically and attached to every targeted platform. For per-platform media, use upload_media + the `data` argument instead.",
  );

const platformSettingsSchema = z
  .record(z.string(), z.unknown())
  .optional()
  .describe(
    'Per-platform options. Either keyed by platform name, e.g. {"TIKTOK":{"privacy":"PUBLIC_TO_EVERYONE"},"YOUTUBE":{"type":"SHORT","privacyStatus":"PUBLIC","madeForKids":false}}, or a flat object applied to every targeted platform. Use this for platform-required fields (Reddit `sr`, Pinterest `boardName`, TikTok `privacy`, YouTube `madeForKids`/`privacyStatus`, Instagram/Facebook `type`).',
  );

const dataSchema = z
  .record(z.string(), z.unknown())
  .optional()
  .describe(
    'Advanced: the full post `data` object keyed by platform, e.g. {"REDDIT":{"sr":"r/test","text":"hello","uploadIds":["<uploadId>"]}}. Overrides content/media/platformSettings. Targeted platforms are inferred from its keys unless `platforms` is also given.',
  );

const titleSchema = z.string().min(1).optional().describe("Post title. Defaults to the first line of `content`. Also used as the YouTube video title.");

interface ComposeArgs {
  teamId?: string;
  content?: string;
  platforms?: string[];
  media?: string[];
  platformSettings?: Record<string, unknown>;
  data?: Record<string, unknown>;
  title?: string;
}

async function composePost(ctx: ServerContext, args: ComposeArgs) {
  const teamId = await resolveTeamId(ctx, args.teamId);

  let targets: Platform[];
  if (args.platforms && args.platforms.length > 0) {
    targets = await resolveTargetPlatforms(ctx.client, teamId, args.platforms);
  } else if (args.data) {
    targets = platformsFromData(args.data);
  } else {
    throw new McpToolError(
      "NO_TARGET",
      'Provide "platforms" (platform names or integration ids), or a "data" object keyed by platform.',
    );
  }
  if (targets.length === 0) throw new McpToolError("NO_TARGET", "Could not determine any target platform for this post.");

  const mediaUploadIds = await uploadMediaRefs(ctx.client, teamId, args.media ?? []);
  const data = buildPostData(targets, {
    content: args.content,
    mediaUploadIds,
    platformSettings: args.platformSettings,
    data: args.data,
  }) as unknown as PostData;

  return {
    teamId,
    socialAccountTypes: targets,
    data,
    title: args.title ?? deriveTitle(args.content, "Untitled post"),
  };
}

export function registerPostTools(server: McpServer, ctx: ServerContext): void {
  registerTool(
    server,
    "create_post",
    {
      title: "Create a post (publish now)",
      description:
        "Publish a post immediately to one or more connected social-media integrations. Returns the created post (with its id and status). Set `draft: true` to save it as a draft instead of publishing. For a future-dated post use schedule_post.",
      inputSchema: {
        teamId: teamIdSchema,
        content: z.string().optional().describe("Post text, applied to every targeted platform."),
        platforms: platformsSchema,
        media: mediaSchema,
        platformSettings: platformSettingsSchema,
        data: dataSchema,
        title: titleSchema,
        draft: z.boolean().optional().default(false).describe("If true, save as a DRAFT instead of publishing now."),
      },
      annotations: { openWorldHint: true },
    },
    async ({ teamId, content, platforms, media, platformSettings, data, title, draft }) => {
      const composed = await composePost(ctx, { teamId, content, platforms, media, platformSettings, data, title });
      const post = await ctx.client.post.postCreate({
        requestBody: {
          teamId: composed.teamId,
          title: composed.title,
          postDate: new Date().toISOString(),
          status: draft ? "DRAFT" : "SCHEDULED",
          socialAccountTypes: composed.socialAccountTypes,
          data: composed.data,
        },
      });
      return jsonResult(post);
    },
  );

  registerTool(
    server,
    "schedule_post",
    {
      title: "Schedule a post for later",
      description:
        "Schedule a post to be published at a specific date/time on one or more connected integrations. Same inputs as create_post plus a required ISO-8601 `date`. Returns the scheduled post.",
      inputSchema: {
        teamId: teamIdSchema,
        date: z.string().min(1).describe("When to publish — ISO 8601, e.g. 2026-06-01T09:00:00Z."),
        content: z.string().optional().describe("Post text, applied to every targeted platform."),
        platforms: platformsSchema,
        media: mediaSchema,
        platformSettings: platformSettingsSchema,
        data: dataSchema,
        title: titleSchema,
      },
      annotations: { openWorldHint: true },
    },
    async ({ teamId, date, content, platforms, media, platformSettings, data, title }) => {
      const postDate = toIsoDate(date, "date");
      const composed = await composePost(ctx, { teamId, content, platforms, media, platformSettings, data, title });
      const post = await ctx.client.post.postCreate({
        requestBody: {
          teamId: composed.teamId,
          title: composed.title,
          postDate,
          status: "SCHEDULED",
          socialAccountTypes: composed.socialAccountTypes,
          data: composed.data,
        },
      });
      return jsonResult(post);
    },
  );

  registerTool(
    server,
    "list_posts",
    {
      title: "List recent posts",
      description: "List recent posts for a team, newest first, with optional filters by status, platform, date range and free-text query.",
      inputSchema: {
        teamId: teamIdSchema,
        limit: z.number().int().positive().max(100).optional().default(20).describe("Max number of posts to return (default 20, max 100)."),
        offset: z.number().int().nonnegative().optional().describe("Number of posts to skip (for pagination)."),
        status: z
          .enum(["DRAFT", "SCHEDULED", "POSTED", "ERROR", "DELETED", "PROCESSING", "REVIEW", "RETRYING"])
          .optional()
          .describe("Filter by post status."),
        platforms: z.array(z.string().min(1)).optional().describe("Filter by platform name/alias."),
        from: z.string().optional().describe("Only posts with postDate on/after this ISO-8601 date."),
        to: z.string().optional().describe("Only posts with postDate on/before this ISO-8601 date."),
        query: z.string().optional().describe("Free-text search over post titles/content."),
        order: z.enum(["ASC", "DESC"]).optional().describe("Sort direction (default DESC)."),
        orderBy: z.enum(["createdAt", "updatedAt", "postDate", "postedDate", "deletedAt"]).optional().describe("Sort field (default postDate)."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ teamId, limit, offset, status, platforms, from, to, query, order, orderBy }) => {
      const id = await resolveTeamId(ctx, teamId);
      const normalizedPlatforms = (platforms ?? []).map(normalizePlatform);
      const params: PostGetListData = {
        teamId: id,
        limit,
        offset,
        status: status ?? undefined,
        platforms: normalizedPlatforms.length > 0 ? (normalizedPlatforms as PostGetListData["platforms"]) : undefined,
        postDateFrom: from ? toIsoDate(from, "from") : undefined,
        postDateTo: to ? toIsoDate(to, "to") : undefined,
        q: query,
        order: order ?? undefined,
        orderBy: orderBy ?? undefined,
      };
      return jsonResult(await ctx.client.post.postGetList(params));
    },
  );

  registerTool(
    server,
    "get_post",
    {
      title: "Get a post by id",
      description: "Fetch a single post by its bundle.social id, including its per-platform data and status.",
      inputSchema: { id: z.string().min(1).describe("Post id.") },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ id }) => jsonResult(await ctx.client.post.postGet({ id })),
  );

  registerTool(
    server,
    "delete_post",
    {
      title: "Delete a post",
      description: "Delete a post by its bundle.social id. This is destructive and cannot be undone.",
      inputSchema: { id: z.string().min(1).describe("Post id.") },
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    async ({ id }) => jsonResult(await ctx.client.post.postDelete({ id })),
  );

  registerTool(
    server,
    "update_post",
    {
      title: "Update a post",
      description:
        "Update an existing post by id — change its title, publish date, status (DRAFT/SCHEDULED), targeted platforms and/or per-platform content. Only the fields you pass are changed. If you change content/media without `platforms`, the post's current platforms are reused.",
      inputSchema: {
        id: z.string().min(1).describe("Post id."),
        title: z.string().optional().describe("New post title."),
        date: z.string().optional().describe("New publish date, ISO 8601."),
        status: z.enum(["DRAFT", "SCHEDULED"]).optional().describe("New status."),
        content: z.string().optional().describe("New post text, applied to every targeted platform."),
        platforms: platformsSchema,
        media: mediaSchema,
        platformSettings: platformSettingsSchema,
        data: dataSchema,
        teamId: teamIdSchema,
      },
      annotations: { openWorldHint: true },
    },
    async ({ id, title, date, status, content, platforms, media, platformSettings, data, teamId }) => {
      const resolvedTeamId = await resolveTeamId(ctx, teamId);
      const wantsDataChange =
        content !== undefined || (media?.length ?? 0) > 0 || platformSettings !== undefined || data !== undefined;

      let targets: Platform[] | undefined;
      if (platforms && platforms.length > 0) {
        targets = await resolveTargetPlatforms(ctx.client, resolvedTeamId, platforms);
      } else if (data) {
        targets = platformsFromData(data);
      } else if (wantsDataChange) {
        const existing = await ctx.client.post.postGet({ id });
        targets = Object.keys(existing.data ?? {}) as Platform[];
        if (targets.length === 0) {
          throw new McpToolError("NO_TARGET", "Could not determine the post's platforms — pass `platforms`.");
        }
      }

      const requestBody: PostUpdateBody = {};
      if (title !== undefined) requestBody.title = title;
      if (date) requestBody.postDate = toIsoDate(date, "date");
      if (status) requestBody.status = status;
      if (targets && targets.length > 0) requestBody.socialAccountTypes = targets as PostUpdateBody["socialAccountTypes"];
      if (wantsDataChange && targets && targets.length > 0) {
        const mediaUploadIds = await uploadMediaRefs(ctx.client, resolvedTeamId, media ?? []);
        requestBody.data = buildPostData(targets, {
          content,
          mediaUploadIds,
          platformSettings,
          data,
        }) as unknown as PostUpdateBody["data"];
      }
      if (Object.keys(requestBody).length === 0) {
        throw new McpToolError(
          "NOTHING_TO_UPDATE",
          "Nothing to update — pass at least one of title, date, status, content, media, platformSettings, data, platforms.",
        );
      }
      return jsonResult(await ctx.client.post.postUpdate({ id, requestBody }));
    },
  );

  registerTool(
    server,
    "retry_post",
    {
      title: "Retry a failed post",
      description: "Retry publishing a post that ended in the ERROR state.",
      inputSchema: { id: z.string().min(1).describe("Post id.") },
      annotations: { openWorldHint: true },
    },
    async ({ id }) => jsonResult(await ctx.client.post.postRetry({ id })),
  );
}
