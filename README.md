# bundlesocial-mcp

[Model Context Protocol](https://modelcontextprotocol.io) server for the [bundle.social](https://bundle.social) social-media API. It lets MCP clients — Claude Desktop, Claude Code, Cursor, and anything else that speaks MCP — post, schedule, list and analyze content across 14+ platforms (X, Instagram, TikTok, LinkedIn, YouTube, Facebook, Pinterest, Reddit, Threads, Bluesky, Mastodon, Discord, Slack, Google Business Profile).

It's a thin wrapper over the official [`bundlesocial`](https://www.npmjs.com/package/bundlesocial) Node SDK. Same operations as [`bundlesocial-cli`](https://www.npmjs.com/package/bundlesocial-cli), exposed as MCP tools.

> Ships as a **local stdio server** today (`npx bundlesocial-mcp`). A hosted remote HTTP server at `mcp.bundle.social` is planned.

## Prerequisites

- Node.js 20+
- A bundle.social API key — create one at <https://bundle.social/dashboard/organization/api-keys>

## Tools

| Tool | Description |
|---|---|
| `list_integrations` | List connected social accounts for a team (ids, platform types, channels). |
| `list_integration_tools` | List the read-only platform helper methods callable via `trigger_integration_tool`. |
| `trigger_integration_tool` | Call a helper: subreddit flairs/requirements, YouTube categories/playlists/regions, LinkedIn mentions, Instagram locations, Google Business categories, TikTok trending music. Use it to discover values the API needs. |
| `create_post` | Publish a post immediately (or save as a draft) to one or more integrations. |
| `schedule_post` | Schedule a post for a future ISO-8601 date/time. |
| `update_post` | Update an existing post (only the fields you pass change; reuses the post's platforms when changing content without `platforms`). |
| `list_posts` | List recent posts with filters (status, platform, date range, query). |
| `get_post` | Fetch one post by id. |
| `delete_post` | Delete a post by id. |
| `retry_post` | Re-attempt a post that ended in `ERROR`. |
| `create_comment` | Comment on a post — pass `content` multiple times for a chain of replies (X-style thread via comments). Comment-capable platforms: TIKTOK, YOUTUBE, INSTAGRAM, FACEBOOK, THREADS, LINKEDIN, REDDIT, MASTODON, DISCORD, SLACK, BLUESKY. |
| `list_comments` / `get_comment` / `delete_comment` | List, fetch, and delete comments. |
| `upload_media` | Upload an image/video/document from a URL (or local path in stdio mode); returns the upload object. |
| `get_post_analytics` | Engagement metrics for one post. |
| `get_analytics_summary` | Org-level usage quotas + latest per-integration analytics snapshot. |

All tools take an optional `teamId` (skip it when your org has one team or you set `BUNDLESOCIAL_TEAM_ID`). `create_post` / `schedule_post` target platforms by **name** (`x`, `tiktok`, `instagram`, `youtube`, `facebook`, `threads`, `linkedin`, `pinterest`, `reddit`, `mastodon`, `discord`, `slack`, `gbp`) or by **integration id**. Put platform-required fields under `platformSettings` keyed by platform — e.g. Reddit `sr`, Pinterest `boardName`, TikTok `privacy`, YouTube `madeForKids`/`privacyStatus`, Instagram/Facebook `type`. Errors come back as `{ "error": { "code", "message", "details"? } }` with `isError: true`.

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

- "List my connected social accounts via bundle.social."
- "Post 'We just shipped dark mode 🌙' to X and Bluesky."
- "Schedule a LinkedIn post for next Monday 9am UTC announcing the launch."
- "Upload https://cdn.example.com/promo.mp4 and create a TikTok post with it, privacy public."
- "Post to r/test on Reddit — first check the subreddit's requirements and flairs, then post with the right flair."
- "Reply to post `post_abc123` with a 3-comment thread on LinkedIn."
- "Change the title of post `post_abc123` and move it back to draft."
- "How did post `post_abc123` perform?"
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
