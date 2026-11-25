import { Bundlesocial, OpenAPI, type TeamGetListResponse } from "bundlesocial";
import { z } from "zod";
import { McpToolError } from "./errors";

export const DEFAULT_API_URL = "https://api.bundle.social";
export const DASHBOARD_API_KEYS_URL = "https://bundle.social/dashboard/organization/api-keys";
export const DASHBOARD_SOCIAL_ACCOUNTS_URL = "https://bundle.social/dashboard/general/social-accounts";

/** stdio = local process on the user's machine; hosted = shared remote server (no local file access). */
export type ServerMode = "stdio" | "hosted";
/** How the user signed in: an API key, or an OAuth connection made by the hosted server. */
export type AuthMethod = "api-key" | "oauth";

export interface ServerContext {
  client: Bundlesocial;
  mode: ServerMode;
  auth: AuthMethod;
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

/** `clientId` goes out as `x-bundle-client` so the API can count MCP usage, e.g. "mcp/1.4.0". */
export function createClient(apiKey: string, apiUrl: string = DEFAULT_API_URL, clientId?: string): Bundlesocial {
  return new Bundlesocial(apiKey, {
    ...OpenAPI,
    BASE: apiUrl,
    ...(clientId ? { HEADERS: { "x-bundle-client": clientId } } : {}),
  });
}

/** Shared `teamId` input: an id or a team name, so agents can say "the Acme team" directly. */
export const teamIdSchema = z
  .string()
  .min(1)
  .optional()
  .describe(
    "bundle.social team id or exact team name. Optional when the organization has one team or a default team is configured; otherwise list_teams shows the choices.",
  );

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** How many teams a tool result or error lists; list_teams (with search) has the rest. */
export const TEAMS_SHOWN = 20;

/** Up to TEAMS_SHOWN teams as { id, name }, plus the total when some were left out. */
export function teamSample(teams: Array<{ id: string; name: string }>): {
  teams: Array<{ id: string; name: string }>;
  totalTeams?: number;
} {
  const shown = teams.slice(0, TEAMS_SHOWN).map((team) => ({ id: team.id, name: team.name }));
  return teams.length > shown.length ? { teams: shown, totalTeams: teams.length } : { teams: shown };
}
const moreTeamsHint = (count: number) => (count > TEAMS_SHOWN ? ` Showing ${TEAMS_SHOWN}; list_teams (with search) has the rest.` : "");

/**
 * Resolve the team to operate on: explicit `teamId` (an id or a team name) > configured
 * default > the organization's only team. Throws with the team list when ambiguous.
 */
export async function resolveTeamId(ctx: ServerContext, teamIdArg?: string): Promise<string> {
  if (teamIdArg) {
    const value = teamIdArg.trim();
    if (UUID_RE.test(value)) return value;
    const teams = await listAllTeams(ctx.client);
    if (teams.some((team) => team.id === value)) return value;
    const byName = teams.filter((team) => team.name?.trim().toLowerCase() === value.toLowerCase());
    if (byName.length === 1) return byName[0].id;
    if (byName.length > 1) {
      throw new McpToolError(
        "TEAM_AMBIGUOUS",
        `${byName.length} teams are named "${value}". Pass the team id instead.${moreTeamsHint(byName.length)}`,
        teamSample(byName),
      );
    }
    throw new McpToolError(
      "TEAM_NOT_FOUND",
      `No team with id or name "${value}". Pick one of the teams listed in details.${moreTeamsHint(teams.length)}`,
      teamSample(teams),
    );
  }
  if (ctx.defaultTeamId) return ctx.defaultTeamId;
  const teams = await listAllTeams(ctx.client);
  if (teams.length === 1) return teams[0].id;
  if (teams.length === 0) {
    throw new McpToolError("NO_TEAMS", "This organization has no teams yet. Create one in the bundle.social dashboard first.");
  }
  throw new McpToolError(
    "TEAM_ID_REQUIRED",
    `This organization has ${teams.length} teams and no default team. Pass "teamId" (a team id or name) from the teams listed in details.${moreTeamsHint(teams.length)}`,
    teamSample(teams),
  );
}
