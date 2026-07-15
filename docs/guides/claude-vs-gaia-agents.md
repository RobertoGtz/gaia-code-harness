# ¿Cuándo usar GAIA agents vs `.claude/agents`?

> Guía rápida para decidir si usar el pipeline automatizado de GAIA (TypeScript) o los agentes manuales de Claude Code (`.claude/agents/`).

---

## TL;DR

No son excluyentes. **GAIA agents** (`src/agents/` + `src/harness/leader.ts`) son mejores para trabajo repetible, automático y trazable. **`.claude/agents/`** son mejores para exploración, especificaciones ambiguas y control humano paso a paso.

La forma más práctica de combinarlos es el slash command `/run` (`.claude/commands/run.md`), que lanza el pipeline de GAIA desde Claude Code.

---

## Comparación directa

| Criterio | **GAIA agents (TypeScript)** | **`.claude/agents/` (prompts)** |
|---|---|---|
| **Orquestación** | Automática vía `src/harness/leader.ts` | Manual; el humano actúa como `craftsman_lead` |
| **Backend de estado** | `DiskBackend` / `PostgresBackend` | Ninguno estructurado; solo `feature_list.json` + markdown |
| **Persistencia** | El job sobrevive a reinicios y caídas | El estado vive en el chat y en archivos sueltos |
| **Aprobación humana** | `--approve` puede saltar la puerta | Siempre se respeta la pausa después de Gherkin |
| **Retry / loop cerrado** | Automático: `ReviewerAgent` → `ImplementerAgent` | Manual; el humano relanza agentes |
| **Repetibilidad** | Alta: mismo `job.json` → mismo resultado | Baja; depende del hilo conversacional |
| **Control de calidad** | Mutation testing integrado, score ≥ 80% | Depende de que el humano lo pida |
| **Ambigüedad** | Necesita un spec claro para no fallar | Excelente para explorar y pivotear |
| **Costo y velocidad** | Más barato y rápido en CI / batch | Más lento por ciclos de chat |
| **Observabilidad** | Logs, estados y archivos de progreso estructurados | Chat disperso |
| **Testeabilidad** | Se puede unit-testear (`tests/*.test.ts`) | Solo validación empírica |
| **Mantenimiento** | Código tipado, refactor fácil | Editar markdowns y probar a mano |
| **LLM context control** | Prompts de sistema + `handoff.md` | Conversacional; riesgo de “teléfono descompuesto” |

---

## Mapeo de agentes

Ambos mundos usan **los mismos roles**, solo que uno los ejecuta como clases TypeScript y el otro como instrucciones de prompt:

| Fase | `.claude/agents/` | GAIA TypeScript | Artefacto |
|---|---|---|---|
| Spec | `spec_partner` | `SpecAuthorAgent` | `project-spec.md` / `TechnicalSpec` |
| Gherkin | `gherkin_author` | `SpecAuthorAgent` (2ª LLM call) | `features/<name>.feature` |
| Aprobación | `craftsman_lead` | `--approve` / `POST /jobs/:id/approve` | — |
| Implementación | `tdd_craftsman` | `ImplementerAgent.executeTDD()` | `src/` + `tests/` del workspace |
| Review | `judge` | `ReviewerAgent` | `progress/judge_<name>.md` |
| Mutación | `mutation_tester` | `MutationTesterAgent` | `progress/mutation_<name>.md` |

---

## ¿Cuándo usar GAIA?

- La spec ya está clara o se puede obtener de Jira/GitHub.
- Quieres correr muchos jobs sin supervisar cada paso.
- Necesitas CI/CD o integración con webhooks.
- Quieres retry automático, trazabilidad y mutation testing obligatorio.
- El cambio es repetible y de tamaño controlado (`maxFilesToTouch`).

## ¿Cuándo usar `.claude/agents/`?

- La feature es ambigua y requiere conversación para entenderla.
- Quieres decidir manualmente cuándo aprobar los escenarios Gherkin.
- Estás depurando GAIA, afinando prompts o probando nuevos agentes.
- Prefieres un control artesanal sobre automatización.

---

## Recomendación: combinarlos

La configuración ideal es híbrida:

1. **Explora y define** con `.claude/agents/` (`spec_partner` + `gherkin_author`) cuando la feature es confusa.
2. **Automatiza** con GAIA agents una vez que el contrato Gherkin está firme.
3. **LanGAIA desde Claude Code** con el slash command `/run` (`.claude/commands/run.md`) para no tener que cambiar de ventana.

Así aprovechas lo mejor de los dos mundos: la conversación para entender el problema y la máquina de estados para ejecutarlo sin errores.

---

## Cómo probar cada modo

### GAIA CLI (agentes TypeScript)

```bash
npx ts-node src/cli/run.ts --job job.json --approve
```

### Claude Code manual (prompts)

```
@craftsman_lead, implementa la siguiente feature pendiente
```

### Desde Claude Code usando GAIA agents

```
/run --job job.json --approve
```
