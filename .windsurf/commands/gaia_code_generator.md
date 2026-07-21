---
description: Ejecuta un job de GAIA en modo CLI desde Windsurf. Usa los mismos agentes que src/cli/run.ts.
---

# `/gaia_code_generator` — Ejecuta GAIA en modo CLI desde Windsurf

Este comando hace que Windsurf se comporte como el **CLI Mode**: toma una ficha de trabajo, corre el pipeline completo y entrega un PR. Usa los **mismos agentes** TypeScript de `src/agents/` (equivalentes a los prompts de `.claude/agents/` según `docs/engineering/workflow.md`).

## Pasos

1. Lee `AGENTS.md` y `docs/engineering/workflow.md` para orientarte.
2. Ejecuta `./init.sh`. Si falla, **detente** y reporta.
3. Determina el trabajo:
   - Si el usuario te dio un path a un `job.json`, úsalo.
   - Si no, lee `feature_list.json`, elige la primera feature con `"sdd": true` y `status` distinto de `done`/`blocked`, y genera un `job.json` temporal con los campos requeridos.
4. Pregunta al humano si quiere ejecutar con `--approve` (auto-aprobar) o pausar después del spec, como el CLI normal.
5. Para generar el spec y detenerte en la puerta humana:
   - Muestra primero el comando con la ruta real en su propio bloque ejecutable:
     ```bash
     npm run gaia -- <RUTA_JOB_JSON_REAL>
     ```
   - Inmediatamente después, ejecuta tú mismo exactamente ese comando (por ejemplo mediante el tool de terminal), en modo bloqueante, y espera su salida.
   - Si detectas que el humano ya lo ejecutó y el job está en `spec_ready`, no lo ejecutes otra vez: recupera el job existente con `--list` y continúa leyendo sus artefactos.
6. Cuando el SpecAuthor termine, obtén de la salida real del CLI:
   - El `JOB_ID`.
   - La ruta absoluta indicada por `Spec saved to ...` o `Gherkin saved to ...`.
   Luego muestra **completos, sin truncar ni resumir**, todos sus artefactos en este orden:
   - `requirements.json`: requisitos derivados y criterios de aceptación.
   - `design.json`: diseño técnico y archivos afectados.
   - `tasks.json`: plan completo de implementación.
   - `scenarios.feature`: todos los escenarios Gherkin, incluyendo `Feature`, `Background`, tags, `Scenario`/`Scenario Outline`, `Examples` y cada paso `Given/When/Then`.
   - `handoff.md`: handoff del SpecAuthor, si existe.
7. Lee los archivos con las **rutas absolutas reales reportadas por el CLI**; no asumas que el workspace está en `/tmp/gaia-workspace`, porque puede estar bajo `/private/tmp/...` u otra raíz configurada. `requirements.json`, `design.json`, `tasks.json` y `scenarios.feature` viven en el directorio reportado por `Spec saved to`. Para localizar `handoff.md`, parte del workspace padre mostrado en la misma salida. Si un archivo no existe, indícalo explícitamente; no lo omitas silenciosamente.
8. Presenta los artefactos con encabezados separados y bloques de código apropiados (`json`, `gherkin` o `markdown`). Los escenarios Gherkin completos deben quedar visibles en el chat **siempre**, incluso cuando se solicitó `--approve` desde el inicio.
9. Si el job se detuvo en `spec_ready`, solo después de mostrar todo lo anterior pide al humano que acepte o rechace explícitamente el spec.
10. En la puerta de aprobación, **siempre** muestra las dos opciones como bloques `bash` independientes, de una sola línea y con el `JOB_ID` real. Antes de los bloques pregunta: "¿Aprobás este spec para continuar con la implementación, o lo rechazás con feedback para regenerarlo? (máximo 5 reintentos)".

    **Aprobar y continuar**

    ```bash
    npm run gaia -- --id <JOB_ID_REAL> --approve
    ```

    **Rechazar con feedback**

    ```bash
    npm run gaia -- --id <JOB_ID_REAL> --reject "<FEEDBACK_REAL_DEL_HUMANO>"
    ```

    No uses un bloque `text`, una lista, código inline, placeholders sin reemplazar ni varios comandos dentro del mismo bloque.
11. Espera la respuesta textual del humano:
    - Si aprueba, ejecuta tú mismo el comando `--approve` en modo bloqueante y continúa automáticamente con la salida completa del CLI durante Implementer, Reviewer, MutationTester y creación del PR.
    - Si rechaza, pide el feedback, ejecuta tú mismo el comando `--reject` con ese feedback en modo bloqueante. El CLI regenerará el spec y volverá a detenerse en `spec_ready`. Lee los nuevos artefactos del spec (pasos 6–8) y vuelve a presentar la puerta de aprobación. Si se alcanzan 5 reintentos, informa al humano y no intentes más rechazos automáticos.
    - Si el humano informa que ya usó el botón/bloque de terminal, verifica el estado con `npm run gaia -- --list` y continúa sin duplicar la ejecución.
12. Todo comando accionable que entregues durante este flujo debe aparecer además en su propio bloque cercado `bash`, con una sola línea ejecutable. No agrupes comandos distintos en un único bloque.
13. Si el humano pidió auto-aprobación desde el inicio, también ejecuta primero `npm run gaia -- <job.json>` **sin** `--approve` para que el CLI se detenga en `spec_ready`. Muestra completos los artefactos según los pasos 6–8 y luego muestra el bloque ejecutable con `npm run gaia -- --id <JOB_ID_REAL> --approve`. Nunca ejecutes el pipeline completo en una sola llamada porque ocultaría los artefactos del SpecAuthor hasta el final.
14. Reporta el resultado final, el URL del PR y el próximo paso.
15. Actualiza `progress/current.md` si aplica.
16. Al finalizar, entrega cada acción del handoff por separado con su propio bloque `bash`:

    **Listar jobs recientes**

    ```bash
    npm run gaia -- --list
    ```

    **Reanudar o reintentar el mismo job**

    ```bash
    npm run gaia -- --id <JOB_ID_REAL> --retry
    ```

    **Inspeccionar el repo generado**

    ```bash
    git -C /tmp/gaia-workspace/<JOB_ID_REAL>/repo log --oneline -3
    ```

    **Empujar manualmente la rama si fuera necesario**

    ```bash
    git -C /tmp/gaia-workspace/<JOB_ID_REAL>/repo push -u origin <BRANCH_REAL>
    ```

## Reglas importantes

- Una sola feature a la vez.
- No edites `src/` ni `tests/` del harness; el CLI se encarga de eso.
- Si hay `--approve`, la puerta humana sobre los `.feature` se salta; sin `--approve`, la respetas.
- `feature_list.json` debe actualizarse si la feature termina (`status: done`).
