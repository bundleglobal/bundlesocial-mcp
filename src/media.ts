import fs from "node:fs/promises";
import path from "node:path";
import type { Bundlesocial } from "bundlesocial";
import { McpToolError } from "./errors";

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".mp4": "video/mp4",
  ".m4v": "video/x-m4v",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".pdf": "application/pdf",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
};

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

/**
 * Upload one media reference (a public URL, or — in stdio mode — a local file
 * path) and return the resulting upload object.
 */
export async function uploadMediaRef(client: Bundlesocial, teamId: string, ref: string) {
  if (isUrl(ref)) {
    return client.upload.uploadCreateFromUrl({ requestBody: { teamId, url: ref.trim() } });
  }
  const absolutePath = path.resolve(ref);
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(absolutePath);
  } catch {
    throw new McpToolError(
      "MEDIA_NOT_FOUND",
      `Could not read media "${ref}". Provide a public https:// URL, or a local file path that exists on the machine running this MCP server (stdio mode only).`,
      { path: absolutePath },
    );
  }
  const mime = MIME_BY_EXT[path.extname(absolutePath).toLowerCase()] ?? "application/octet-stream";
  const file = new File([buffer], path.basename(absolutePath), { type: mime });
  return client.upload.uploadCreate({ formData: { teamId, file } });
}

export async function uploadMediaRefs(client: Bundlesocial, teamId: string, refs: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const ref of refs) {
    const upload = await uploadMediaRef(client, teamId, ref);
    ids.push(upload.id);
  }
  return ids;
}
