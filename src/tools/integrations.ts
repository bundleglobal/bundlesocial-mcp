import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../client";
import { jsonResult } from "../errors";
import { registerTool } from "../register-tool";

const teamIdSchema = z
  .string()
  .min(1)
  .optional()
  .describe("bundle.social team id. Optional when the organization has a single team or BUNDLESOCIAL_TEAM_ID is configured.");

type SocialAccount = {
  id: string;
  type: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  channels?: Array<{ id: string; name?: string | null; username?: string | null; address?: string | null }> | null;
};

function mapAccounts(accounts: SocialAccount[] | undefined) {
  return (accounts ?? []).map((account) => ({
    id: account.id,
    type: account.type,
    username: account.username ?? null,
    displayName: account.displayName ?? null,
    avatarUrl: account.avatarUrl ?? null,
    channels: (account.channels ?? []).map((channel) => ({
      id: channel.id,
      name: channel.name ?? null,
      username: channel.username ?? null,
      address: channel.address ?? null,
    })),
  }));
}

export function registerIntegrationTools(server: McpServer, ctx: ServerContext): void {
  registerTool(
    server,
    "list_integrations",
    {
      title: "List connected integrations",
      description:
        "List the social-media integrations (accounts) connected to a bundle.social team — each with its `id`, `type` (platform), `username` and channels. Use this to discover which platforms are available and to get integration ids. Without a team id it lists every team in the organization.",
      inputSchema: { teamId: teamIdSchema },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ teamId }) => {
      if (teamId ?? ctx.defaultTeamId) {
        const id = (teamId ?? ctx.defaultTeamId) as string;
        const team = await ctx.client.team.teamGetTeam({ id });
        return jsonResult({ teamId: team.id, teamName: team.name, integrations: mapAccounts(team.socialAccounts) });
      }
      const organization = await ctx.client.organization.organizationGetOrganization();
      const teams = organization.teams ?? [];
      if (teams.length === 1) {
        const team = await ctx.client.team.teamGetTeam({ id: teams[0].id });
        return jsonResult({ teamId: team.id, teamName: team.name, integrations: mapAccounts(team.socialAccounts) });
      }
      const perTeam = [];
      for (const summary of teams) {
        const team = await ctx.client.team.teamGetTeam({ id: summary.id });
        perTeam.push({ teamId: team.id, teamName: team.name, integrations: mapAccounts(team.socialAccounts) });
      }
      return jsonResult({ organizationId: organization.id, organizationName: organization.name ?? null, teams: perTeam });
    },
  );
}
