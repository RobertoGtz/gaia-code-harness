# Sesión actual

## Feature en curso

Aplicación de insights del artículo de Anthropic "Harness design for long-running application development": cerrar el loop de feedback entre evaluador e implementador, introducir handoff artifacts entre agentes, y hacer al Reviewer más escéptico con few-shot examples.

## Estado

- `init.sh`: verde
- `npm test`: 242/242 tests pasan, 19 suites
- `npx tsc --noEmit`: sin errores
- Git working tree: limpio (commit f621a2b pushed)

## Notas de sesión

### Revisión de consistencia previa (commit 647088b)

- Se identificaron y corrigieron referencias obsoletas a `src/skills/` → `src/plugins/` en `project-spec.md`, `CHECKPOINTS.md`, `src/agents/registry.ts` y comentarios de tests.
- Se actualizó el conteo de tests en `CHECKPOINTS.md` (120/12 → 242/19) aunque el archivo aún podría necesitar ajuste si el número cambia.
- Se actualizó `.gitignore` para ignorar `progress/.state/` y logs individuales de jobs.
- Se limpiaron archivos temporales no trackeados.
- Se creó `docs/guides/cli-demo-script.md` y se actualizó `scripts/present.sh` con slide de CLI deep-dive.

### Cambios implementados (commit f621a2b)

1. **Handoff artifacts** (`BaseAgent`, `SpecAuthorAgent`, `ImplementerAgent`, `ReviewerAgent`, `MutationTesterAgent`)
   - Cada agente lee `handoff.md` del agente anterior y escribe uno nuevo al terminar.
   - Resumen: estado actual, archivos tocados, próximo paso.
   - Escritura best-effort para no fallar en entornos de test.

2. **Prompt tuning del Reviewer** (`ReviewerAgent.runLLMReview`)
   - Nuevo paso LLM con few-shot examples de buenas y malas reviews.
   - Devuelve score 0-100 y lista de issues concretas.
   - Si `passed === false`, retorna `REVIEW_ERROR` con el feedback.

3. **Closed-loop review** (`Leader`)
   - Si `ReviewerAgent` devuelve `REVIEW_ERROR` o `TEST_ERROR`, se guarda `reviewFeedback` en el job y se re-ejecuta `ImplementerAgent` (hasta 2 retries).
   - Si `MutationTesterAgent` devuelve `TEST_ERROR` por mutaciones sobrevivientes, se hace lo mismo.
   - `ImplementerAgent` inyecta `job.reviewFeedback` en el system prompt.

4. **Persistencia**
   - Añadido `reviewFeedback` a `CodeGenerationJob` y columna `review_feedback` en Postgres.

### Tests

- `tests/reviewer.test.ts`: casos de LLM review pasando/fallando.
- `tests/handoff.test.ts`: lectura/escritura de `handoff.md`.
- Todos los tests existentes siguen verdes.

### Próximos pasos sugeridos

- Validar el closed-loop del Leader con un test de integración real (mockear agentes + `orchestrateJob`).
- Evaluar si se prefiere que `ReviewerAgent` no cree el PR hasta que `MutationTesterAgent` pase, para evitar PRs duplicados en el loop de mutación.

### Revisión de documentación

- Se actualizó `README.md` con diagrama de flujo que incluye handoffs y closed-loop feedback.
- Se actualizó `docs/engineering/architecture.md`: diagrama de estados con loops, procesos de agentes con handoffs/LLM review, schema SQL con `review_feedback`, tabla de retries con closed-loop.
- Se actualizó `docs/engineering/workflow.md`: artefactos `handoff.md`/`review_report.md`, fase de LLM review, explicación de closed-loop.
- Se actualizó `docs/engineering/mutation-testing.md`: closed-loop en Modos A/C; Modo B manual.
- Se actualizó `docs/guides/quick-start.md`, `docs/guides/gaia-http-flow.md`, `docs/guides/demo.md` con LLM review, mutation testing post-PR y closed-loop.
- Se actualizó `API.md` estados (`reviewing`, `pr_created`) y eventos (`job.pr_created`).
- Se actualizó `CHECKPOINTS.md` conteo de tests a 242/19.
- Se actualizó `AGENTS.md` y `.claude/agents/mutation_tester.md` para reflejar closed-loop en HTTP/Webhook.
- No se editaron bitácoras históricas en `progress/history.md` ni `progress/judge_*.md`/`progress/mutation_*.md` (append-only).
