---
name: gaia-code-harness
description: Knowledge base del proyecto GAIA Code Harness. Arquitectura, modos de operación, pipeline de agentes, artefactos y reglas.
scope: project
createdAt: "2026-07-15T00:00:00.000Z"
---

# GAIA Code Harness

> Sistema de orquestación de agentes LLM para desarrollo de software con TDD, Gherkin, review y mutation testing.

---

## When to use this skill

Usa esta skill cuando trabajes dentro del repositorio `gaia-code-harness` o coordines jobs de GAIA en cualquiera de sus tres modos.

## Overview

GAIA soporta **tres modos de orquestación** simultáneamente:

| Modo | Cómo arranca | Backend | Aprobación |
|---|---|---|---|
| **HTTP API** | `npm run dev` → `POST /jobs` | PostgreSQL | `POST /jobs/:id/approve` |
| **CLI** | `npx ts-node src/cli/run.ts --job job.json` | Disk JSON | `--approve` flag |
| **Webhook** | `POST /webhook/trigger` | PostgreSQL | Automática |
| **`.claude`** | Conversación con Claude Code | Markdown + `feature_list.json` | Puerta humana en Gherkin |

## Pipeline de 5 fases

```
pending
  → [Spec] project-spec.md
  → [Gherkin] features/<name>.feature
  → ⏸ HUMANO APRUEBA
  → in_progress
  → [Implementación] src/ + tests/ del workspace
  → [Review] progress/judge_<name>.md
  → [Mutación] progress/mutation_<name>.md
  → done
```

La **única puerta de aprobación humana** está después de los escenarios Gherkin.

## Agente mapping

| Fase | `.claude/agents/` | GAIA TypeScript | Artefacto |
|---|---|---|---|
| Spec | `spec_partner` | `SpecAuthorAgent` | `project-spec.md` |
| Gherkin | `gherkin_author` | `SpecAuthorAgent` (2ª LLM call) | `features/<name>.feature` |
| Aprobación | `craftsman_lead` | `--approve` / `POST /jobs/:id/approve` | — |
| Implementación | `tdd_craftsman` | `ImplementerAgent.executeTDD()` | `src/` + `tests/` |
| Bulk | — | `ImplementerAgent.execute()` | `src/` + `tests/` |
| Review | `judge` | `ReviewerAgent` | `progress/judge_<name>.md` |
| Mutación | `mutation_tester` | `MutationTesterAgent` | `progress/mutation_<name>.md` |

## Arquitectura clave

- `src/harness/leader.ts` — máquina de estados que orquesta los 4 agentes TS.
- `src/state/` — `StateBackend` con `PostgresBackend` y `DiskBackend`.
- `src/agents/` — `SpecAuthorAgent`, `ImplementerAgent`, `ReviewerAgent`, `MutationTesterAgent`.
- `src/plugins/` — `flutter_web/`, `ios/`, `android/`; cada uno implementa `PlatformSkill`.
- `src/tools/` — utilidades de Git, GitHub, Jira, Slack, archivos, tests, mutación.
- `src/api/routes/` — endpoints REST (`jobs.ts`, `webhook.ts`).
- `src/cli/run.ts` — entry point del Modo B (CLI).

## Handoff artifacts

Cada agente deja un resumen para el siguiente:

- `project-spec.md`
- `features/<name>.feature`
- `progress/tdd_<name>.md`
- `progress/judge_<name>.md`
- `progress/mutation_<name>.md`
- `handoff.md`
- `review_report.md` (en modos TS)

## Reglas duras

- Una sola feature a la vez.
- No declares `done` sin `judge` aprobado y mutación ≥ 80%.
- No saltes la aprobación humana sobre los `.feature`.
- No edites `src/` ni `tests/` directamente; delega.
- TDD estricto: un test a la vez.
- Corre `./init.sh` al arrancar y `npx tsc --noEmit` tras cambios TS.

## Useful commands

```bash
./init.sh                                                       # verificar entorno
npx tsc --noEmit                                               # compilar TS
npm test                                                        # correr tests Jest
npx ts-node src/cli/run.ts --job job.json --approve             # CLI Mode
npx ts-node src/cli/run.ts --list                              # listar jobs
python3 tools/mutate.py <file> --cmd "<runner>" --threshold 80 # mutación manual
```

## From Claude Code

- `/run_gaia` — lanza el CLI Mode con los mismos agentes TypeScript.
- `@craftsman_lead` — inicia el pipeline manual paso a paso.

## Related files

- `AGENTS.md` — mapa completo para agentes IA.
- `CLAUDE.md` — instrucciones de arranque para Claude Code.
- `docs/engineering/workflow.md` — pipeline y mapeo entre modos.
- `docs/engineering/tdd.md` — TDD estricto.
- `docs/engineering/gherkin.md` — sintaxis y reglas Gherkin.
- `docs/engineering/mutation-testing.md` — mutación y umbrales.
