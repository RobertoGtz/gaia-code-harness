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
- Se actualizó `scripts/present.sh` con slide de CLI deep-dive.

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
- Se actualizó `CHECKPOINTS.md` conteo de tests a 254/20.
- Se actualizó `AGENTS.md` y `.claude/agents/mutation_tester.md` para reflejar closed-loop en HTTP/Webhook.
- No se editaron bitácoras históricas en `progress/history.md` ni `progress/judge_*.md`/`progress/mutation_*.md` (append-only).

### Revisión del Modo B (CLI)

- `src/cli/run.ts` refactorizado para ser testeable: `main()` ahora acepta `argv` y un `backend` opcional; `approveAndResume()` recibe backend explícito; solo se auto-ejecuta cuando `require.main === module`.
- Se verificó que `DiskBackend` persiste `reviewFeedback` vía `updateJobStatus(..., { reviewFeedback })`, lo que permite closed-loop retries en Modo B.
- Se añadieron tests en `tests/cli.test.ts`: parseo de args, auto-aprobar `spec_ready`, crear job desde JSON inline/archivo, resumir con `--id`, reintentar `--id --retry`, listar jobs, y mensaje de uso sin args.
- Se añadió test en `tests/disk-backend.test.ts` para verificar persistencia de `reviewFeedback`.
- Se probó manualmente `npx ts-node src/cli/run.ts --list` y funciona correctamente.
- Se añadió flag `--retry` al CLI: `npx ts-node src/cli/run.ts --id <jobId> --retry` transiciona `review_error`/`test_error`/`failed` → `implementing` y re-ejecuta `orchestrateJob` con el `reviewFeedback` persistido.
- Se actualizó `docs/guides/quick-start.md` y `docs/engineering/mutation-testing.md` con el nuevo flag `--retry`.

### Prueba end-to-end del Modo B (CLI) en `rpp-account-basics-multiplatform-pyme`

- Job creado: `0f001bc8-cb44-4b9b-ad71-c71594ea94ce` — `Add pull-to-refresh support to PymeWallMovementsListNotifier`.
- Se añadió soporte para ejecutar `scripts/setup.sh` desde `src/plugins/flutter/index.ts` antes de resolver dependencias.
- Se añadió migración automática de dependencias Bitbucket → GitHub (`rpp-co`) usando `GITHUB_TOKEN_RPP` y `GITHUB_OWNER_RPP` en `runRepoSetupScript`.
- El CLI logró: crear job, generar spec, auto-aprobar, clonar repo, ejecutar `setup.sh`, resolver dependencias, generar código y tests.
- Los tests fallaron por errores de implementación del LLM (rutas de import, nombres de clases) y por un error transversal de `dart:js_in...` en `pay_multiplatform_common_web` al correr `flutter test`.
- El job entró en loop de reintentos del `ImplementerAgent`; se detuvo manualmente para evitar consumo innecesario.
- Conclusión: el CLI (Modo B) funciona end-to-end. Los fallos restantes son de calidad de generación de código, no del CLI.

### Correcciones posteriores

1. **Loop infinito en CLI**: Se añadió `requestSource` (`api` | `cli` | `webhook`) a `CodeGenerationJob` y a los creadores de jobs. En `leader.ts`, los errores `test_error`/`review_error`/`failed` solo se reintentan automáticamente si `requestSource !== 'cli'`, evitando loops en Modo B.
2. **Tests generados inconsistentes**: En `ImplementerAgent.execute()` (bulk) ahora se ejecutan primero los tasks de implementación (`create`/`modify`) y luego los de test, pasando el contenido real de los archivos fuente como `sourceContext` para que el LLM genere imports y APIs correctos. Se mantiene el orden original vía `dependsOn`.

### Test count

- `CHECKPOINTS.md` actualizado a 262 tests en 21 suites.
