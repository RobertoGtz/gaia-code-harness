# CHECKPOINTS — Evaluación del estado final

> En sistemas multi-agente no se evalúa el camino, se evalúa el destino.
> Estos son los checkpoints objetivos que un juez (humano o IA) puede usar
> para decidir si el proyecto está sano.
>
> El agente `judge` recorre C1–C6 y el `mutation_tester` valida C7.
> Se rechaza el cierre de sesión si quedan boxes sin marcar.

---

## C1 — El arnés está completo

- [ ] Existen los archivos base: `AGENTS.md`, `init.sh`, `feature_list.json`, `progress/current.md`.
- [ ] Existen los docs de disciplina: `docs/engineering/tdd.md`, `docs/engineering/gherkin.md`, `docs/engineering/mutation-testing.md`, `docs/engineering/workflow.md`.
- [ ] `./init.sh` termina con exit code 0.
- [ ] `npx tsc --noEmit` termina sin errores.

## C2 — El estado es coherente

- [ ] Como mucho una feature en `in_progress` en `feature_list.json`.
- [ ] Toda feature `done` tiene tests que pasan (`./init.sh` lo verifica).
- [ ] `progress/current.md` está vacío o describe la sesión activa
      (no contiene basura de sesiones anteriores).

## C3 — El código respeta la arquitectura

- [ ] `src/` solo contiene los módulos previstos en `docs/engineering/architecture.md`.
- [ ] Los agentes TypeScript (`src/agents/`) no tienen lógica de plataforma —
      esa vive en `src/plugins/{platform}/`.
- [ ] No hay `console.log` de debug sueltos, ni TODOs sin contexto.
- [ ] Leader (`src/harness/leader.ts`) importa de `state/`, nunca directamente de `db/`.

## C4 — La verificación es real

- [ ] `src/agents/` tiene tests de integración o unit para el agente tocado.
- [ ] Los tests usan fixtures reales, no mocks frágiles de filesystem.
- [ ] `npm test` muestra > 0 tests y todos verdes (actualmente: 238 tests en 18 suites).

## C5 — La sesión se cerró bien

- [ ] No hay archivos sin trackear sospechosos (`.tmp`, `dist/` sin gitignore).
- [ ] `progress/history.md` tiene una entrada por la última sesión completada.
- [ ] La última feature trabajada está en el estado correcto en `feature_list.json`.

## C6 — Contrato Gherkin (features con `"sdd": true`)

- [ ] Toda feature con `"sdd": true` en estado `spec_ready`, `in_progress`
      o `done` tiene su `features/<name>.feature` y una sección en `project-spec.md`.
- [ ] El `.feature` usa Gherkin con escenarios tagueados `@s1`, `@s2`, …
      y cada `Then` afirma algo medible (ver `docs/engineering/gherkin.md`).
- [ ] Cada escenario `@s` está cubierto por al menos un test concreto
      (mapa `@s → test` en `progress/tdd_<name>.md`).
- [ ] No hay código de producción que ningún test rojo haya pedido
      (disciplina TDD, ver `docs/engineering/tdd.md`).

## C7 — Prueba de mutación

- [ ] La feature `done` superó la prueba de mutación con score ≥ 80%:

  | Modo             | Cómo verificar                                                                   |
  | ---------------- | -------------------------------------------------------------------------------- |
  | **A — HTTP API** | `MutationTesterAgent.ts` reportó score ≥ 80% en `progressLogs` (`GET /jobs/:id`) |
  | **B — CLI**      | `python3 tools/mutate.py <archivo> --cmd "<runner>" --threshold 80` exit 0       |
  | **C — Webhook**  | Igual que Modo A (mismo agente, solo warn si < 80%)                              |
  | **Claude Code**  | Agente `mutation_tester` aprobó en `progress/mutation_<name>.md`                 |

- [ ] Cualquier mutante sobreviviente queda documentado en
      `progress/mutation_<name>.md` (matado con un test nuevo, o
      justificado explícitamente como equivalente).

---

## Cómo usar este archivo

**Agentes:** al cerrar una feature, el `judge` marca cada checkbox de C1–C6
y el `mutation_tester` valida C7. Si alguno queda vacío, rechaza y devuelve
el control al `craftsman_lead` con lista de issues.

**Humano:** puedes correr `./init.sh` en cualquier momento para verificar
el estado de entorno (C1, C3, C4).
