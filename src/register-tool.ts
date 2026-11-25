import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z, ZodRawShape } from "zod";
import { errorResult, type ToolResult } from "./errors";

type InferShape<Shape extends ZodRawShape> = { [K in keyof Shape]: z.infer<Shape[K]> };

export interface ToolConfig<Shape extends ZodRawShape> {
  title?: string;
  description: string;
  inputSchema?: Shape;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

/**
 * Tools that publish to, or fetch from, places outside the user's bundle.social account (social platforms,
 * arbitrary URLs, the open API surface). Everything else stays inside the account.
 */
export const OPEN_WORLD_TOOLS = new Set([
  "create_post",
  "schedule_post",
  "update_post",
  "delete_post",
  "retry_post",
  "create_comment",
  "update_comment",
  "delete_comment",
  "retry_comment",
  "act_on_imported_comment",
  "manage_tiktok_ad_authorization",
  "connect_integration",
  "create_integration_portal_link",
  "trigger_integration_tool",
  "upload_media",
  "create_post_csv_import",
  "call_api_action",
]);

/** Every hint as an explicit boolean, as both the Claude and ChatGPT directories require. */
export function explicitAnnotations(name: string, annotations: ToolConfig<ZodRawShape>["annotations"] = {}) {
  const readOnlyHint = annotations.readOnlyHint === true;
  return {
    ...annotations,
    readOnlyHint,
    destructiveHint: readOnlyHint ? false : annotations.destructiveHint !== false,
    openWorldHint: OPEN_WORLD_TOOLS.has(name),
  };
}

/**
 * Register a tool whose handler always returns a structured result — thrown
 * errors (incl. SDK `ApiError`s and `McpToolError`s) become the standard
 * `{ error: { code, message, details? } }` envelope with `isError: true`.
 */
export function registerTool<Shape extends ZodRawShape>(
  server: McpServer,
  name: string,
  config: ToolConfig<Shape>,
  handler: (args: InferShape<Shape>) => Promise<ToolResult>,
): void {
  // The MCP SDK's overloads can't statically tie our handler's arg type to the
  // zod shape here, so the cast is confined to this single boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const withHints = { ...config, annotations: explicitAnnotations(name, config.annotations) };
  server.registerTool(name, withHints as any, (async (args: any) => {
    try {
      return await handler(args ?? {});
    } catch (error) {
      return errorResult(error);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any);
}
