# Contributing to mcpkit

Thanks for your interest in contributing.

## Requirements

- **Node.js** 20 or newer
- **npm** (comes with Node)

## Development setup

```bash
git clone https://github.com/AbdlrahmanSaberAbdo/mcpkit.git
cd mcpkit
npm install
```

## Commands

| Command | Purpose |
|--------|---------|
| `npm run dev` | Watch mode rebuild with tsup |
| `npm run build` | Production build to `dist/` |
| `npm test` | Run Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run lint` | ESLint on `src/` and `bin/` |
| `npm run lint:fix` | ESLint with auto-fix |
| `npm run typecheck` | TypeScript `tsc --noEmit` |

Lint configuration lives in [`eslint.config.mjs`](eslint.config.mjs) (flat config, `typescript-eslint`). Browser dashboard scripts under `src/inspector/dashboard/*.js` are intentionally excluded from ESLint.

## Pull requests

1. Open an issue first for large changes (optional for small fixes).
2. Branch from `main`, keep commits focused.
3. Ensure `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` pass locally.
4. CI must be green before merge.

## Commit messages

Short, imperative subject line (e.g. `fix(proxy): handle closed WebSocket`). Optional scope in parentheses.

## Scaffolding examples

YAML examples under `examples/scaffold-from-yaml/` are source-only. Generated folders (e.g. `influxdb-server/`) are not committed; run `mcpkit init` per the example README.

**Important:** Always pass `--output <dir>` when running `mcpkit init` so generated files never overwrite the mcpkit root `package.json` / `tsconfig.json`.

## Releases (maintainers)

When you want a release, open a PR (or commit) that **only bumps** `version` in [`package.json`](package.json) and updates [`CHANGELOG.md`](CHANGELOG.md), then **merge to `main`**.

[`.github/workflows/release.yml`](.github/workflows/release.yml) runs on every push to `main`. It publishes to npm **only if** that version is **not** already on the registry (`npm view` check), then creates a GitHub Release tagged `vVERSION`. Merges that do not change the version do not publish.

Repo secret **`NPM_TOKEN`** must be set. You can re-run the workflow manually (**Actions → Release → Run workflow**) if a publish failed after the tarball reached npm.
