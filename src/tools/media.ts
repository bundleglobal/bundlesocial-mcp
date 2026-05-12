import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type ServerContext, resolveTeamId } from "../client";
import { jsonResult } from "../errors";
import { uploadMediaRef } from "../media";
import { registerTool } from "../register-tool";

export function registerMediaTools(server: McpServer, ctx: ServerContext): void {
  registerTool(
    server,
    "upload_media",
    {
      title: "Upload media",
      description:
        "Upload a media file (image, video or document) to a bundle.social team from a public https:// URL — or, when this server runs in stdio mode, a local file path. Returns the upload object; pass its `id` to create_post/schedule_post via the `data` argument (e.g. {\"TWITTER\":{\"text\":\"hi\",\"uploadIds\":[\"<id>\"]}}).",
      inputSchema: {
        teamId: z
          .string()
          .min(1)
          .optional()
          .describe("bundle.social team id. Optional when the organization has a single team or BUNDLESOCIAL_TEAM_ID is configured."),
        source: z.string().min(1).describe("A public https:// URL, or a local file path (stdio mode only)."),
      },
      annotations: { openWorldHint: true },
    },
    async ({ teamId, source }) => {
      const id = await resolveTeamId(ctx, teamId);
      return jsonResult(await uploadMediaRef(ctx.client, id, source));
    },
  );
}
