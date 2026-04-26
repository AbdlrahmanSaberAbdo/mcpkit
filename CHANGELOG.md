# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- ESLint (flat config) with `typescript-eslint` recommended rules
- GitHub Actions CI (lint, typecheck, test on Node 20 and 22, build)
- GitHub Actions release workflow on `v*.*.*` tags (npm publish + GitHub Release)
- `LICENSE` (MIT), `CONTRIBUTING.md`, issue and PR templates

## [0.1.0] - 2026-04-26

### Added

- **`mcpkit init`** — Scaffold MCP servers from YAML or OpenAPI
- **`mcpkit proxy`** — Transparent JSON-RPC proxy with optional NDJSON logging and WebSocket trace export
- **`mcpkit inspect`** — Proxy with browser-based inspector dashboard
- **`mcpkit serve`** — Standalone shared inspector dashboard for multiple proxied servers
- Inspector dashboard: server column, filters (tools / protocol / server), clear + history replay fixes
- Example YAML definitions under `examples/scaffold-from-yaml/` (InfluxDB, PostgreSQL) with README
