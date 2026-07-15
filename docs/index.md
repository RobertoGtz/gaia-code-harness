# Mapa de documentación — GAIA Code Harness

> Lee esto si no sabes por dónde empezar.

---

## Quiero usarlo ahora mismo

| Objetivo                                  | Documento                                                |
| ----------------------------------------- | -------------------------------------------------------- |
| Entender qué hace el sistema en 2 minutos | [`README.md`](../README.md)                              |
| Setup + primer job paso a paso            | [`docs/guides/quick-start.md`](../guides/quick-start.md) |
| Demo con comandos listos para copiar      | [`docs/guides/demo.md`](../guides/demo.md)               |
| Demo automático en 1 comando              | `./scripts/demo.sh flutter`                              |

---

## Documentación por tema

### Uso y referencia

| Documento                                                          | Descripción                                   | Audiencia              |
| ------------------------------------------------------------------ | --------------------------------------------- | ---------------------- |
| [`docs/guides/quick-start.md`](../guides/quick-start.md)           | Guía completa de los 3 modos con ejemplos     | Cualquier persona      |
| [`docs/guides/demo.md`](../guides/demo.md)                         | Demo paso a paso, comandos listos para copiar | PM / Tech Lead         |
| [`API.md`](../API.md)                                              | Referencia completa REST + Webhook            | Dev / CI               |
| [`docs/guides/setup.md`](../guides/setup.md)                       | Instalación detallada por plataforma          | Dev                    |
| [`docs/guides/testing.md`](../guides/testing.md)                   | Cómo correr tests localmente                  | Dev                    |
| [`docs/guides/cli-mode-product.md`](../guides/cli-mode-product.md) | Cómo funciona el CLI Mode (para producto)     | PM / Cualquier persona |
| [`docs/guides/production.md`](../guides/production.md)             | Checklist antes de ir a producción            | DevOps / Tech Lead     |

### Arquitectura e ingeniería

| Documento                                                                    | Descripción                                                |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [`docs/engineering/architecture.md`](../engineering/architecture.md)         | Arquitectura interna, máquina de estados, agentes, plugins |
| [`docs/engineering/workflow.md`](../engineering/workflow.md)                 | Pipeline completo: las 5 fases del ciclo de vida           |
| [`docs/engineering/tdd.md`](../engineering/tdd.md)                           | Las Tres Leyes del TDD + ciclo Rojo-Verde-Refactor         |
| [`docs/engineering/gherkin.md`](../engineering/gherkin.md)                   | Formato Gherkin, reglas, ejemplos de ACs                   |
| [`docs/engineering/mutation-testing.md`](../engineering/mutation-testing.md) | Cómo funciona mutate.py, umbrales, plataformas             |

### Para agentes IA (Claude Code mode)

| Documento                                   | Descripción                             |
| ------------------------------------------- | --------------------------------------- |
| [`AGENTS.md`](../AGENTS.md)                 | Mapa de navegación — leer primero       |
| [`CLAUDE.md`](../CLAUDE.md)                 | Entry point para craftsman_lead         |
| [`CHECKPOINTS.md`](../CHECKPOINTS.md)       | Criterios objetivos de "done" (C1–C7)   |
| [`feature_list.json`](../feature_list.json) | Backlog de features con estados         |
| [`.claude/agents/`](../.claude/agents/)     | Definiciones de los 6 subagentes Claude |

---

## Estructura del repositorio

```
gaia-code-harness/
├── README.md          ← Punto de entrada (conciso)
├── API.md             ← Referencia REST completa
├── AGENTS.md          ← Mapa para agentes IA
├── CLAUDE.md          ← Entry point Claude Code
├── CHECKPOINTS.md     ← Criterios de done
├── .env.example       ← Variables de entorno documentadas
│
├── docs/
│   ├── INDEX.md       ← Este archivo
│   ├── guides/        ← Documentación para USAR el sistema
│   │   ├── quick-start.md   ← Los 3 modos paso a paso
│   │   ├── demo.md          ← Demo con comandos listos
│   │   ├── setup.md              ← Instalación detallada
│   │   ├── testing.md            ← Testing local
│   │   ├── cli-mode-product.md   ← Cómo funciona el CLI Mode (para producto)
│   │   └── production.md         ← Checklist pre-producción
│   ├── engineering/   ← Disciplina de ingeniería (devs + agentes IA)
│   │   ├── architecture.md  ← Arquitectura interna
│   │   ├── workflow.md      ← Pipeline + mapeo 3 modos
│   │   ├── tdd.md           ← Las Tres Leyes + ciclo R-V-R
│   │   ├── gherkin.md       ← Formato Gherkin, reglas
│   │   └── mutation-testing.md ← mutate.py, umbrales
│   └── archive/       ← Documentos históricos (ignorar)
│
├── scripts/
│   ├── demo.sh        ← Demo automático multi-modo
│   └── present.sh     ← Script de presentación
│
├── src/
│   ├── agents/        ← SpecAuthor, Implementer, Reviewer, MutationTester
│   ├── plugins/       ← flutter/, ios/, android/, flutter_web/ (con repo-local override)
│   ├── harness/       ← leader.ts (máquina de estados)
│   ├── api/routes/    ← jobs.ts + webhook.ts
│   ├── notifiers/     ← Slack, GitHub Checks, Generic, Jira
│   ├── state/         ← PostgresBackend + DiskBackend
│   ├── tools/         ← git.ts, jira.ts, llm.ts, test runners
│   └── cli/run.ts     ← CLI entry point (Modo B)
│
├── tests/             ← Unit tests
├── tools/mutate.py    ← Mutation tester Python
└── .claude/agents/    ← Subagentes Claude Code
```

---

## Variables de entorno clave

| Variable                               | Requerida      | Para qué                                                    |
| -------------------------------------- | -------------- | ----------------------------------------------------------- |
| `OPENAI_API_KEY` o `ANTHROPIC_API_KEY` | ✅             | Generación de código                                        |
| `GITHUB_TOKEN`                         | ✅             | Crear PRs reales                                            |
| `GITHUB_OWNER`                         | ✅             | Org o usuario de GitHub                                     |
| `DATABASE_URL`                         | ✅ Modos A y C | Conexión PostgreSQL                                         |
| `JIRA_BASE_URL`                        | Si usas Jira   | Subdominio exacto del tenant (ej. `tu-org.atlassian.net`)   |
| `JIRA_EMAIL`                           | Si usas Jira   | Email de la cuenta Jira                                     |
| `JIRA_API_TOKEN`                       | Si usas Jira   | Token API de Jira                                           |
| `DEFAULT_PLATFORM`                     | Opcional       | Plataforma si el ticket no tiene label (default: `flutter`) |
| `DEFAULT_REPO`                         | Opcional       | Repo si el ticket no tiene label `repo:...`                 |
| `SLACK_WEBHOOK_URL`                    | Opcional       | Notificaciones Slack                                        |

Ver todos los valores en [`.env.example`](../.env.example).

---

## Links útiles

- **GitHub Token:** https://github.com/settings/tokens (scope: `repo`)
- **Jira API Token:** https://id.atlassian.com/manage-profile/security/api-tokens
- **OpenAI API Key:** https://platform.openai.com/api-keys
