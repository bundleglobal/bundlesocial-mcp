# Changelog

All notable changes to `bundlesocial-mcp` are documented here. This file is
maintained automatically by [semantic-release](https://semantic-release.gitbook.io/).

## 1.0.0

Initial release.

- Local **stdio** MCP server (`npx bundlesocial-mcp`) for Claude Desktop, Claude Code, Cursor and other MCP clients
- Tools: `list_integrations`, `list_integration_tools`, `trigger_integration_tool`, `create_post`, `schedule_post`, `update_post`, `list_posts`, `get_post`, `delete_post`, `retry_post`, `create_comment`, `list_comments`, `get_comment`, `delete_comment`, `upload_media`, `get_post_analytics`, `get_analytics_summary`
- Strict zod-derived input schemas; structured `{ error: { code, message, details? } }` results with `isError: true`
- Auth via `BUNDLESOCIAL_API_KEY` (env or `--api-key`); `BUNDLESOCIAL_API_URL` and `BUNDLESOCIAL_TEAM_ID` supported
- `server.json` manifest + `mcpName` for the official MCP registry

Remote HTTP mode (hosted `mcp.bundle.social`) is planned for a future release.
