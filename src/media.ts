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

/** Files larger than this must use the chunked/large-upload flow (init + signed PUT + finalize). */
export const LARGE_UPLOAD_THRESHOLD_BYTES = 90 * 1024 * 1024;

/** MIME types accepted by the large-upload (init) endpoint. */
const LARGE_UPLOAD_MIME_BY_EXT: Record<string, "image/jpg" | "image/jpeg" | "image/png" | "image/gif" | "video/mp4" | "application/pdf"> = {
  ".jpg": "image/jpg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
};

/**
 * Upload one media reference (a public URL, or — in stdio mode — a local file
 * path) and return the resulting upload object. Local files larger than ~90 MB
 * are uploaded via the large-upload flow automatically.
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
  if (buffer.byteLength > LARGE_UPLOAD_THRESHOLD_BYTES) {
    return uploadLargeMedia(client, teamId, absolutePath, buffer);
  }
  const mime = MIME_BY_EXT[path.extname(absolutePath).toLowerCase()] ?? "application/octet-stream";
  const file = new File([buffer], path.basename(absolutePath), { type: mime });
  return client.upload.uploadCreate({ formData: { teamId, file } });
}

/**
 * Upload a (large) local file via the init → signed PUT → finalize flow.
 * Only `image/jpg|jpeg|png|gif`, `video/mp4` and `application/pdf` are supported.
 */
async function uploadLargeMedia(client: Bundlesocial, teamId: string, absolutePath: string, buffer: Buffer) {
  const ext = path.extname(absolutePath).toLowerCase();
  const mimeType = LARGE_UPLOAD_MIME_BY_EXT[ext];
  if (!mimeType) {
    throw new McpToolError(
      "LARGE_UPLOAD_UNSUPPORTED_TYPE",
      `Large uploads (>90 MB) only support .jpg, .jpeg, .png, .gif, .mp4 and .pdf — got "${ext || "no extension"}".`,
      { path: absolutePath },
    );
  }
  const init = await client.upload.uploadInitLargeUpload({ requestBody: { teamId, fileName: path.basename(absolutePath), mimeType } });
  const put = await fetch(init.url, { method: "PUT", headers: { "content-type": mimeType }, body: new Uint8Array(buffer) });
  if (!put.ok) {
    throw new McpToolError("LARGE_UPLOAD_FAILED", `Uploading the file to storage failed (HTTP ${put.status}).`, { status: put.status });
  }
  return client.upload.uploadFinalizeLargeUpload({ requestBody: { teamId, path: init.path } });
}

export async function uploadMediaRefs(client: Bundlesocial, teamId: string, refs: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const ref of refs) {
    const upload = await uploadMediaRef(client, teamId, ref);
    ids.push(upload.id);
  }
  return ids;
}
