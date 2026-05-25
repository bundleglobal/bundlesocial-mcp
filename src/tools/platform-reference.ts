import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../client";
import { jsonResult } from "../errors";
import {
  MEDIA_NOTES,
  PLATFORM_REFERENCE,
  type PlatformReferenceEntry,
} from "../platform-reference";
import { PLATFORMS, tryNormalizePlatform } from "../platforms";
import { registerTool } from "../register-tool";

type Operation = "post" | "comment";

/** Narrow an entry to a single operation, or return it whole. */
function projectEntry(entry: PlatformReferenceEntry, operation?: Operation): Record<string, unknown> {
  const base = {
    platform: entry.platform,
    label: entry.label,
    aliases: entry.aliases,
    capabilities: entry.capabilities,
    notes: entry.notes,
  };
  if (operation === "post") {
    return { ...base, post: entry.post };
  }
  if (operation === "comment") {
    return {
      ...base,
      comment: entry.comment ?? {
        supported: false,
        message: `Comments are not available on ${entry.label} via the bundle.social API.`,
      },
    };
  }
  return { ...base, post: entry.post, ...(entry.comment ? { comment: entry.comment } : {}) };
}

export function registerPlatformReferenceTools(server: McpServer, ctx: ServerContext): void {
  // ctx is unused — this tool serves a static reference, but the signature is
  // kept uniform with the other register* functions.
  void ctx;

  registerTool(
    server,
    "describe_platform",
    {
      title: "Describe a platform's field schema",
      description:
        "Look up the exact per-platform `data.<PLATFORM>` fields the bundle.social API accepts — for posting AND commenting — so you can build a correct `data` / `platformSettings` object instead of guessing. " +
        "Pass `platform` (name or alias, e.g. \"reddit\", \"x\", \"gbp\") for one platform, or omit it to get every platform. " +
        "Pass `operation` (\"post\" or \"comment\") to narrow the response. " +
        "Each field lists its name, type, whether it is required, and notes; each platform also reports its capabilities (posting / comments / analytics / comment imports) and a ready-to-use example. " +
        "Call this before create_post / schedule_post / update_post / create_comment / update_comment whenever you are unsure which fields a platform needs.",
      inputSchema: {
        platform: z
          .string()
          .min(1)
          .optional()
          .describe('Platform name or alias (e.g. "reddit", "x", "tiktok", "gbp"). Omit to describe every platform.'),
        operation: z
          .enum(["post", "comment"])
          .optional()
          .describe('Which operation to describe. "post" = create/schedule/update a post; "comment" = create/update a comment. Omit for both.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ platform, operation }) => {
      if (platform) {
        const normalized = tryNormalizePlatform(platform);
        if (!normalized) {
          return jsonResult({
            error: {
              code: "UNKNOWN_PLATFORM",
              message: `Unknown platform "${platform}". Supported: ${PLATFORMS.join(", ")} (aliases like "x" and "gbp" are accepted too).`,
              supportedPlatforms: PLATFORMS,
            },
          });
        }
        return jsonResult({
          platform: projectEntry(PLATFORM_REFERENCE[normalized], operation),
          mediaNotes: MEDIA_NOTES,
        });
      }

      return jsonResult({
        platforms: PLATFORMS.map((name) => projectEntry(PLATFORM_REFERENCE[name], operation)),
        mediaNotes: MEDIA_NOTES,
        hint: 'Pass `platform` (e.g. "reddit") to focus on one platform, or `operation` ("post" | "comment") to narrow the response.',
      });
    },
  );
}
