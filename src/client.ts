import { Bundlesocial, OpenAPI, type TeamGetListResponse } from "bundlesocial";
import { McpToolError } from "./errors";

export const DEFAULT_API_URL = "https://api.bundle.social";
export const DASHBOARD_API_KEYS_URL = "https://bundle.social/dashboard/organization/api-keys";
export const DASHBOARD_SOCIAL_ACCOUNTS_URL = "https://bundle.social/dashboard/general/social-accounts";

export interface ServerContext {
  client: Bundlesocial;
  /** Team id from BUNDLESOCIAL_TEAM_ID / --team-id, if configured. */
  defaultTeamId?: string;
}

export type TeamListItem = TeamGetListResponse["items"][number];

/** Page size used when walking the team list (the `list_teams` tool caps at the same value). */
export const TEAM_PAGE_SIZE = 100;
/** Safety cap so a misbehaving `total` can't loop forever (100 pages x 100 = 10k teams). */
export const TEAM_MAX_PAGES = 100;

/**
 * Fetch every team in the organization via the paginated team list. Replaces
 * the deprecated `organization.teams` array (removed from the API on 2026-11-15).
 */
export async function listAllTeams(client: Bundlesocial): Promise<TeamListItem[]> {
  const teams: TeamListItem[] = [];
  for (let page = 0; page < TEAM_MAX_PAGES; page++) {
    const { items, total } = await client.team.teamGetList({ offset: teams.length, limit: TEAM_PAGE_SIZE });
    teams.push(...(items ?? []));
    if (!items?.length || teams.length >= total) return teams;
  }
  // stdio transport owns stdout, so warnings go to stderr.
  process.stderr.write(`bundlesocial-mcp: team list truncated at ${teams.length} teams (page cap ${TEAM_MAX_PAGES} reached)\n`);
  return teams;
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
  const teams = await listAllTeams(ctx.client);
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
