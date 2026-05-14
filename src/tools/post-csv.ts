import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../client";
import { McpToolError, jsonResult } from "../errors";
import { registerTool } from "../register-tool";

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

async function readCsvFile(source: string): Promise<File> {
  if (isUrl(source)) {
    const response = await fetch(source.trim());
    if (!response.ok) {
      throw new McpToolError("CSV_FETCH_FAILED", `Could not download the CSV from "${source}" (HTTP ${response.status}).`, { status: response.status });
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const name = path.basename(new URL(source).pathname) || "import.csv";
    return new File([buffer], name, { type: "text/csv" });
  }
  const absolutePath = path.resolve(source);
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(absolutePath);
  } catch {
    throw new McpToolError(
      "CSV_NOT_FOUND",
      `Could not read CSV "${source}". Provide a public https:// URL, or a local file path that exists on the machine running this MCP server (stdio mode only).`,
      { path: absolutePath },
    );
  }
  return new File([buffer], path.basename(absolutePath), { type: "text/csv" });
}

export function registerPostCsvTools(server: McpServer, ctx: ServerContext): void {
  registerTool(
    server,
    "create_post_csv_import",
    {
      title: "Bulk-import posts from a CSV",
      description:
        "Upload a CSV for async bulk post import. Accepts a public https:// URL to the CSV, or a local file path when this server runs in stdio mode. Poll get_post_csv_import_status / get_post_csv_import_rows for progress and per-row results.",
      inputSchema: {
        source: z.string().min(1).describe("Public https:// URL of the CSV, or a local file path (stdio mode only)."),
      },
      annotations: { openWorldHint: true },
    },
    async ({ source }) => {
      const file = await readCsvFile(source);
      return jsonResult(await ctx.client.postCsv.postCsvCreate({ formData: { file } }));
    },
  );

  registerTool(
    server,
    "list_post_csv_imports",
    {
      title: "List CSV imports",
      description: "List the post-CSV import history (paginated).",
      inputSchema: {
        limit: z.number().int().positive().max(100).optional(),
        offset: z.number().int().nonnegative().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ limit, offset }) => jsonResult(await ctx.client.postCsv.postCsvGetList({ limit: limit ?? null, offset: offset ?? null })),
  );

  registerTool(
    server,
    "get_post_csv_import",
    {
      title: "Get a CSV import by id",
      description: "Fetch a single post-CSV import by its id, including counts and status.",
      inputSchema: { importId: z.string().min(1).describe("CSV import id.") },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ importId }) => jsonResult(await ctx.client.postCsv.postCsvGetById({ importId })),
  );

  registerTool(
    server,
    "get_post_csv_import_status",
    {
      title: "Get a CSV import's processing status",
      description: "Fetch the processing status of a post-CSV import (rows processed/succeeded/failed).",
      inputSchema: { importId: z.string().min(1).describe("CSV import id.") },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ importId }) => jsonResult(await ctx.client.postCsv.postCsvGetStatus({ importId })),
  );

  registerTool(
    server,
    "get_post_csv_import_rows",
    {
      title: "Get a CSV import's row results",
      description: "List per-row results of a post-CSV import (the raw row, normalized payload, created post id or error), optionally filtered by SUCCESS/FAILED.",
      inputSchema: {
        importId: z.string().min(1).describe("CSV import id."),
        status: z.enum(["SUCCESS", "FAILED"]).optional().describe("Filter rows by outcome."),
        limit: z.number().int().positive().max(100).optional(),
        offset: z.number().int().nonnegative().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ importId, status, limit, offset }) =>
      jsonResult(await ctx.client.postCsv.postCsvGetRows({ importId, status, limit: limit ?? null, offset: offset ?? null })),
  );
}
