import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type ServerContext, resolveTeamId } from "../client";
import { jsonResult } from "../errors";
import { McpToolError } from "../errors";
import { registerTool } from "../register-tool";
import { API_ACTIONS, describeApiAction, findApiAction, runApiAction, searchApiActions } from "../api-actions";

const paramsSchema = z
  .record(z.string(), z.unknown())
  .optional()
  .describe(
    "Flat object of the action's parameters (path, query and body fields side by side), as listed by search_api_actions. teamId accepts a team id or name and is filled in automatically when it can be.",
  );

/** Generic access to every public API endpoint, for whatever the dedicated tools don't cover. */
export function registerApiTools(server: McpServer, ctx: ServerContext): void {
  const resolveTeam = (teamIdOrName?: string) => resolveTeamId(ctx, teamIdOrName);

  registerTool(
    server,
    "search_api_actions",
    {
      title: "Search API actions",
      description: `Search all ${API_ACTIONS.length} bundle.social API actions, including ones no dedicated tool covers: editing or deleting published posts per platform, YouTube playlists and thumbnails, Google Business profile, reviews and Facebook recommendations, direct messages and automations, credits, multipart uploads. Returns ids with their parameters; run read actions with call_api_read and the rest with call_api_action. Prefer a dedicated tool when one exists.`,
      inputSchema: {
        query: z.string().optional().describe('Words to match, e.g. "youtube playlist", "reply review", "conversation message". Omit to list every action.'),
        readOnly: z.boolean().optional().describe("true for read actions only, false for actions that change something."),
        limit: z.number().int().positive().max(200).optional().describe("Maximum results (default 25)."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query, readOnly, limit }) => {
      const matches = searchApiActions(query, { readOnly });
      const max = limit ?? 25;
      // A broad listing stays compact; a narrow search returns full parameter lists.
      const detailed = Boolean(query) && matches.length <= max;
      return jsonResult({
        total: matches.length,
        actions: matches.slice(0, max).map((action) => describeApiAction(action, detailed)),
        ...(matches.length > max ? { note: `Showing ${max} of ${matches.length}. Narrow the query to see parameters.` } : {}),
      });
    },
  );

  registerTool(
    server,
    "call_api_read",
    {
      title: "Run a read API action",
      description: "Run a read-only bundle.social API action (readOnly: true in search_api_actions) by id, with its parameters.",
      inputSchema: {
        action: z.string().min(1).describe('Action id from search_api_actions, e.g. "misc.google-business-get-reviews".'),
        params: paramsSchema,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ action, params }) => {
      const found = findApiAction(action);
      if (!found.readOnly) {
        throw new McpToolError("NOT_READ_ONLY", `"${found.id}" changes data (${found.http}). Run it with call_api_action.`);
      }
      return jsonResult(await runApiAction(ctx.client, found, params ?? {}, resolveTeam));
    },
  );

  registerTool(
    server,
    "call_api_action",
    {
      title: "Run an API action that changes data",
      description:
        "Run a bundle.social API action that creates, updates, deletes or sends something (readOnly: false in search_api_actions), by id, with its parameters. Confirm with the user before deleting, publishing or sending.",
      inputSchema: {
        action: z.string().min(1).describe('Action id from search_api_actions, e.g. "misc.youtube-edit-video".'),
        params: paramsSchema,
      },
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    async ({ action, params }) => {
      const found = findApiAction(action);
      if (found.readOnly) {
        throw new McpToolError("READ_ONLY_ACTION", `"${found.id}" only reads data. Run it with call_api_read.`);
      }
      return jsonResult(await runApiAction(ctx.client, found, params ?? {}, resolveTeam));
    },
  );

  registerTool(
    server,
    "get_credit_balance",
    {
      title: "Get credit balance",
      description:
        "The organization's prepaid credit balance for X (Twitter) pay-per-use actions: settled funds, holds for in-flight actions and the available amount. Check it before posting to X.",
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => jsonResult(await ctx.client.credit.creditGetCreditBalance()),
  );

  registerTool(
    server,
    "quote_billable_usage",
    {
      title: "Quote X usage cost",
      description:
        "Price planned X (Twitter) actions before running them, e.g. a post with a link, so the user can see the cost and whether the balance covers it. Parameters as in the API (see search_api_actions \"quote\").",
      inputSchema: { params: paramsSchema },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ params }) =>
      jsonResult(await runApiAction(ctx.client, findApiAction("credit.quote-billable-usage"), params ?? {}, resolveTeam)),
  );
}
