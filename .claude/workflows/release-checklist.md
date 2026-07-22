# Release Checklist Workflow

> Steps to publish a new version of GAIA Code Harness.

## When to use

- When tagging a release (`vX.Y.Z`).
- Before deploying the HTTP mode to production.

## Steps

1. **Freeze features**
   - Review `feature_list.json`; there should be no `in_progress` features.
   - Make sure only `done` or `blocked` remain for the next version.
2. **Tests and compilation**
   - `./init.sh` passes.
   - `npx tsc --noEmit` passes.
   - `npm test` passes (or document why it does not apply).
3. **Documentation**
   - Update `README.md` if there are usage changes.
   - Update `API.md` if the REST/Webhook API changed.
   - Update `docs/guides/production.md` if deploy requirements changed.
4. **Changelog**
   - Summarize commits since the last tag: `git log <last-tag>..HEAD --oneline`.
   - Write or update `CHANGELOG.md`.
5. **Version bump**
   - Update `version` in `package.json`.
   - Update `package-lock.json` with `npm install`.
6. **Tag and release**
   - `git tag -a vX.Y.Z -m "Release vX.Y.Z"`.
   - `git push origin vX.Y.Z`.
   - Create release notes on GitHub (manually or via API).
7. **Deploy (HTTP mode)**
   - Verify production environment variables.
   - Run DB migrations if applicable.
   - Deploy and check health checks.

## Verification

- `git tag` shows the new tag.
- `npm run build` produces `dist/` without errors.
- The staging server responds to `GET /health`.

## Output

- `progress/release-vX.Y.Z.md` with a summary of changes, decisions, and validations.
