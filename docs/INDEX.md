# Mapa de documentación — GAIA Code Harness

> Lee esto si no sabes por dónde empezar.

---

## Quiero usarlo ahora mismo

| Objetivo                                  | Documento                                         |
| ----------------------------------------- | ------------------------------------------------- |
| Entender qué hace el sistema en 2 minutos | [`README.md`](../README.md)                       |
| Setup + primer job paso a paso            | [`docs/GUIA_TRES_MODOS.md`](./GUIA_TRES_MODOS.md) |
| Demo con comandos listos para copiar      | [`docs/DEMO_GUIDE.md`](./DEMO_GUIDE.md)           |
| Demo automático en 1 comando              | `./scripts/demo.sh flutter`                       |

---

## Documentación por tema

### Uso y referencia

| Documento                                                   | Descripción                                   | Audiencia          |
| ----------------------------------------------------------- | --------------------------------------------- | ------------------ |
| [`docs/GUIA_TRES_MODOS.md`](./GUIA_TRES_MODOS.md)           | Guía completa de los 3 modos con ejemplos     | Cualquier persona  |
| [`docs/DEMO_GUIDE.md`](./DEMO_GUIDE.md)                     | Demo paso a paso, comandos listos para copiar | PM / Tech Lead     |
| [`API.md`](../API.md)                                       | Referencia completa REST + Webhook            | Dev / CI           |
| [`docs/SETUP.md`](./SETUP.md)                               | Instalación detallada por plataforma          | Dev                |
| [`docs/TESTING.md`](./TESTING.md)                           | Cómo correr tests localmente                  | Dev                |
| [`docs/PRODUCTION_CHECKLIST.md`](./PRODUCTION_CHECKLIST.md) | Checklist antes de ir a producción            | DevOps / Tech Lead |

### Arquitectura e ingeniería

| Documento                                           | Descripción                                               |
| --------------------------------------------------- | --------------------------------------------------------- |
| [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md)         | Arquitectura interna, máquina de estados, agentes, skills |
| [`docs/workflow.md`](./workflow.md)                 | Pipeline completo: las 5 fases del ciclo de vida          |
| [`docs/tdd.md`](./tdd.md)                           | Las Tres Leyes del TDD + ciclo Rojo-Verde-Refactor        |
| [`docs/gherkin.md`](./gherkin.md)                   | Formato Gherkin, reglas, ejemplos de ACs                  |
| [`docs/mutation-testing.md`](./mutation-testing.md) | Cómo funciona mutate.py, umbrales, plataformas            |

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
├── README.md                    ← Punto de entrada (conciso)
├── API.md                       ← Referencia REST completa
├── AGENTS.md                    ← Mapa para agentes IA
├── CLAUDE.md                    ← Entry point Claude Code
├── CHECKPOINTS.md               ← Criterios de done
├── .env.example                 ← Variables de entorno documentadas
│
├── docs/
│   ├── INDEX.md                 ← Este archivo
│   ├── GUIA_TRES_MODOS.md       ← Guía principal de uso
│   ├── DEMO_GUIDE.md            ← Demo paso a paso
│   ├── ARCHITECTURE.md          ← Arquitectura interna
│   ├── SETUP.md                 ← Instalación detallada
│   ├── TESTING.md               ← Testing local
│   ├── PRODUCTION_CHECKLIST.md  ← Checklist producción
│   ├── workflow.md              ← Pipeline completo
│   ├── tdd.md                   ← TDD discipline
│   ├── gherkin.md               ← Gherkin format
│   ├── mutation-testing.md      ← Mutation testing
│   └── archive/                 ← Documentos históricos (no leer)
│
├── scripts/
│   ├── demo.sh                  ← Demo automático multi-modo
│   └── present.sh               ← Script de presentación
│
├── src/
│   ├── agents/                  ← SpecAuthor, Implementer, Reviewer, MutationTester
│   ├── skills/                  ← flutter/, ios/, android/, flutter_web/
│   ├── harness/leader.ts        ← Máquina de estados (orquestador)
│   ├── api/routes/              ← jobs.ts + webhook.ts
│   ├── notifiers/               ← Slack, GitHub Checks, Generic HTTP, Jira
│   ├── state/                   ← PostgresBackend + DiskBackend
│   ├── tools/                   ← git.ts, jira.ts, llm.ts, test runners
│   └── cli/run.ts               ← CLI entry point (Modo B)
│
├── tests/                       ← Unit tests
├── tools/mutate.py              ← Mutation tester Python
└── .claude/agents/              ← Subagentes Claude Code
```

---

## Variables de entorno clave

| Variable                               | Requerida      | Para qué                                                    |
| -------------------------------------- | -------------- | ----------------------------------------------------------- |
| `OPENAI_API_KEY` o `ANTHROPIC_API_KEY` | ✅             | Generación de código                                        |
| `GITHUB_TOKEN`                         | ✅             | Crear PRs reales                                            |
| `GITHUB_OWNER`                         | ✅             | Org o usuario de GitHub                                     |
| `DATABASE_URL`                         | ✅ Modos A y C | Conexión PostgreSQL                                         |
| `JIRA_BASE_URL`                        | Si usas Jira   | Subdominio exacto del tenant (ej. `rappidev.atlassian.net`) |
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
