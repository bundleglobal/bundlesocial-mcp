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
    organization: {
      organizationGetOrganization: vi.fn(),
      organizationGetPostsUsage: vi.fn(),
      organizationGetCommentsUsage: vi.fn(),
      organizationGetUploadsUsage: vi.fn(),
    },
    team: { teamGetTeam: vi.fn() },
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
    },
    analytics: {
      analyticsGetPostAnalytics: vi.fn(),
      analyticsGetSocialAccountAnalytics: vi.fn(),
    },
    upload: { uploadCreate: vi.fn(), uploadCreateFromUrl: vi.fn() },
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
        "create_comment",
        "create_post",
        "delete_comment",
        "delete_post",
        "get_analytics_summary",
        "get_comment",
        "get_post",
        "get_post_analytics",
        "list_comments",
        "list_integration_tools",
        "list_integrations",
        "list_posts",
        "retry_post",
        "schedule_post",
        "trigger_integration_tool",
        "update_post",
        "upload_media",
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
