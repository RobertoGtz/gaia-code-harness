# Modo `.claude` — Guía de uso

> Cómo usar GAIA desde Claude Code: agentes conversacionales, aprobación humana y el slash command `/run`.

---

## ¿Qué es el modo `.claude`?

El **modo `.claude`** es la forma de trabajar con GAIA directamente dentro de Claude Code. En lugar de ejecutar un comando de terminal o llamar a una API, le pides a Claude que coordine el pipeline usando los archivos de `.claude/agents/`.

Es el modo más **artesanal** y con mayor control humano.

## ¿Cómo se compara con los otros modos?

| Modo | ¿Cómo arranca? | Orquestador | Aprobación de spec |
|---|---|---|---|
| **HTTP API** | `POST /jobs` | Servidor + `leader.ts` | `POST /jobs/:id/approve` |
| **CLI** | `npx ts-node src/cli/run.ts --job job.json` | `src/cli/run.ts` + `leader.ts` | `--approve` flag |
| **Webhook** | `POST /webhook/trigger` | Servidor + `leader.ts` | Automática |
| **`.claude`** | Conversación con Claude Code | `craftsman_lead` + subagentes | Siempre pausa después de Gherkin |

## ¿Cuándo usar `.claude`?

- La feature es ambigua y necesita conversación para entenderla.
- Quieres revisar y aprobar cada escenario Gherkin antes de que se escriba código.
- Estás depurando GAIA, afinando prompts o probando nuevos agentes.
- Prefieres un control manual paso a paso sobre automatización total.

## Estructura de `.claude/`

```
.claude/
├── agents/              ← Instrucciones de los 6 subagentes
│   ├── craftsman_lead.md
│   ├── spec_partner.md
│   ├── gherkin_author.md
│   ├── tdd_craftsman.md
│   ├── judge.md
│   └── mutation_tester.md
└── commands/
    └── run.md           ← Slash command `/run` para lanzar CLI Mode
```

## Cómo arrancar

1. Abre Claude Code en el repositorio `gaia-code-harness`.
2. `CLAUDE.md` se carga automáticamente: Claude actúa como `craftsman_lead`.
3. Pide la siguiente tarea pendiente, por ejemplo:

```
Implementa la siguiente feature pendiente
```

4. Claude leerá `AGENTS.md`, `feature_list.json` y `progress/current.md`, ejecutará `./init.sh` y seguirá el pipeline.

## El pipeline del modo `.claude`

```
pending
  → [spec_partner]     conversa y escribe project-spec.md
  → [gherkin_author]   destila features/<name>.feature
  → ⏸ HUMANO APRUEBA los escenarios Gherkin
  → in_progress
  → [tdd_craftsman]    implementa con TDD estricto (o bulk si tddMode=false)
  → [judge]            revisa calidad
  → [mutation_tester]  valida mutación ≥ 80%
  → done
```

La **única puerta de aprobación humana** está después de los escenarios Gherkin. Antes de escribir producción, el humano debe aprobar el `.feature`.

## Los agentes y sus equivalentes en GAIA

| Fase | Agente `.claude` | Equivalente GAIA TypeScript | Artefacto |
|---|---|---|---|
| Spec | `spec_partner` | `SpecAuthorAgent` | `project-spec.md` |
| Gherkin | `gherkin_author` | `SpecAuthorAgent` (2ª LLM call) | `features/<name>.feature` |
| Aprobación | `craftsman_lead` | `--approve` / `POST /jobs/:id/approve` | — |
| Implementación | `tdd_craftsman` | `ImplementerAgent.executeTDD()` | `src/` + `tests/` del workspace |
| Review | `judge` | `ReviewerAgent` | `progress/judge_<name>.md` |
| Mutación | `mutation_tester` | `MutationTesterAgent` | `progress/mutation_<name>.md` |

## Slash command `/run`

Si prefieres que el mismo pipeline corra de forma automática (como CLI Mode) pero sin salir de Claude Code, usa el slash command:

```
/run --job job.json --approve
```

o, para la siguiente feature pendiente:

```
/run
```

Este comando invoca `src/cli/run.ts`, por lo que **usa los mismos agentes TypeScript** de GAIA pero desde el chat. Es la forma de alternar entre control manual y ejecución automática sin cambiar de herramienta.

## Reglas duras del modo `.claude`

- **Una sola feature a la vez.** No mezcles cambios de varias tareas.
- **No declares `done`** sin `judge` aprobado y mutación ≥ 80%.
- **No saltes la aprobación humana** sobre los `.feature`.
- **No edites `src/` ni `tests/` directamente**; delega al agente correspondiente.
- Cada subagente debe **escribir sus resultados en disco** (`project-spec.md`, `.feature`, `progress/*.md`).

## Ejemplo de flujo completo

```
Usuario: Implementa la siguiente feature pendiente
Claude:  La siguiente feature es "Handle SummaryFormSuccess". Arranco con spec_partner...
         → project-spec.md actualizado.
Claude:  Ahora gherkin_author destilará los escenarios...
         → features/handle-summary-form-success.feature creado.
Claude:  Escenarios listos. Léelos y dime "aprobado" para continuar.
Usuario: aprobado
Claude:  [tdd_craftsman] implementando...
Claude:  [judge] revisando...
Claude:  [mutation_tester] corriendo mutación...
Claude:  Feature done. PR: https://github.com/...
```

## Relación con otros documentos

- `CLAUDE.md` — instrucciones que Claude lee al arrancar (entry point del modo `.claude`).
- `AGENTS.md` — mapa completo de archivos, reglas y pipeline.
- `docs/engineering/workflow.md` — pipeline de las 5 fases y mapeo con HTTP/CLI/Webhook.
- `docs/guides/cli-mode-product.md` — guía del CLI Mode para producto.
- `docs/guides/claude-vs-gaia-agents.md` — cuándo usar `.claude/agents` vs GAIA agents.
