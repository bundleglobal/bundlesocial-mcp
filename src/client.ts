import { Bundlesocial, OpenAPI } from "bundlesocial";
import { McpToolError } from "./errors";

export const DEFAULT_API_URL = "https://api.bundle.social";
export const DASHBOARD_API_KEYS_URL = "https://bundle.social/dashboard/organization/api-keys";
export const DASHBOARD_SOCIAL_ACCOUNTS_URL = "https://bundle.social/dashboard/general/social-accounts";

export interface ServerContext {
  client: Bundlesocial;
  /** Team id from BUNDLESOCIAL_TEAM_ID / --team-id, if configured. */
  defaultTeamId?: string;
}

export function createClient(apiKey: string, apiUrl: string = DEFAULT_API_URL): Bundlesocial {
  return new Bundlesocial(apiKey, { ...OpenAPI, BASE: apiUrl });
}

/**
 * Resolve the team to operate on: explicit `teamId` argument > server's
 * configured default > the organization's only team. Throws when ambiguous.
 */
export async function resolveTeamId(ctx: ServerContext, teamIdArg?: string): Promise<string> {
  if (teamIdArg) return teamIdArg;
  if (ctx.defaultTeamId) return ctx.defaultTeamId;
  const organization = await ctx.client.organization.organizationGetOrganization();
  const teams = organization.teams ?? [];
  if (teams.length === 1) return teams[0].id;
  if (teams.length === 0) {
    throw new McpToolError("NO_TEAMS", "This organization has no teams yet. Create one in the bundle.social dashboard first.");
  }
  throw new McpToolError(
    "TEAM_ID_REQUIRED",
    `This organization has ${teams.length} teams. Pass a "teamId" argument (or set BUNDLESOCIAL_TEAM_ID when starting the server).`,
    { teams: teams.map((team) => ({ id: team.id, name: team.name })) },
  );
}
