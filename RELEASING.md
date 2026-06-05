# Releasing `send-email`

This Action is authored in [`primitivedotdev/primitive-mono-repo`](https://github.com/primitivedotdev/primitive-mono-repo) under `tools/actions/send-email/` and **mirrored on tag** to the public repo [`primitivedotdev/send-email`](https://github.com/primitivedotdev/send-email). External consumers pin a floating major (`@v0`) or an immutable patch (`@v0.1.0`) from the public repo.

The mirror is **one-way**: every release wipes the public tree and force-replaces it with the contents of `tools/actions/send-email/`. No PRs are accepted against the public repo.

> This mirrors the model used by [`deploy-function`](../deploy-function/RELEASING.md).

## One-time setup

Publishing is handled by the **generalized** [`mirror-action.yml`](../../../.github/workflows/mirror-action.yml) workflow (shared by every action under `tools/actions/`) — there's no per-action mirror workflow to add. The workflow is a **thin tag-triggered caller**: it does only auth setup (OIDC + the App installation token) and delegates the mirror to the typed, unit-tested deploy-engine (`deploy-worker mirror-action`). On first publish it **creates `primitivedotdev/send-email` automatically** if it doesn't exist (it needs the `primitive-ci` App to have org `Administration: write`; if not, it prints a `gh repo create …` to run once by hand). The org-level App install (`repository_selection: all`) covers the new repo, so there's no per-repo install or GitHub Actions secret to manage.

> **`dist/` parity is CI-enforced.** The published action runs the committed `dist/index.js`, so the `actions` job in [`ci.yml`](../../../.github/workflows/ci.yml) **blocks** PRs on `typecheck` + `test:run` + `lint:dist` (the `check-dist.mjs` guard). Rebuild a stale bundle with `pnpm --filter @primitivedotdev/send-email-action build` and commit.

> **Marketplace:** the mirror pushes git tags only — listing on the Marketplace is a separate one-time manual step in the public repo's UI.

## Cutting a release

1. **Confirm the change is on `main`** — the mirror workflow asserts the tag commit is reachable from `origin/main` and refuses to publish otherwise.
2. **Pick a version** following semver (`vX.Y.Z`). Breaking changes bump the major.
3. **Tag and push**:

   ```bash
   git checkout main && git pull --ff-only
   git tag send-email-action-v0.1.0
   git push origin send-email-action-v0.1.0
   ```

4. **Watch the mirror run**, then confirm the public tags:

   ```bash
   gh run watch "$(gh run list --workflow mirror-action.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
   gh api repos/primitivedotdev/send-email/tags --jq '.[].name'
   curl -fsSL https://raw.githubusercontent.com/primitivedotdev/send-email/v0/action.yml | head -20
   ```

## How `vMAJOR` works

The mirror force-pushes a floating major tag (`v0`) pointing at the latest `v0.x.y`. Consumers who pin `@v0` get the newest patch; `@v0.1.0` pins an immutable version. Shipping `v1.0.0` creates `v1` without touching `v0`, so existing consumers stay put until they upgrade.

## Rollback

Tag the previous good commit with a superseding patch (don't delete a published tag — consumers may already pin it):

```bash
git tag send-email-action-v0.1.1 <previous-good-sha>
git push origin send-email-action-v0.1.1
```

The mirror rebuilds the public repo from that commit and moves `v0` to it. If the breakage was in the bundled `dist/`, revert + re-tag on the monorepo — `dist/` regenerates from `src/` and the `check-dist.mjs` CI guard enforces parity.
