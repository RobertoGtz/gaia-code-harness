---
name: run_gaia
description: Ejecuta un job de GAIA en modo CLI desde Claude Code. Usa los mismos agentes que src/cli/run.ts.
tools: Read, Bash, Agent
---

# `/run_gaia` — Ejecuta GAIA en modo CLI desde Claude Code

Este comando hace que `.claude` se comporte como el **CLI Mode**: toma una ficha de trabajo, corre el pipeline completo y entrega un PR. Usa los **mismos agentes** (los TypeScript de `src/agents/`, equivalentes a los de `.claude/agents/` según `docs/engineering/workflow.md`).

## Pasos

1. Lee `AGENTS.md` y `docs/engineering/workflow.md` para orientarte.
2. Ejecuta `./init.sh`. Si falla, **detente** y reporta.
3. Determina el trabajo:
   - Si el usuario te dio un path a un `job.json`, úsalo.
   - Si no, lee `feature_list.json`, elige la primera feature con `"sdd": true` y `status` distinto de `done`/`blocked`, y genera un `job.json` temporal con los campos requeridos.
4. Pregunta al humano si quiere ejecutar con `--approve` (auto-aprobar) o pausar después del spec, como el CLI normal.
5. Corre el comando equivalente:
   - `npm run gaia -- <job.json> --approve`
   - o sin `--approve` si el humano quiere revisar el spec primero.
6. Si el job se detuvo en `spec_ready`, espera la aprobación humana y luego corre:
   - `npm run gaia -- --id <job-id> --approve`
7. Reporta el resultado final, el URL del PR y el próximo paso.
8. Actualiza `progress/current.md` si aplica.
9. Al finalizar, entregá un bloque listo para copiar y pegar en la terminal (handoff):

   ```text
   # Listar jobs recientes
   cd ~/Desktop/gaia-code-harness && npm run gaia -- --list

   # Reanudar/reintentar el mismo job desde la terminal
   cd ~/Desktop/gaia-code-harness && npm run gaia -- --id <JOB_ID> --retry

   # Inspeccionar el repo generado
   cd /tmp/gaia-workspace/<JOB_ID>/repo && git log --oneline -3 && git show --stat HEAD

   # Si por alguna razón la rama no se empujó, hacelo manualmente
   cd /tmp/gaia-workspace/<JOB_ID>/repo && git push -u origin <branch>
   ```

## Reglas importantes

- Una sola feature a la vez.
- No edites `src/` ni `tests/` del harness; el CLI se encarga de eso.
- Si hay `--approve`, la puerta humana sobre los `.feature` se salta; sin `--approve`, la respetas.
- `feature_list.json` debe actualizarse si la feature termina (`status: done`).
