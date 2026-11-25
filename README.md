# bundlesocial-mcp

[Model Context Protocol](https://modelcontextprotocol.io) server for the [bundle.social](https://bundle.social) social-media API. It lets MCP clients — Claude, ChatGPT, Claude Code, Cursor, Codex, and anything else that speaks MCP — post, schedule, list and analyze content across 15+ platforms (X, Instagram, TikTok, LinkedIn, YouTube, Facebook, Pinterest, Reddit, Threads, Bluesky, Mastodon, Discord, Slack, Google Business Profile, Snapchat).

It's a thin wrapper over the official [`bundlesocial`](https://www.npmjs.com/package/bundlesocial) Node SDK. Same surface as [`bundlesocial-cli`](https://www.npmjs.com/package/bundlesocial-cli) — posting, comments, media, analytics, team & integration management, and post-history/comment/CSV imports — exposed as MCP tools.

## Quick start: hosted server

The same tools run at `https://mcp.bundle.social` (Streamable HTTP). Add that URL to your client and sign in with your bundle.social account: nothing to install and no API key to copy. You choose **Full access** or **Read only** and can disconnect the app any time in [Connected apps](https://bundle.social/dashboard/organization/connected-apps).

- **Claude** (claude.ai, Desktop, mobile): Customize → Connectors → + Add → Add custom connector, URL `https://mcp.bundle.social`, then Connect.
- **ChatGPT**: Settings → Apps & Connectors → Developer mode, create an app with URL `https://mcp.bundle.social` and Authentication OAuth, then Connect.
- **Claude Code**: `claude mcp add --transport http bundlesocial https://mcp.bundle.social`, then `/mcp` → Authenticate.
- **Cursor**: `{ "mcpServers": { "bundlesocial": { "url": "https://mcp.bundle.social" } } }` in `~/.cursor/mcp.json`, then Connect in Cursor Settings → MCP.
- **Codex**: `[mcp_servers.bundlesocial]` with `url = "https://mcp.bundle.social"` in `~/.codex/config.toml`, then `codex mcp login bundlesocial`.

For scripts, scheduled agents and clients without sign-in, send an API key instead (see [Hosted server with an API key](#hosted-server-with-an-api-key)). Setup for every client: <https://info.bundle.social/api-reference/mcp>.

Run it locally (`npx bundlesocial-mcp`, below) when the agent needs to read files from your disk.

## Prerequisites (local server)

- Node.js 20+
- A bundle.social API key — create one at <https://bundle.social/dashboard/organization/api-keys>

## Tools

Team-scoped tools take an optional `teamId`, either a team id or the exact team name (case-insensitive) — skip it when your org has one team or you set a default team (`BUNDLESOCIAL_TEAM_ID`, or `x-bundle-team-id` on the hosted server). Without one, an org with several teams gets an error listing the teams to pick from. Errors come back as `{ "error": { "code", "message", "details"? } }` with `isError: true`.

### Diagnostics

| Tool | Description |
|---|---|
| `check_setup` | Self-diagnosis: credentials present (connection or API key), API reachable, credentials valid, org API access, team resolution, connected integrations, posts quota. Returns `{ ok, checks: [...] }`. Run it first. |

### Reference

| Tool | Description |
|---|---|
| `describe_platform` | Look up the exact per-platform `data.<PLATFORM>` field schema for posts **and** comments — name, type, required flag, notes, capabilities and a ready-to-use example. Pass a `platform` (name/alias) or omit for all; `operation` (`post`/`comment`) narrows it. Call it before `create_post` / `create_comment` when unsure which fields a platform needs. |

### Organization & teams

| Tool | Description |
|---|---|
| `get_organization` | Fetch the organization — id, name, API-access flag, plan limits (use `list_teams` for teams). |
| `get_usage` | Posts / comments / uploads usage quotas + a paginated per-account post-import usage breakdown. |
| `get_daily_limits_usage` | One connected account's daily post/comment allowance (used/limit/remaining) for a day — check it before bulk-scheduling. |
| `list_teams` | List teams in the organization (paginated, searchable). |
| `get_team` | Fetch one team by id (incl. its connected integrations). |
| `create_team` | Create a team. |
| `update_team` | Update a team's name/avatar — only the fields you pass change. |
| `delete_team` | Delete a team by id (destructive). |

### Integrations (social accounts)

| Tool | Description |
|---|---|
| `list_integrations` | List connected social accounts for a team (ids, platform types, channels). Without a team, lists every team (up to 10; with more it returns the team list to pick from). |
| `connect_integration` | Start an OAuth connect flow — returns a `url` to redirect the user to. `serverUrl` for Mastodon/Bluesky; `options` for provider flags (e.g. `snapchatConnectionMethod: "BUSINESS"` for Snap Business Public Profiles). |
| `disconnect_integration` | Disconnect a social account of a given platform from the team (destructive). |
| `set_integration_channel` / `unset_integration_channel` | Pick / clear the channel/page to post to (FACEBOOK, INSTAGRAM, LINKEDIN, YOUTUBE, GBP, and SNAPCHAT Business profiles). |
| `refresh_integration_channels` | Re-fetch the available channels (DISCORD, SLACK, REDDIT, PINTEREST, …). |
| `create_integration_portal_link` | Create a bundle.social-hosted portal link the user can open to connect/manage accounts — returns a `url`. |
| `check_integration_connection` | Run an on-demand connection/disconnect health check for a platform's account. |
| `refresh_integration_profile` | Refresh the cached profile info (username, display name, avatar). |
| `get_integration_by_type` | Fetch the connected social account for a platform on the team. |
| `copy_integration` | Copy connected accounts between teams (`fromTeamId` → `toTeamId`). |
| `list_integrations_to_delete` | List social accounts scheduled for deletion (paginated). |
| `list_integration_tools` | List the read-only platform helper methods callable via `trigger_integration_tool`. |
| `trigger_integration_tool` | Call a helper: subreddit flairs/requirements, YouTube categories/playlists/regions, LinkedIn mentions, Instagram locations/audio/business discovery, Google Business categories, TikTok trending music, the Spark Ads code of a TikTok post (`tiktok:ad-authorization`). Use it to discover values the API needs. Read-only. |
| `manage_tiktok_ad_authorization` | Turn TikTok Spark Ads authorization of a post on (`enable`), extend it (`extend`) or turn it off (`disable`). `enable` and `extend` return the code to share with an advertiser. |

### Posts

| Tool | Description |
|---|---|
| `create_post` | Publish a post immediately (or save as a draft) to one or more integrations. |
| `schedule_post` | Schedule a post for a future ISO-8601 date/time. |
| `list_posts` | List recent posts with filters (status, platform, date range, query). |
| `get_post` | Fetch one post by id. |
| `delete_post` | Delete a post by id (destructive). |
| `update_post` | Update an existing post — only the fields you pass change; reuses the post's platforms when changing content without `platforms`. |
| `retry_post` | Re-attempt a post that ended in `ERROR`. |
| `get_post_by_reference_key` | Fetch a post by the `referenceKey` set on it, instead of its bundle.social id. |
| `list_reconnect_candidates` / `reconnect_posts` | List draft/scheduled posts that lost their social account after a disconnect, and reattach them to the newly connected account. |

`create_post` / `schedule_post` / `update_post` also take `referenceKey` (your own identifier for the post) and `firstComment` — a comment published as soon as the post goes live, either one string for every comment-capable target or an object keyed by platform.

### Comments

| Tool | Description |
|---|---|
| `create_comment` | Comment on a post — pass `content` multiple times for a chain of replies (X-style thread via comments). Comment-capable platforms: TIKTOK, YOUTUBE, INSTAGRAM, FACEBOOK, THREADS, LINKEDIN, REDDIT, MASTODON, DISCORD, SLACK, BLUESKY. Use `importedPostId` to comment on a post from `create_post_import` (with explicit `platforms`), or `fetchedParentCommentId` to reply to a comment from `create_comment_import`. |
| `list_comments` / `get_comment` / `delete_comment` | List, fetch, and delete comments. |
| `retry_comment` | Re-attempt a comment that ended in `ERROR`. |
| `create_comment_import` | Start an async import of a published post's (incoming) comments for one platform. |
| `list_comment_imports` / `get_comment_import` | List / fetch comment-import jobs. |
| `list_imported_comments` | List the comments fetched for a post via `create_comment_import`. |
| `act_on_imported_comment` | Moderate an imported comment — `DELETE`, `HIDE`, `UNHIDE`, `LIKE`, `UNLIKE`, `APPROVE`, `REJECT` (support varies by platform), optionally banning the author. |

### Media (uploads)

| Tool | Description |
|---|---|
| `upload_media` | Upload an image/video/document from a public URL (or local path in stdio mode). Local files >90 MB use the large-upload flow automatically (.jpg/.jpeg/.png/.gif/.mp4/.pdf only above that size). Returns the upload object — pass its `id` to `create_post`/`schedule_post` via `data` (e.g. `{"TWITTER":{"text":"hi","uploadIds":["<id>"]}}`). |
| `list_media` / `get_media` | List / fetch media uploads (filter by type and USED/UNUSED). |
| `delete_media` / `delete_media_many` | Delete one or several uploads (destructive). |
| `init_large_upload` / `finalize_large_upload` | Direct upload of any file up to 5 GB — `init` returns a signed PUT `url` + `path`; PUT the bytes there, then `finalize`. The way to send local files to the hosted server; in stdio mode `upload_media` with a local path does it for you. |

### Post-history imports

| Tool | Description |
|---|---|
| `create_post_import` | Start an async import of an account's recent posts (post history) into bundle.social. Platforms: FACEBOOK, INSTAGRAM, THREADS, TIKTOK, YOUTUBE, LINKEDIN, PINTEREST, REDDIT, MASTODON, BLUESKY, TWITTER, SNAPCHAT. |
| `list_post_imports` / `get_post_import` | List / fetch post-history import jobs. |
| `list_imported_posts` | List imported posts (with analytics) for an account on a platform. |
| `delete_imported_posts` | Bulk-delete imported posts and their analytics (destructive). |
| `retry_post_import` | Retry a failed post-history import. |

### CSV bulk import

| Tool | Description |
|---|---|
| `create_post_csv_import` | Upload a CSV (public URL or local path) for an async bulk post import. |
| `list_post_csv_imports` / `get_post_csv_import` | List / fetch CSV import jobs. |
| `get_post_csv_import_status` | A CSV import's processing status (rows processed/succeeded/failed). |
| `get_post_csv_import_rows` | Per-row results of a CSV import (filter by SUCCESS/FAILED). |

### Analytics

| Tool | Description |
|---|---|
| `get_post_analytics` | Engagement metrics for one post. `raw: true` for the unprocessed provider payload. |
| `get_account_analytics` | Follower/engagement snapshots for a connected account on the team. `raw: true` for the raw payload. |
| `get_bulk_post_analytics` | Analytics for up to 60 posts in one request (paginated 20/page) for one platform. |
| `refresh_analytics` | Force-refresh analytics — `postId` to refresh a post, otherwise `platform` to refresh a connected account. |
| `get_analytics_summary` | Org-level usage quotas + latest per-integration analytics snapshot. |

(Analytics are not available for X/Twitter, Discord and Slack.)

### Everything else in the API

| Tool | Description |
|---|---|
| `search_api_actions` | Search all ~200 public API actions by keyword: editing or deleting published posts per platform, YouTube playlists and thumbnails, Google Business profile, reviews and Facebook recommendations, direct messages and automations, credits, multipart uploads. A narrow search returns each action's parameters. |
| `call_api_read` | Run a read action (`readOnly: true`) by id with a flat `params` object. |
| `call_api_action` | Run an action that changes data (`readOnly: false`) by id. Marked destructive, so clients can ask for confirmation. |
| `get_credit_balance` / `quote_billable_usage` | Prepaid credit balance for X (Twitter) pay-per-use actions, and a price quote before running them. |

The action list is generated from the `bundlesocial` SDK (`npm run generate:actions`), so it follows the API.

### Targeting platforms & per-platform fields

`create_post` / `schedule_post` target platforms by **name** (`x`, `tiktok`, `instagram`, `youtube`, `facebook`, `threads`, `linkedin`, `pinterest`, `reddit`, `mastodon`, `discord`, `slack`, `bluesky`, `gbp`, `snapchat`) or by **integration id** (from `list_integrations`). Put platform-required fields under `platformSettings` keyed by platform — e.g. Reddit `sr`, Pinterest `boardName`, TikTok `privacy`, YouTube `madeForKids`/`privacyStatus`, Instagram/Facebook `type` — or pass the full `data` object verbatim. The complete per-platform parameter reference is at **<https://docs.bundle.social/api-reference/platform-parameters>**.

## Configuration (local server)

The local server reads these environment variables (CLI flags override them):

| Env var | Flag | Required | Purpose |
|---|---|---|---|
| `BUNDLESOCIAL_API_KEY` | `--api-key` | yes | Your bundle.social API key |
| `BUNDLESOCIAL_TEAM_ID` | `--team-id` | no | Default team (needed only if the org has >1 team) |
| `BUNDLESOCIAL_API_URL` | `--api-url` | no | API base URL (default `https://api.bundle.social`) |

### Claude Desktop

Edit `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "bundlesocial": {
      "command": "npx",
      "args": ["-y", "bundlesocial-mcp"],
      "env": {
        "BUNDLESOCIAL_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add bundlesocial --env BUNDLESOCIAL_API_KEY=YOUR_API_KEY -- npx -y bundlesocial-mcp
```

Or add to `.mcp.json` in your project:

```json
{
  "mcpServers": {
    "bundlesocial": {
      "command": "npx",
      "args": ["-y", "bundlesocial-mcp"],
      "env": { "BUNDLESOCIAL_API_KEY": "YOUR_API_KEY" }
    }
  }
}
```

### Cursor

Add to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project):

```json
{
  "mcpServers": {
    "bundlesocial": {
      "command": "npx",
      "args": ["-y", "bundlesocial-mcp"],
      "env": { "BUNDLESOCIAL_API_KEY": "YOUR_API_KEY" }
    }
  }
}
```

### Hosted server with an API key

Signing in (see [Quick start](#quick-start-hosted-server)) is the default. For automation, send your API key as `Authorization: Bearer YOUR_API_KEY` (or `x-api-key`), and optionally a default team as `x-bundle-team-id`:

```bash
claude mcp add --transport http bundlesocial https://mcp.bundle.social \
  --header "Authorization: Bearer YOUR_API_KEY"
```

The hosted server cannot read local file paths: pass media and CSV files as public `https://` URLs. To send a file from your machine, an agent with a shell calls `init_large_upload`, PUTs the bytes to the returned signed `url` (for example `curl -X PUT -H "Content-Type: video/mp4" --upload-file ./clip.mp4 "<url>"`), then calls `finalize_large_upload`. Setup for other clients: <https://info.bundle.social/api-reference/mcp>.

## Try it without a client

```bash
BUNDLESOCIAL_API_KEY=YOUR_API_KEY npx bundlesocial-mcp
```

It speaks MCP over stdio — pair it with the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npx @modelcontextprotocol/inspector npx bundlesocial-mcp
```

## Example prompts (once configured in a client)

- "Check my bundle.social setup."
- "List my connected social accounts via bundle.social."
- "Post 'We just shipped dark mode 🌙' to X and Bluesky."
- "Schedule a LinkedIn post for next Monday 9am UTC announcing the launch."
- "Upload https://cdn.example.com/promo.mp4 and create a TikTok post with it, privacy public."
- "Post to r/test on Reddit — first check the subreddit's requirements and flairs, then post with the right flair."
- "Reply to post `post_abc123` with a 3-comment thread on LinkedIn."
- "Change the title of post `post_abc123` and move it back to draft."
- "How did post `post_abc123` perform? Refresh its analytics first."
- "Import my last 25 Instagram posts with analytics."
- "Bulk-import posts from https://example.com/campaign.csv and show me the failed rows."
- "Connect a new Instagram account — give me the OAuth link."
- "Create a team called Marketing and copy our X account into it."
- "Show me everything scheduled this week."

## Development

```bash
npm install
npm run build       # tsup → dist/index.js (ESM, with shebang)
npm test            # vitest — every tool exercised end-to-end via an in-memory MCP client against a mocked SDK
npm run typecheck
```

The package also exports a library entry for embedding the tools in another transport:

```ts
import { createServer } from "bundlesocial-mcp";

const server = createServer({ apiKey, mode: "hosted", defaultTeamId });
```

`createServer({ apiKey, apiUrl?, defaultTeamId?, mode?, clientId?, auth?, readOnly? })` builds the `McpServer` and is transport-agnostic. `mode: "hosted"` is for servers that run remotely: local file paths are refused (media and CSV sources must be public `https://` URLs), and CSV URLs are fetched without redirects and only from public addresses. Every request sends `x-bundle-client` (`mcp/<version>`, or `mcp-hosted/<version>` when hosted) so usage can be measured. `auth: "oauth"` tells `check_setup` the user signed in through an OAuth connection rather than an API key, and `readOnly: true` registers only read-only tools.

Every tool is annotated with a `title` and either `readOnlyHint` or `destructiveHint`; anything that writes, including creating a post, is marked destructive so clients ask before running it.

Releases are automated with [semantic-release](https://semantic-release.gitbook.io/) on merge to `main` (conventional commits).

## Publishing & registries

- **npm** — published as [`bundlesocial-mcp`](https://www.npmjs.com/package/bundlesocial-mcp) (via semantic-release; `package.json` carries `"mcpName": "io.github.bundleglobal/bundlesocial-mcp"` so the registry can verify ownership).
- **Official MCP registry** — [`server.json`](./server.json) is the registry manifest. Publish with the [`mcp-publisher`](https://github.com/modelcontextprotocol/registry) CLI after `npm publish`:
  ```bash
  npx -y @modelcontextprotocol/publisher login github
  npx -y @modelcontextprotocol/publisher publish
  ```
- **Anthropic connector directory** — submit via the form at https://modelcontextprotocol.io / the Anthropic connectors directory once it's on the public registry.
- **awesome-mcp-servers** — open a PR adding `bundlesocial-mcp` under the relevant category (social media / automation).

## License

MIT — see [LICENSE](./LICENSE).
