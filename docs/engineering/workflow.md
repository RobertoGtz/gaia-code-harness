# Pipeline y flujo de trabajo — GAIA Code Harness

> Pipeline completo del harness: fases, agentes, artefactos y mapeo entre los tres modos de operación.

---

## Los tres modos y su pipeline

| Modo             | Cómo arranca                 | Backend    | Aprobación de spec         | `tddMode` soportado |
| ---------------- | ---------------------------- | ---------- | -------------------------- | ------------------- |
| **A — HTTP API** | `POST /jobs`                 | PostgreSQL | `POST /jobs/:id/approve`   | ✅ sí               |
| **B — CLI**      | `npx ts-node src/cli/run.ts` | Disk JSON  | `--approve` flag (o pausa) | ✅ sí               |
| **C — Webhook**  | `POST /webhook/trigger`      | PostgreSQL | Automática (sin pausa)     | ✅ sí               |

Los tres modos comparten el mismo `leader.ts` (máquina de estados) y los mismos agentes.  
La diferencia es en cómo entra el job, dónde persiste el estado y si la aprobación del spec es manual o automática.

---

## El pipeline de un vistazo

> El diagrama describe el flujo completo. La columna "Agente" muestra el agente Claude Code;
> la columna "Equivalente TypeScript" muestra el módulo que ejecuta lo mismo en los Modos A, B y C.

| Fase                | Agente (Claude Code)           | Equivalente TypeScript          | Artefacto                     |
| ------------------- | ------------------------------ | ------------------------------- | ----------------------------- |
| Spec                | `spec_partner`                 | `SpecAuthorAgent`               | `project-spec.md`             |
| Gherkin             | `gherkin_author`               | _(parte de SpecAuthorAgent)_    | `features/<name>.feature`     |
| ⏸ **PUERTA HUMANA** | `craftsman_lead` para          | `POST /jobs/:id/approve`        | —                             |
| Implementación      | `tdd_craftsman` (si `tddMode`) | `ImplementerAgent.executeTDD()` | `src/` + `tests/`             |
| _(bulk)_            | _(bulk implementer)_           | `ImplementerAgent.execute()`    | `src/` + `tests/`             |
| Review              | `judge`                        | `ReviewerAgent`                 | `progress/judge_<name>.md`    |
| Mutación            | `mutation_tester`              | `MutationTesterAgent`           | `progress/mutation_<name>.md` |

Una sola feature a la vez. Una sola puerta de aprobación humana: sobre los
escenarios Gherkin, **antes** de escribir producción.

---

## Por qué este orden

### 1. La spec nace de una conversación, no de un dictado

El humano no entrega un documento cerrado. Debate con el `spec_partner`:
casos límite, contratos de salida, alternativas descartadas. El resultado,
`project-spec.md`, es el acuerdo razonado — incluidas las **decisiones** y
su porqué.

### 2. Gherkin convierte la prosa en un contrato ejecutable

Cada comportamiento se vuelve un `Scenario` con `Given/When/Then` verificable.
Esto es lo que el humano firma. A partir de aquí, la ambigüedad es un bug
del contrato, no del código. Ver `docs/engineering/gherkin.md`.

### 3. La puerta humana va sobre el contrato, no sobre el código

Aprobar tarde (cuando ya hay código) es caro. Aprobar el `.feature` es
barato y es el punto de máximo apalancamiento: un escenario mal definido
arrastra todo el TDD. El `craftsman_lead` **para** aquí y espera.

### 4. TDD estricto: un test a la vez

No se escriben todos los tests por adelantado. Se vive el ciclo pequeño:
un test rojo → el mínimo verde → refactor en verde. Las Tres Leyes en
`docs/engineering/tdd.md`. El código que ningún test pidió no existe.

### 5. El review es el juego entero

> "Agents draft, judgment prunes."

Generar borradores es barato. El valor escaso es el **juicio** que decide
qué sobrevive. El `judge` no edita: poda. Si un escenario no tiene test, o
hay código que nadie pidió, rechaza.

### 6. La validación es compute-bound

> "Raw computer power is the limiting factor." / "Mutation testing is
> resource-heavy, but the ROI on code correctness is worth every cycle."

Una suite verde solo dice que el código no explota. La prueba de mutación
introduce defectos y exige que algún test falle. Es cara en CPU pero es la
medida real de si la red atrapa peces. Ver `docs/engineering/mutation-testing.md`.

---

## Mapa de artefactos

| Archivo                       | Lo escribe                         | Contiene                                            |
| ----------------------------- | ---------------------------------- | --------------------------------------------------- |
| `project-spec.md`             | `spec_partner`                     | Spec conversada: propósito, contrato, decisiones    |
| `features/<name>.feature`     | `gherkin_author`                   | Escenarios Gherkin `@s1..@sn` (el contrato firmado) |
| `src/` (workspace job)        | `tdd_craftsman`                    | Código tallado por TDD                              |
| `progress/tdd_<name>.md`      | `tdd_craftsman`                    | Bitácora de ciclos + mapa `@s → test`               |
| `progress/judge_<name>.md`    | `judge`                            | Veredicto + checkpoints                             |
| `progress/mutation_<name>.md` | `mutation_tester`                  | Score + mutantes sobrevivientes                     |
| `feature_list.json`           | `craftsman_lead` / `tdd_craftsman` | `pending → spec_ready → in_progress → done`         |

**Regla anti-teléfono-descompuesto:** los subagentes escriben en disco y
devuelven una línea de referencia. El contenido no circula por chat.
