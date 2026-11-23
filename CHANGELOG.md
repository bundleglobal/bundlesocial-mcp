# [1.6.0](https://github.com/bundleglobal/bundlesocial-mcp/compare/v1.5.0...v1.6.0) (2026-11-23)


### Features

* local files on the hosted server through direct (signed) uploads ([#6](https://github.com/bundleglobal/bundlesocial-mcp/issues/6)) ([75700d6](https://github.com/bundleglobal/bundlesocial-mcp/commit/75700d6cd59edbf1ea7aa68f7cd8445594c1887f))

# [1.5.0](https://github.com/bundleglobal/bundlesocial-mcp/compare/v1.4.0...v1.5.0) (2026-11-23)


### Features

* teamId accepts a team name; several teams is not a setup warning ([#5](https://github.com/bundleglobal/bundlesocial-mcp/issues/5)) ([1ee5a50](https://github.com/bundleglobal/bundlesocial-mcp/commit/1ee5a50c74e8c0eed922f0c77eb2128f0344083e))

# [1.4.0](https://github.com/bundleglobal/bundlesocial-mcp/compare/v1.3.0...v1.4.0) (2026-11-23)


### Features

* hosted mode, library export and destructive-tool annotations ([#4](https://github.com/bundleglobal/bundlesocial-mcp/issues/4)) ([308d287](https://github.com/bundleglobal/bundlesocial-mcp/commit/308d287a59fdf9444aca05ea00b45a70c39f33df))

# [1.4.0](https://github.com/bundleglobal/bundlesocial-mcp/compare/v1.3.0...v1.4.0) (2026-11-23)


### Features

* hosted mode, library export and destructive-tool annotations ([#4](https://github.com/bundleglobal/bundlesocial-mcp/issues/4)) ([308d287](https://github.com/bundleglobal/bundlesocial-mcp/commit/308d287a59fdf9444aca05ea00b45a70c39f33df))

# [1.3.0](https://github.com/bundleglobal/bundlesocial-mcp/compare/v1.2.3...v1.3.0) (2026-11-18)


### Features

* TikTok ad authorization, Threads ghost posts and Snapchat Business profiles ([#3](https://github.com/bundleglobal/bundlesocial-mcp/issues/3)) ([b678012](https://github.com/bundleglobal/bundlesocial-mcp/commit/b6780124b9e0962d551d6c818102fdb99012fccb))

## [1.2.3](https://github.com/bundleglobal/bundlesocial-mcp/compare/v1.2.2...v1.2.3) (2026-11-04)


### Bug Fixes

* describe Pinterest carousel Pins and update the SDK to 2.70 ([98bfe3b](https://github.com/bundleglobal/bundlesocial-mcp/commit/98bfe3bfe470eea820c749833e776078d8307fbd))

## [1.2.2](https://github.com/bundleglobal/bundlesocial-mcp/compare/v1.2.1...v1.2.2) (2026-10-20)


### Bug Fixes

* drop copyTeamId from team creation and update the SDK to 2.68 ([77ee5ca](https://github.com/bundleglobal/bundlesocial-mcp/commit/77ee5cab5ee1f3b81a665e35b1b160f833fd0bb6))

## [1.2.1](https://github.com/bundleglobal/bundlesocial-mcp/compare/v1.2.0...v1.2.1) (2026-10-13)


### Bug Fixes

* list teams via paginated team endpoint instead of deprecated organization.teams ([098fe65](https://github.com/bundleglobal/bundlesocial-mcp/commit/098fe65a3f0d1d27b00d0b712a4b6eccc993156c))

# [1.2.0](https://github.com/bundleglobal/bundlesocial-mcp/compare/v1.1.0...v1.2.0) (2026-07-30)


### Features

* catch up with bundle.social API and SDK 2.61.0 ([d49ee6b](https://github.com/bundleglobal/bundlesocial-mcp/commit/d49ee6b4cf022f8086ae1b725749d789968ff12c))

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
