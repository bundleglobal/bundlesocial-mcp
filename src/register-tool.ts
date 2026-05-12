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
  server.registerTool(name, config as any, (async (args: any) => {
    try {
      return await handler(args ?? {});
    } catch (error) {
      return errorResult(error);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any);
}
