# [1.1.0](https://github.com/bundleglobal/bundlesocial-mcp/compare/v1.0.1...v1.1.0) (2026-05-25)


### Features

* additional reference ([5a5133f](https://github.com/bundleglobal/bundlesocial-mcp/commit/5a5133fc5d51f49e8d8dfe8d9effbee129989dc9))

## [1.0.1](https://github.com/bundleglobal/bundlesocial-mcp/compare/v1.0.0...v1.0.1) (2026-05-17)


### Bug Fixes

* build before release ([b7a6aa7](https://github.com/bundleglobal/bundlesocial-mcp/commit/b7a6aa7e74adc17ee3c3122bdaa9bfad07c727f0))

# 1.0.0 (2026-05-17)


### Bug Fixes

* semantic release ([7a2f61e](https://github.com/bundleglobal/bundlesocial-mcp/commit/7a2f61ee298913d174836a3c4b523ced49b984b1))


### Features

* additional methods ([0aa1af1](https://github.com/bundleglobal/bundlesocial-mcp/commit/0aa1af1cf4d65af5c781630cd3baad2d121ad665))
* bundle.social MCP server v1 ([3ed0235](https://github.com/bundleglobal/bundlesocial-mcp/commit/3ed0235902bf2ecd288cbfaf9976c6dcdaf9f160))
* update comment ([c0da8ca](https://github.com/bundleglobal/bundlesocial-mcp/commit/c0da8caaa797eb6542886dff53b82b715344e204))

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
