import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type ServerContext, resolveTeamId, teamIdSchema } from "../client";
import { McpToolError, jsonResult } from "../errors";
import { uploadMediaRef } from "../media";
import { registerTool } from "../register-tool";

export function registerMediaTools(server: McpServer, ctx: ServerContext): void {
  registerTool(
    server,
    "create_upload_link",
    {
      title: "Create a link to upload a file",
      description:
        "Create a link the user opens in their browser to add files (JPG, PNG, GIF, MP4, MOV or PDF, up to 5 GB each) to a team's bundle.social media library, without signing in. Use it when the user has a file on their device that this chat can't send, for example a photo they want to post. Give the user the returned url, then call get_upload_link with the returned id to get the upload ids for create_post or schedule_post. The url is shown only once.",
      inputSchema: {
        teamId: teamIdSchema,
        maxFiles: z.number().int().min(1).max(10).optional().describe("How many files the user can add, 1 by default."),
        expiresIn: z.number().int().min(5).max(1440).optional().describe("Minutes the link stays open, 60 by default."),
      },
      annotations: { destructiveHint: true },
    },
    async ({ teamId, maxFiles, expiresIn }) => {
      const id = await resolveTeamId(ctx, teamId);
      return jsonResult(
        await ctx.client.request.request({
          method: "POST",
          url: "/api/v1/upload/link",
          body: { teamId: id, maxFiles, expiresIn },
          mediaType: "application/json",
        }),
      );
    },
  );

  registerTool(
    server,
    "get_upload_link",
    {
      title: "Check an upload link",
      description:
        "Status of a link made with create_upload_link: WAITING (the user hasn't added all files yet), COMPLETED or EXPIRED, with the ids of the files added so far. Pass those ids to create_post or schedule_post.",
      inputSchema: { id: z.string().min(1).describe("The id returned by create_upload_link.") },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) =>
      jsonResult(await ctx.client.request.request({ method: "GET", url: "/api/v1/upload/link/{id}", path: { id } })),
  );

  registerTool(
    server,
    "upload_media",
    {
      title: "Upload media",
      description:
        "Upload a media file (image, video or document) to a bundle.social team from a public https:// URL, a file the user attached in ChatGPT (`file`), or, when this server runs in stdio mode, a local file path. Local files larger than ~90 MB are uploaded via the large-upload flow automatically (only .jpg/.jpeg/.png/.gif/.mp4/.mov/.pdf are supported above that size). For a file on the user's device that none of these reach, create_upload_link gives the user a link to add it. Returns the upload object; pass its `id` to create_post/schedule_post via the `data` argument (e.g. {\"TWITTER\":{\"text\":\"hi\",\"uploadIds\":[\"<id>\"]}}).",
      inputSchema: {
        teamId: teamIdSchema,
        source: z
          .string()
          .min(1)
          .optional()
          .describe("A public https:// URL, or a local file path (stdio mode only). Leave out when passing `file`."),
        file: z
          .object({
            download_url: z.string().url(),
            file_id: z.string(),
            mime_type: z.string().optional(),
            file_name: z.string().optional(),
          })
          .optional()
          .describe("A file the user attached in the chat, as ChatGPT passes it. Leave out when passing `source`."),
      },
      annotations: { destructiveHint: true, openWorldHint: true },
      // ChatGPT fills `file` with the user's attachment and a temporary download_url.
      _meta: { "openai/fileParams": ["file"] },
    },
    async ({ teamId, source, file }) => {
      const ref = file?.download_url ?? source;
      if (!ref) {
        throw new McpToolError("MISSING_SOURCE", "Pass `source` (a public https:// URL) or `file` (an attached file).");
      }
      const id = await resolveTeamId(ctx, teamId);
      return jsonResult(await uploadMediaRef(ctx, id, ref));
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
        "Start a direct upload of a file of any size up to 5 GB. Returns a signed `url` (valid 30 minutes) and a `path`. PUT the raw file bytes to `url` with the same Content-Type as `mimeType`, for example `curl -X PUT -H \"Content-Type: video/mp4\" --upload-file ./clip.mp4 \"<url>\"`, then call finalize_large_upload with `path`. Use this to send a file from the user's machine to the hosted server (it cannot read local paths) or for files over ~90 MB. In stdio mode, upload_media with a local path does all of this automatically.",
      inputSchema: {
        teamId: teamIdSchema,
        fileName: z.string().min(1).describe("File name."),
        mimeType: z
          .enum(["image/jpg", "image/jpeg", "image/png", "image/gif", "video/mp4", "video/quicktime", "application/pdf"])
          .describe("File MIME type; also the Content-Type of the PUT."),
      },
      annotations: { destructiveHint: true, openWorldHint: true },
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
      description:
        "Finish a direct upload after the file bytes have been PUT to the signed url from init_large_upload. Returns the upload object; pass its `id` to create_post/schedule_post.",
      inputSchema: {
        teamId: teamIdSchema,
        path: z.string().min(1).describe("The `path` returned by init_large_upload."),
      },
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    async ({ teamId, path }) => {
      const id = await resolveTeamId(ctx, teamId);
      return jsonResult(await ctx.client.upload.uploadFinalizeLargeUpload({ requestBody: { teamId: id, path } }));
    },
  );
}
