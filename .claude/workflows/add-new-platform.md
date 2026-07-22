# Add New Platform Workflow

> Add support for a new target platform in GAIA (e.g., `react`, `python`, `go`).

## When to use

- You want GAIA to generate code for a new technology.
- The platform follows the `PlatformSkill` contract.

## Steps

1. **Define the skill**
   - Create `src/plugins/<platform>/index.ts` implementing the `PlatformSkill` interface.
   - Define `displayName`, `srcDirs`, `sourceExtension`, `testCommand`, `buildCommand`.
2. **Prompt context**
   - Implement `getPromptContext(job)` with the platform's conventions and commands.
3. **Environment verification**
   - Implement `verifyEnvironment(repoPath)` that validates the toolchain is installed.
4. **Build and test**
   - Implement `build(repoPath, module, strategy)`.
   - Implement `test(repoPath, module)`.
5. **Optional analysis**
   - Implement `analyze(repoPath, module)` for lint/style checks.
6. **Register the plugin**
   - Update `src/plugins/index.ts` to export and register the new platform.
7. **Harness tests**
   - Add unit tests in `tests/plugins/<platform>.test.ts` or extend existing ones.
   - Run `npm test` and `npx tsc --noEmit`.
8. **Documentation**
   - Add a guide in `docs/guides/<platform>.md` if applicable.
   - Update `README.md` and `docs/index.md` listing the supported platform.

## Verification

- `./init.sh` passes.
- `npx tsc --noEmit` passes.
- `npm test` passes.
- A `job.json` with `"platform": "<platform>"` and `npx ts-node src/cli/run.ts --job job.json --approve` reaches implementation without "skill not found" errors.

## Output

- `progress/add-platform-<platform>.md` with decisions, commands, and validations.
