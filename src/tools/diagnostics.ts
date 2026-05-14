import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import pkg from "../../package.json";
import { type ServerContext, DASHBOARD_SOCIAL_ACCOUNTS_URL } from "../client";
import { errorSummary, jsonResult } from "../errors";
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
        "Diagnose this MCP server's setup: API key present, API reachable, API key valid, organization API access, team resolution, connected integrations and posts quota. Always returns a structured diagnostic object ({ ok, checks: [...] }).",
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => {
      const checks: Check[] = [];
      const add = (name: string, status: CheckStatus, message: string, extra: Record<string, unknown> = {}) =>
        checks.push({ name, status, message, ...extra });
      const finish = () => jsonResult({ ok: checks.every((check) => check.status !== "fail"), mcpVersion: VERSION, node: process.version, checks });

      // The server is only constructed with a non-empty API key, so by the time
      // a tool runs the key is always present — record it for completeness.
      add("api_key", "ok", "API key configured");

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
        teams = (organization.teams ?? []).map((team) => ({ id: team.id, name: team.name }));
        organizationApiAccess = organization.apiAccess;
        add("authentication", "ok", "API key is valid", { organizationId: organization.id, organizationName: organization.name ?? null });
      } catch (error) {
        add("authentication", "fail", "API key was rejected by the API", { error: errorSummary(error) });
        return finish();
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
        add("team", "ok", "Using team from BUNDLESOCIAL_TEAM_ID / --team-id", { teamId });
      } else if (teams.length === 1) {
        teamId = teams[0].id;
        add("team", "ok", "Using the organization's only team", { teamId, teamName: teams[0].name });
      } else if (teams.length === 0) {
        add("team", "fail", "Organization has no teams — create one in the dashboard");
      } else {
        add("team", "warn", `Organization has ${teams.length} teams; tools need a teamId argument (or set BUNDLESOCIAL_TEAM_ID)`, { teams });
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
