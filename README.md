# bundlesocial-mcp

[Model Context Protocol](https://modelcontextprotocol.io) server for the [bundle.social](https://bundle.social) social-media API. It lets MCP clients — Claude Desktop, Claude Code, Cursor, and anything else that speaks MCP — post, schedule, list and analyze content across 14+ platforms (X, Instagram, TikTok, LinkedIn, YouTube, Facebook, Pinterest, Reddit, Threads, Bluesky, Mastodon, Discord, Slack, Google Business Profile).

It's a thin wrapper over the official [`bundlesocial`](https://www.npmjs.com/package/bundlesocial) Node SDK. Same surface as [`bundlesocial-cli`](https://www.npmjs.com/package/bundlesocial-cli) — posting, comments, media, analytics, team & integration management, and post-history/comment/CSV imports — exposed as MCP tools.

> Ships as a **local stdio server** today (`npx bundlesocial-mcp`). A hosted remote HTTP server at `mcp.bundle.social` is planned.

## Prerequisites

- Node.js 20+
- A bundle.social API key — create one at <https://bundle.social/dashboard/organization/api-keys>

## Tools

Team-scoped tools take an optional `teamId` — skip it when your org has one team or you set `BUNDLESOCIAL_TEAM_ID`. Errors come back as `{ "error": { "code", "message", "details"? } }` with `isError: true`.

### Diagnostics

| Tool | Description |
|---|---|
| `check_setup` | Self-diagnosis: API key present, API reachable, API key valid, org API access, team resolution, connected integrations, posts quota. Returns `{ ok, checks: [...] }`. Run it first. |

### Organization & teams

| Tool | Description |
|---|---|
| `get_organization` | Fetch the organization — id, name, API-access flag, plan limits, teams. |
| `get_usage` | Posts / comments / uploads usage quotas + a paginated per-account post-import usage breakdown. |
| `list_teams` | List teams in the organization (paginated, searchable). |
| `get_team` | Fetch one team by id (incl. its connected integrations). |
| `create_team` | Create a team (optionally copy another team's social accounts via `copyTeamId`). |
| `update_team` | Update a team's name/avatar — only the fields you pass change. |
| `delete_team` | Delete a team by id (destructive). |

### Integrations (social accounts)

| Tool | Description |
|---|---|
| `list_integrations` | List connected social accounts for a team (ids, platform types, channels). Without a team, lists every team. |
| `connect_integration` | Start an OAuth connect flow — returns a `url` to redirect the user to. `serverUrl` for Mastodon/Bluesky; `options` for provider flags. |
| `disconnect_integration` | Disconnect a social account of a given platform from the team (destructive). |
| `set_integration_channel` / `unset_integration_channel` | Pick / clear the channel/page to post to (FACEBOOK, INSTAGRAM, LINKEDIN, YOUTUBE, GBP). |
| `refresh_integration_channels` | Re-fetch the available channels (DISCORD, SLACK, REDDIT, PINTEREST, …). |
| `create_integration_portal_link` | Create a bundle.social-hosted portal link the user can open to connect/manage accounts — returns a `url`. |
| `check_integration_connection` | Run an on-demand connection/disconnect health check for a platform's account. |
| `refresh_integration_profile` | Refresh the cached profile info (username, display name, avatar). |
| `get_integration_by_type` | Fetch the connected social account for a platform on the team. |
| `copy_integration` | Copy connected accounts between teams (`fromTeamId` → `toTeamId`). |
| `list_integrations_to_delete` | List social accounts scheduled for deletion (paginated). |
| `list_integration_tools` | List the read-only platform helper methods callable via `trigger_integration_tool`. |
| `trigger_integration_tool` | Call a helper: subreddit flairs/requirements, YouTube categories/playlists/regions, LinkedIn mentions, Instagram locations, Google Business categories, TikTok trending music. Use it to discover values the API needs. |

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

### Comments

| Tool | Description |
|---|---|
| `create_comment` | Comment on a post — pass `content` multiple times for a chain of replies (X-style thread via comments). Comment-capable platforms: TIKTOK, YOUTUBE, INSTAGRAM, FACEBOOK, THREADS, LINKEDIN, REDDIT, MASTODON, DISCORD, SLACK, BLUESKY. |
| `list_comments` / `get_comment` / `delete_comment` | List, fetch, and delete comments. |
| `create_comment_import` | Start an async import of a published post's (incoming) comments for one platform. |
| `list_comment_imports` / `get_comment_import` | List / fetch comment-import jobs. |
| `list_imported_comments` | List the comments fetched for a post via `create_comment_import`. |

### Media (uploads)

| Tool | Description |
|---|---|
| `upload_media` | Upload an image/video/document from a public URL (or local path in stdio mode). Local files >90 MB use the large-upload flow automatically (.jpg/.jpeg/.png/.gif/.mp4/.pdf only above that size). Returns the upload object — pass its `id` to `create_post`/`schedule_post` via `data` (e.g. `{"TWITTER":{"text":"hi","uploadIds":["<id>"]}}`). |
| `list_media` / `get_media` | List / fetch media uploads (filter by type and USED/UNUSED). |
| `delete_media` / `delete_media_many` | Delete one or several uploads (destructive). |
| `init_large_upload` / `finalize_large_upload` | Low-level chunked-upload primitives — `init` returns a signed PUT `url` + `path`; PUT the bytes there, then `finalize`. (Prefer `upload_media` with a local path — it does this for you.) |

### Post-history imports

| Tool | Description |
|---|---|
| `create_post_import` | Start an async import of an account's recent posts (post history) into bundle.social. Platforms: FACEBOOK, INSTAGRAM, THREADS, TIKTOK, YOUTUBE, LINKEDIN, PINTEREST, REDDIT, MASTODON, BLUESKY. |
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

### Targeting platforms & per-platform fields

`create_post` / `schedule_post` target platforms by **name** (`x`, `tiktok`, `instagram`, `youtube`, `facebook`, `threads`, `linkedin`, `pinterest`, `reddit`, `mastodon`, `discord`, `slack`, `gbp`) or by **integration id** (from `list_integrations`). Put platform-required fields under `platformSettings` keyed by platform — e.g. Reddit `sr`, Pinterest `boardName`, TikTok `privacy`, YouTube `madeForKids`/`privacyStatus`, Instagram/Facebook `type` — or pass the full `data` object verbatim. The complete per-platform parameter reference is at **<https://docs.bundle.social/api-reference/platform-parameters>**.

## Configuration

The server reads these environment variables (CLI flags override them):

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
        "BUNDLESOCIAL_API_KEY": "sk_live_..."
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add bundlesocial --env BUNDLESOCIAL_API_KEY=sk_live_... -- npx -y bundlesocial-mcp
```

Or add to `.mcp.json` in your project:

```json
{
  "mcpServers": {
    "bundlesocial": {
      "command": "npx",
      "args": ["-y", "bundlesocial-mcp"],
      "env": { "BUNDLESOCIAL_API_KEY": "sk_live_..." }
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
      "env": { "BUNDLESOCIAL_API_KEY": "sk_live_..." }
    }
  }
}
```

### Remote MCP (planned)

A hosted server at `https://mcp.bundle.social` with `Authorization: Bearer <key>` auth is on the roadmap. Until then, run the stdio server locally as above.

## Try it without a client

```bash
BUNDLESOCIAL_API_KEY=sk_live_... npx bundlesocial-mcp
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

`createServer({ apiKey, apiUrl?, defaultTeamId? })` (from `./server`) builds the `McpServer` and is transport-agnostic — convenient for embedding or for a future HTTP transport.

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
