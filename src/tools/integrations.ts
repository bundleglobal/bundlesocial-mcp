import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  SocialAccountConnectData,
  SocialAccountCreatePortalLinkData,
} from "bundlesocial";
import { type ServerContext, resolveTeamId } from "../client";
import { jsonResult } from "../errors";
import { normalizePlatform, type Platform } from "../platforms";
import { registerTool } from "../register-tool";

const teamIdSchema = z
  .string()
  .min(1)
  .optional()
  .describe("bundle.social team id. Optional when the organization has a single team or BUNDLESOCIAL_TEAM_ID is configured.");

const platformSchema = z
  .string()
  .min(1)
  .describe('Platform name/alias (x, tiktok, instagram, youtube, facebook, threads, linkedin, pinterest, reddit, mastodon, discord, slack, gbp).');

type ConnectBody = NonNullable<SocialAccountConnectData["requestBody"]>;
type PortalLinkBody = NonNullable<SocialAccountCreatePortalLinkData["requestBody"]>;

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

  registerTool(
    server,
    "connect_integration",
    {
      title: "Connect a social account",
      description:
        "Start connecting a social account to a team. Returns an OAuth `url` — open it in a browser to authorize the account; bundle.social redirects back to `redirectUrl` afterwards. For Mastodon/Bluesky pass `serverUrl`.",
      inputSchema: {
        platform: platformSchema,
        redirectUrl: z.string().min(1).describe("URL bundle.social redirects to after the user finishes (or cancels) the OAuth flow."),
        serverUrl: z.string().optional().describe("Mastodon/Bluesky instance URL (required for those platforms)."),
        teamId: teamIdSchema,
        options: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Advanced provider flags, e.g. {\"instagramConnectionMethod\":\"INSTAGRAM\",\"withBusinessScope\":true,\"disableAutoLogin\":true,\"forceBrowserOAuth\":true}."),
      },
      annotations: { openWorldHint: true },
    },
    async ({ platform, redirectUrl, serverUrl, teamId, options }) => {
      const id = await resolveTeamId(ctx, teamId);
      const requestBody = {
        type: normalizePlatform(platform) as ConnectBody["type"],
        teamId: id,
        redirectUrl,
        ...(serverUrl ? { serverUrl } : {}),
        ...(options ?? {}),
      } as ConnectBody;
      return jsonResult(await ctx.client.socialAccount.socialAccountConnect({ requestBody }));
    },
  );

  registerTool(
    server,
    "disconnect_integration",
    {
      title: "Disconnect a social account",
      description: "Disconnect a social account of the given platform from a team. Destructive — also removes it from scheduled posts.",
      inputSchema: { platform: platformSchema, teamId: teamIdSchema },
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    async ({ platform, teamId }) => {
      const id = await resolveTeamId(ctx, teamId);
      return jsonResult(await ctx.client.socialAccount.socialAccountDisconnect({ requestBody: { type: normalizePlatform(platform) as Platform, teamId: id } }));
    },
  );

  registerTool(
    server,
    "set_integration_channel",
    {
      title: "Set a social account's channel/page",
      description: "Select the page/channel for a connected account (needed for FACEBOOK, INSTAGRAM, LINKEDIN, YOUTUBE, GOOGLE_BUSINESS). Get channel ids from list_integrations / refresh_integration_channels.",
      inputSchema: { platform: platformSchema, channelId: z.string().min(1).describe("Channel/page id to select."), teamId: teamIdSchema },
      annotations: { openWorldHint: true },
    },
    async ({ platform, channelId, teamId }) => {
      const id = await resolveTeamId(ctx, teamId);
      return jsonResult(await ctx.client.socialAccount.socialAccountSetChannel({ requestBody: { type: normalizePlatform(platform) as never, teamId: id, channelId } }));
    },
  );

  registerTool(
    server,
    "unset_integration_channel",
    {
      title: "Clear a social account's channel/page",
      description: "Clear the selected page/channel for a connected account (FACEBOOK, INSTAGRAM, LINKEDIN, YOUTUBE, GOOGLE_BUSINESS) while keeping the authorization.",
      inputSchema: { platform: platformSchema, teamId: teamIdSchema },
      annotations: { openWorldHint: true },
    },
    async ({ platform, teamId }) => {
      const id = await resolveTeamId(ctx, teamId);
      return jsonResult(await ctx.client.socialAccount.socialAccountUnsetChannel({ requestBody: { type: normalizePlatform(platform) as never, teamId: id } }));
    },
  );

  registerTool(
    server,
    "refresh_integration_channels",
    {
      title: "Refresh a social account's channels",
      description: "Re-fetch the available channels for a connected account (needed for REDDIT, DISCORD, SLACK, PINTEREST and the page-based platforms).",
      inputSchema: { platform: platformSchema, teamId: teamIdSchema },
      annotations: { openWorldHint: true },
    },
    async ({ platform, teamId }) => {
      const id = await resolveTeamId(ctx, teamId);
      return jsonResult(await ctx.client.socialAccount.socialAccountRefreshChannels({ requestBody: { type: normalizePlatform(platform) as never, teamId: id } }));
    },
  );

  registerTool(
    server,
    "create_integration_portal_link",
    {
      title: "Create a connect-portal link",
      description:
        "Create a hosted bundle.social portal link a user can open to connect/manage social accounts without you implementing the OAuth flow. Returns a `url`.",
      inputSchema: {
        platforms: z.array(z.string().min(1)).min(1).describe("Platforms the portal should offer to connect (names/aliases)."),
        redirectUrl: z.string().optional().describe("URL to redirect to when the user finishes."),
        teamId: teamIdSchema,
        expiresInMinutes: z.number().int().min(5).max(2880).optional().describe("Link lifetime in minutes (5 min – 48 h)."),
        options: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Advanced portal options (logoUrl, userName, language, hidePoweredBy, maxSocialAccountsConnected, …)."),
      },
      annotations: { openWorldHint: true },
    },
    async ({ platforms, redirectUrl, teamId, expiresInMinutes, options }) => {
      const id = await resolveTeamId(ctx, teamId);
      const requestBody = {
        teamId: id,
        socialAccountTypes: platforms.map((p) => normalizePlatform(p)) as PortalLinkBody["socialAccountTypes"],
        ...(redirectUrl ? { redirectUrl } : {}),
        ...(expiresInMinutes ? { expiresIn: expiresInMinutes } : {}),
        ...(options ?? {}),
      } as PortalLinkBody;
      return jsonResult(await ctx.client.socialAccount.socialAccountCreatePortalLink({ requestBody }));
    },
  );

  registerTool(
    server,
    "check_integration_connection",
    {
      title: "Check a social account's connection",
      description: "Run an on-demand connection/disconnect health check for a connected account of the given platform.",
      inputSchema: { platform: platformSchema, teamId: teamIdSchema },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ platform, teamId }) => {
      const id = await resolveTeamId(ctx, teamId);
      return jsonResult(await ctx.client.socialAccount.socialAccountConnectionCheck({ requestBody: { type: normalizePlatform(platform) as Platform, teamId: id } }));
    },
  );

  registerTool(
    server,
    "refresh_integration_profile",
    {
      title: "Refresh a social account's profile",
      description: "Re-fetch the profile info (username, display name, avatar) for a connected account of the given platform.",
      inputSchema: { platform: platformSchema, teamId: teamIdSchema },
      annotations: { openWorldHint: true },
    },
    async ({ platform, teamId }) => {
      const id = await resolveTeamId(ctx, teamId);
      return jsonResult(await ctx.client.socialAccount.socialAccountProfileRefresh({ requestBody: { type: normalizePlatform(platform) as Platform, teamId: id } }));
    },
  );

  registerTool(
    server,
    "get_integration_by_type",
    {
      title: "Get a social account by platform",
      description: "Fetch the connected social account of a given platform for a team (including its channels).",
      inputSchema: { platform: platformSchema, teamId: teamIdSchema },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ platform, teamId }) => {
      const id = await resolveTeamId(ctx, teamId);
      return jsonResult(await ctx.client.socialAccount.socialAccountGetByType({ teamId: id, type: normalizePlatform(platform) as Platform }));
    },
  );

  registerTool(
    server,
    "copy_integration",
    {
      title: "Copy social accounts between teams",
      description: "Copy connected social accounts of the given platforms from one team to another. Set `resetChannel` to require re-picking the page (Facebook/Instagram/LinkedIn/YouTube).",
      inputSchema: {
        fromTeamId: z.string().min(1).describe("Source team id."),
        toTeamId: z.string().min(1).describe("Destination team id."),
        platforms: z.array(z.string().min(1)).min(1).describe("Platforms to copy (names/aliases)."),
        resetChannel: z.boolean().optional().describe("If true, the destination must re-select the page/channel."),
      },
      annotations: { openWorldHint: true },
    },
    async ({ fromTeamId, toTeamId, platforms, resetChannel }) =>
      jsonResult(
        await ctx.client.socialAccount.socialAccountCopy({
          requestBody: {
            fromTeamId,
            toTeamId,
            ...(resetChannel !== undefined ? { resetChannel } : {}),
            socialAccountTypes: platforms.map((p) => normalizePlatform(p)) as Platform[],
          },
        }),
      ),
  );

  registerTool(
    server,
    "list_integrations_to_delete",
    {
      title: "List social accounts pending deletion",
      description: "List social accounts scheduled to be deleted (paginated) across the organization.",
      inputSchema: {
        page: z.number().int().positive().optional().describe("Page (1-based)."),
        pageSize: z.number().int().positive().max(100).optional().describe("Page size."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ page, pageSize }) => jsonResult(await ctx.client.socialAccount.socialAccountGetAccountsToDelete({ page, pageSize })),
  );
}
