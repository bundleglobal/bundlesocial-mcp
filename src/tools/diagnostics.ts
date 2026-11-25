import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import pkg from "../../package.json";
import { type ServerContext, DASHBOARD_SOCIAL_ACCOUNTS_URL, listAllTeams, teamSample } from "../client";
import { errorSummary, jsonResult, normalizeError } from "../errors";
import { registerTool } from "../register-tool";

const VERSION: string = pkg.version;

type CheckStatus = "ok" | "warn" | "fail";
interface Check {
  name: string;
  status: CheckStatus;
  message: string;
  [key: string]: unknown;
}

export function registerDiagnosticsTools(server: McpServer, ctx: ServerContext): void {
  registerTool(
    server,
    "check_setup",
    {
      title: "Check the bundle.social setup",
      description:
        "Diagnose this MCP server's setup: credentials present, API reachable, credentials valid, organization API access, team resolution, connected integrations and posts quota. Always returns a structured diagnostic object ({ ok, checks: [...] }).",
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => {
      const checks: Check[] = [];
      const add = (name: string, status: CheckStatus, message: string, extra: Record<string, unknown> = {}) =>
        checks.push({ name, status, message, ...extra });
      const finish = () => jsonResult({ ok: checks.every((check) => check.status !== "fail"), mcpVersion: VERSION, node: process.version, checks });

      const oauth = ctx.auth === "oauth";
      // The server is only constructed with credentials, so they are always present here.
      if (oauth) add("connection", "ok", "Signed in to bundle.social");
      else add("api_key", "ok", "API key configured");

      try {
        const health = await ctx.client.app.appGetHealth();
        add("api_reachable", "ok", "API reachable", { health });
      } catch (error) {
        add("api_reachable", "fail", "Could not reach the bundle.social API", { error: errorSummary(error) });
        return finish();
      }

      let teams: Array<{ id: string; name: string }> = [];
      let organizationApiAccess: boolean | undefined;
      try {
        const organization = await ctx.client.organization.organizationGetOrganization();
        organizationApiAccess = organization.apiAccess;
        add("authentication", "ok", oauth ? "Connection is active" : "API key is valid", { organizationId: organization.id, organizationName: organization.name ?? null });
      } catch (error) {
        // The API's message says what to do (for a disconnected app: reconnect).
        const reason = normalizeError(error).message;
        add(
          "authentication",
          "fail",
          oauth
            ? `bundle.social rejected this connection: ${reason}`
            : `API key was rejected by the API: ${reason}`,
          { error: errorSummary(error) },
        );
        return finish();
      }
      if (!ctx.defaultTeamId) {
        try {
          teams = (await listAllTeams(ctx.client)).map((team) => ({ id: team.id, name: team.name }));
        } catch (error) {
          add("team", "fail", "Could not list the organization's teams", { error: errorSummary(error) });
          return finish();
        }
      }
      add(
        "api_access",
        organizationApiAccess ? "ok" : "fail",
        organizationApiAccess
          ? "Organization has API access enabled"
          : "Organization does not have API access enabled — upgrade your plan or contact bundle.social support",
      );

      let teamId: string | undefined;
      if (ctx.defaultTeamId) {
        teamId = ctx.defaultTeamId;
        add("team", "ok", "Using the configured default team", { teamId });
      } else if (teams.length === 1) {
        teamId = teams[0].id;
        add("team", "ok", "Using the organization's only team", { teamId, teamName: teams[0].name });
      } else if (teams.length === 0) {
        add("team", "fail", "Organization has no teams — create one in the dashboard");
      } else {
        // Several teams is normal (agencies run one per client): the agent names the team per request.
        // Only a sample is listed so an organization with hundreds of teams doesn't flood the context.
        const sample = teamSample(teams);
        add(
          "team",
          "ok",
          `${teams.length} teams, no default team. Name the team in each request; teamId accepts a team id or name.` +
            (sample.totalTeams ? ` Showing ${sample.teams.length}; list_teams (with search) has the rest.` : ""),
          sample,
        );
      }

      if (teamId) {
        try {
          const team = await ctx.client.team.teamGetTeam({ id: teamId });
          const accounts = team.socialAccounts ?? [];
          add(
            "integrations",
            accounts.length > 0 ? "ok" : "warn",
            accounts.length > 0 ? `${accounts.length} connected integration(s)` : "No integrations connected — connect one in the dashboard before posting",
            { count: accounts.length, platforms: accounts.map((account) => account.type), connectUrl: DASHBOARD_SOCIAL_ACCOUNTS_URL },
          );
        } catch (error) {
          add("integrations", "fail", "Could not load the team's integrations", { teamId, error: errorSummary(error) });
        }
      }

      try {
        const usage = await ctx.client.organization.organizationGetPostsUsage();
        add("posts_quota", usage.remaining > 0 ? "ok" : "warn", `Posts quota: ${usage.used}/${usage.limit} used, ${usage.remaining} remaining`, {
          used: usage.used,
          limit: usage.limit,
          remaining: usage.remaining,
        });
      } catch (error) {
        add("posts_quota", "warn", "Could not read posts quota", { error: errorSummary(error) });
      }

      return finish();
    },
  );
}
