import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CommentCreateData, CommentGetListData, CommentImportCreateData, CommentUpdateData } from "bundlesocial";
import { type ServerContext, resolveTeamId } from "../client";
import { McpToolError, jsonResult } from "../errors";
import { COMMENT_PLATFORMS, type CommentPlatform, isCommentPlatform, normalizePlatform } from "../platforms";
import { resolveTargetPlatforms } from "../post-data";
import { registerTool } from "../register-tool";

type CommentImportPlatform = NonNullable<CommentImportCreateData["requestBody"]>["socialAccountType"];

const commentImportStatusSchema = z.enum(["PENDING", "FETCHING", "RETRYING", "COMPLETED", "SKIPPED", "FAILED", "RATE_LIMITED"]);

type CommentCreateBody = NonNullable<CommentCreateData["requestBody"]>;
type CommentUpdateBody = NonNullable<CommentUpdateData["requestBody"]>;

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
        "Post one or more comments on a post you created (`postId`) or on a post brought in by create_post_import (`importedPostId`). Pass `content` multiple times to create a chain (the first replies to the post, each subsequent one replies to the previous comment) — useful for X-style threads via comments. Use `fetchedParentCommentId` to reply to a comment pulled in by create_comment_import. Comments are supported on TIKTOK, YOUTUBE, INSTAGRAM, FACEBOOK, THREADS, LINKEDIN, REDDIT, MASTODON, DISCORD, SLACK, BLUESKY. Returns the created comment(s).",
      inputSchema: {
        postId: z.string().min(1).optional().describe("Id of the bundle.social post to comment on. Either this or importedPostId is required."),
        importedPostId: z
          .string()
          .min(1)
          .optional()
          .describe("Id of an imported (post-history) post to comment on instead of postId. Requires `platforms`."),
        fetchedParentCommentId: z
          .string()
          .min(1)
          .optional()
          .describe("Reply to a comment fetched by create_comment_import (its imported-comment id) instead of to the post itself."),
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
    async ({ postId, importedPostId, fetchedParentCommentId, content, platforms, date, delayMinutes, draft, teamId }) => {
      const id = await resolveTeamId(ctx, teamId);
      if (!postId && !importedPostId) {
        throw new McpToolError("NO_POST", "Pass `postId` (a bundle.social post) or `importedPostId` (a post brought in by create_post_import).");
      }
      let resolved: CommentPlatform[];
      if (platforms && platforms.length > 0) {
        resolved = assertCommentPlatforms(await resolveTargetPlatforms(ctx.client, id, platforms));
      } else if (postId) {
        // An imported post has no bundle.social `data` to infer platforms from, so targets are explicit there.
        const post = await ctx.client.post.postGet({ id: postId });
        resolved = Object.keys(post.data ?? {}).filter(isCommentPlatform);
        if (resolved.length === 0) {
          throw new McpToolError("NO_TARGET", "Could not determine comment platforms from the post — pass `platforms` (comment-capable only).");
        }
      } else {
        throw new McpToolError("NO_TARGET", "Pass `platforms` when commenting on an imported post (comment-capable only).");
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
            ...(postId ? { internalPostId: postId } : { importedPostId: importedPostId as string }),
            ...(parentCommentId ? { internalParentCommentId: parentCommentId } : {}),
            // Only the first comment of a chain replies to the fetched comment; the rest chain off each other.
            ...(!parentCommentId && fetchedParentCommentId ? { fetchedParentCommentId } : {}),
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

  registerTool(
    server,
    "update_comment",
    {
      title: "Update a comment",
      description:
        "Update an existing comment by id — change its title, scheduled date, status (DRAFT/SCHEDULED), targeted platforms and/or per-platform text. Only the fields you pass are changed. Use `data` for the full per-platform object, or `content` + `platforms` for a same-text-everywhere change.",
      inputSchema: {
        id: z.string().min(1).describe("Comment id."),
        title: z.string().optional().describe("New title."),
        date: z.string().optional().describe("New scheduled date, ISO 8601."),
        status: z.enum(["DRAFT", "SCHEDULED"]).optional().describe("New status."),
        content: z.string().optional().describe("New comment text, applied to every platform in `platforms`."),
        platforms: z
          .array(z.string().min(1))
          .optional()
          .describe("Comment-capable platform name/alias. Required when changing `content` without supplying `data`."),
        data: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('Advanced: the full comment `data` object keyed by platform, e.g. {"LINKEDIN":{"text":"new"}}.'),
      },
      annotations: { openWorldHint: true },
    },
    async ({ id, title, date, status, content, platforms, data }) => {
      const normalized = assertCommentPlatforms((platforms ?? []).map(normalizePlatform));
      const wantsDataChange = content !== undefined || data !== undefined;

      const requestBody: CommentUpdateBody = {};
      if (title !== undefined) requestBody.title = title;
      if (date) {
        const parsed = new Date(date);
        if (Number.isNaN(parsed.getTime())) {
          throw new McpToolError("INVALID_DATE", `date is not a valid ISO 8601 date/time: "${date}". Example: 2026-06-01T09:00:00Z`);
        }
        requestBody.postDate = parsed.toISOString();
      }
      if (status) requestBody.status = status;
      if (normalized.length > 0) requestBody.socialAccountTypes = normalized as CommentUpdateBody["socialAccountTypes"];
      if (wantsDataChange) {
        if (data) {
          requestBody.data = data as unknown as CommentUpdateBody["data"];
        } else {
          if (normalized.length === 0) {
            throw new McpToolError("NO_TARGET", "Pass `platforms` when changing `content` (the per-platform comment text needs to know which platforms to target).");
          }
          const perPlatform = Object.fromEntries(normalized.map((platform) => [platform, { text: content as string }]));
          requestBody.data = perPlatform as unknown as CommentUpdateBody["data"];
        }
      }
      if (Object.keys(requestBody).length === 0) {
        throw new McpToolError(
          "NOTHING_TO_UPDATE",
          "Nothing to update — pass at least one of title, date, status, content (+ platforms), data.",
        );
      }
      return jsonResult(await ctx.client.comment.commentUpdate({ id, requestBody }));
    },
  );

  registerTool(
    server,
    "retry_comment",
    {
      title: "Retry a failed comment",
      description: "Retry publishing a comment that ended in the ERROR state.",
      inputSchema: { id: z.string().min(1).describe("Comment id.") },
      annotations: { openWorldHint: true },
    },
    async ({ id }) => jsonResult(await ctx.client.comment.commentRetry({ id })),
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

  registerTool(
    server,
    "act_on_imported_comment",
    {
      title: "Moderate an imported comment",
      description:
        "Act on a comment fetched by a comment import — delete, hide/unhide, like/unlike, or approve/reject it. Supported actions vary by platform; DELETE and HIDE are the widely available ones.",
      inputSchema: {
        commentId: z.string().min(1).describe("Id of the fetched (imported) comment."),
        action: z
          .enum(["DELETE", "HIDE", "UNHIDE", "LIKE", "UNLIKE", "APPROVE", "REJECT"])
          .describe("What to do with the comment."),
        reason: z.string().optional().describe("Optional reason recorded with the action."),
        banAuthor: z.boolean().optional().describe("Also ban the comment's author, where the platform supports it."),
        teamId: teamIdSchema,
      },
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    async ({ commentId, action, reason, banAuthor, teamId }) => {
      const id = await resolveTeamId(ctx, teamId);
      return jsonResult(
        await ctx.client.comment.commentImportActionFetchedComment({
          commentId,
          requestBody: {
            teamId: id,
            action,
            ...(reason !== undefined ? { reason } : {}),
            ...(banAuthor ? { banAuthor: true } : {}),
          },
        }),
      );
    },
  );
}
