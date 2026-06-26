# AGENTS.md — Mapa de navegación para agentes de IA

> Punto de entrada para cualquier agente que trabaje en este repositorio.
> NO es una biblia de reglas: es un **mapa**. Lee solo lo que necesites
> cuando lo necesites (divulgación progresiva).
>
> **GAIA Code Harness** — soporta tres modos de orquestación simultáneamente:
>
> - **Modo A — HTTP + Postgres** (producción/demo): `npm run dev` → `POST /jobs`
> - **Modo B — CLI + disco** (artesano/local): `npx ts-node src/cli/run.ts --job job.json`
> - **Modo C — Webhook + Postgres** (integración CI): `POST /webhook/trigger`

---

## 1. Antes de empezar (obligatorio)

1. Ejecuta `./init.sh` y verifica que termina sin errores. Si falla, **para**
   y resuelve el entorno antes de tocar código.
2. Lee `progress/current.md` para entender en qué estado quedó la última sesión.
3. Lee `feature_list.json`. Toda feature nueva (`"sdd": true`) recorre el
   pipeline de cinco fases — ver `docs/engineering/workflow.md` y §4.
4. Lee `docs/engineering/workflow.md` antes de coordinar nada.

---

## 2. Mapa del repositorio

### Archivos de orquestación (Claude Code mode)

| Archivo / carpeta                      | Qué contiene                                                                                    | Cuándo leerlo                           |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------- |
| `feature_list.json`                    | Lista de tareas con estado (`pending / spec_ready / in_progress / done / blocked`)              | Siempre, al empezar                     |
| `progress/current.md`                  | Estado de la sesión actual                                                                      | Siempre, al empezar                     |
| `progress/history.md`                  | Bitácora append-only de sesiones anteriores                                                     | Si necesitas contexto histórico         |
| `project-spec.md`                      | Spec conversada: propósito, contrato y decisiones por feature                                   | Antes de destilar Gherkin o implementar |
| `features/<name>.feature`              | Escenarios Gherkin (el contrato ejecutable que el humano aprueba)                               | Antes de empezar el ciclo TDD           |
| `docs/engineering/workflow.md`         | El pipeline completo y los insights de cada fase                                                | Antes de coordinar                      |
| `docs/engineering/tdd.md`              | Las Tres Leyes del TDD; el ciclo Rojo-Verde-Refactor                                            | Antes de escribir código                |
| `docs/engineering/gherkin.md`          | Cómo escribir `.feature`; de Gherkin a test                                                     | Antes de redactar/leer escenarios       |
| `docs/engineering/mutation-testing.md` | Por qué y cómo; umbral; uso de `tools/mutate.py`                                                | Antes de validar la suite               |
| `CHECKPOINTS.md`                       | Criterios objetivos de "estado final correcto"                                                  | Para auto-evaluarte                     |
| `tools/mutate.py`                      | Mutador determinístico sin dependencias (Python, TS, Swift, Kotlin)                             | Fase de mutación                        |
| `.claude/agents/`                      | `craftsman_lead`, `spec_partner`, `gherkin_author`, `tdd_craftsman`, `judge`, `mutation_tester` | Si orquestas trabajo                    |

### Archivos del harness TypeScript (HTTP mode)

| Archivo / carpeta                  | Qué contiene                                                                                     | Cuándo leerlo                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------ |
| `src/agents/`                      | `SpecAuthorAgent`, `ImplementerAgent` (+ `executeTDD()`), `ReviewerAgent`, `MutationTesterAgent` | Si modificas agentes TS        |
| `src/state/`                       | `StateBackend` interface + `PostgresBackend` + `DiskBackend`                                     | Si modificas persistencia      |
| `src/harness/leader.ts`            | Máquina de estados — orquesta los 4 agentes TS                                                   | Si modificas el flujo HTTP     |
| `src/api/routes/jobs.ts`           | `POST /jobs` con `tddMode` flag                                                                  | Si modificas la API REST       |
| `src/cli/run.ts`                   | CLI entry point para Claude Code mode con DiskBackend                                            | Si modificas el CLI TS         |
| `src/db/index.ts`                  | Postgres schema + `tdd_mode` column                                                              | Si modificas la DB             |
| `src/types/index.ts`               | `CodeGenerationJob`, `CreateJobRequest` con `tddMode`                                            | Si modificas tipos             |
| `docs/engineering/architecture.md` | Arquitectura técnica profunda (dual-mode, agents, state machine)                                 | Antes de cambios estructurales |
| `API.md`                           | Referencia completa REST API                                                                     | Antes de integrar HTTP mode    |

---

## 3. Reglas duras (no negociables)

- **Una sola feature a la vez.** No mezcles cambios de varias tareas.
- **No declares una tarea `done`** sin pruebas verdes Y umbral de mutación
  superado (`tools/mutate.py` o `MutationTesterAgent.ts`).
- **No saltes la conversación de spec ni la destilación Gherkin.** Toda
  feature con `"sdd": true` pasa por `spec_partner` y `gherkin_author`.
- **No saltes la puerta de aprobación humana** sobre los `.feature`. El
  `craftsman_lead` detiene el flujo en `spec_ready` y espera.
- **TDD estricto: un test a la vez.** Nada de producción sin un test rojo
  que la pida (`docs/engineering/tdd.md`).
- **Documenta lo que haces** en `progress/current.md` mientras trabajas.
- **Deja el repositorio limpio** antes de cerrar la sesión (ver §5).
- **Si no sabes algo, busca en `docs/`** antes de inventarlo.
- **No toques `src/` ni `tests/` directamente** — delega a `tdd_craftsman`.

---

## 4. Flujo de trabajo — Claude Code mode (pipeline)

```
pending
  → [spec_partner]    conversación → project-spec.md
  → [gherkin_author]  project-spec.md → features/<name>.feature   (status: spec_ready)
  → ⏸ HUMANO APRUEBA los escenarios  ← único punto de aprobación
  → in_progress
  → [tdd_craftsman]   Rojo → Verde → Refactor (un test a la vez, si tddMode=true)
                      ó bulk implementer (tddMode=false)
  → [judge]           review completo
  → [mutation_tester] python3 tools/mutate.py; valida ≥80% kill rate
  → done
```

### Mapeo Claude Code ↔ HTTP mode (TypeScript)

| Agente Claude Code | Equivalente TypeScript          | Diferencia clave                        |
| ------------------ | ------------------------------- | --------------------------------------- |
| `spec_partner`     | `SpecAuthorAgent`               | Conversacional (Claude) vs bulk (TS)    |
| `gherkin_author`   | _(parte de SpecAuthorAgent)_    | Separado en Claude mode                 |
| `tdd_craftsman`    | `ImplementerAgent.executeTDD()` | Activo cuando `tddMode: true`           |
| _(bulk)_           | `ImplementerAgent.execute()`    | `tddMode: false` (default)              |
| `judge`            | `ReviewerAgent`                 | Judge bloquea; reviewer no bloquea lint |
| `mutation_tester`  | `MutationTesterAgent.ts`        | Claude mode bloquea; HTTP mode warning  |

---

## 5. Cierre de sesión (lifecycle)

Antes de terminar:

1. Ejecuta `./init.sh` — todo verde.
2. Corre `python3 tools/mutate.py <archivo_tocado>` — supera el umbral.
3. Si la tarea está acabada: marca `status: "done"` en `feature_list.json`.
4. Mueve el resumen de `progress/current.md` al final de `progress/history.md`.
5. Vacía `progress/current.md` dejando solo la plantilla base.
6. No dejes archivos temporales, ni debug prints, ni TODOs sin contexto.

---

## 6. Si te bloqueas

- Relee la sección relevante de `docs/`.
- Si algo no compila o el test no corre como esperas, **no inventes un workaround**:
  documenta el bloqueo en `progress/current.md` y para la sesión.
- Para problemas de entorno (SDK faltante, Node version, Postgres down): `./init.sh` te los muestra.
