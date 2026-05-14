import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type ServerContext, resolveTeamId } from "../client";
import { jsonResult } from "../errors";
import { uploadMediaRef } from "../media";
import { registerTool } from "../register-tool";

const teamIdSchema = z
  .string()
  .min(1)
  .optional()
  .describe("bundle.social team id. Optional when the organization has a single team or BUNDLESOCIAL_TEAM_ID is configured.");

export function registerMediaTools(server: McpServer, ctx: ServerContext): void {
  registerTool(
    server,
    "upload_media",
    {
      title: "Upload media",
      description:
        "Upload a media file (image, video or document) to a bundle.social team from a public https:// URL — or, when this server runs in stdio mode, a local file path. Local files larger than ~90 MB are uploaded via the large-upload flow automatically (only .jpg/.jpeg/.png/.gif/.mp4/.pdf are supported above that size). Returns the upload object; pass its `id` to create_post/schedule_post via the `data` argument (e.g. {\"TWITTER\":{\"text\":\"hi\",\"uploadIds\":[\"<id>\"]}}).",
      inputSchema: {
        teamId: teamIdSchema,
        source: z.string().min(1).describe("A public https:// URL, or a local file path (stdio mode only)."),
      },
      annotations: { openWorldHint: true },
    },
    async ({ teamId, source }) => {
      const id = await resolveTeamId(ctx, teamId);
      return jsonResult(await uploadMediaRef(ctx.client, id, source));
    },
  );

  registerTool(
    server,
    "list_media",
    {
      title: "List uploaded media",
      description: "List media uploads for a team, optionally filtered by type (image/video/document) and usage status (USED/UNUSED).",
      inputSchema: {
        teamId: teamIdSchema,
        type: z.enum(["image", "video", "document"]).optional().describe("Filter by media type."),
        status: z.enum(["USED", "UNUSED"]).optional().describe("Filter by whether the upload is attached to a post."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ teamId, type, status }) => {
      const id = await resolveTeamId(ctx, teamId);
      return jsonResult(await ctx.client.upload.uploadGetList({ teamId: id, type: type ?? null, status: status ?? null }));
    },
  );

  registerTool(
    server,
    "get_media",
    {
      title: "Get an upload by id",
      description: "Fetch a single media upload by its bundle.social id.",
      inputSchema: { id: z.string().min(1).describe("Upload id.") },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ id }) => jsonResult(await ctx.client.upload.uploadGet({ id })),
  );

  registerTool(
    server,
    "delete_media",
    {
      title: "Delete an upload",
      description: "Delete a media upload by its bundle.social id. Destructive.",
      inputSchema: { id: z.string().min(1).describe("Upload id.") },
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    async ({ id }) => jsonResult(await ctx.client.upload.uploadDelete({ id })),
  );

  registerTool(
    server,
    "delete_media_many",
    {
      title: "Delete multiple uploads",
      description: "Delete several media uploads at once by their ids. Destructive.",
      inputSchema: { ids: z.array(z.string().min(1)).min(1).describe("Upload ids to delete.") },
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    async ({ ids }) => jsonResult(await ctx.client.upload.uploadDeleteMany({ requestBody: { ids } })),
  );

  registerTool(
    server,
    "init_large_upload",
    {
      title: "Initialize a large upload",
      description:
        "Low-level: start a >90 MB upload. Returns a signed `url` (PUT the file bytes there with the matching content-type) and a `path` to pass to finalize_large_upload. Prefer `upload_media` with a local file path in stdio mode — it does this automatically.",
      inputSchema: {
        teamId: teamIdSchema,
        fileName: z.string().min(1).describe("File name."),
        mimeType: z.enum(["image/jpg", "image/jpeg", "image/png", "image/gif", "video/mp4", "application/pdf"]).describe("File MIME type."),
      },
      annotations: { openWorldHint: true },
    },
    async ({ teamId, fileName, mimeType }) => {
      const id = await resolveTeamId(ctx, teamId);
      return jsonResult(await ctx.client.upload.uploadInitLargeUpload({ requestBody: { teamId: id, fileName, mimeType } }));
    },
  );

  registerTool(
    server,
    "finalize_large_upload",
    {
      title: "Finalize a large upload",
      description: "Low-level: finalize a >90 MB upload after the bytes have been PUT to the signed URL from init_large_upload. Returns the upload object.",
      inputSchema: {
        teamId: teamIdSchema,
        path: z.string().min(1).describe("The `path` returned by init_large_upload."),
      },
      annotations: { openWorldHint: true },
    },
    async ({ teamId, path }) => {
      const id = await resolveTeamId(ctx, teamId);
      return jsonResult(await ctx.client.upload.uploadFinalizeLargeUpload({ requestBody: { teamId: id, path } }));
    },
  );
}
