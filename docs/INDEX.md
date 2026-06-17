# Índice de Documentación - Gaia Code Harness

> Documentación completa del proyecto Gaia Code Harness  
> Tres modos de operación: **HTTP + Postgres**, **Claude Code CLI**, **CI / Webhook**

---

## 📚 Documentación Principal

| #   | Documento                                        | Descripción                           | Cuándo usar          |
| --- | ------------------------------------------------ | ------------------------------------- | -------------------- |
| 1   | [README.md](../README.md)                        | Overview, instalación, quick start    | **Primero**          |
| 2   | [AGENTS.md](../AGENTS.md)                        | Mapa de navegación para agentes IA    | Antes de usar Claude |
| 3   | [CLAUDE.md](../CLAUDE.md)                        | Entry point para Claude Code mode     | Claude Code          |
| 4   | [CHECKPOINTS.md](../CHECKPOINTS.md)              | Criterios objetivos C1–C7 de "done"   | Auto-evaluación      |
| 5   | [API.md](../API.md)                              | REST API + Webhook trigger reference  | Desarrollo / CI      |
| 6   | [SETUP.md](./SETUP.md)                           | Guía de instalación paso a paso       | Setup local          |
| 7   | [TESTING.md](./TESTING.md)                       | Cómo probar el proyecto local         | Testing local        |
| 8   | [ARCHITECTURE.md](./ARCHITECTURE.md)             | Arquitectura profunda, diagramas      | Entender internos    |
| 9   | [DEMO_GUIDE.md](./DEMO_GUIDE.md)                 | Demo paso a paso (HTTP + Claude + CI) | Presentaciones       |
| 10  | [GUION_PRESENTACION.md](./GUION_PRESENTACION.md) | Guion para presentar al equipo        | Presentación         |

### Disciplina de ingeniería

| Documento                                         | Descripción                          |
| ------------------------------------------------- | ------------------------------------ |
| [docs/workflow.md](./workflow.md)                 | Pipeline completo con anotaciones    |
| [docs/tdd.md](./tdd.md)                           | Las Tres Leyes del TDD + ciclo R-V-R |
| [docs/gherkin.md](./gherkin.md)                   | Formato Gherkin, reglas, ejemplos    |
| [docs/mutation-testing.md](./mutation-testing.md) | mutate.py, umbrales, plataformas     |

---

## 🎬 Scripts

| Script                              | Descripción                       | Uso                                       |
| ----------------------------------- | --------------------------------- | ----------------------------------------- |
| [demo.sh](../scripts/demo.sh)       | Demo interactivo multi-plataforma | `./scripts/demo.sh flutter\|ios\|android` |
| [present.sh](../scripts/present.sh) | Presentación con slides           | `./scripts/present.sh`                    |

---

## 📂 Estructura de Código

```
src/
├── index.ts                    # Punto de entrada (carga dotenv)
├── types/
│   └── index.ts               # Tipos TypeScript (documentados)
├── db/
│   └── index.ts               # PostgreSQL CRUD
├── api/
│   ├── server.ts              # Fastify server (registra jobs + webhook routes)
│   └── routes/
│       ├── jobs.ts            # 6 endpoints REST (POST /jobs, GET, approve, retry…)
│       └── webhook.ts         # POST /webhook/trigger — Jira / Slack / genérico
├── notifiers/
│   ├── base.ts                # JobNotifier interface + NullNotifier
│   ├── slack.ts               # Slack Block Kit por estado
│   ├── github-checks.ts       # GitHub Checks API (in_progress → completed)
│   ├── generic.ts             # HTTP POST con firma HMAC-SHA256 opcional
│   ├── jira.ts                # Jira: comentarios + transiciones de estado por evento
│   └── index.ts               # buildNotifier() factory (lee env vars)
├── agents/
│   ├── base.ts                # Clase base abstracta
│   ├── spec-author.ts         # SpecAuthorAgent genérico
│   ├── implementer.ts         # ImplementerAgent (bulk + executeTDD)
│   ├── reviewer.ts            # ReviewerAgent
│   ├── mutation-tester.ts     # MutationTesterAgent (mutate.py + LLM fallback)
│   └── registry.ts            # getAgentsForPlatform()
├── skills/
│   ├── index.ts               # PlatformSkill interface + loadSkill(platform)
│   ├── flutter/index.ts       # Flutter mobile
│   ├── flutter_web/index.ts   # Flutter Web
│   ├── ios/index.ts           # iOS/Swift
│   └── android/index.ts       # Android/Kotlin
├── harness/
│   ├── leader.ts              # Máquina de estados (10 estados, emite notifier events)
│   └── plugin-loader.ts       # Sistema de plugins
├── cli/
│   └── run.ts                 # CLI entry point (DiskBackend, sin Postgres)
└── tools/
    ├── file.ts                # File system ops
    ├── git.ts                 # Git + GitHub API
    ├── repo.ts                # Setup repositorios
    ├── test-runner.ts         # Flutter test runner
    ├── xcode-runner.ts        # Swift/Xcode runner
    └── gradle-runner.ts       # Gradle runner

tools/
└── mutate.py                  # Mutador determinístico Python/TS/Swift/Kotlin

.claude/agents/
├── craftsman_lead.md          # Orquestador Claude Code
├── spec_partner.md            # Conversación de spec
├── gherkin_author.md          # Destilación Gherkin
├── tdd_craftsman.md           # Ciclo Red-Green-Refactor
├── judge.md                   # Reviewer bloqueante
└── mutation_tester.md         # Mutation tester
```

---

## 📦 Configuración

| Archivo                           | Descripción              |
| --------------------------------- | ------------------------ |
| [package.json](../package.json)   | Dependencias y scripts   |
| [tsconfig.json](../tsconfig.json) | TypeScript config        |
| [.env.example](../.env.example)   | Variables de entorno (9) |

---

## 🎯 Ejemplos

| Ejemplo                                                                                         | Descripción                  |
| ----------------------------------------------------------------------------------------------- | ---------------------------- |
| [examples/.gaia/gaia.json](../examples/.gaia/gaia.json)                                         | Manifest de plugin           |
| [examples/.gaia/agents/flutter-spec-author.ts](../examples/.gaia/agents/flutter-spec-author.ts) | Agente Flutter personalizado |

---

## 🚀 Quick Start

```bash
# 1. Setup
createdb gaia_harness
cp .env.example .env
# Editar .env

# 2. Instalar y compilar
npm install
npm run db:init
npm run build

# 3. Correr
npm run dev

# 4. Verificar
curl http://localhost:3000/health

# 5. Demo (elegir plataforma)
./scripts/demo.sh flutter    # o ios, android
```

---

## 📊 Estadísticas del Proyecto

- **Líneas de código:** ~3,500 TypeScript + ~300 Python
- **Archivos fuente:** ~28
- **Documentos:** 15+
- **Endpoints REST:** 7 (+ `POST /webhook/trigger`)
- **Estados de job:** 10
- **Agentes TS:** 4 (spec-author, implementer, reviewer, mutation-tester)
- **Agentes Claude:** 6 (craftsman_lead, spec_partner, gherkin_author, tdd_craftsman, judge, mutation_tester)
- **Notifiers:** 3 (Slack, GitHub Checks, Generic) + NullNotifier
- **Skills:** 4 (flutter, flutter_web, ios, android)
- **Modos de operación:** 3 (HTTP + Postgres, Claude Code CLI, CI / Webhook)

---

## 🔗 Links Externos

- **Harness Engineering**: https://www.youtube.com/watch?v=q9Vaoz0hd0U
- **Spec-Driven Development**: https://www.youtube.com/watch?v=ElGlTv2A_bM
- **GitHub Token**: https://github.com/settings/tokens
- **Jira API Token**: https://id.atlassian.com/manage-profile/security/api-tokens

---

**Ticket:** RPCO-37575  
**Estado:** Listo para presentación al equipo
