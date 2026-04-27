# Changelog

Notable **user-facing** changes by version. Maintainers update this when cutting a release (along with a version bump in `package.json`).

## [Unreleased]

### Added

- ESLint, GitHub Actions CI, release workflow (publish to npm when `main` has a new version), `LICENSE`, contributor/issue templates
- npm package metadata (`files`, `repository`, etc.) for registry publishing

## [0.1.0] - 2026-04-26

### Added

- **`mcpkit init`** — Scaffold MCP servers from YAML or OpenAPI
- **`mcpkit proxy`** — Transparent JSON-RPC proxy with optional NDJSON logging and WebSocket trace export
- **`mcpkit inspect`** — Proxy with browser-based inspector dashboard
- **`mcpkit serve`** — Standalone shared inspector dashboard for multiple proxied servers
- Inspector dashboard: server column, filters (tools / protocol / server), clear + history replay fixes
- Example YAML definitions under `examples/scaffold-from-yaml/` (InfluxDB, PostgreSQL) with README
