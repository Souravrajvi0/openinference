---
description: Cut and publish a new @openinference/cli release (bump → build → dry-run → publish)
argument-hint: [patch|minor|major]  (default patch)
allowed-tools: Bash(npm:*), Bash(git:*), Bash(node:*)
---

Release a new version of the `@openinference/cli` package. The bump level is
`$1` (one of `patch`, `minor`, `major`); default to **patch** if not given.

Work entirely inside `packages/cli`. Follow these steps in order and STOP if any
guard fails — do not force past a failed check.

## 1. Preflight (must all pass before bumping)
- Confirm the current branch is `dev` (`git branch --show-current`). If it isn't,
  tell the user and ask whether to continue from the current branch or switch to `dev`.
- Confirm the git working tree is clean (`git status --short`). `npm version` will
  refuse to run on a dirty tree. If there are uncommitted changes:
  - If they are only the `packages/cli/data/models.json` build artifact, restore it
    (`git restore packages/cli/data/models.json`).
  - Otherwise, list them and ask the user to commit first — do NOT commit their work
    for them unless they say so.
- Show current local version vs the registry so the bump lands **above** npm:
  - local: `node -e "console.log(require('./packages/cli/package.json').version)"`
  - registry: `npm view @openinference/cli version`
  - If local ≤ registry, warn the user and propose the right target version before bumping.

## 2. Bump
- `cd packages/cli && npm version $1` (defaults to `patch`). This edits
  `package.json`, creates a commit, and a git tag. Report the new version.

## 3. Build
- `npm run build` — rebuilds `dist/` + `data/` (what actually ships). Confirm it
  succeeds; if the build fails, stop and surface the error (do not publish).

## 4. Dry-run
- `npm publish --dry-run` and show the user the tarball's file list + size.
  Sanity-check that `dist/` and `data/` are present and `src/` is NOT included.

## 5. Publish (confirm first — irreversible)
- Publishing a version cannot be undone. Ask the user to confirm before running it.
- Run `npm publish`. If it fails with an OTP/2FA prompt, ask the user for their
  one-time code and re-run with `npm publish --otp=<code>`.
- Do NOT retry a failed publish in a loop — surface the error and let the user decide.

## 6. Verify + hand off
- Confirm the registry updated: `npm view @openinference/cli version`.
- Remind the user of the update command for each machine (laptop, droplet):
  `npm install -g @openinference/cli@latest` then `oi --version`.
- Note: this publishes the CLI to npm only — it does NOT deploy the droplet or push
  any branch. Mention that the version-bump commit/tag on `dev` is local until pushed.
