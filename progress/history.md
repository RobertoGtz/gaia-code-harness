# Historial de sesiones

> Bitácora append-only. Cada entrada se añade al final al cerrar una sesión.
> No se edita ni se elimina nada del historial.

---

<!-- Formato de entrada:
## YYYY-MM-DD — <nombre de la feature o tarea>

- **Feature**: #<id> <name>
- **Status final**: done | blocked | in_progress
- **Resumen**: qué se hizo, qué decisiones se tomaron, qué quedó pendiente.
- **Mutation score**: XX% (archivo mutado)
- **Notas**: bloqueos, decisiones de diseño, deuda técnica.
-->

## 2026-06-28 — iOS Build Strategy validation

- **Feature**: iOS Build Strategy for large Tuist monorepos
- **Status final**: in_progress
- **Resumen**: Validated `auto` build strategy on a Rappi iOS Tuist feature (PR 2334). Validated `xcodebuild` build strategy on a standalone non-Tuist iOS module generated in /tmp. Added unit tests for `git.ts`, `repo.ts`, and `reviewer.ts`. Improved `mutate.py` to strip block comments and mask strings before line comments.
- **Mutation score**: reviewer.ts 90%, git.ts 76.9%, repo.ts 55.6%, xcode-runner.ts 82% (prior session), ios/index.ts 94% (prior session)
- **Notas**: The Rappi monorepo's non-Tuist apps (Partners, Grability) require external CocoaPods/script dependencies that are not present in the workspace, so the `xcodebuild` validation used a generated non-Tuist module. `git.ts` and `repo.ts` mutation scores are held down by false positives from generic type `<>` in JSDoc and JSDoc boolean literals, which the improved mutator reduces but does not fully eliminate.
