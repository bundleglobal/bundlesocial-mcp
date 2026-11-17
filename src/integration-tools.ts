import type { Bundlesocial } from "bundlesocial";
import { McpToolError } from "./errors";

/**
 * Curated platform helpers — mostly read-only "what value goes here?" lookups
 * (subreddit flairs, YouTube categories, LinkedIn mentions, Google Business
 * categories, etc.), plus a few post actions flagged with `writes: true`. The
 * platform is implied by the method name; all are team-scoped, with extra
 * parameters supplied as a JSON object.
 */
export interface IntegrationTool {
  id: string;
  platform: string;
  description: string;
  requiredParams?: string[];
  optionalParams?: string[];
  /** Changes state on the platform (not a read-only lookup). */
  writes?: boolean;
  run: (client: Bundlesocial, teamId: string, params: Record<string, unknown>) => Promise<unknown>;
}

const TIKTOK_AUTHORIZATION_DAYS = [7, 30, 60, 180, 365] as const;
type TiktokAuthorizationDays = (typeof TIKTOK_AUTHORIZATION_DAYS)[number];

/** The TikTok post is addressed by exactly one of `postId` (bundle.social) or `platformPostId` (TikTok item_id). */
function tiktokPostRef(method: string, p: Record<string, unknown>): { postId: string } | { platformPostId: string } {
  const postId = p.postId ? String(p.postId) : undefined;
  const platformPostId = p.platformPostId ? String(p.platformPostId) : undefined;
  if (Boolean(postId) === Boolean(platformPostId)) {
    throw new McpToolError(
      "INVALID_PARAMS",
      `Integration tool "${method}" needs exactly one of postId (bundle.social post id) or platformPostId (TikTok item_id).`,
      { method },
    );
  }
  return postId ? { postId } : { platformPostId: platformPostId as string };
}

function tiktokAuthorizationDays(method: string, p: Record<string, unknown>): { authorizationDays?: TiktokAuthorizationDays } {
  if (p.authorizationDays === undefined || p.authorizationDays === null || p.authorizationDays === "") return {};
  const days = Number(p.authorizationDays);
  if (!(TIKTOK_AUTHORIZATION_DAYS as readonly number[]).includes(days)) {
    throw new McpToolError(
      "INVALID_PARAMS",
      `Integration tool "${method}": authorizationDays must be one of ${TIKTOK_AUTHORIZATION_DAYS.join(", ")}.`,
      { method, authorizationDays: p.authorizationDays },
    );
  }
  return { authorizationDays: days as TiktokAuthorizationDays };
}

export const INTEGRATION_TOOLS: IntegrationTool[] = [
  {
    id: "reddit:flairs",
    platform: "REDDIT",
    description: "List the post flairs available in a subreddit (use the returned flair id when creating a Reddit post that requires a flair).",
    requiredParams: ["subreddit"],
    run: (client, teamId, p) => client.misc.miscRedditGetSubredditFlairs({ teamId, subreddit: String(p.subreddit) }),
  },
  {
    id: "reddit:requirements",
    platform: "REDDIT",
    description: "Get a subreddit's posting requirements (title length, flair requirement, allowed post types, etc.).",
    requiredParams: ["subreddit"],
    run: (client, teamId, p) => client.misc.miscRedditGetPostRequirements({ teamId, subreddit: String(p.subreddit) }),
  },
  {
    id: "youtube:categories",
    platform: "YOUTUBE",
    description: "List YouTube video categories for a region (use the returned category id as `categoryId` when posting a YouTube video).",
    optionalParams: ["regionCode"],
    run: (client, teamId, p) =>
      client.misc.miscYoutubeGetVideoCategories({ teamId, ...(p.regionCode ? { regionCode: String(p.regionCode) } : {}) }),
  },
  {
    id: "youtube:playlists",
    platform: "YOUTUBE",
    description: "List the connected YouTube channel's playlists (use a playlist id to add the posted video to it).",
    optionalParams: ["maxResults"],
    run: (client, teamId, p) =>
      client.misc.miscYoutubeGetChannelPlaylist({ teamId, ...(p.maxResults !== undefined ? { maxResults: Number(p.maxResults) } : {}) }),
  },
  {
    id: "youtube:regions",
    platform: "YOUTUBE",
    description: "List YouTube content regions (i18n region codes).",
    run: (client, teamId) => client.misc.miscYoutubeGetRegions({ teamId }),
  },
  {
    id: "linkedin:mentions",
    platform: "LINKEDIN",
    description: "Search LinkedIn people/organizations to mention in a post (use the returned URN in the post text).",
    requiredParams: ["q"],
    optionalParams: ["scope"],
    run: (client, teamId, p) =>
      client.misc.miscLinkedinGetTags({
        teamId,
        q: String(p.q),
        ...(p.scope ? { scope: String(p.scope) as "people" | "organizations" | "all" } : {}),
      }),
  },
  {
    id: "instagram:locations",
    platform: "INSTAGRAM",
    description: "Search Instagram locations (use the returned location id as `locationId` when posting).",
    requiredParams: ["q"],
    optionalParams: ["limit"],
    run: (client, teamId, p) =>
      client.misc.miscInstagramSearchLocations({ teamId, q: String(p.q), ...(p.limit !== undefined ? { limit: Number(p.limit) } : {}) }),
  },
  {
    id: "gbp:location",
    platform: "GOOGLE_BUSINESS",
    description: "Get the connected Google Business Profile location's details.",
    optionalParams: ["fields"],
    run: (client, teamId, p) =>
      client.misc.miscGoogleBusinessGetLocation({ teamId, ...(Array.isArray(p.fields) ? { fields: p.fields as never } : {}) }),
  },
  {
    id: "gbp:categories",
    platform: "GOOGLE_BUSINESS",
    description: "List Google Business Profile categories for a region/language (use a category id when updating the location).",
    requiredParams: ["languageCode", "regionCode"],
    optionalParams: ["filter", "pageSize", "pageToken", "view"],
    run: (client, teamId, p) =>
      client.misc.miscGoogleBusinessListCategories({
        teamId,
        languageCode: String(p.languageCode),
        regionCode: String(p.regionCode),
        ...(p.filter ? { filter: String(p.filter) } : {}),
        ...(p.pageSize !== undefined ? { pageSize: Number(p.pageSize) } : {}),
        ...(p.pageToken ? { pageToken: String(p.pageToken) } : {}),
        ...(p.view ? { view: String(p.view) as never } : {}),
      }),
  },
  {
    id: "instagram:audio",
    platform: "INSTAGRAM",
    description:
      "Search the Instagram audio catalogue (use the returned audio_id as `musicSoundInfo.musicSoundId` when posting a Reel).",
    requiredParams: ["audioType"],
    optionalParams: ["searchQuery"],
    run: (client, teamId, p) =>
      client.misc.miscInstagramSearchAudio({
        teamId,
        audioType: String(p.audioType) as "original_sound" | "music",
        ...(p.searchQuery ? { searchQuery: String(p.searchQuery) } : {}),
      }),
  },
  {
    id: "instagram:business-discovery",
    platform: "INSTAGRAM",
    description:
      "Look up a public Instagram Business/Creator profile by username (followers, media count, recent public media). Requires an account connected via Facebook Login.",
    requiredParams: ["username"],
    run: (client, teamId, p) => client.misc.miscInstagramBusinessDiscovery({ teamId, username: String(p.username) }),
  },
  {
    id: "tiktok:trending-music",
    platform: "TIKTOK",
    description: "List trending tracks from TikTok's commercial music library (use a track id in the TikTok post settings).",
    optionalParams: ["dateRange", "genre"],
    run: (client, teamId, p) =>
      client.misc.miscTiktokGetCommercialMusicTrendingList({
        teamId,
        ...(p.dateRange ? { dateRange: String(p.dateRange) as "1DAY" | "7DAY" | "30DAY" } : {}),
        ...(p.genre ? { genre: String(p.genre) as never } : {}),
      }),
  },
  {
    id: "tiktok:ad-authorization",
    platform: "TIKTOK",
    description:
      "Get the Spark Ads authorization code of a TikTok post with its validity window and status (NOT_USED, IN_USE, EXPIRED). Pass exactly one of postId (bundle.social post) or platformPostId (TikTok item_id). Fails if ad authorization was never enabled for the post.",
    optionalParams: ["postId", "platformPostId"],
    run: (client, teamId, p) =>
      client.misc.miscTiktokGetAdAuthorization({ teamId, ...tiktokPostRef("tiktok:ad-authorization", p) }),
  },
  {
    id: "tiktok:enable-ad-authorization",
    platform: "TIKTOK",
    description:
      "Turn on ad authorization for a public TikTok post and return its Spark Ads code (share it with the advertiser). Accepts TikTok's Advertising Content Terms for the post. Pass exactly one of postId or platformPostId; authorizationDays 7/30/60/180/365 (default 30).",
    optionalParams: ["postId", "platformPostId", "authorizationDays"],
    writes: true,
    run: (client, teamId, p) =>
      client.misc.miscTiktokEnableAdAuthorization({
        requestBody: {
          teamId,
          ...tiktokPostRef("tiktok:enable-ad-authorization", p),
          ...tiktokAuthorizationDays("tiktok:enable-ad-authorization", p),
        },
      }),
  },
  {
    id: "tiktok:extend-ad-authorization",
    platform: "TIKTOK",
    description:
      "Add days (authorizationDays 7/30/60/180/365, default 30) to a TikTok post's Spark Ads code, or issue a new code if the old one was deleted. Ad authorization must already be enabled. Pass exactly one of postId or platformPostId.",
    optionalParams: ["postId", "platformPostId", "authorizationDays"],
    writes: true,
    run: (client, teamId, p) =>
      client.misc.miscTiktokExtendAdAuthorization({
        requestBody: {
          teamId,
          ...tiktokPostRef("tiktok:extend-ad-authorization", p),
          ...tiktokAuthorizationDays("tiktok:extend-ad-authorization", p),
        },
      }),
  },
  {
    id: "tiktok:disable-ad-authorization",
    platform: "TIKTOK",
    description:
      "Turn off ad authorization for a TikTok post. TikTok refuses this while the post runs in an active Spark Ad (pause those ads first). Pass exactly one of postId or platformPostId.",
    optionalParams: ["postId", "platformPostId"],
    writes: true,
    run: (client, teamId, p) =>
      client.misc.miscTiktokDisableAdAuthorization({
        requestBody: { teamId, ...tiktokPostRef("tiktok:disable-ad-authorization", p) },
      }),
  },
];

export function listIntegrationTools() {
  return INTEGRATION_TOOLS.map((tool) => ({
    method: tool.id,
    platform: tool.platform,
    description: tool.description,
    requiredParams: tool.requiredParams ?? [],
    optionalParams: tool.optionalParams ?? [],
    writes: tool.writes ?? false,
  }));
}

export async function runIntegrationTool(
  client: Bundlesocial,
  teamId: string,
  method: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const tool = INTEGRATION_TOOLS.find((candidate) => candidate.id === method.trim().toLowerCase());
  if (!tool) {
    throw new McpToolError(
      "UNKNOWN_INTEGRATION_TOOL",
      `Unknown integration tool "${method}". Available: ${INTEGRATION_TOOLS.map((t) => t.id).join(", ")}.`,
      { available: INTEGRATION_TOOLS.map((t) => t.id) },
    );
  }
  const missing = (tool.requiredParams ?? []).filter((key) => params[key] === undefined || params[key] === null || params[key] === "");
  if (missing.length > 0) {
    throw new McpToolError(
      "MISSING_PARAMS",
      `Integration tool "${tool.id}" requires: ${missing.join(", ")}. Provide them in the params object.`,
      { method: tool.id, requiredParams: tool.requiredParams },
    );
  }
  return tool.run(client, teamId, params);
}
