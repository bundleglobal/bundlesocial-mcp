import type { Bundlesocial } from "bundlesocial";
import { McpToolError } from "./errors";
import { PLATFORMS, type Platform, normalizePlatform, tryNormalizePlatform } from "./platforms";

function asPlainObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new McpToolError("INVALID_INPUT", `${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

/**
 * Resolve `platforms` arguments to a unique platform list. A value is used
 * directly when it is a recognised platform name/alias; otherwise it is treated
 * as a connected social-account id and resolved via the team's integrations.
 */
export async function resolveTargetPlatforms(client: Bundlesocial, teamId: string, rawTargets: string[]): Promise<Platform[]> {
  const resolved = new Set<Platform>();
  const accountIds: string[] = [];

  for (const raw of rawTargets) {
    const platform = tryNormalizePlatform(raw);
    if (platform) resolved.add(platform);
    else accountIds.push(raw.trim());
  }

  if (accountIds.length > 0) {
    const team = await client.team.teamGetTeam({ id: teamId });
    const accounts = team.socialAccounts ?? [];
    for (const id of accountIds) {
      const account = accounts.find((candidate) => candidate.id === id);
      if (!account) {
        throw new McpToolError(
          "INTEGRATION_NOT_FOUND",
          `No connected integration with id "${id}" in team ${teamId}. Call list_integrations to see ids, or use a platform name like "x" or "tiktok".`,
          { availableIntegrations: accounts.map((a) => ({ id: a.id, type: a.type, username: a.username })) },
        );
      }
      resolved.add(account.type as Platform);
    }
  }

  return [...resolved];
}

function isPlatformKeyedObject(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => PLATFORMS.includes(key.trim().toUpperCase() as Platform));
}

function expandPlatformSettings(
  settings: Record<string, unknown> | undefined,
  platforms: Platform[],
): Record<Platform, Record<string, unknown>> {
  const result = Object.fromEntries(platforms.map((p) => [p, {}])) as Record<Platform, Record<string, unknown>>;
  if (!settings) return result;
  if (isPlatformKeyedObject(settings)) {
    for (const [key, value] of Object.entries(settings)) {
      const platform = key.trim().toUpperCase() as Platform;
      if (platform in result) result[platform] = { ...result[platform], ...asPlainObject(value, `platformSettings.${key}`) };
    }
    return result;
  }
  for (const platform of platforms) result[platform] = { ...settings };
  return result;
}

export interface BuildPostDataInput {
  content?: string;
  mediaUploadIds: string[];
  platformSettings?: Record<string, unknown>;
  /** Advanced escape hatch: the full `data` object keyed by platform. */
  data?: Record<string, unknown>;
}

/** Build the API's `data` object, one entry per targeted platform. */
export function buildPostData(platforms: Platform[], input: BuildPostDataInput): Record<string, unknown> {
  if (input.data) return input.data;
  const perPlatform = expandPlatformSettings(input.platformSettings, platforms);
  const data: Record<string, unknown> = {};
  for (const platform of platforms) {
    data[platform] = {
      ...(input.content !== undefined ? { text: input.content } : {}),
      ...(input.mediaUploadIds.length > 0 ? { uploadIds: input.mediaUploadIds } : {}),
      ...perPlatform[platform],
    };
  }
  return data;
}

/** Determine targeted platforms when only `data` is given (use its keys). */
export function platformsFromData(data: Record<string, unknown>): Platform[] {
  return Object.keys(data).map((key) => normalizePlatform(key));
}

export function deriveTitle(content: string | undefined, fallback: string): string {
  const firstLine = (content ?? "").split("\n").map((line) => line.trim()).find((line) => line.length > 0);
  if (!firstLine) return fallback;
  return firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine;
}

export function toIsoDate(value: string, label: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new McpToolError("INVALID_DATE", `${label} is not a valid ISO 8601 date/time: "${value}". Example: 2026-06-01T09:00:00Z`);
  }
  return date.toISOString();
}
