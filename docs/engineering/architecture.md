# Arquitectura — GAIA Code Harness

> Documentación técnica interna: máquina de estados, agentes, skills, notifiers y backends.

---

## Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              GAIA PLATFORM                                    │
│  (Donde PMs crean iniciativas y criterios de aceptación)                     │
└─────────────────────────────┬─────────────────────────────────────────────────┘
                              │ POST /jobs
                              │ { acceptanceCriteria, repo, module }
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         API REST (Fastify)                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ POST /jobs  │  │GET /jobs/:id│  │POST /approve│  │ POST /retry         │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────┬─────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LEADER / ORCHESTRATOR                                │
│                                                                              │
│  Máquina de estados:                                                         │
│                                                                              │
│  pending ──► fetching_jira ──► spec_generating ──► spec_ready              │
│                                                          │                   │
│  done ◄── pr_created ◄── reviewing ◄── implementing ◄── spec_approved       │
│                 │                │                │                         │
│           review_error      test_error       repo_error                      │
│           spec_error        build_error      env_error   failed              │
│                                                                              │
│  Todos los estados de error aceptan POST /retry → vuelven a pending          │
└──────────┬─────────────────┬─────────────────┬──────────────────────────────┘
           │                 │                 │
           ▼                 ▼                 ▼
┌──────────────────────────────────────────────────────────────┐
│                   AGENT REGISTRY                             │
│            getAgentsForPlatform(job.platform)                 │
│                                                              │
│  SpecAuthorAgent  ImplementerAgent  ReviewerAgent  MutationTesterAgent │
│  (generic)     execute()/executeTDD() (generic)  (auto, post-review)  │
│            │                  │                  │           │
│            └──────────────────┴──────────────────┘           │
│                        loadSkill(platform)                    │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    PLATFORM SKILLS                           │
│                   src/skills/{platform}/                     │
├──────────────┬──────────────────┬────────────────────────────┤
│  flutter     │      ios         │     android / flutter_web  │
├──────────────┼──────────────────┼────────────────────────────┤
│ flutter test │  swift test      │ gradle test                │
│ dart analyze │  swiftlint       │ lintDebug                  │
│ melos / pub  │  swift pkg res.  │ gradleSync                 │
│ prompt ctx   │  prompt ctx      │ prompt ctx                 │
└──────────────┴──────────────────┴────────────────────────────┘
        │                  │                  │
        ▼                  ▼                  ▼
  Genera spec          Escribe código      Valida + Crea PR
  (JSON files)         (Git commits)       (GitHub API)
        │                  │                  │
        └──────────────────┴──────────────────┘
                           │
                           ▼
              ┌──────────────────────┐
              │   PostgreSQL DB      │
              │   code_generation_jobs│
              └──────────────────────┘
```

---

## Flujo de Datos

### 0. Modo de Orquestación

El harness soporta tres modos; todos usan la misma máquina de estados internamente:

| Modo                      | Entry point                        | State backend        | Casos de uso                      |
| ------------------------- | ---------------------------------- | -------------------- | --------------------------------- |
| **A — HTTP API**          | `npm run dev` → `POST /jobs`       | `PostgresBackend`    | CI/CD, Postman, integraciones     |
| **B — CLI**               | `npx ts-node src/cli/run.ts --job` | `DiskBackend` (JSON) | Desarrollo local, demos, sin DB   |
| **C — Webhook**           | `POST /webhook/trigger`            | `PostgresBackend`    | Jira, Slack, automatización total |
| **Claude Code (agentes)** | `.claude/agents/craftsman_lead`    | Archivos en disco    | Ciclo conversacional SDD          |

`StateBackend` es una interfaz en `src/state/index.ts`; el Leader y las rutas HTTP importan de `state/` — nunca directamente de `db/`.

### 1. Creación de Job

```
Gaia → POST /jobs → API → DB insert → Leader.orchestrateJob()
                                      ↓
                              Async processing begins
```

### 2. Generación de Spec

```
Leader → SpecAuthorAgent.execute()
           ↓
    1. Explora repo structure
    2. Identifica archivos relevantes
    3. Genera TechnicalSpec
           ↓
    DB: status='spec_ready'
    Espera: POST /approve
```

### 3. Aprobación Humana

```
Tech Lead → POST /jobs/:id/approve
              ↓
    DB: status='spec_approved'
    Leader.continue()
              ↓
    ImplementerAgent.execute()
```

### 4. Implementación

```
ImplementerAgent:
  Si job.tddMode=false → execute() [modo normal]
    1. Setup repo → GaiaRepoError si clone falla
    2. skill.verifyEnvironment() → GaiaEnvError si SDK no encontrado
    3. Crea branch → GaiaRepoError si branch creation falla
    4. skill.build() → GaiaBuildError si resolución de dependencias falla
    5. Por cada task (bulk): genera/modifica código con LLM
    6. skill.test() → GaiaTestError si tests fallan (hasta 3 fix loops)
    7. commit & push → GaiaRepoError si push falla

  Si job.tddMode=true → executeTDD() [Red-Green-Refactor]
    1-4. Mismo setup que execute()
    5. Escribe todos los archivos impl (no test) primero
    6. Verifica que impl compila
    7. Por cada test task (uno a la vez):
       RED   → escribe test → confirma que falla
       GREEN → fixAllFiles() con LLM → confirma que pasa
    8. Final fix loop (hasta 3) para cubrir cualquier fallo restante
    9. commit & push

  → success: DB status='reviewing'
  → catch GaiaError: return { success:false, errorCode }
  Leader → ERROR_STATUS[errorCode] → estado granular
```

### 5. Review y Mutation Testing

```
ReviewerAgent:
  1. Lint: dart analyze / swiftlint / lintDebug + ktlintCheck
  2. Tests: flutter test / swift test / gradle testDebugUnitTest
  3. Verifica cambios vs spec
  4. Crea GitHub PR
  5. Comenta en Jira (opcional)
  → DB: status='pr_created'

MutationTesterAgent (automático, post-review):
  Para cada archivo de producción modificado:
    1. Genera 3-5 mutaciones con LLM (flip booleano, remove return, etc.)
    2. Aplica mutación → corre tests → revierte
    3. KILLED = tests fallaron (bueno) / SURVIVED = tests no detectaron (malo)
  Score = killed/total × 100
  ≥ 80% → PASS (warning en logs si < 80%, no bloquea el PR)
  Reporte: progress/mutation_{jobId}.md
  → DB: status='done'
```

---

## Estructura de Datos

### PostgreSQL Schema

```sql
CREATE TABLE code_generation_jobs (
  -- Identificación
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jira_ticket_id TEXT,
  jira_epic_id TEXT,
  initiative_id TEXT NOT NULL,

  -- Requerimientos
  title TEXT NOT NULL,
  platform TEXT NOT NULL,  -- flutter | flutter_web | ios | android
  repo TEXT NOT NULL,
  module TEXT,             -- ej: pay_multiplatform_home_web
  target_branch TEXT NOT NULL DEFAULT 'develop',

  -- Contexto
  description TEXT,
  acceptance_criteria JSONB NOT NULL DEFAULT '[]',
  figma_url TEXT,
  technical_constraints JSONB DEFAULT '[]',

  -- Límites y modos
  max_files_to_touch INTEGER DEFAULT 5,
  require_tests BOOLEAN DEFAULT true,
  tdd_mode BOOLEAN DEFAULT false,   -- Red-Green-Refactor cycle when true

  -- Estado
  status TEXT NOT NULL DEFAULT 'pending',
  current_agent TEXT,
  progress_logs JSONB NOT NULL DEFAULT '[]',

  -- Outputs
  spec JSONB,              -- TechnicalSpec generado
  branch_name TEXT,
  pr_url TEXT,
  pr_id TEXT,

  -- Error handling
  error_context JSONB,     -- ErrorContext cuando el job entra en estado de error

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_jobs_status ON code_generation_jobs(status);
CREATE INDEX idx_jobs_initiative ON code_generation_jobs(initiative_id);
```

### ErrorContext (columna `error_context` JSONB)

Cuando un job falla, el Leader persiste un objeto estructurado con toda la información de diagnóstico:

```json
{
  "code": "BUILD_ERROR",
  "stage": "implementing",
  "message": "[Flutter] `flutter pub get` failed — dependency resolution error in my-repo",
  "detail": "Because dependency_x >=2.0.0 requires sdk >=3.0.0…\n… (truncated at 1500 chars)",
  "timestamp": "2026-06-16T19:00:00.000Z",
  "retryCount": 1
}
```

| Campo        | Tipo        | Descripción                                                    |
| ------------ | ----------- | -------------------------------------------------------------- |
| `code`       | `ErrorCode` | Categoría machine-readable (`ENV_ERROR`, `REPO_ERROR`, etc.)   |
| `stage`      | `JobStatus` | Estado en el que falló el job                                  |
| `message`    | `string`    | Resumen legible con plataforma y comando fallido               |
| `detail`     | `string?`   | stderr recortado (máx 1 500 chars) vía `trim()` en `errors.ts` |
| `timestamp`  | `string`    | ISO 8601                                                       |
| `retryCount` | `number`    | Reintentos automáticos antes de entrar en estado de error      |

---

## Error Handling

### Estados de error granulares

En lugar de un estado genérico `failed`, el Leader transiciona a estados específicos según el tipo de error reportado por el agente:

| Estado         | `ErrorCode`    | Causa                                                     | Retry automático |
| -------------- | -------------- | --------------------------------------------------------- | ---------------- |
| `env_error`    | `ENV_ERROR`    | SDK no instalado (Flutter, Xcode, JDK/Android SDK)        | No               |
| `repo_error`   | `REPO_ERROR`   | Clone, branch creation o push fallaron                    | No               |
| `build_error`  | `BUILD_ERROR`  | `pub get` / `gradle sync` / `swift package resolve` falló | No               |
| `test_error`   | `TEST_ERROR`   | Tests o lint fallaron tras implementación                 | Sí (hasta 3×)    |
| `review_error` | `REVIEW_ERROR` | Validación del reviewer falló (file count, spec ausente)  | Sí (hasta 2×)    |
| `spec_error`   | `SPEC_ERROR`   | LLM no pudo generar un spec válido                        | No               |
| `failed`       | `UNKNOWN`      | Error inesperado                                          | Sí (hasta 3×)    |

### Flujo de errores

```
Skill lanza GaiaError (subclase tipificada)
  ↓
Agente.execute() — catch block
  return { success: false, error: err.message, errorCode: err.code }
  ↓
Leader.handleImplementing() / handleReviewing()
  1. Lee result.errorCode
  2. ERROR_STATUS[errorCode] → JobStatus granular
  3. setErrorContext(jobId, ctx)  ← persiste en DB
  4. Si retryable && retryCount < max → reintenta automáticamente
  5. Si no → updateJobStatus(jobId, errorStatus)
  6. printErrorBox(job, ctx)  ← box de error en terminal
```

### Clases de error (`src/errors.ts`)

| Clase             | `ErrorCode`    | Lanzada desde                                   |
| ----------------- | -------------- | ----------------------------------------------- |
| `GaiaEnvError`    | `ENV_ERROR`    | `skill.verifyEnvironment()`                     |
| `GaiaRepoError`   | `REPO_ERROR`   | `setupRepository()`, `createBranch()`, `push()` |
| `GaiaBuildError`  | `BUILD_ERROR`  | `skill.build()`                                 |
| `GaiaTestError`   | `TEST_ERROR`   | `skill.test()`, `skill.analyze()`               |
| `GaiaReviewError` | `REVIEW_ERROR` | File count guard, traceability check            |
| `GaiaSpecError`   | `SPEC_ERROR`   | `SpecAuthorAgent` (LLM failures)                |

Todas heredan de `GaiaError` que expone `code: ErrorCode`, `message`, y `detail?`.

### Terminal error box

Cuando un job entra en estado de error, se imprime:

```
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║ ✖  GAIA — JOB FAILED                                            ║
║ 16/06/2026, 19:00:00                                            ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║ ERROR DETAILS                                                    ║
║  ────────────────────────────────────────────────────────────  ║
║ 📦  BUILD ERROR  — Dependency resolution failed                  ║
║ Stage:   implementing                                           ║
║ Message: [Flutter] `flutter pub get` failed — my-repo           ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║ JOB                                                              ║
║ ID:       3f2a1b4c-...                                          ║
║ Platform: flutter                                               ║
║ Repo:     my-repo                                               ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║ NEXT STEP                                                        ║
║ Fix pubspec.yaml / build.gradle / Package.swift,                ║
║ then POST /jobs/:id/retry                                        ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## Agentes y Skills

### Arquitectura Genérica + Skills

Todos los jobs comparten **tres agentes genéricos**. La lógica específica de plataforma vive en `src/skills/{platform}/`. Los agentes cargan el skill correcto en runtime con `loadSkill(job.platform)`:

```
src/
├── agents/
│   ├── spec-author.ts      ← único para todas las plataformas
│   ├── implementer.ts      ← execute() + executeTDD()
│   ├── reviewer.ts         ← único para todas las plataformas
│   ├── mutation-tester.ts  ← corre automáticamente post-review
│   └── registry.ts         ← PlatformAgents: specAuthor, implementer, reviewer, mutationTester
├── state/
│   ├── index.ts            ← StateBackend interface + setStateBackend()/getStateBackend()
│   ├── postgres-backend.ts ← Adapter (HTTP mode)
│   └── disk-backend.ts     ← Adapter (Claude Code mode)
├── cli/
│   └── run.ts              ← CLI entry point: --list, --job, --id
└── skills/
    ├── flutter/index.ts    ← PlatformSkill impl
    ├── flutter_web/index.ts
    ├── ios/index.ts
    └── android/index.ts
```

**Flujo de ejecución:**

```typescript
const agents = getAgentsForPlatform(job.platform);
// agents = { specAuthor, implementer, reviewer, mutationTester }

await agents.specAuthor.execute(context);
// internamente: const skill = await loadSkill(job.platform)
//               const ctx = skill.getPromptContext(job)

// Normal mode:
await agents.implementer.execute(context);
// TDD mode (job.tddMode === true):
await agents.implementer.executeTDD(context);
// Leader elige automáticamente según job.tddMode

// MutationTester corre siempre después del reviewer:
await agents.mutationTester.execute(context);
// score ≥ 80% → PASS | < 80% → warn (non-blocking)
```

**Para agregar una plataforma nueva:**

1. Crear `src/skills/{nueva_plataforma}/index.ts` implementando `PlatformSkill`
2. Añadir el `case` en `loadSkill()` dentro de `src/skills/index.ts`
3. Los tres agentes genéricos lo usan automáticamente — sin tocar agentes

---

### PlatformSkill Interface

Define el contrato que cada skill debe cumplir (`src/skills/index.ts`):

| Método                        | Responsabilidad                                              |
| ----------------------------- | ------------------------------------------------------------ |
| `verifyEnvironment(repoPath)` | Verifica toolchain disponible                                |
| `build(repoPath, module?)`    | Resuelve dependencias (pub get, gradle sync, spm resolve…)   |
| `test(repoPath, module?)`     | Corre el test suite completo                                 |
| `analyze(repoPath)`           | Lint / análisis estático                                     |
| `getPromptContext(job)`       | Devuelve system prompts + file patterns + forbidden packages |

---

### SpecAuthorAgent (genérico)

**Proceso:**

1. `loadSkill(platform)` → obtiene `promptCtx`
2. Setup repo via `setupRepository`
3. Explora estructura del repo
4. Identifica archivos relevantes
5. Llama LLM con `promptCtx.specSystem` + criterios de aceptación
6. Guarda `TechnicalSpec` en disco (requirements.json, design.json, tasks.json)

### ImplementerAgent (genérico)

**`execute()` — modo normal:**

1. `loadSkill(platform)` → `verifyEnvironment`, `build`, `getPromptContext`
2. Setup repo + crea branch
3. `skill.build()` → resuelve deps
4. Por cada task: genera/modifica código con LLM (bulk)
5. `skill.test()` → hasta 3 fix loops con LLM si falla
6. Commit & push

**`executeTDD()` — modo Red-Green-Refactor:**

1–3. Igual que `execute()` 4. Escribe todos los archivos impl (no test) para establecer el baseline 5. Por cada test task, en orden:

- **RED**: escribe test → confirma que falla por razón correcta
- **GREEN**: `fixAllFiles()` con LLM → confirma que pasa

6. Final fix loop (hasta 3) para cubrir cualquier fallo restante
7. Commit & push

### MutationTesterAgent (automático)

**Proceso:**

1. Recopila archivos de producción modificados en el job (excluye tests)
2. Por cada archivo: pide al LLM 3-5 mutaciones simples
3. Aplica cada mutación → `skill.test()` → revierte
4. `KILLED` = tests fallaron (bueno); `SURVIVED` = tests pasaron con código roto (malo)
5. Score ≥ 80% → PASS; < 80% → warn en logs (no bloquea)
6. Escribe `progress/mutation_{jobId}.md`

### ReviewerAgent (genérico)

**Proceso:**

1. `loadSkill(platform)` → `verifyEnvironment`, `analyze`, `test`
2. `skill.analyze()` → lint (non-blocking, solo warnings)
3. `skill.test()` → tests deben pasar (blocking)
4. Verifica `modifiedFiles ≤ maxFilesToTouch`
5. Traceability: spec debe existir
6. Crea GitHub PR con body generado por `generatePRBody()`
7. Comenta en Jira (opcional)

**Dry-run mode:** Si `GITHUB_TOKEN` no está configurado, retorna un PR mock.

---

### Toolchains por plataforma

| Platform      | build                                 | test                        | analyze                              | Tool file          |
| ------------- | ------------------------------------- | --------------------------- | ------------------------------------ | ------------------ |
| `flutter`     | `flutter pub get` / `melos bootstrap` | `flutter test`              | `dart analyze`                       | `test-runner.ts`   |
| `flutter_web` | `flutter pub get`                     | `flutter test`              | `dart analyze` + forbidden pkg check | `test-runner.ts`   |
| `ios`         | `swift package resolve`               | `swift test`                | `swiftlint`                          | `xcode-runner.ts`  |
| `android`     | `gradlew dependencies`                | `gradlew testDebugUnitTest` | `lintDebug`                          | `gradle-runner.ts` |

---

## Plugin System

### ¿Cómo funciona?

```
Repo del proyecto
└── docs/
    ├── gaia.json          ← Manifest
    └── agents/
        ├── flutter-spec-author.ts
        ├── flutter-implementer.ts
        └── flutter-reviewer.ts
```

### Orden de búsqueda

1. **Platform-specific:** `docs/agents/{platform}-{agentType}.ts`
2. **Generic:** `docs/agents/{agentType}.ts`
3. **Manifest-specified:** `gaia.json → agents.{agentType}`
4. **Default:** Usar agente del harness

### Archivos que lee el harness en el repo del proyecto

| Archivo                                 | Requerido | Para qué                                                              |
| --------------------------------------- | --------- | --------------------------------------------------------------------- |
| `docs/gaia.json`                        | No        | Manifest: nombre, versión, agentes custom, config                     |
| `docs/RULES.md`                         | No        | Reglas de código/tests en texto libre — se inyectan como contexto LLM |
| `docs/UNIT_TESTS.md`                    | No        | Reglas de testing específicas — se inyectan como contexto LLM         |
| `docs/agents/{platform}-{agentType}.ts` | No        | Agente custom por plataforma                                          |

### Ejemplo gaia.json completo

```json
{
  "name": "mi-proyecto-flutter",
  "platform": "flutter",
  "version": "1.0.0",
  "agents": {
    "specAuthor": "flutter-spec-author.ts",
    "implementer": "flutter-implementer.ts",
    "reviewer": "flutter-reviewer.ts"
  },
  "config": {
    "maxFilesToTouch": 10,
    "requireTests": true,
    "targetBranch": "develop",
    "architecture": "clean",
    "patterns": {
      "widget": "lib/src/presentation/widgets/{Name}.dart",
      "repository": "lib/src/data/repositories/{Name}Repository.dart",
      "test": "test/{name}_test.dart"
    },
    "naming": {
      "widget": "PascalCase",
      "test": "snake_case_test"
    },
    "codeRules": [
      "Usar BLoC para state management",
      "No lógica de negocio en widgets"
    ],
    "testRules": [
      "Cada widget tiene golden test",
      "Mocks con mocktail, no mockito"
    ],
    "forbidden": ["lib/src/core/di/injection.dart", "pubspec.yaml"]
  }
}
```

> Si existe `docs/RULES.md`, los campos `codeRules`, `testRules` y `forbidden` de `gaia.json` se omiten para evitar duplicación. `RULES.md` tiene prioridad.

---

## Seguridad y Control

### Human-in-the-Loop

| Checkpoint    | Quién     | Qué decide                    |
| ------------- | --------- | ----------------------------- |
| Spec approval | Tech Lead | ¿El spec técnico es correcto? |
| PR review     | Dev Team  | ¿El código cumple estándares? |

### Límites Automáticos

- `maxFilesToTouch`: Previene cambios masivos no revisables
- `requireTests`: Fuerza tests para cada feature
- `tddMode`: Activa Red-Green-Refactor (un test a la vez)
- Lint obligatorio: dart analyze (Flutter) / swiftlint (iOS) / lintDebug (Android)
- Tests obligatorios: flutter test / swift test / gradle test
- **Mutation Tester**: valida automáticamente que los tests detecten defectos reales (≥80% kill rate)

### Auditoría

Todo se guarda en DB:

- Cada cambio de estado
- Cada log de progreso
- Spec generado
- Archivos modificados
- PR creado

---

## Escalabilidad

### Vertical (más recursos)

- PostgreSQL puede escalar verticalmente
- Leader procesa un job a la vez (por diseño)
- Cada job es independiente

### Horizontal (más instancias)

- Múltiples instancias del API server
- Load balancer distribuye requests
- Todos leen/escriben a la misma DB

### Async Processing

- Leader corre async después de POST /jobs
- Response inmediata al cliente
- Polling para status updates

---

## Configuración

### Variables de Entorno Críticas

```bash
# Server
PORT=3000

# Database
DATABASE_URL=postgresql://...

# GitHub (para crear PRs)
GITHUB_TOKEN=ghp_...
GITHUB_OWNER=mi-org

# Jira (opcional)
JIRA_BASE_URL=https://tu-org.atlassian.net
JIRA_EMAIL=...
JIRA_API_TOKEN=...

# LLM (para generación real de código)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Workspace
REPOS_BASE_PATH=/tmp/gaia-workspace
```

---

## Deployment

### Local Development

```bash
npm install
npm run db:init
npm run dev
```

### Production (Docker)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### AWS ECS + RDS

- Tarea ECS con variable `DATABASE_URL` apuntando a RDS PostgreSQL
- Secrets en AWS Secrets Manager, no en variables de entorno planas
- Ver `docs/guides/production.md` para el checklist completo

---

## Métricas

| Métrica           | Valor Actual   | Target       |
| ----------------- | -------------- | ------------ |
| Jobs/hour         | 10 (estimado)  | 50+          |
| Success rate      | 80% (estimado) | 95%+         |
| Avg time          | 5 min          | 2 min        |
| Human checkpoints | 2              | 2 (mantener) |

---

## Decisiones de Diseño

### ¿Por qué PostgreSQL y no SQLite?

- Persistencia real entre reinicios
- Concurrencia mejor manejada
- Escalabilidad horizontal
- Backups estándar

### ¿Por qué Fastify y no Express?

- Mejor performance
- Async/await nativo
- Schema validation integrado
- Menos overhead

### ¿Por qué state machine explícita?

- Debugging más fácil
- Recuperación de errores clara
- Visibilidad del proceso
- Testing más simple

### ¿Por qué human-in-the-loop?

- Calidad > Velocidad
- Responsabilidad humana
- Reduce riesgo de errores
- Cumplimiento de procesos

---

**Documentación relacionada:**

- [`API.md`](../API.md) — Referencia completa de endpoints REST + Webhook
- [`docs/guides/setup.md`](../guides/setup.md) — Instalación y configuración por plataforma
- [`docs/guides/production.md`](../guides/production.md) — Checklist pre-producción
