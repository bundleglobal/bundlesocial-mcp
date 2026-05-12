import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../client";
import { registerIntegrationTools } from "./integrations";
import { registerPostTools } from "./posts";
import { registerCommentTools } from "./comments";
import { registerMediaTools } from "./media";
import { registerAnalyticsTools } from "./analytics";
import { registerIntegrationToolHelpers } from "./integration-tools";

export function registerAllTools(server: McpServer, ctx: ServerContext): void {
  registerIntegrationTools(server, ctx);
  registerPostTools(server, ctx);
  registerCommentTools(server, ctx);
  registerMediaTools(server, ctx);
  registerAnalyticsTools(server, ctx);
  registerIntegrationToolHelpers(server, ctx);
}
