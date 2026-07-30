import { McpToolError } from "./errors";

/** Every platform bundle.social can post to. Mirrors the API's `socialAccountTypes` enum. */
export const PLATFORMS = [
  "TIKTOK",
  "YOUTUBE",
  "INSTAGRAM",
  "FACEBOOK",
  "TWITTER",
  "THREADS",
  "LINKEDIN",
  "PINTEREST",
  "REDDIT",
  "MASTODON",
  "DISCORD",
  "SLACK",
  "BLUESKY",
  "GOOGLE_BUSINESS",
  "SNAPCHAT",
] as const;

export type Platform = (typeof PLATFORMS)[number];

/** Platforms for which the API exposes analytics (X/Twitter, Discord and Slack are absent). */
export const ANALYTICS_PLATFORMS = [
  "TIKTOK",
  "YOUTUBE",
  "INSTAGRAM",
  "FACEBOOK",
  "THREADS",
  "REDDIT",
  "PINTEREST",
  "MASTODON",
  "LINKEDIN",
  "BLUESKY",
  "GOOGLE_BUSINESS",
  "SNAPCHAT",
] as const;

export type AnalyticsPlatform = (typeof ANALYTICS_PLATFORMS)[number];

const ALIASES: Record<string, Platform> = {
  X: "TWITTER",
  TWITTER: "TWITTER",
  TIKTOK: "TIKTOK",
  TT: "TIKTOK",
  YOUTUBE: "YOUTUBE",
  YT: "YOUTUBE",
  INSTAGRAM: "INSTAGRAM",
  IG: "INSTAGRAM",
  INSTA: "INSTAGRAM",
  FACEBOOK: "FACEBOOK",
  FB: "FACEBOOK",
  THREADS: "THREADS",
  LINKEDIN: "LINKEDIN",
  LI: "LINKEDIN",
  PINTEREST: "PINTEREST",
  PIN: "PINTEREST",
  REDDIT: "REDDIT",
  MASTODON: "MASTODON",
  MASTO: "MASTODON",
  DISCORD: "DISCORD",
  SLACK: "SLACK",
  BLUESKY: "BLUESKY",
  BSKY: "BLUESKY",
  GOOGLE_BUSINESS: "GOOGLE_BUSINESS",
  "GOOGLE-BUSINESS": "GOOGLE_BUSINESS",
  GBP: "GOOGLE_BUSINESS",
  GOOGLEBUSINESS: "GOOGLE_BUSINESS",
  GMB: "GOOGLE_BUSINESS",
  SNAPCHAT: "SNAPCHAT",
  SNAP: "SNAPCHAT",
};

export function tryNormalizePlatform(input: string): Platform | undefined {
  return ALIASES[input.trim().toUpperCase().replace(/\s+/g, "_")];
}

export function normalizePlatform(input: string): Platform {
  const platform = tryNormalizePlatform(input);
  if (!platform) {
    throw new McpToolError(
      "UNKNOWN_PLATFORM",
      `Unknown platform "${input}". Supported: ${PLATFORMS.join(", ")} (aliases like "x" and "gbp" are accepted too).`,
    );
  }
  return platform;
}

export function isAnalyticsPlatform(platform: string): platform is AnalyticsPlatform {
  return (ANALYTICS_PLATFORMS as readonly string[]).includes(platform);
}

/**
 * Platforms on which the API can post comments. TWITTER/X, PINTEREST and
 * GOOGLE_BUSINESS are intentionally absent.
 */
export const COMMENT_PLATFORMS = [
  "TIKTOK",
  "YOUTUBE",
  "INSTAGRAM",
  "FACEBOOK",
  "THREADS",
  "LINKEDIN",
  "REDDIT",
  "MASTODON",
  "DISCORD",
  "SLACK",
  "BLUESKY",
] as const;

export type CommentPlatform = (typeof COMMENT_PLATFORMS)[number];

export function isCommentPlatform(platform: string): platform is CommentPlatform {
  return (COMMENT_PLATFORMS as readonly string[]).includes(platform);
}

export function normalizeAnalyticsPlatform(input: string): AnalyticsPlatform {
  const platform = normalizePlatform(input);
  if (!isAnalyticsPlatform(platform)) {
    throw new McpToolError(
      "ANALYTICS_NOT_SUPPORTED",
      `Analytics are not available for ${platform}. Supported: ${ANALYTICS_PLATFORMS.join(", ")}.`,
    );
  }
  return platform;
}
