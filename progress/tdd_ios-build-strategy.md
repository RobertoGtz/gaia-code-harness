# TDD — iOS build strategy

Mapa de escenarios Gherkin a tests unitarios.

## Estado

Los tests fueron escritos a lo largo de la implementación; este documento
recoge el mapeo retrospectivo.

## Mapa `@s → test`

| Escenario | Test | Archivo | Estado |
| --------- | ---- | ------- | ------ |
| @s1 | `resolve strategy returns success` | `tests/ios-skill.test.ts` | ✅ |
| @s2 | `tuist strategy returns success for Tuist module` | `tests/ios-skill.test.ts` | ✅ |
| @s3 | `auto strategy uses tuist build when tuist config exists` | `tests/ios-skill.test.ts` | ✅ |
| @s4 | `auto strategy falls back to xcodebuild when tuist fails` | `tests/ios-skill.test.ts` | ✅ |
| @s5 | `auto strategy falls back to resolve when tuist and xcodebuild fail` | `tests/ios-skill.test.ts` | ✅ |
| @s6 | `xcodebuild strategy returns success for non-Tuist project` | `tests/ios-skill.test.ts` | ✅ |
| @s7 | `preserves GitHub upstream URL when cloning from LOCAL_REPOS_PATH` | `tests/repo-setup.test.ts` | ✅ |
| @s8 | `copies Tuist/.build cache from local repo when present` | `tests/repo-setup.test.ts` | ✅ |
| @s9 | `does not copy Tuist/.build cache when destination already exists` | `tests/repo-setup.test.ts` | ✅ |
| @s10 | `returns success with PR URL when review passes` | `tests/reviewer.test.ts` | ✅ |
| @s11 | `limits directory structure to 500 files and skips broken symlinks` | `tests/file.test.ts` | ✅ |
| @s12 | Mutation scores ≥ 80% en `tools/mutate.py` | `progress/mutation_ios-build-strategy.md` | ✅ |

## Ciclos Rojo → Verde → Refactor

1. **Añadir campo `buildStrategy` al tipo** — test `tests/types.test.ts` (si existe) o verificación directa de `CodeGenerationJob`.
2. **Selección de estrategia en `IosSkill.build`** — tests de `ios-skill.test.ts` cubriendo `resolve`, `tuist`, `xcodebuild`, `auto`.
3. **Tuist build wrapper** — `tests/xcode-runner.test.ts` para `runTuistBuild` y `ensureTuistGenerated`.
4. **Repo setup con cache** — `tests/repo-setup.test.ts` para cache y upstream.
5. **Git remote parsing** — `tests/git.test.ts` para `parseGitHubRepoFromRemote` y PR.
6. **File system limits** — `tests/file.test.ts` para 500 files y symlinks.
7. **Reviewer integration** — `tests/reviewer.test.ts` con `jest.spyOn` para evitar problemas de `instanceof`.

## Notas

- Los tests de `IosSkill` usan mocks del toolchain (`xcode-runner`) para no depender de Xcode instalado en CI.
- Los tests de `repo-setup` usan `jest.spyOn` sobre `simple-git` para que las instancias de error pasen `instanceof`.
- Los tests de `reviewer` usan `jest.spyOn` en lugar de `jest.mock` para preservar las clases de error de `git.ts`.
