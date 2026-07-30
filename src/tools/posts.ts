import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  PostCreateData,
  PostGetListData,
  PostGetReconnectSocialAccountCandidatesData,
  PostReconnectSocialAccountData,
  PostUpdateData,
} from "bundlesocial";
import { type ServerContext, resolveTeamId } from "../client";
import { McpToolError, jsonResult } from "../errors";
import { COMMENT_PLATFORMS, isCommentPlatform, normalizePlatform, type Platform } from "../platforms";
import { uploadMediaRefs } from "../media";
import { buildPostData, deriveTitle, platformsFromData, resolveTargetPlatforms, toIsoDate } from "../post-data";
import { registerTool } from "../register-tool";

type PostCreateBody = NonNullable<PostCreateData["requestBody"]>;
type PostData = PostCreateBody["data"];
type PostUpdateBody = NonNullable<PostUpdateData["requestBody"]>;
type ReconnectPlatform = NonNullable<PostReconnectSocialAccountData["requestBody"]>["type"];
type PostFirstComment = NonNullable<NonNullable<PostCreateBody["firstComment"]>>;

/**
 * Normalize the `firstComment` argument into the per-platform object the API
 * expects: either a platform-keyed map, or one string applied to every
 * comment-capable platform the post targets.
 */
function buildFirstComment(
  firstComment: string | Record<string, string> | undefined,
  targets: Platform[],
): PostFirstComment | undefined {
  if (firstComment === undefined) return undefined;
  if (typeof firstComment === "string") {
    const commentable = targets.filter(isCommentPlatform);
    if (commentable.length === 0) {
      throw new McpToolError(
        "COMMENTS_NOT_SUPPORTED",
        `None of the targeted platforms support comments, so firstComment has no effect. Supported: ${COMMENT_PLATFORMS.join(", ")}.`,
      );
    }
    const perPlatform: PostFirstComment = {};
    for (const platform of commentable) perPlatform[platform] = firstComment;
    return perPlatform;
  }
  const result: PostFirstComment = {};
  for (const [key, value] of Object.entries(firstComment)) {
    const platform = normalizePlatform(key);
    if (!isCommentPlatform(platform)) {
      throw new McpToolError(
        "COMMENTS_NOT_SUPPORTED",
        `A first comment is not supported on ${platform}. Supported: ${COMMENT_PLATFORMS.join(", ")}.`,
      );
    }
    result[platform] = value;
  }
  return result;
}

const referenceKeySchema = z
  .string()
  .min(1)
  .optional()
  .describe("Your own identifier for this post. Look the post up later with get_post_by_reference_key.");

const firstCommentSchema = z
  .union([z.string().min(1), z.record(z.string(), z.string())])
  .optional()
  .describe(
    'Comment published as soon as the post itself goes live. A string applies to every comment-capable target; a platform-keyed object targets specific platforms, e.g. {"INSTAGRAM":"more below 👇"}. Supported on TIKTOK, YOUTUBE, INSTAGRAM, FACEBOOK, THREADS, LINKEDIN, REDDIT, MASTODON, DISCORD, SLACK, BLUESKY.',
  );

const teamIdSchema = z
  .string()
  .min(1)
  .optional()
  .describe("bundle.social team id. Optional when the organization has a single team or BUNDLESOCIAL_TEAM_ID is configured.");

const platformsSchema = z
  .array(z.string().min(1))
  .optional()
  .describe(
    'Target platforms — names/aliases (x, tiktok, instagram, youtube, facebook, threads, linkedin, pinterest, reddit, mastodon, discord, slack, bluesky, gbp, snapchat) and/or connected integration ids from list_integrations. Required unless "data" is provided with platform keys.',
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
        referenceKey: referenceKeySchema,
        firstComment: firstCommentSchema,
        draft: z.boolean().optional().default(false).describe("If true, save as a DRAFT instead of publishing now."),
      },
      annotations: { openWorldHint: true },
    },
    async ({ teamId, content, platforms, media, platformSettings, data, title, referenceKey, firstComment, draft }) => {
      const composed = await composePost(ctx, { teamId, content, platforms, media, platformSettings, data, title });
      const requestBody: PostCreateBody = {
        teamId: composed.teamId,
        title: composed.title,
        postDate: new Date().toISOString(),
        status: draft ? "DRAFT" : "SCHEDULED",
        socialAccountTypes: composed.socialAccountTypes,
        data: composed.data,
      };
      if (referenceKey !== undefined) requestBody.referenceKey = referenceKey;
      const resolvedFirstComment = buildFirstComment(firstComment, composed.socialAccountTypes);
      if (resolvedFirstComment) requestBody.firstComment = resolvedFirstComment;
      return jsonResult(await ctx.client.post.postCreate({ requestBody }));
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
        referenceKey: referenceKeySchema,
        firstComment: firstCommentSchema,
      },
      annotations: { openWorldHint: true },
    },
    async ({ teamId, date, content, platforms, media, platformSettings, data, title, referenceKey, firstComment }) => {
      const postDate = toIsoDate(date, "date");
      const composed = await composePost(ctx, { teamId, content, platforms, media, platformSettings, data, title });
      const requestBody: PostCreateBody = {
        teamId: composed.teamId,
        title: composed.title,
        postDate,
        status: "SCHEDULED",
        socialAccountTypes: composed.socialAccountTypes,
        data: composed.data,
      };
      if (referenceKey !== undefined) requestBody.referenceKey = referenceKey;
      const resolvedFirstComment = buildFirstComment(firstComment, composed.socialAccountTypes);
      if (resolvedFirstComment) requestBody.firstComment = resolvedFirstComment;
      return jsonResult(await ctx.client.post.postCreate({ requestBody }));
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
        referenceKey: referenceKeySchema,
        firstComment: firstCommentSchema,
        teamId: teamIdSchema,
      },
      annotations: { openWorldHint: true },
    },
    async ({ id, title, date, status, content, platforms, media, platformSettings, data, referenceKey, firstComment, teamId }) => {
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
      if (referenceKey !== undefined) requestBody.referenceKey = referenceKey;
      if (firstComment !== undefined) {
        const commentTargets = targets ?? (Object.keys((await ctx.client.post.postGet({ id })).data ?? {}) as Platform[]);
        requestBody.firstComment = buildFirstComment(firstComment, commentTargets);
      }
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
          "Nothing to update — pass at least one of title, date, status, content, media, platformSettings, data, referenceKey, firstComment, platforms.",
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

  registerTool(
    server,
    "get_post_by_reference_key",
    {
      title: "Get a post by reference key",
      description:
        "Fetch a single post by the `referenceKey` set when it was created, instead of by bundle.social post id. Use this when you track posts under your own identifiers.",
      inputSchema: { referenceKey: z.string().min(1).describe("The reference key you set on the post.") },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ referenceKey }) => jsonResult(await ctx.client.post.postGetByReferenceKey({ referenceKey })),
  );

  registerTool(
    server,
    "list_reconnect_candidates",
    {
      title: "List posts waiting for a reconnected account",
      description:
        "List draft/scheduled posts that lost their link to a social account after a disconnect and can be reattached to a newly connected account of the same platform. Pair with reconnect_posts.",
      inputSchema: {
        teamId: teamIdSchema,
        platform: z.string().min(1).describe("Platform of the reconnected account (name or alias)."),
        limit: z.number().int().positive().max(100).optional().describe("Max number of posts to return."),
        offset: z.number().int().nonnegative().optional().describe("Number of posts to skip."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ teamId, platform, limit, offset }) => {
      const id = await resolveTeamId(ctx, teamId);
      const params: PostGetReconnectSocialAccountCandidatesData = {
        teamId: id,
        type: normalizePlatform(platform) as PostGetReconnectSocialAccountCandidatesData["type"],
        limit,
        offset,
      };
      return jsonResult(await ctx.client.post.postGetReconnectSocialAccountCandidates(params));
    },
  );

  registerTool(
    server,
    "reconnect_posts",
    {
      title: "Reattach posts to a reconnected account",
      description:
        "Attach a newly connected social account to posts that lost their link to the previous account of that platform. Without `postIds`, every candidate is reattached.",
      inputSchema: {
        teamId: teamIdSchema,
        platform: z.string().min(1).describe("Platform of the reconnected account (name or alias)."),
        postIds: z.array(z.string().min(1)).optional().describe("Only reattach these post ids. Defaults to every candidate."),
      },
      annotations: { openWorldHint: true },
    },
    async ({ teamId, platform, postIds }) => {
      const id = await resolveTeamId(ctx, teamId);
      return jsonResult(
        await ctx.client.post.postReconnectSocialAccount({
          requestBody: {
            teamId: id,
            type: normalizePlatform(platform) as ReconnectPlatform,
            ...(postIds && postIds.length > 0 ? { postIds } : {}),
          },
        }),
      );
    },
  );
}
