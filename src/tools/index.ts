import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../client";
import { registerIntegrationTools } from "./integrations";
import { registerPostTools } from "./posts";
import { registerCommentTools } from "./comments";
import { registerMediaTools } from "./media";
import { registerAnalyticsTools } from "./analytics";
import { registerIntegrationToolHelpers } from "./integration-tools";
import { registerTeamTools } from "./teams";
import { registerOrganizationTools } from "./organization";
import { registerPostImportTools } from "./post-imports";
import { registerPostCsvTools } from "./post-csv";
import { registerDiagnosticsTools } from "./diagnostics";

export function registerAllTools(server: McpServer, ctx: ServerContext): void {
  registerOrganizationTools(server, ctx);
  registerTeamTools(server, ctx);
  registerIntegrationTools(server, ctx);
  registerPostTools(server, ctx);
  registerCommentTools(server, ctx);
  registerMediaTools(server, ctx);
  registerAnalyticsTools(server, ctx);
  registerPostImportTools(server, ctx);
  registerPostCsvTools(server, ctx);
  registerIntegrationToolHelpers(server, ctx);
  registerDiagnosticsTools(server, ctx);
}
