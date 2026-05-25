import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createServer } from "../src/server";

// --- bundlesocial mock -------------------------------------------------------

const mocks = vi.hoisted(() => {
  const client = {
    app: { appGetHealth: vi.fn() },
    organization: {
      organizationGetOrganization: vi.fn(),
      organizationGetPostsUsage: vi.fn(),
      organizationGetCommentsUsage: vi.fn(),
      organizationGetUploadsUsage: vi.fn(),
      organizationGetImportsUsage: vi.fn(),
    },
    team: {
      teamGetTeam: vi.fn(),
      teamGetList: vi.fn(),
      teamCreateTeam: vi.fn(),
      teamUpdateTeam: vi.fn(),
      teamDeleteTeam: vi.fn(),
    },
    socialAccount: {
      socialAccountConnect: vi.fn(),
      socialAccountDisconnect: vi.fn(),
      socialAccountSetChannel: vi.fn(),
      socialAccountUnsetChannel: vi.fn(),
      socialAccountRefreshChannels: vi.fn(),
      socialAccountCreatePortalLink: vi.fn(),
      socialAccountConnectionCheck: vi.fn(),
      socialAccountProfileRefresh: vi.fn(),
      socialAccountGetByType: vi.fn(),
      socialAccountCopy: vi.fn(),
      socialAccountGetAccountsToDelete: vi.fn(),
    },
    post: {
      postCreate: vi.fn(),
      postGetList: vi.fn(),
      postGet: vi.fn(),
      postDelete: vi.fn(),
      postUpdate: vi.fn(),
      postRetry: vi.fn(),
    },
    comment: {
      commentCreate: vi.fn(),
      commentGetList: vi.fn(),
      commentGet: vi.fn(),
      commentDelete: vi.fn(),
      commentImportCreate: vi.fn(),
      commentImportGetList: vi.fn(),
      commentImportGetById: vi.fn(),
      commentImportGetFetchedComments: vi.fn(),
    },
    analytics: {
      analyticsGetPostAnalytics: vi.fn(),
      analyticsGetPostAnalyticsRaw: vi.fn(),
      analyticsGetSocialAccountAnalytics: vi.fn(),
      analyticsGetSocialAccountAnalyticsRaw: vi.fn(),
      analyticsGetBulkPostAnalytics: vi.fn(),
      analyticsForcePostAnalytics: vi.fn(),
      analyticsForceSocialAccountAnalytics: vi.fn(),
    },
    upload: {
      uploadCreate: vi.fn(),
      uploadCreateFromUrl: vi.fn(),
      uploadGetList: vi.fn(),
      uploadGet: vi.fn(),
      uploadDelete: vi.fn(),
      uploadDeleteMany: vi.fn(),
      uploadInitLargeUpload: vi.fn(),
      uploadFinalizeLargeUpload: vi.fn(),
    },
    postImport: {
      postImportCreate: vi.fn(),
      postImportGetStatus: vi.fn(),
      postImportGetById: vi.fn(),
      postImportGetImportedPosts: vi.fn(),
      postImportDeleteImportedPosts: vi.fn(),
      postImportRetryImport: vi.fn(),
    },
    postCsv: {
      postCsvCreate: vi.fn(),
      postCsvGetList: vi.fn(),
      postCsvGetById: vi.fn(),
      postCsvGetStatus: vi.fn(),
      postCsvGetRows: vi.fn(),
    },
    misc: {
      miscRedditGetSubredditFlairs: vi.fn(),
      miscYoutubeGetVideoCategories: vi.fn(),
      miscLinkedinGetTags: vi.fn(),
    },
  };
  return { client };
});

vi.mock("bundlesocial", () => {
  class ApiError extends Error {
    status: number;
    statusText: string;
    body: unknown;
    url: string;
    request: unknown;
    constructor(status: number, body: unknown, statusText = "Error") {
      super(typeof body === "string" ? body : statusText);
      this.name = "ApiError";
      this.status = status;
      this.statusText = statusText;
      this.body = body;
      this.url = "https://api.bundle.social/test";
      this.request = {};
    }
  }
  return { Bundlesocial: vi.fn(() => mocks.client), OpenAPI: { BASE: "https://api.bundle.social" }, ApiError };
});

const sdk = mocks.client;

// --- harness -----------------------------------------------------------------

const TEAM = {
  id: "team_test",
  name: "Test Team",
  socialAccounts: [
    { id: "acc_tw", type: "TWITTER", username: "acme", channels: [] },
    { id: "acc_ig", type: "INSTAGRAM", username: "acme.ig", channels: [] },
  ],
};
const ORG = { id: "org_test", name: "Acme", apiAccess: true, teams: [{ id: "team_test", name: "Test Team" }] };

const servers: McpServer[] = [];

async function connect(options?: { defaultTeamId?: string | null }) {
  const server = createServer({
    apiKey: "test-key",
    defaultTeamId: options?.defaultTeamId === null ? undefined : options?.defaultTeamId ?? "team_test",
  });
  servers.push(server);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

async function callTool(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = (await client.callTool({ name, arguments: args })) as {
    content: Array<{ type: string; text?: string }>;
    isError?: boolean;
  };
  const text = result.content?.[0]?.text ?? "";
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { result, json, isError: Boolean(result.isError) };
}

beforeEach(() => {
  vi.clearAllMocks();
  sdk.app.appGetHealth.mockResolvedValue({ status: "ok" });
  sdk.organization.organizationGetOrganization.mockResolvedValue(ORG);
  sdk.team.teamGetTeam.mockResolvedValue(TEAM);
});

afterAll(async () => {
  await Promise.all(servers.map((server) => server.close().catch(() => undefined)));
});

// --- tests -------------------------------------------------------------------

describe("tool registry", () => {
  it("exposes every documented tool", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();
    expect(names).toEqual(
      [
        // diagnostics
        "check_setup",
        // platform reference
        "describe_platform",
        // organization
        "get_organization",
        "get_usage",
        // teams
        "list_teams",
        "get_team",
        "create_team",
        "update_team",
        "delete_team",
        // integrations
        "list_integrations",
        "connect_integration",
        "disconnect_integration",
        "set_integration_channel",
        "unset_integration_channel",
        "refresh_integration_channels",
        "create_integration_portal_link",
        "check_integration_connection",
        "refresh_integration_profile",
        "get_integration_by_type",
        "copy_integration",
        "list_integrations_to_delete",
        // integration helper tools
        "list_integration_tools",
        "trigger_integration_tool",
        // posts
        "create_post",
        "schedule_post",
        "list_posts",
        "get_post",
        "delete_post",
        "update_post",
        "retry_post",
        // comments
        "create_comment",
        "list_comments",
        "get_comment",
        "delete_comment",
        "update_comment",
        // comment imports
        "create_comment_import",
        "list_comment_imports",
        "get_comment_import",
        "list_imported_comments",
        // media
        "upload_media",
        "list_media",
        "get_media",
        "delete_media",
        "delete_media_many",
        "init_large_upload",
        "finalize_large_upload",
        // post imports
        "create_post_import",
        "list_post_imports",
        "get_post_import",
        "list_imported_posts",
        "delete_imported_posts",
        "retry_post_import",
        // post CSV
        "create_post_csv_import",
        "list_post_csv_imports",
        "get_post_csv_import",
        "get_post_csv_import_status",
        "get_post_csv_import_rows",
        // analytics
        "get_post_analytics",
        "get_account_analytics",
        "get_bulk_post_analytics",
        "refresh_analytics",
        "get_analytics_summary",
      ].sort(),
    );
    for (const tool of tools) {
      expect(typeof tool.description).toBe("string");
      expect((tool.description as string).length).toBeGreaterThan(20);
      expect(tool.inputSchema).toBeTruthy();
    }
  });
});

describe("list_integrations", () => {
  it("lists the configured team's integrations", async () => {
    const client = await connect();
    const { json } = await callTool(client, "list_integrations");
    expect(sdk.team.teamGetTeam).toHaveBeenCalledWith({ id: "team_test" });
    expect(json).toMatchObject({
      teamId: "team_test",
      integrations: [
        { id: "acc_tw", type: "TWITTER", username: "acme" },
        { id: "acc_ig", type: "INSTAGRAM" },
      ],
    });
  });

  it("falls back to the only team when none is configured", async () => {
    const client = await connect({ defaultTeamId: null });
    const { json } = await callTool(client, "list_integrations");
    expect(sdk.organization.organizationGetOrganization).toHaveBeenCalled();
    expect((json as { teamId: string }).teamId).toBe("team_test");
  });
});

describe("create_post", () => {
  beforeEach(() => sdk.post.postCreate.mockResolvedValue({ id: "post_1", status: "SCHEDULED", title: "Hello" }));

  it("creates a post for platform names without touching the team", async () => {
    const client = await connect();
    const { json } = await callTool(client, "create_post", { content: "Hello", platforms: ["x", "bluesky"] });
    expect(sdk.team.teamGetTeam).not.toHaveBeenCalled();
    const body = sdk.post.postCreate.mock.calls[0][0].requestBody;
    expect(body.teamId).toBe("team_test");
    expect(body.status).toBe("SCHEDULED");
    expect([...body.socialAccountTypes].sort()).toEqual(["BLUESKY", "TWITTER"]);
    expect(body.data).toMatchObject({ TWITTER: { text: "Hello" }, BLUESKY: { text: "Hello" } });
    expect(json).toMatchObject({ id: "post_1" });
  });

  it("resolves an integration id to its platform", async () => {
    const client = await connect();
    await callTool(client, "create_post", { content: "Hi", platforms: ["acc_ig"] });
    expect(sdk.team.teamGetTeam).toHaveBeenCalledWith({ id: "team_test" });
    expect(sdk.post.postCreate.mock.calls[0][0].requestBody.socialAccountTypes).toEqual(["INSTAGRAM"]);
  });

  it("merges platformSettings and uploads media", async () => {
    sdk.upload.uploadCreateFromUrl.mockResolvedValue({ id: "up_1", type: "image" });
    const client = await connect();
    await callTool(client, "create_post", {
      content: "Launch",
      platforms: ["tiktok"],
      media: ["https://example.com/a.png"],
      platformSettings: { TIKTOK: { privacy: "PUBLIC_TO_EVERYONE" } },
    });
    expect(sdk.upload.uploadCreateFromUrl).toHaveBeenCalledWith({ requestBody: { teamId: "team_test", url: "https://example.com/a.png" } });
    expect(sdk.post.postCreate.mock.calls[0][0].requestBody.data.TIKTOK).toMatchObject({
      text: "Launch",
      privacy: "PUBLIC_TO_EVERYONE",
      uploadIds: ["up_1"],
    });
  });

  it("derives targets from a `data` object", async () => {
    const client = await connect();
    await callTool(client, "create_post", { data: { REDDIT: { sr: "r/test", text: "hi", uploadIds: [] } } });
    const body = sdk.post.postCreate.mock.calls[0][0].requestBody;
    expect(body.socialAccountTypes).toEqual(["REDDIT"]);
    expect(body.data).toEqual({ REDDIT: { sr: "r/test", text: "hi", uploadIds: [] } });
  });

  it("creates a DRAFT when draft=true", async () => {
    const client = await connect();
    await callTool(client, "create_post", { content: "WIP", platforms: ["linkedin"], draft: true });
    expect(sdk.post.postCreate.mock.calls[0][0].requestBody.status).toBe("DRAFT");
  });

  it("returns a structured error when no target is given", async () => {
    const client = await connect();
    const { json, isError } = await callTool(client, "create_post", { content: "Orphan" });
    expect(isError).toBe(true);
    expect(json).toMatchObject({ error: { code: "NO_TARGET" } });
    expect(sdk.post.postCreate).not.toHaveBeenCalled();
  });

  it("returns a structured error for an unknown integration id", async () => {
    const client = await connect();
    const { json, isError } = await callTool(client, "create_post", { content: "x", platforms: ["acc_nope"] });
    expect(isError).toBe(true);
    expect(json).toMatchObject({ error: { code: "INTEGRATION_NOT_FOUND" } });
  });
});

describe("schedule_post", () => {
  it("schedules at the given ISO date", async () => {
    sdk.post.postCreate.mockResolvedValue({ id: "post_2", status: "SCHEDULED" });
    const client = await connect();
    const { json } = await callTool(client, "schedule_post", { content: "Soon", platforms: ["linkedin"], date: "2026-06-01T09:00:00Z" });
    const body = sdk.post.postCreate.mock.calls[0][0].requestBody;
    expect(body.status).toBe("SCHEDULED");
    expect(body.postDate).toBe("2026-06-01T09:00:00.000Z");
    expect(json).toMatchObject({ id: "post_2" });
  });

  it("rejects an invalid date with a structured error", async () => {
    const client = await connect();
    const { json, isError } = await callTool(client, "schedule_post", { content: "Soon", platforms: ["x"], date: "nope" });
    expect(isError).toBe(true);
    expect(json).toMatchObject({ error: { code: "INVALID_DATE" } });
  });
});

describe("list_posts / get_post / delete_post", () => {
  it("lists posts with filters and the default limit", async () => {
    sdk.post.postGetList.mockResolvedValue({ items: [{ id: "post_1", title: "A", status: "POSTED" }] });
    const client = await connect();
    const { json } = await callTool(client, "list_posts", { status: "POSTED", platforms: ["x"] });
    expect(sdk.post.postGetList).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: "team_test", limit: 20, status: "POSTED", platforms: ["TWITTER"] }),
    );
    expect(json).toMatchObject({ items: [{ id: "post_1" }] });
  });

  it("gets a post by id", async () => {
    sdk.post.postGet.mockResolvedValue({ id: "post_9", title: "Nine" });
    const client = await connect();
    const { json } = await callTool(client, "get_post", { id: "post_9" });
    expect(sdk.post.postGet).toHaveBeenCalledWith({ id: "post_9" });
    expect(json).toMatchObject({ id: "post_9" });
  });

  it("deletes a post by id", async () => {
    sdk.post.postDelete.mockResolvedValue({ id: "post_9" });
    const client = await connect();
    const { json } = await callTool(client, "delete_post", { id: "post_9" });
    expect(sdk.post.postDelete).toHaveBeenCalledWith({ id: "post_9" });
    expect(json).toMatchObject({ id: "post_9" });
  });

  it("surfaces an SDK ApiError as a structured tool error", async () => {
    const { ApiError } = await import("bundlesocial");
    // @ts-expect-error the bundlesocial mock's ApiError takes (status, body, statusText?)
    sdk.post.postGet.mockRejectedValueOnce(new ApiError(404, { message: "Post not found" }, "Not Found"));
    const client = await connect();
    const { json, isError } = await callTool(client, "get_post", { id: "missing" });
    expect(isError).toBe(true);
    expect(json).toMatchObject({ error: { code: "HTTP_404", message: "Post not found" } });
  });
});

describe("upload_media", () => {
  it("uploads from a URL", async () => {
    sdk.upload.uploadCreateFromUrl.mockResolvedValue({ id: "up_url", type: "image" });
    const client = await connect();
    const { json } = await callTool(client, "upload_media", { source: "https://example.com/banner.png" });
    expect(sdk.upload.uploadCreateFromUrl).toHaveBeenCalledWith({ requestBody: { teamId: "team_test", url: "https://example.com/banner.png" } });
    expect(json).toMatchObject({ id: "up_url" });
  });

  it("uploads a local file", async () => {
    sdk.upload.uploadCreate.mockResolvedValue({ id: "up_file", type: "image" });
    const file = path.join(os.tmpdir(), `bundlesocial-mcp-test-${Date.now()}.png`);
    await fs.writeFile(file, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    try {
      const client = await connect();
      const { json } = await callTool(client, "upload_media", { source: file });
      const arg = sdk.upload.uploadCreate.mock.calls[0][0];
      expect(arg.formData.teamId).toBe("team_test");
      expect(arg.formData.file).toBeInstanceOf(File);
      expect((arg.formData.file as File).type).toBe("image/png");
      expect(json).toMatchObject({ id: "up_file" });
    } finally {
      await fs.rm(file, { force: true });
    }
  });

  it("errors when a local file does not exist", async () => {
    const client = await connect();
    const { json, isError } = await callTool(client, "upload_media", { source: "/no/such/file.png" });
    expect(isError).toBe(true);
    expect(json).toMatchObject({ error: { code: "MEDIA_NOT_FOUND" } });
  });
});

describe("analytics", () => {
  it("get_post_analytics passes a normalized platform", async () => {
    sdk.analytics.analyticsGetPostAnalytics.mockResolvedValue({ post: { id: "post_1" }, items: [] });
    const client = await connect();
    const { json } = await callTool(client, "get_post_analytics", { id: "post_1", platform: "instagram" });
    expect(sdk.analytics.analyticsGetPostAnalytics).toHaveBeenCalledWith({ postId: "post_1", platformType: "INSTAGRAM" });
    expect(json).toMatchObject({ post: { id: "post_1" } });
  });

  it("get_analytics_summary composes usage + per-integration snapshots", async () => {
    sdk.organization.organizationGetPostsUsage.mockResolvedValue({ used: 12, limit: 10000, remaining: 9988 });
    sdk.organization.organizationGetCommentsUsage.mockResolvedValue({ used: 0, limit: 100, remaining: 100 });
    sdk.organization.organizationGetUploadsUsage.mockResolvedValue({ used: 3, limit: 1000, remaining: 997 });
    sdk.analytics.analyticsGetSocialAccountAnalytics.mockResolvedValue({
      socialAccount: { id: "acc_ig", type: "INSTAGRAM" },
      items: [{ id: "a1", followers: 1000, likes: 50, comments: 4, createdAt: "2026-05-10T00:00:00Z" }],
    });
    const client = await connect();
    const { json } = await callTool(client, "get_analytics_summary");
    const result = json as {
      organization: { id: string };
      usage: { posts: { used: number } };
      integrations: Array<{ type: string; latest?: { followers: number }; note?: string }>;
    };
    expect(result.organization.id).toBe("org_test");
    expect(result.usage.posts.used).toBe(12);
    expect(result.integrations.find((i) => i.type === "TWITTER")?.note).toMatch(/not available/i);
    expect(result.integrations.find((i) => i.type === "INSTAGRAM")?.latest?.followers).toBe(1000);
    expect(sdk.analytics.analyticsGetSocialAccountAnalytics).toHaveBeenCalledWith({ teamId: "team_test", platformType: "INSTAGRAM" });
    expect(sdk.analytics.analyticsGetSocialAccountAnalytics).toHaveBeenCalledTimes(1);
  });
});

// --- update_post / retry_post ------------------------------------------------

describe("update_post", () => {
  it("updates only the fields passed", async () => {
    sdk.post.postUpdate.mockResolvedValue({ id: "post_1", title: "New", status: "DRAFT" });
    const client = await connect();
    const { json } = await callTool(client, "update_post", { id: "post_1", title: "New", status: "DRAFT" });
    expect(sdk.post.postUpdate).toHaveBeenCalledWith({ id: "post_1", requestBody: { title: "New", status: "DRAFT" } });
    expect(json).toMatchObject({ id: "post_1" });
  });

  it("reuses the post's platforms when changing content without `platforms`", async () => {
    sdk.post.postGet.mockResolvedValue({ id: "post_1", data: { TWITTER: { text: "old" } } });
    sdk.post.postUpdate.mockResolvedValue({ id: "post_1" });
    const client = await connect();
    await callTool(client, "update_post", { id: "post_1", content: "new text" });
    const body = sdk.post.postUpdate.mock.calls[0][0].requestBody;
    expect(body.socialAccountTypes).toEqual(["TWITTER"]);
    expect(body.data).toMatchObject({ TWITTER: { text: "new text" } });
  });

  it("returns an error when nothing changes", async () => {
    const client = await connect();
    const { json, isError } = await callTool(client, "update_post", { id: "post_1" });
    expect(isError).toBe(true);
    expect(json).toMatchObject({ error: { code: "NOTHING_TO_UPDATE" } });
  });
});

describe("retry_post", () => {
  it("retries a post", async () => {
    sdk.post.postRetry.mockResolvedValue({ id: "post_1", status: "RETRYING" });
    const client = await connect();
    const { json } = await callTool(client, "retry_post", { id: "post_1" });
    expect(sdk.post.postRetry).toHaveBeenCalledWith({ id: "post_1" });
    expect(json).toMatchObject({ id: "post_1" });
  });
});

// --- comments ----------------------------------------------------------------

describe("comments", () => {
  it("create_comment posts a single comment, defaulting platforms to the post's", async () => {
    sdk.post.postGet.mockResolvedValue({ id: "post_1", data: { TWITTER: { text: "x" }, REDDIT: { sr: "r/x", text: "y" } } });
    sdk.comment.commentCreate.mockResolvedValue({ id: "cmt_1", status: "SCHEDULED" });
    const client = await connect();
    const { json } = await callTool(client, "create_comment", { postId: "post_1", content: ["Nice!"] });
    const body = sdk.comment.commentCreate.mock.calls[0][0].requestBody;
    expect(body.internalPostId).toBe("post_1");
    expect(body.socialAccountTypes).toEqual(["REDDIT"]); // TWITTER not comment-capable
    expect(body.data).toMatchObject({ REDDIT: { text: "Nice!" } });
    expect(json).toMatchObject({ id: "cmt_1" });
  });

  it("create_comment threads a chain of replies", async () => {
    sdk.comment.commentCreate
      .mockResolvedValueOnce({ id: "cmt_1" })
      .mockResolvedValueOnce({ id: "cmt_2" })
      .mockResolvedValueOnce({ id: "cmt_3" });
    const client = await connect();
    const { json } = await callTool(client, "create_comment", { postId: "post_1", platforms: ["linkedin"], content: ["a", "b", "c"] });
    expect(sdk.comment.commentCreate).toHaveBeenCalledTimes(3);
    expect(sdk.comment.commentCreate.mock.calls[0][0].requestBody.internalParentCommentId).toBeUndefined();
    expect(sdk.comment.commentCreate.mock.calls[1][0].requestBody.internalParentCommentId).toBe("cmt_1");
    expect(sdk.comment.commentCreate.mock.calls[2][0].requestBody.internalParentCommentId).toBe("cmt_2");
    expect((json as Array<{ id: string }>).map((c) => c.id)).toEqual(["cmt_1", "cmt_2", "cmt_3"]);
  });

  it("create_comment rejects a non-comment-capable platform", async () => {
    const client = await connect();
    const { json, isError } = await callTool(client, "create_comment", { postId: "post_1", platforms: ["pinterest"], content: ["hi"] });
    expect(isError).toBe(true);
    expect(json).toMatchObject({ error: { code: "COMMENTS_NOT_SUPPORTED" } });
  });

  it("list_comments / get_comment / delete_comment", async () => {
    sdk.comment.commentGetList.mockResolvedValue({ items: [{ id: "cmt_1" }] });
    sdk.comment.commentGet.mockResolvedValue({ id: "cmt_9" });
    sdk.comment.commentDelete.mockResolvedValue({ id: "cmt_9" });
    const client = await connect();
    const { json: listJson } = await callTool(client, "list_comments", { postId: "post_1", status: "POSTED" });
    expect(sdk.comment.commentGetList).toHaveBeenCalledWith(expect.objectContaining({ teamId: "team_test", postId: "post_1", status: "POSTED", limit: 20 }));
    expect(listJson).toMatchObject({ items: [{ id: "cmt_1" }] });
    await callTool(client, "get_comment", { id: "cmt_9" });
    expect(sdk.comment.commentGet).toHaveBeenCalledWith({ id: "cmt_9" });
    await callTool(client, "delete_comment", { id: "cmt_9" });
    expect(sdk.comment.commentDelete).toHaveBeenCalledWith({ id: "cmt_9" });
  });
});

// --- integration tool helpers ------------------------------------------------

describe("integration tool helpers", () => {
  it("list_integration_tools lists available tools", async () => {
    const client = await connect();
    const { json } = await callTool(client, "list_integration_tools");
    const methods = (json as { tools: Array<{ method: string }> }).tools.map((t) => t.method);
    expect(methods).toEqual(expect.arrayContaining(["reddit:flairs", "youtube:categories", "linkedin:mentions"]));
  });

  it("trigger_integration_tool calls the underlying SDK method", async () => {
    sdk.misc.miscRedditGetSubredditFlairs.mockResolvedValue([{ id: "flair_1" }]);
    const client = await connect();
    const { json } = await callTool(client, "trigger_integration_tool", { method: "reddit:flairs", params: { subreddit: "r/test" } });
    expect(sdk.misc.miscRedditGetSubredditFlairs).toHaveBeenCalledWith({ teamId: "team_test", subreddit: "r/test" });
    expect(json).toEqual([{ id: "flair_1" }]);
  });

  it("trigger_integration_tool errors on a missing required param", async () => {
    const client = await connect();
    const { json, isError } = await callTool(client, "trigger_integration_tool", { method: "reddit:flairs" });
    expect(isError).toBe(true);
    expect(json).toMatchObject({ error: { code: "MISSING_PARAMS" } });
  });

  it("trigger_integration_tool errors on an unknown method", async () => {
    const client = await connect();
    const { json, isError } = await callTool(client, "trigger_integration_tool", { method: "bogus:thing" });
    expect(isError).toBe(true);
    expect(json).toMatchObject({ error: { code: "UNKNOWN_INTEGRATION_TOOL" } });
  });
});

// --- organization & teams ----------------------------------------------------

describe("organization & teams", () => {
  it("get_organization returns the organization", async () => {
    const client = await connect();
    const { json } = await callTool(client, "get_organization");
    expect(sdk.organization.organizationGetOrganization).toHaveBeenCalled();
    expect(json).toMatchObject({ id: "org_test" });
  });

  it("get_usage composes the four usage endpoints", async () => {
    sdk.organization.organizationGetPostsUsage.mockResolvedValue({ used: 1, limit: 10, remaining: 9 });
    sdk.organization.organizationGetCommentsUsage.mockResolvedValue({ used: 0, limit: 5, remaining: 5 });
    sdk.organization.organizationGetUploadsUsage.mockResolvedValue({ used: 2, limit: 20, remaining: 18 });
    sdk.organization.organizationGetImportsUsage.mockResolvedValue({ limitPerSocialAccount: 100, socialAccounts: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
    const client = await connect();
    const { json } = await callTool(client, "get_usage", { page: 1 });
    expect(json).toMatchObject({ posts: { used: 1 }, comments: { remaining: 5 }, uploads: { used: 2 }, imports: { limitPerSocialAccount: 100 } });
    expect(sdk.organization.organizationGetImportsUsage).toHaveBeenCalledWith(expect.objectContaining({ page: 1, teamId: "team_test" }));
  });

  it("list_teams / get_team / create_team / update_team / delete_team", async () => {
    sdk.team.teamGetList.mockResolvedValue({ items: [{ id: "team_test" }], total: 1 });
    sdk.team.teamCreateTeam.mockResolvedValue({ id: "team_new", name: "New" });
    sdk.team.teamUpdateTeam.mockResolvedValue({ id: "team_test", name: "Renamed" });
    sdk.team.teamDeleteTeam.mockResolvedValue({ id: "team_test" });
    const client = await connect();

    const { json: listJson } = await callTool(client, "list_teams", { limit: 5 });
    expect(sdk.team.teamGetList).toHaveBeenCalledWith({ limit: 5, offset: null, search: null });
    expect(listJson).toMatchObject({ items: [{ id: "team_test" }] });

    await callTool(client, "get_team", { id: "team_test" });
    expect(sdk.team.teamGetTeam).toHaveBeenCalledWith({ id: "team_test" });

    await callTool(client, "create_team", { name: "New" });
    expect(sdk.team.teamCreateTeam).toHaveBeenCalledWith({ requestBody: { name: "New", avatarUrl: null, copyTeamId: null } });

    await callTool(client, "update_team", { id: "team_test", name: "Renamed" });
    expect(sdk.team.teamUpdateTeam).toHaveBeenCalledWith({ id: "team_test", requestBody: { name: "Renamed" } });

    const { json: delJson } = await callTool(client, "delete_team", { id: "team_test" });
    expect(sdk.team.teamDeleteTeam).toHaveBeenCalledWith({ id: "team_test" });
    expect(delJson).toMatchObject({ id: "team_test" });
  });

  it("update_team errors when nothing changes", async () => {
    const client = await connect();
    const { json, isError } = await callTool(client, "update_team", { id: "team_test" });
    expect(isError).toBe(true);
    expect(json).toMatchObject({ error: { code: "NOTHING_TO_UPDATE" } });
  });
});

// --- social-account management ----------------------------------------------

describe("integration management", () => {
  it("connect_integration returns the OAuth url", async () => {
    sdk.socialAccount.socialAccountConnect.mockResolvedValue({ url: "https://oauth.example/x" });
    const client = await connect();
    const { json } = await callTool(client, "connect_integration", { platform: "x", redirectUrl: "https://app.example/cb" });
    expect(sdk.socialAccount.socialAccountConnect).toHaveBeenCalledWith({
      requestBody: { type: "TWITTER", teamId: "team_test", redirectUrl: "https://app.example/cb" },
    });
    expect(json).toMatchObject({ url: "https://oauth.example/x" });
  });

  it("disconnect_integration passes the normalized platform", async () => {
    sdk.socialAccount.socialAccountDisconnect.mockResolvedValue({ id: "acc_tw" });
    const client = await connect();
    await callTool(client, "disconnect_integration", { platform: "twitter" });
    expect(sdk.socialAccount.socialAccountDisconnect).toHaveBeenCalledWith({ requestBody: { type: "TWITTER", teamId: "team_test" } });
  });

  it("set_integration_channel / get_integration_by_type", async () => {
    sdk.socialAccount.socialAccountSetChannel.mockResolvedValue({ id: "acc_ig" });
    sdk.socialAccount.socialAccountGetByType.mockResolvedValue({ id: "acc_ig", type: "INSTAGRAM" });
    const client = await connect();
    await callTool(client, "set_integration_channel", { platform: "instagram", channelId: "ch_1" });
    expect(sdk.socialAccount.socialAccountSetChannel).toHaveBeenCalledWith({ requestBody: { type: "INSTAGRAM", teamId: "team_test", channelId: "ch_1" } });
    const { json } = await callTool(client, "get_integration_by_type", { platform: "instagram" });
    expect(sdk.socialAccount.socialAccountGetByType).toHaveBeenCalledWith({ teamId: "team_test", type: "INSTAGRAM" });
    expect(json).toMatchObject({ id: "acc_ig" });
  });

  it("create_integration_portal_link maps platforms and expiry", async () => {
    sdk.socialAccount.socialAccountCreatePortalLink.mockResolvedValue({ url: "https://portal.example/abc" });
    const client = await connect();
    const { json } = await callTool(client, "create_integration_portal_link", { platforms: ["x", "linkedin"], expiresInMinutes: 60 });
    const body = sdk.socialAccount.socialAccountCreatePortalLink.mock.calls[0][0].requestBody;
    expect(body.teamId).toBe("team_test");
    expect([...body.socialAccountTypes].sort()).toEqual(["LINKEDIN", "TWITTER"]);
    expect(body.expiresIn).toBe(60);
    expect(json).toMatchObject({ url: "https://portal.example/abc" });
  });

  it("list_integrations_to_delete passes pagination", async () => {
    sdk.socialAccount.socialAccountGetAccountsToDelete.mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
    const client = await connect();
    await callTool(client, "list_integrations_to_delete", { page: 2, pageSize: 10 });
    expect(sdk.socialAccount.socialAccountGetAccountsToDelete).toHaveBeenCalledWith({ page: 2, pageSize: 10 });
  });
});

// --- media (list/get/delete + large upload) ---------------------------------

describe("media management", () => {
  it("list_media / get_media / delete_media / delete_media_many", async () => {
    sdk.upload.uploadGetList.mockResolvedValue([{ id: "up_1", type: "image" }]);
    sdk.upload.uploadGet.mockResolvedValue({ id: "up_1", type: "image" });
    sdk.upload.uploadDelete.mockResolvedValue({ id: "up_1" });
    sdk.upload.uploadDeleteMany.mockResolvedValue([{ id: "up_1" }, { id: "up_2" }]);
    const client = await connect();

    await callTool(client, "list_media", { type: "image", status: "UNUSED" });
    expect(sdk.upload.uploadGetList).toHaveBeenCalledWith({ teamId: "team_test", type: "image", status: "UNUSED" });

    await callTool(client, "get_media", { id: "up_1" });
    expect(sdk.upload.uploadGet).toHaveBeenCalledWith({ id: "up_1" });

    await callTool(client, "delete_media", { id: "up_1" });
    expect(sdk.upload.uploadDelete).toHaveBeenCalledWith({ id: "up_1" });

    await callTool(client, "delete_media_many", { ids: ["up_1", "up_2"] });
    expect(sdk.upload.uploadDeleteMany).toHaveBeenCalledWith({ requestBody: { ids: ["up_1", "up_2"] } });
  });

  it("init_large_upload / finalize_large_upload pass through", async () => {
    sdk.upload.uploadInitLargeUpload.mockResolvedValue({ url: "https://storage.example/put", path: "uploads/x.mp4" });
    sdk.upload.uploadFinalizeLargeUpload.mockResolvedValue({ id: "up_big", type: "video" });
    const client = await connect();
    const { json: initJson } = await callTool(client, "init_large_upload", { fileName: "x.mp4", mimeType: "video/mp4" });
    expect(sdk.upload.uploadInitLargeUpload).toHaveBeenCalledWith({ requestBody: { teamId: "team_test", fileName: "x.mp4", mimeType: "video/mp4" } });
    expect(initJson).toMatchObject({ path: "uploads/x.mp4" });
    const { json: finJson } = await callTool(client, "finalize_large_upload", { path: "uploads/x.mp4" });
    expect(sdk.upload.uploadFinalizeLargeUpload).toHaveBeenCalledWith({ requestBody: { teamId: "team_test", path: "uploads/x.mp4" } });
    expect(finJson).toMatchObject({ id: "up_big" });
  });
});

// --- comment imports ---------------------------------------------------------

describe("comment imports", () => {
  it("create_comment_import / list / get / list_imported_comments", async () => {
    sdk.comment.commentImportCreate.mockResolvedValue({ id: "ci_1", status: "PENDING" });
    sdk.comment.commentImportGetList.mockResolvedValue({ imports: [{ id: "ci_1" }] });
    sdk.comment.commentImportGetById.mockResolvedValue({ id: "ci_1" });
    sdk.comment.commentImportGetFetchedComments.mockResolvedValue({ items: [{ id: "c_1" }] });
    const client = await connect();

    const { json } = await callTool(client, "create_comment_import", { postId: "post_1", platform: "instagram" });
    expect(sdk.comment.commentImportCreate).toHaveBeenCalledWith({ requestBody: { teamId: "team_test", postId: "post_1", socialAccountType: "INSTAGRAM" } });
    expect(json).toMatchObject({ id: "ci_1" });

    await callTool(client, "list_comment_imports", { postId: "post_1", status: "COMPLETED" });
    expect(sdk.comment.commentImportGetList).toHaveBeenCalledWith(expect.objectContaining({ teamId: "team_test", postId: "post_1", status: "COMPLETED" }));

    await callTool(client, "get_comment_import", { importId: "ci_1" });
    expect(sdk.comment.commentImportGetById).toHaveBeenCalledWith({ importId: "ci_1" });

    await callTool(client, "list_imported_comments", { postId: "post_1", platform: "instagram" });
    expect(sdk.comment.commentImportGetFetchedComments).toHaveBeenCalledWith(expect.objectContaining({ teamId: "team_test", postId: "post_1", platform: "INSTAGRAM" }));
  });
});

// --- post-history imports ----------------------------------------------------

describe("post imports", () => {
  it("create_post_import / list / get / list_imported_posts / delete / retry", async () => {
    sdk.postImport.postImportCreate.mockResolvedValue({ id: "pi_1", status: "PENDING" });
    sdk.postImport.postImportGetStatus.mockResolvedValue({ imports: [{ id: "pi_1" }] });
    sdk.postImport.postImportGetById.mockResolvedValue({ id: "pi_1" });
    sdk.postImport.postImportGetImportedPosts.mockResolvedValue({ posts: [], total: 0, limit: 20, remainingCapacity: 100 });
    sdk.postImport.postImportDeleteImportedPosts.mockResolvedValue({ deletedCount: 2 });
    sdk.postImport.postImportRetryImport.mockResolvedValue({ id: "pi_1", status: "PENDING" });
    const client = await connect();

    const { json } = await callTool(client, "create_post_import", { platform: "tiktok", count: 10, withAnalytics: true });
    expect(sdk.postImport.postImportCreate).toHaveBeenCalledWith({ requestBody: { teamId: "team_test", socialAccountType: "TIKTOK", count: 10, withAnalytics: true } });
    expect(json).toMatchObject({ id: "pi_1" });

    await callTool(client, "list_post_imports", { platform: "tiktok" });
    expect(sdk.postImport.postImportGetStatus).toHaveBeenCalledWith({ teamId: "team_test", socialAccountType: "TIKTOK" });

    await callTool(client, "get_post_import", { importId: "pi_1" });
    expect(sdk.postImport.postImportGetById).toHaveBeenCalledWith({ importId: "pi_1" });

    await callTool(client, "list_imported_posts", { platform: "tiktok", limit: 5 });
    expect(sdk.postImport.postImportGetImportedPosts).toHaveBeenCalledWith({ teamId: "team_test", socialAccountType: "TIKTOK", limit: 5, offset: null });

    await callTool(client, "delete_imported_posts", { postIds: ["ip_1", "ip_2"] });
    expect(sdk.postImport.postImportDeleteImportedPosts).toHaveBeenCalledWith({ requestBody: { teamId: "team_test", postIds: ["ip_1", "ip_2"] } });

    await callTool(client, "retry_post_import", { importId: "pi_1" });
    expect(sdk.postImport.postImportRetryImport).toHaveBeenCalledWith({ importId: "pi_1", requestBody: { teamId: "team_test" } });
  });
});

// --- CSV bulk import ---------------------------------------------------------

describe("post CSV import", () => {
  it("create_post_csv_import uploads a local CSV file", async () => {
    sdk.postCsv.postCsvCreate.mockResolvedValue({ id: "csv_1", status: "PENDING" });
    const file = path.join(os.tmpdir(), `bundlesocial-mcp-test-${Date.now()}.csv`);
    await fs.writeFile(file, "platform,text\nx,hello\n");
    try {
      const client = await connect();
      const { json } = await callTool(client, "create_post_csv_import", { source: file });
      const arg = sdk.postCsv.postCsvCreate.mock.calls[0][0];
      expect(arg.formData.file).toBeInstanceOf(File);
      expect((arg.formData.file as File).type).toBe("text/csv");
      expect(json).toMatchObject({ id: "csv_1" });
    } finally {
      await fs.rm(file, { force: true });
    }
  });

  it("errors when the CSV file does not exist", async () => {
    const client = await connect();
    const { json, isError } = await callTool(client, "create_post_csv_import", { source: "/no/such/file.csv" });
    expect(isError).toBe(true);
    expect(json).toMatchObject({ error: { code: "CSV_NOT_FOUND" } });
  });

  it("list / get / status / rows", async () => {
    sdk.postCsv.postCsvGetList.mockResolvedValue({ items: [{ id: "csv_1" }], total: 1 });
    sdk.postCsv.postCsvGetById.mockResolvedValue({ id: "csv_1" });
    sdk.postCsv.postCsvGetStatus.mockResolvedValue({ id: "csv_1", status: "COMPLETED" });
    sdk.postCsv.postCsvGetRows.mockResolvedValue({ items: [{ id: "r_1", rowNumber: 1, status: "SUCCESS" }], total: 1 });
    const client = await connect();

    await callTool(client, "list_post_csv_imports", { limit: 10 });
    expect(sdk.postCsv.postCsvGetList).toHaveBeenCalledWith({ limit: 10, offset: null });
    await callTool(client, "get_post_csv_import", { importId: "csv_1" });
    expect(sdk.postCsv.postCsvGetById).toHaveBeenCalledWith({ importId: "csv_1" });
    await callTool(client, "get_post_csv_import_status", { importId: "csv_1" });
    expect(sdk.postCsv.postCsvGetStatus).toHaveBeenCalledWith({ importId: "csv_1" });
    await callTool(client, "get_post_csv_import_rows", { importId: "csv_1", status: "SUCCESS" });
    expect(sdk.postCsv.postCsvGetRows).toHaveBeenCalledWith({ importId: "csv_1", status: "SUCCESS", limit: null, offset: null });
  });
});

// --- analytics (new tools) ---------------------------------------------------

describe("analytics extras", () => {
  it("get_post_analytics with raw=true calls the raw endpoint", async () => {
    sdk.analytics.analyticsGetPostAnalyticsRaw.mockResolvedValue({ raw: true });
    const client = await connect();
    await callTool(client, "get_post_analytics", { id: "post_1", platform: "instagram", raw: true });
    expect(sdk.analytics.analyticsGetPostAnalyticsRaw).toHaveBeenCalledWith({ postId: "post_1", platformType: "INSTAGRAM" });
    expect(sdk.analytics.analyticsGetPostAnalytics).not.toHaveBeenCalled();
  });

  it("get_account_analytics resolves team + platform", async () => {
    sdk.analytics.analyticsGetSocialAccountAnalytics.mockResolvedValue({ socialAccount: { id: "acc_ig" }, items: [] });
    const client = await connect();
    const { json } = await callTool(client, "get_account_analytics", { platform: "instagram" });
    expect(sdk.analytics.analyticsGetSocialAccountAnalytics).toHaveBeenCalledWith({ teamId: "team_test", platformType: "INSTAGRAM" });
    expect(json).toMatchObject({ socialAccount: { id: "acc_ig" } });
  });

  it("get_account_analytics rejects a non-analytics platform", async () => {
    const client = await connect();
    const { json, isError } = await callTool(client, "get_account_analytics", { platform: "x" });
    expect(isError).toBe(true);
    expect(json).toMatchObject({ error: { code: "ANALYTICS_NOT_SUPPORTED" } });
  });

  it("get_bulk_post_analytics passes ids + platform", async () => {
    sdk.analytics.analyticsGetBulkPostAnalytics.mockResolvedValue({ results: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
    const client = await connect();
    await callTool(client, "get_bulk_post_analytics", { postIds: ["p1", "p2"], platform: "tiktok" });
    expect(sdk.analytics.analyticsGetBulkPostAnalytics).toHaveBeenCalledWith({ postIds: ["p1", "p2"], platformType: "TIKTOK", page: undefined, limit: undefined });
  });

  it("refresh_analytics forces a post when postId is given", async () => {
    sdk.analytics.analyticsForcePostAnalytics.mockResolvedValue({ id: "an_1" });
    const client = await connect();
    await callTool(client, "refresh_analytics", { postId: "post_1" });
    expect(sdk.analytics.analyticsForcePostAnalytics).toHaveBeenCalledWith({ requestBody: { postId: "post_1", importedPostId: null, platformType: null } });
  });

  it("refresh_analytics forces a social account when only platform is given", async () => {
    sdk.analytics.analyticsForceSocialAccountAnalytics.mockResolvedValue({ id: "an_2" });
    const client = await connect();
    await callTool(client, "refresh_analytics", { platform: "instagram" });
    expect(sdk.analytics.analyticsForceSocialAccountAnalytics).toHaveBeenCalledWith({ requestBody: { teamId: "team_test", platformType: "INSTAGRAM" } });
  });

  it("refresh_analytics errors with no target", async () => {
    const client = await connect();
    const { json, isError } = await callTool(client, "refresh_analytics", {});
    expect(isError).toBe(true);
    expect(json).toMatchObject({ error: { code: "REFRESH_TARGET_REQUIRED" } });
  });
});

// --- describe_platform -------------------------------------------------------

describe("describe_platform", () => {
  it("describes a single platform by alias, with post + comment schemas", async () => {
    const client = await connect();
    const { json } = await callTool(client, "describe_platform", { platform: "reddit" });
    const result = json as {
      platform: {
        platform: string;
        capabilities: { posting: boolean; comments: boolean; analytics: boolean };
        post: { fields: Array<{ name: string; required: boolean }> };
        comment: { fields: Array<{ name: string }> };
      };
      mediaNotes: string[];
    };
    expect(result.platform.platform).toBe("REDDIT");
    expect(result.platform.capabilities.posting).toBe(true);
    expect(result.platform.post.fields.find((f) => f.name === "sr")?.required).toBe(true);
    expect(result.platform.comment.fields.map((f) => f.name)).toEqual(["text"]);
    expect(result.mediaNotes.length).toBeGreaterThan(0);
  });

  it("normalizes aliases (x -> TWITTER) and marks comments unsupported", async () => {
    const client = await connect();
    const { json } = await callTool(client, "describe_platform", { platform: "x", operation: "comment" });
    const result = json as { platform: { platform: string; comment: { supported?: boolean } } };
    expect(result.platform.platform).toBe("TWITTER");
    expect(result.platform.comment.supported).toBe(false);
  });

  it("narrows to the post operation only", async () => {
    const client = await connect();
    const { json } = await callTool(client, "describe_platform", { platform: "tiktok", operation: "post" });
    const result = json as { platform: { post?: unknown; comment?: unknown } };
    expect(result.platform.post).toBeTruthy();
    expect(result.platform.comment).toBeUndefined();
  });

  it("returns every platform when none is given", async () => {
    const client = await connect();
    const { json } = await callTool(client, "describe_platform");
    const result = json as { platforms: Array<{ platform: string }> };
    expect(result.platforms).toHaveLength(14);
  });

  it("returns a structured error for an unknown platform", async () => {
    const client = await connect();
    const { json } = await callTool(client, "describe_platform", { platform: "myspace" });
    expect(json).toMatchObject({ error: { code: "UNKNOWN_PLATFORM" } });
  });
});

// --- check_setup -------------------------------------------------------------

describe("check_setup", () => {
  it("reports a healthy setup", async () => {
    sdk.organization.organizationGetPostsUsage.mockResolvedValue({ used: 1, limit: 10, remaining: 9 });
    const client = await connect();
    const { json } = await callTool(client, "check_setup");
    const result = json as { ok: boolean; checks: Array<{ name: string; status: string }> };
    expect(result.ok).toBe(true);
    expect(result.checks.find((c) => c.name === "api_reachable")?.status).toBe("ok");
    expect(result.checks.find((c) => c.name === "authentication")?.status).toBe("ok");
    expect(result.checks.find((c) => c.name === "team")?.status).toBe("ok");
    expect(result.checks.find((c) => c.name === "integrations")?.status).toBe("ok");
  });

  it("reports fail when the API is unreachable", async () => {
    sdk.app.appGetHealth.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const client = await connect();
    const { json } = await callTool(client, "check_setup");
    const result = json as { ok: boolean; checks: Array<{ name: string; status: string }> };
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.name === "api_reachable")?.status).toBe("fail");
  });
});
