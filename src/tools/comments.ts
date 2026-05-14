import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CommentCreateData, CommentGetListData, CommentImportCreateData } from "bundlesocial";
import { type ServerContext, resolveTeamId } from "../client";
import { McpToolError, jsonResult } from "../errors";
import { COMMENT_PLATFORMS, type CommentPlatform, isCommentPlatform, normalizePlatform } from "../platforms";
import { resolveTargetPlatforms } from "../post-data";
import { registerTool } from "../register-tool";

type CommentImportPlatform = NonNullable<CommentImportCreateData["requestBody"]>["socialAccountType"];

const commentImportStatusSchema = z.enum(["PENDING", "FETCHING", "RETRYING", "COMPLETED", "SKIPPED", "FAILED", "RATE_LIMITED"]);

type CommentCreateBody = NonNullable<CommentCreateData["requestBody"]>;

const teamIdSchema = z
  .string()
  .min(1)
  .optional()
  .describe("bundle.social team id. Optional when the organization has a single team or BUNDLESOCIAL_TEAM_ID is configured.");

function assertCommentPlatforms(platforms: string[]): CommentPlatform[] {
  const bad = platforms.filter((platform) => !isCommentPlatform(platform));
  if (bad.length > 0) {
    throw new McpToolError(
      "COMMENTS_NOT_SUPPORTED",
      `Comments are not available for ${bad.join(", ")}. Supported: ${COMMENT_PLATFORMS.join(", ")}.`,
    );
  }
  return platforms as CommentPlatform[];
}

function toIso(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new McpToolError("INVALID_DATE", `date is not a valid ISO 8601 date/time: "${value}". Example: 2026-06-01T09:00:00Z`);
  }
  return date.toISOString();
}

export function registerCommentTools(server: McpServer, ctx: ServerContext): void {
  registerTool(
    server,
    "create_comment",
    {
      title: "Comment on a post",
      description:
        "Post one or more comments on an existing post. Pass `content` multiple times to create a chain (the first replies to the post, each subsequent one replies to the previous comment) — useful for X-style threads via comments. Comments are supported on TIKTOK, YOUTUBE, INSTAGRAM, FACEBOOK, THREADS, LINKEDIN, REDDIT, MASTODON, DISCORD, SLACK, BLUESKY. Returns the created comment(s).",
      inputSchema: {
        postId: z.string().min(1).describe("Id of the post to comment on."),
        content: z.array(z.string().min(1)).min(1).describe("Comment text. Pass multiple to create a chain of replies."),
        platforms: z
          .array(z.string().min(1))
          .optional()
          .describe("Target comment-capable platform names/aliases and/or integration ids. Defaults to the post's platforms (filtered to comment-capable ones)."),
        date: z.string().optional().describe("When to post the (first) comment, ISO 8601. Default: now."),
        delayMinutes: z.number().int().nonnegative().optional().default(0).describe("For a chain, minutes to wait between each comment."),
        draft: z.boolean().optional().default(false).describe("If true, create the comment(s) as DRAFT instead of posting."),
        teamId: teamIdSchema,
      },
      annotations: { openWorldHint: true },
    },
    async ({ postId, content, platforms, date, delayMinutes, draft, teamId }) => {
      const id = await resolveTeamId(ctx, teamId);
      let resolved: CommentPlatform[];
      if (platforms && platforms.length > 0) {
        resolved = assertCommentPlatforms(await resolveTargetPlatforms(ctx.client, id, platforms));
      } else {
        const post = await ctx.client.post.postGet({ id: postId });
        resolved = Object.keys(post.data ?? {}).filter(isCommentPlatform);
        if (resolved.length === 0) {
          throw new McpToolError("NO_TARGET", "Could not determine comment platforms from the post — pass `platforms` (comment-capable only).");
        }
      }
      const status: CommentCreateBody["status"] = draft ? "DRAFT" : "SCHEDULED";
      const baseDate = date ? new Date(toIso(date)) : new Date();

      const created = [];
      let parentCommentId: string | undefined;
      for (let index = 0; index < content.length; index += 1) {
        const text = content[index];
        const postDate = new Date(baseDate.getTime() + index * (delayMinutes ?? 0) * 60_000).toISOString();
        const perPlatform = Object.fromEntries(resolved.map((platform) => [platform, { text }]));
        const comment = await ctx.client.comment.commentCreate({
          requestBody: {
            teamId: id,
            internalPostId: postId,
            ...(parentCommentId ? { internalParentCommentId: parentCommentId } : {}),
            status,
            postDate,
            socialAccountTypes: resolved as never,
            data: perPlatform as never,
            text,
          },
        });
        created.push(comment);
        parentCommentId = comment.id;
      }
      return jsonResult(created.length === 1 ? created[0] : created);
    },
  );

  registerTool(
    server,
    "list_comments",
    {
      title: "List comments",
      description: "List comments for a team, optionally filtered by post, status and platform.",
      inputSchema: {
        postId: z.string().optional().describe("Only comments on this post."),
        limit: z.number().int().positive().max(100).optional().default(20),
        offset: z.number().int().nonnegative().optional(),
        status: z.enum(["DRAFT", "SCHEDULED", "POSTED", "ERROR", "DELETED", "PROCESSING", "RETRYING"]).optional(),
        platforms: z.array(z.string().min(1)).optional().describe("Filter by comment-capable platform name/alias."),
        query: z.string().optional(),
        order: z.enum(["ASC", "DESC"]).optional(),
        orderBy: z.enum(["createdAt", "updatedAt", "deletedAt"]).optional(),
        teamId: teamIdSchema,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ postId, limit, offset, status, platforms, query, order, orderBy, teamId }) => {
      const id = await resolveTeamId(ctx, teamId);
      const normalized = assertCommentPlatforms((platforms ?? []).map(normalizePlatform));
      const params: CommentGetListData = {
        teamId: id,
        postId,
        limit,
        offset,
        status: status ?? undefined,
        platforms: normalized.length > 0 ? (normalized as CommentGetListData["platforms"]) : undefined,
        q: query,
        order: order ?? undefined,
        orderBy: orderBy ?? undefined,
      };
      return jsonResult(await ctx.client.comment.commentGetList(params));
    },
  );

  registerTool(
    server,
    "get_comment",
    {
      title: "Get a comment by id",
      description: "Fetch a single comment by its bundle.social id.",
      inputSchema: { id: z.string().min(1).describe("Comment id.") },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ id }) => jsonResult(await ctx.client.comment.commentGet({ id })),
  );

  registerTool(
    server,
    "delete_comment",
    {
      title: "Delete a comment",
      description: "Delete a comment by its bundle.social id. Destructive.",
      inputSchema: { id: z.string().min(1).describe("Comment id.") },
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    async ({ id }) => jsonResult(await ctx.client.comment.commentDelete({ id })),
  );

  // --- comment imports (fetch incoming comments on a published post) ---------

  registerTool(
    server,
    "create_comment_import",
    {
      title: "Import comments on a post",
      description:
        "Start an async import of the (incoming) comments on a published post for one platform. Comment imports are available on FACEBOOK, INSTAGRAM, LINKEDIN, YOUTUBE, TIKTOK, REDDIT, THREADS, MASTODON, BLUESKY. Poll get_comment_import / list_comment_imports for status and list_imported_comments for the fetched comments.",
      inputSchema: {
        postId: z.string().min(1).describe("Id of the published post to import comments for."),
        platform: z.string().min(1).describe("Platform name/alias to import comments from."),
        teamId: teamIdSchema,
      },
      annotations: { openWorldHint: true },
    },
    async ({ postId, platform, teamId }) => {
      const id = await resolveTeamId(ctx, teamId);
      return jsonResult(
        await ctx.client.comment.commentImportCreate({
          requestBody: { teamId: id, postId, socialAccountType: normalizePlatform(platform) as CommentImportPlatform },
        }),
      );
    },
  );

  registerTool(
    server,
    "list_comment_imports",
    {
      title: "List comment imports",
      description: "List comment-import jobs for a team, optionally filtered by post and status.",
      inputSchema: {
        teamId: teamIdSchema,
        postId: z.string().optional().describe("Only imports for this post."),
        status: commentImportStatusSchema.optional().describe("Filter by import status."),
        limit: z.number().int().positive().max(100).optional(),
        offset: z.number().int().nonnegative().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ teamId, postId, status, limit, offset }) => {
      const id = await resolveTeamId(ctx, teamId);
      return jsonResult(await ctx.client.comment.commentImportGetList({ teamId: id, postId, status, limit: limit ?? null, offset: offset ?? null }));
    },
  );

  registerTool(
    server,
    "get_comment_import",
    {
      title: "Get a comment import by id",
      description: "Fetch a single comment-import job by its id, including its status and the number of comments imported.",
      inputSchema: { importId: z.string().min(1).describe("Comment import id.") },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ importId }) => jsonResult(await ctx.client.comment.commentImportGetById({ importId })),
  );

  registerTool(
    server,
    "list_imported_comments",
    {
      title: "List imported comments for a post",
      description: "List the comments fetched by comment imports for a post, optionally filtered by platform / social account.",
      inputSchema: {
        postId: z.string().min(1).describe("Id of the post whose imported comments to list."),
        platform: z.string().optional().describe("Filter by platform name/alias."),
        socialAccountId: z.string().optional().describe("Filter by social-account id."),
        teamId: teamIdSchema,
        limit: z.number().int().positive().max(100).optional(),
        offset: z.number().int().nonnegative().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ postId, platform, socialAccountId, teamId, limit, offset }) => {
      const id = await resolveTeamId(ctx, teamId);
      return jsonResult(
        await ctx.client.comment.commentImportGetFetchedComments({
          teamId: id,
          postId,
          platform: platform ? (normalizePlatform(platform) as CommentImportPlatform) : undefined,
          socialAccountId,
          limit: limit ?? null,
          offset: offset ?? null,
        }),
      );
    },
  );
}
