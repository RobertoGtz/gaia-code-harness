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
3. **Timeout melos bootstrap**: Se aumentó de 5 a 10 minutos (`src/tools/test-runner.ts`) para monorepos RPP grandes con dependencias git.

### Segunda prueba end-to-end en `rpp-cashflow-multiplatform-pyme` (feature bre_b)

- Job creado: `c7a94f76-c492-4972-9812-7f2f466302e8` — `Handle SummaryFormSuccess and SummaryFormError states in Bre-B presummary form`.
- Primera corrida falló con `BUILD_ERROR` porque `melos bootstrap` superó el timeout de 5 min al descargar dependencias git.
- Tras aumentar timeout a 10 min y reintentar con `--retry`, el CLI pasó a implementación y generó código/tests.
- Los tests fallaron por errores del LLM:
  - Import inexistente `presummary_form_module.dart` en `presummary_form_screen.dart`.
  - Uso incorrecto de `FluroRouter()` como constructor.
- El job terminó en `TEST_ERROR` y no reintentó automáticamente (comportamiento esperado en Modo B).
- Conclusión: el CLI sigue funcionando end-to-end; los fallos son de precisión del `SpecAuthorAgent`/`ImplementerAgent` al interpretar la estructura del repo RPP.

### Test count

- `CHECKPOINTS.md` actualizado a 264 tests en 21 suites.

### Plugin `flutter_web` actualizado para RPP cashflow

- Se añadió `rpp-cashflow-multiplatform-pyme` al comentario de soporte.
- Se corrigió `breb` → `bre_b` en `KNOWN_FEATURE_PACKAGES` y se añadieron `common`, `create_payment`, `link_pse`, `register_account`.
- Se amplió el prompt context (`getPromptContext`) con:
  - Arquitectura dual `lib/<feature>.dart` (web) vs `lib/<feature>_core.dart` (VM/tests/controllers).
  - Distinción `presentation/flow/` (Screen + Controller concreto) vs `presentation/modules/` (Module widget + Controller abstracto + Notifier).
  - Patrón de provider tokens + overrides para inyección de dependencias.
  - Convenciones de tests `MockRef`, `mocktail`, y no importar web deps en tests VM.
  - Referencias concretas del feature `bre_b` para `rpp-cashflow-multiplatform-pyme`.
- Se parametrizó `baseHref` por repo (`/banking-accounts/pyme/cashflow/` para cashflow).
- Se actualizaron y ampliaron tests en `tests/flutter-web-skill.test.ts`.

### Fix: SpecAuthorAgent no leía código existente

- Problema: `SpecAuthorAgent.generateSpec()` solo recibía paths de archivos, no contenido. Para `bre_b` generó tareas sobre `presummary_form_screen.dart` y `presummary_form_controller.dart` en vez de `presummary_form_module.dart`, porque no sabía dónde estaban los `TODO`.
- Solución:
  - Nueva función `getRelevantSourceContext()` en `src/tools/file.ts` que lee el contenido de `lib/src/` (excluye generated files, prioriza controllers/modules/notifiers/models, limita a 100k chars).
  - `SpecAuthorAgent` ahora carga y pasa `sourceContext` al prompt.
  - Instrucciones críticas añadidas al user prompt: usar el código existente, no modificar flow/router salvo que sea necesario, atender `TODO`/`UnimplementedError`, preferir modificar antes que crear.
  - `specSystem` de `flutter_web` reforzado con las mismas instrucciones.
- Tests: 3 nuevos tests en `tests/file.test.ts` para `getRelevantSourceContext`.
- Test count actualizado a 267.

### Validación end-to-end con `bre_b` (job `6a3fdd9c-1c31-4333-af9b-c1031a72a487`)

- El `SpecAuthorAgent` ahora carga **60,798 chars** de contexto fuente y generó un spec correcto:
  - 4 tareas, **todas** apuntan a `packages/features/bre_b/lib/src/presentation/modules/presummary_form/presummary_form_module.dart`.
  - Ya no propone modificar screen/controller/router innecesariamente.
- `RULES.md` y `UNIT_TESTS.md` del repo cashflow se cargaron correctamente.
- `ImplementerAgent` completó las 4 tareas y los tests pasaron.
- `ReviewerAgent` detectó falta de cobertura de tests (retry + primary action + estados existentes); `ImplementerAgent` reintentó agregarlos.
- El job falló finalmente por permisos de push: `Failed to push branch 'feature/...' to 'rpp-co/rpp-cashflow-multiplatform-pyme'. Check push permissions and GITHUB_TOKEN scope.`
- Root cause adicional: `commitAndPush` duplicaba el token en la URL (`https://token@token@github.com/...`) porque el regex inyectaba sobre URLs que ya tenían credenciales.
- Fix en `src/tools/git.ts`: usar `new URL()` para normalizar SSH→HTTPS, eliminar credenciales previas e inyectar el token exactamente una vez.
- Tests añadidos: no duplicar token, usar `GITHUB_TOKEN_RPP` para `rpp-co`, normalizar SSH.
- Test count actualizado a 270.
- Re-ejecución del job `bre_b` (nuevo job `14625297-16f6-4a4c-8769-07bd30e8bf94`) confirmó que:
  - El push ahora funciona; la branch remota `feature/14625297-handle-summaryformsuccess-and-summaryfor` fue creada en `rpp-co/rpp-cashflow-multiplatform-pyme`.
  - Los cambios se trajeron al repo local en Desktop y están visibles en `packages/features/bre_b/lib/src/presentation/modules/presummary_form/presummary_form_module.dart`.
  - `ReviewerAgent` sigue pidiendo tests para retry/navigation, lo cual es un problema de prompt/cobertura separado.

### Refinamiento de controller tests para `bre_b` (docs/gaia-conventions)

- Se añadió un esqueleto de controller test en `packages/features/bre_b/test/src/presentation/flow/presummary_form/presummary_form_controller_test.dart` con mocks locales, imports correctos y tests para `loadPresummary`, `retryLoadingPresummary` y `navigateToSummary`.
- Se actualizó `presummary_form_module_controller.dart` para declarar `retryLoadingPresummary()` abstracto y `presummary_form_controller.dart` para implementarlo importando `presummary_form_module_provider.dart`.
- Se actualizó `UNIT_TESTS.md` con ejemplo concreto del controller test `bre_b`.
- Se reforzó el prompt de `flutter_web` (`src/plugins/flutter_web/index.ts`):
  - Uso de mocks locales cuando no existe `test/src/mocks/mocks.dart`.
  - Import obligatorio de `hooks_riverpod` y `pay_multiplatform_common` en controller tests.
  - Patrón `MockAppManager` sin getter recursivo.
  - Prohibir `handleSuccess`/`handleError` y métodos similares en controllers.
  - Prohibir stubs/asserts sobre estado del notifier en controller tests.
  - Conservar imports/mocks existentes cuando el archivo de test ya existe.
  - Los controllers de flujo concretos manejan navegación con `fluro`; el controller abstracto de módulo solo declara métodos abstractos.
- Se mejoró `ImplementerAgent` (`src/agents/implementer.ts`) para que los tasks de test sobre archivos existentes usen `modifyCode` en lugar de `generateCode`, preservando imports/mocks.
- Se mejoró `ReviewerAgent` (`src/agents/reviewer.ts`):
  - Guía para no marcar como faltantes tests de estados cuando existen tests de métodos de acción.
  - El contexto de review para archivos `_test.dart` muestra el final del archivo (hasta 12k chars) para que se vean los casos de prueba reales.
- Resultado: la implementación del job `5c4daa32-f41b-4c5d-9725-f38b99730704` pasó tests y se empujó a `feature/5c4daa32-handle-summaryformsuccess-and-summaryfor`. El `ReviewerAgent` entró en loop pidiendo tests que sí existen; con el fix de contexto de review se espera que la siguiente corrida apruebe.
- Bloqueador temporal: OpenAI API retornó `429 You exceeded your current quota` al generar el spec del siguiente job (`cd6bd82a-1fe9-4c15-8e0e-b77d8bb188cb`). Se resolvió.
- Nueva corrida `28ee8542-9e7e-44c4-ae71-7b8020c41a71` completada exitosamente:
  - Spec generado correctamente (5 tasks, todas apuntan al module widget o controller test).
  - Implementación pasó tests.
  - `ReviewerAgent` aprobó con 85/100.
  - PR creado: https://github.com/rpp-co/rpp-cashflow-multiplatform-pyme/pull/15
  - Mutation testing skipped (no source files to mutate según el agente).
- Limpieza del PR #15: se eliminaron del commit `a36c66d` los cambios no deseados en `pubspec_overrides.yaml` de varios packages y los archivos de build/fonts/assets. Se reescribió la branch `feature/28ee8542-handle-summaryformsuccess-and-summaryfor` con un commit limpio (`b0bc558`) que solo toca el module widget y el controller test.
- Prevención futura:
  - Se añadió a `docs/RULES.md` sección "Archivos y carpetas que NO se deben tocar" (pubspec_overrides.yaml, pubspec.yaml, build/, assets/, fonts/, etc.).
  - Se añadió regla equivalente en `flutter_web/index.ts` para que el skill lo recuerde.
