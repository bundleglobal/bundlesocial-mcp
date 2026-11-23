import { describe, expect, it } from "vitest";
import { Bundlesocial } from "bundlesocial";
import { API_ACTIONS, findApiAction, runApiAction, searchApiActions } from "../src/api-actions";

// Runs against the real SDK (no mock), so a stale generated file fails here.
describe("generated API actions", () => {
  it("cover the SDK and point at methods that exist", () => {
    const client = new Bundlesocial("test-key") as unknown as Record<string, Record<string, unknown>>;
    expect(API_ACTIONS.length).toBeGreaterThan(190);
    for (const action of API_ACTIONS) {
      const [service, method] = action.sdk;
      expect(typeof client[service]?.[method], `${action.id} -> ${service}.${method}`).toBe("function");
    }
    expect(new Set(API_ACTIONS.map((a) => a.id)).size).toBe(API_ACTIONS.length);
  });

  it("carry the SDK summaries (a missing JSDoc lookup would leave method names)", () => {
    expect(API_ACTIONS.filter((a) => a.summary === a.sdk[1]).length).toBeLessThan(5);
  });

  it("marks GET endpoints as read-only", () => {
    for (const action of API_ACTIONS) expect(action.readOnly).toBe(action.http.startsWith("GET "));
  });

  it("finds actions by words", () => {
    expect(searchApiActions("youtube playlist").map((a) => a.id)).toContain("misc.youtube-create-new-channel-playlist");
    expect(searchApiActions("review reply", { readOnly: false }).map((a) => a.id)).toContain(
      "misc.google-business-reply-to-review",
    );
  });

  it("splits flat params into path params and the request body, and resolves the team", async () => {
    const calls: unknown[] = [];
    const client = { misc: { miscGoogleBusinessReplyToReview: async (data: unknown) => (calls.push(data), { ok: true }) } };
    await runApiAction(
      client as never,
      findApiAction("misc.google-business-reply-to-review"),
      { reviewId: "r1", teamId: "Acme", comment: "Thanks!" },
      async (name) => (name === "Acme" ? "team_acme" : "team_default"),
    );
    expect(calls[0]).toEqual({ reviewId: "r1", requestBody: { teamId: "team_acme", comment: "Thanks!" } });
  });

  it("explains missing and unknown parameters", async () => {
    const action = findApiAction("misc.google-business-reply-to-review");
    await expect(runApiAction({} as never, action, { teamId: "t" }, async () => "t")).rejects.toMatchObject({
      code: "INVALID_PARAMS",
    });
    await expect(
      runApiAction({} as never, action, { reviewId: "r", comment: "x", nope: 1 }, async () => "t"),
    ).rejects.toMatchObject({ code: "INVALID_PARAMS" });
  });
});
