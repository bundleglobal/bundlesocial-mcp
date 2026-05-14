import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TeamUpdateTeamData } from "bundlesocial";
import type { ServerContext } from "../client";
import { McpToolError, jsonResult } from "../errors";
import { registerTool } from "../register-tool";

type TeamUpdateBody = NonNullable<TeamUpdateTeamData["requestBody"]>;

export function registerTeamTools(server: McpServer, ctx: ServerContext): void {
  registerTool(
    server,
    "list_teams",
    {
      title: "List teams",
      description: "List the teams in the organization (paginated). Use this to discover team ids for the optional `teamId` argument on other tools.",
      inputSchema: {
        limit: z.number().int().positive().max(100).optional().describe("Max number of teams to return."),
        offset: z.number().int().nonnegative().optional().describe("Number of teams to skip (for pagination)."),
        search: z.string().optional().describe("Free-text search over team names."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ limit, offset, search }) =>
      jsonResult(await ctx.client.team.teamGetList({ limit: limit ?? null, offset: offset ?? null, search: search ?? null })),
  );

  registerTool(
    server,
    "get_team",
    {
      title: "Get a team by id",
      description: "Fetch a single team by id, including its connected social accounts/integrations.",
      inputSchema: { id: z.string().min(1).describe("Team id.") },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ id }) => jsonResult(await ctx.client.team.teamGetTeam({ id })),
  );

  registerTool(
    server,
    "create_team",
    {
      title: "Create a team",
      description: "Create a new team in the organization. Optionally copy the connected social accounts from an existing team via `copyTeamId`.",
      inputSchema: {
        name: z.string().min(1).describe("Team name."),
        avatarUrl: z.string().optional().describe("Optional avatar image URL."),
        copyTeamId: z.string().optional().describe("Optional id of an existing team to copy social accounts from."),
      },
      annotations: { openWorldHint: true },
    },
    async ({ name, avatarUrl, copyTeamId }) =>
      jsonResult(
        await ctx.client.team.teamCreateTeam({
          requestBody: { name, avatarUrl: avatarUrl ?? null, copyTeamId: copyTeamId ?? null },
        }),
      ),
  );

  registerTool(
    server,
    "update_team",
    {
      title: "Update a team",
      description: "Update a team's name and/or avatar. Only the fields you pass are changed.",
      inputSchema: {
        id: z.string().min(1).describe("Team id."),
        name: z.string().optional().describe("New team name."),
        avatarUrl: z.string().nullable().optional().describe("New avatar image URL, or null to clear it."),
      },
      annotations: { openWorldHint: true },
    },
    async ({ id, name, avatarUrl }) => {
      const requestBody: TeamUpdateBody = {};
      if (name !== undefined) requestBody.name = name;
      if (avatarUrl !== undefined) requestBody.avatarUrl = avatarUrl;
      if (Object.keys(requestBody).length === 0) {
        throw new McpToolError("NOTHING_TO_UPDATE", "Nothing to update — pass at least one of name, avatarUrl.");
      }
      return jsonResult(await ctx.client.team.teamUpdateTeam({ id, requestBody }));
    },
  );

  registerTool(
    server,
    "delete_team",
    {
      title: "Delete a team",
      description: "Delete a team by id. This is destructive and cannot be undone — it removes the team and its scheduled content.",
      inputSchema: { id: z.string().min(1).describe("Team id.") },
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    async ({ id }) => jsonResult(await ctx.client.team.teamDeleteTeam({ id })),
  );
}
