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

1. Bump version in `package.json` and update [`CHANGELOG.md`](CHANGELOG.md).
2. Commit and push, then tag: `git tag v0.2.0 && git push origin v0.2.0`.
3. Ensure the repository secret **`NPM_TOKEN`** is set (npm automation or granular token with publish permission).

Pushing a tag matching `v*.*.*` runs [`.github/workflows/release.yml`](.github/workflows/release.yml): lint, typecheck, test, build, `npm publish`, and a GitHub Release with generated notes.

If `NPM_TOKEN` is missing, the publish step fails; fix secrets and re-run the failed job or delete the tag and push again after fixing.

### First publication to npm

1. Create an account on [npmjs.com](https://www.npmjs.com/signup) and verify the **`mcpkit`** name is available (`npm view mcpkit`).
2. Locally: `npm login`.
3. After `npm run build`, run `npm publish` from the repo root (or rely on CI after tagging). The tarball only includes [`package.json`](package.json) `files`: `dist/`, license, and docs — not `src/` or tests.

Consumers install with **`npm install -g mcpkit`** or **`npx mcpkit`** once the package is published.

### `403 Forbidden` when publishing

npm requires **two-factor authentication** for publishing (or an eligible token).

**Interactive publish from your machine**

1. Enable 2FA on [npm → Account → Two-Factor Authentication](https://www.npmjs.com/settings/~YOUR_USERNAME/profile/edit) (choose **Authorization and publishing**).
2. Publish with a one-time code:

   ```bash
   npm publish --otp=123456
   ```

   Replace `123456` with the code from your authenticator app.

**GitHub Actions (`NPM_TOKEN`)**

Create an **Automation** or **Granular** token at [npm → Access Tokens](https://www.npmjs.com/settings/~YOUR_USERNAME/tokens) with permission to publish this package. Automation tokens do not require `--otp`. Add it as repo secret `NPM_TOKEN`.

Run `npm pkg fix` locally if npm warns about auto-corrected `package.json` fields (it normalizes `bin` paths and formatting).
