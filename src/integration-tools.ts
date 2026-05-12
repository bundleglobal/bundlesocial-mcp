import type { Bundlesocial } from "bundlesocial";
import { McpToolError } from "./errors";

/**
 * Curated, read-only "what value goes here?" helpers — the bundle.social
 * equivalent of fetching subreddit flairs, YouTube categories, LinkedIn
 * mentions, Google Business categories, etc. The platform is implied by the
 * method name; all are team-scoped, with extra parameters supplied as a JSON
 * object.
 */
export interface IntegrationTool {
  id: string;
  platform: string;
  description: string;
  requiredParams?: string[];
  optionalParams?: string[];
  run: (client: Bundlesocial, teamId: string, params: Record<string, unknown>) => Promise<unknown>;
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
];

export function listIntegrationTools() {
  return INTEGRATION_TOOLS.map((tool) => ({
    method: tool.id,
    platform: tool.platform,
    description: tool.description,
    requiredParams: tool.requiredParams ?? [],
    optionalParams: tool.optionalParams ?? [],
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
