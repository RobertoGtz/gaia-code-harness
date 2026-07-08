# Arquitectura — GAIA Code Harness

> Documentación técnica interna: máquina de estados, agentes, skills, notifiers y backends.

---

## Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CLIENTE / CI / JIRA WEBHOOK                          │
│  (Postman, cURL, CI pipeline, o webhook automático)                          │
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
│                  loadSkill(platform, repoPath)               │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    PLATFORM PLUGINS                          │
│                   src/plugins/{platform}/                    │
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
  Generate spec        Write code          Validate + Create PR
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

El punto de entrada varía por modo, pero todos llegan al mismo `orchestrateJob()`:

```
Modo A  POST /jobs              → PostgresBackend.createJob() → orchestrateJob() [async]
Modo B  src/cli/run.ts --job    → DiskBackend.createJob()     → orchestrateJob() [blocking]
Modo C  POST /webhook/trigger   → PostgresBackend.createJob() → orchestrateJob() [async]
```

> Todos los campos opcionales (`figmaUrl`, `jiraEpicId`, `description`, `module`) son
> soportados en los tres modos. El webhook Jira los enriquece automáticamente desde el ticket.

### 2. Generación de Spec

```
Leader → SpecAuthorAgent.execute()
           ↓
    1. Explore repo structure
    2. Identify relevant files
    3. LLM → TechnicalSpec JSON
    4. LLM → scenarios.feature (Gherkin, non-blocking)
           ↓
    DB: status='spec_ready'
    Waits: POST /approve
```

### 3. Aprobación Humana

El mecanismo varía por modo:

```
Modo A  Tech Lead → POST /jobs/:id/approve   [manual, bloqueante hasta llamada]
Modo B  CLI flag --approve                   [automática al arrancar]
Modo C  Automática                           [no hay pausa; webhook dispara el pipeline completo]
```

En los tres casos, al aprobarse el spec:

```
DB/Disco: status='spec_approved'
Leader.continue() → ImplementerAgent.execute()
```

### 4. Implementación

```
ImplementerAgent:
  job.tddMode=false → execute() [bulk mode]
    1. Setup repo → GaiaRepoError if clone fails
    2. skill.verifyEnvironment() → GaiaEnvError if SDK missing
    3. Create branch → GaiaRepoError if branch creation fails
    4. skill.build() → GaiaBuildError if dependency resolution fails
    5. For each task (bulk): generate/modify code with LLM
    6. skill.test() → GaiaTestError if tests fail (up to 3 fix loops)
    7. commit & push → GaiaRepoError if push fails

  job.tddMode=true → executeTDD() [Red-Green-Refactor]
    1-4. Same setup as execute()
    5. Write all impl files (non-test) first
    6. Verify impl compiles
    7. For each test task (one at a time):
       RED   → write test → confirm it fails
       GREEN → fixAllFiles() with LLM → confirm it passes
    8. Final fix loop (up to 3) to cover any remaining failures
    9. commit & push

  → success: DB status='reviewing'
  → catch GaiaError: return { success:false, errorCode }
  Leader → ERROR_STATUS[errorCode] → granular error state
```

### 5. Review y Mutation Testing

```
ReviewerAgent:
  1. Lint: dart analyze / swiftlint / lintDebug + ktlintCheck
  2. Tests: flutter test / swift test / gradle testDebugUnitTest
  3. Verify changes vs spec
  4. Create GitHub PR
  5. Comment on Jira (optional)
  → DB: status='pr_created'

MutationTesterAgent (automatic, post-review):
  For each modified production file:
    1. Generate 3-5 mutations with LLM (flip boolean, remove return, etc.)
    2. Apply mutation → run tests → revert
    3. KILLED = tests failed (good) / SURVIVED = tests missed defect (bad)
  Score = killed/total × 100
  ≥ 80% → PASS (warning in logs if < 80%, does not block PR)
  Report: progress/mutation_{jobId}.md
  → DB: status='done'
```

---

## Estructura de Datos

### PostgreSQL Schema

```sql
CREATE TABLE code_generation_jobs (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jira_ticket_id TEXT,
  jira_epic_id TEXT,
  initiative_id TEXT NOT NULL,

  -- Requirements
  title TEXT NOT NULL,
  platform TEXT NOT NULL,  -- flutter | flutter_web | ios | android
  repo TEXT NOT NULL,
  module TEXT,             -- e.g. home_screen, checkout (optional)
  target_branch TEXT NOT NULL DEFAULT 'develop',

  -- Context
  description TEXT,
  acceptance_criteria JSONB NOT NULL DEFAULT '[]',
  figma_url TEXT,
  technical_constraints JSONB DEFAULT '[]',

  -- Limits and modes
  max_files_to_touch INTEGER DEFAULT 5,
  require_tests BOOLEAN DEFAULT true,
  tdd_mode BOOLEAN DEFAULT false,   -- Red-Green-Refactor cycle when true

  -- Status
  status TEXT NOT NULL DEFAULT 'pending',
  current_agent TEXT,
  progress_logs JSONB NOT NULL DEFAULT '[]',

  -- Outputs
  spec JSONB,              -- generated TechnicalSpec
  branch_name TEXT,
  pr_url TEXT,
  pr_id TEXT,

  -- Error handling
  error_context JSONB,     -- ErrorContext set when the job enters an error state

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_jobs_status ON code_generation_jobs(status);
CREATE INDEX idx_jobs_initiative ON code_generation_jobs(initiative_id);
```

### ErrorContext (columna `error_context` JSONB)

Cuando un job falla, el Leader persiste un objeto estructurado con toda la información de diagnóstico:

```json
{
  "code": "BUILD_ERROR",
  "stage": "implementing",
  "message": "[Flutter] `flutter pub get` failed — dependency resolution error in mi-org/mi-repo",
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
Skill throws GaiaError (typed subclass)
  ↓
Agent.execute() — catch block
  return { success: false, error: err.message, errorCode: err.code }
  ↓
Leader.handleImplementing() / handleReviewing()
  1. Read result.errorCode
  2. ERROR_STATUS[errorCode] → granular JobStatus
  3. setErrorContext(jobId, ctx)  ← persisted in DB
  4. If retryable && retryCount < max → retry automatically
  5. Otherwise → updateJobStatus(jobId, errorStatus)
  6. printErrorBox(job, ctx)  ← error box in terminal
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
║ Message: [Flutter] `flutter pub get` failed — mi-org/mi-repo    ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║ JOB                                                              ║
║ ID:       3f2a1b4c-...                                          ║
║ Platform: flutter                                               ║
║ Repo:     mi-org/mi-repo                                        ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║ NEXT STEP                                                        ║
║ Fix pubspec.yaml / build.gradle / Package.swift,                ║
║ then POST /jobs/:id/retry                                        ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## Agentes y Plugins

### Arquitectura Genérica + Plugins

Todos los jobs comparten **tres agentes genéricos**. La lógica específica de plataforma vive en `src/plugins/{platform}/`. Los agentes cargan el plugin correcto en runtime con `loadSkill(job.platform, repoPath)`:

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
│   ├── postgres-backend.ts ← Adapter — Modes A and C (HTTP/Webhook + Postgres)
│   └── disk-backend.ts     ← Adapter — Mode B (CLI + disk)
├── cli/
│   └── run.ts              ← CLI entry point: --list, --job, --id
└── plugins/
    ├── index.ts            ← loadSkill() con override logic
    ├── flutter/index.ts    ← PlatformSkill built-in
    ├── flutter_web/index.ts
    ├── ios/index.ts
    └── android/index.ts
```

**Flujo de ejecución:**

```typescript
const agents = getAgentsForPlatform(job.platform);
// agents = { specAuthor, implementer, reviewer, mutationTester }

await agents.specAuthor.execute(context);
// internally: const skill = await loadSkill(job.platform)
//             const ctx = skill.getPromptContext(job)

// Normal mode:
await agents.implementer.execute(context);
// TDD mode (job.tddMode === true):
await agents.implementer.executeTDD(context);
// Leader picks automatically based on job.tddMode

// MutationTester always runs after the reviewer:
await agents.mutationTester.execute(context);
// score ≥ 80% → PASS | < 80% → warn (non-blocking)
```

**To add a new platform:**

1. Create `src/plugins/{new_platform}/index.ts` implementing `PlatformSkill`
2. Add the `case` in `loadSkill()` inside `src/plugins/index.ts`
3. All three generic agents use it automatically — no agent changes needed

---

### PlatformSkill Interface

Define el contrato que cada plugin debe cumplir (`src/plugins/index.ts`):

| Método                        | Responsabilidad                                            |
| ----------------------------- | ---------------------------------------------------------- |
| `verifyEnvironment(repoPath)` | Verify toolchain is available                              |
| `build(repoPath, module?)`    | Resolve dependencies (pub get, gradle sync, spm resolve…)  |
| `test(repoPath, module?)`     | Run the full test suite                                    |
| `analyze(repoPath, module?)`  | Lint / static analysis (module-aware for monorepos)        |
| `getPromptContext(job)`       | Return system prompts + file patterns + forbidden packages |

---

### SpecAuthorAgent (generic)

**Process:**

1. `loadSkill(platform, repoPath)` → get `promptCtx` (con override si existe `<repo>/.gaia/plugins/<platform>/index.js`)
2. Setup repo via `setupRepository`
3. Explore repo structure
4. Identify relevant files
5. `createPluginLoader(repoPath)` → lee `docs/RULES.md` + `docs/UNIT_TESTS.md` + `docs/gaia.json` del repo clonado
6. LLM call → `TechnicalSpec` JSON (requirements, design, tasks)
7. LLM call → `scenarios.feature` (Gherkin) — **non-blocking**: si falla se loggea como warning y el pipeline continúa
8. Save to disk: `requirements.json`, `design.json`, `tasks.json`, `scenarios.feature`

### ImplementerAgent (generic)

**`execute()` — bulk mode:**

1. `loadSkill(platform, repoPath)` → `verifyEnvironment`, `build`, `getPromptContext`
2. Setup repo + create branch
3. `skill.build()` → resolve deps
4. Inject into `implementerSystem`: `[gherkinScenarios +] [repoRules +] promptCtx.implementerSystem`
5. For each task: generate/modify code with LLM (bulk)
6. `skill.test()` → up to 3 LLM fix loops if tests fail
7. Commit & push

**`executeTDD()` — Red-Green-Refactor mode (mismo PluginLoader aplicado):**

1–3. Same setup as `execute()`. 4. Write all impl files (non-test) to establish compile baseline. 5. For each test task, in order:

- **RED**: write test → confirm it fails for the right reason
- **GREEN**: `fixAllFiles()` with LLM → confirm it passes

6. Final fix loop (up to 3) to cover any remaining failures
7. Commit & push

### MutationTesterAgent (automatic)

**Process:**

1. Collect modified production files in the job (excludes tests)
2. For each file: ask LLM for 3-5 simple mutations
3. Apply mutation → `skill.test()` → revert
4. `KILLED` = tests failed (good); `SURVIVED` = tests passed with broken code (bad)
5. Score ≥ 80% → PASS; < 80% → warn in logs (does not block)
6. Write `progress/mutation_{jobId}.md`

### ReviewerAgent (generic)

**Process:**

1. `loadSkill(platform, repoPath)` → `verifyEnvironment`, `analyze`, `test`
2. `skill.analyze()` → lint (non-blocking, warnings only)
3. `skill.test()` → tests must pass (blocking)
4. Verify `modifiedFiles ≤ maxFilesToTouch`
5. Traceability: spec must exist
6. Create GitHub PR with body from `generatePRBody()`
7. Comment on Jira (optional)

**Dry-run mode:** If `GITHUB_TOKEN` is not set, returns a mock PR.

---

### Toolchains por plataforma

| Platform      | build                                                                | test                        | analyze                              | Tool file          |
| ------------- | -------------------------------------------------------------------- | --------------------------- | ------------------------------------ | ------------------ |
| `flutter`     | `flutter pub get` / `melos bootstrap`                                | `flutter test`              | `dart analyze`                       | `test-runner.ts`   |
| `flutter_web` | `flutter pub get`                                                    | `flutter test`              | `dart analyze` + forbidden pkg check | `test-runner.ts`   |
| `ios`         | `swift package resolve` (default), `tuist build`, `xcodebuild build` | `xcodebuild test`           | `swiftlint` (module-aware)           | `xcode-runner.ts`  |
| `android`     | `gradlew dependencies`                                               | `gradlew testDebugUnitTest` | `lintDebug`                          | `gradle-runner.ts` |

---

### Plugin iOS (`src/plugins/ios/index.ts`)

El skill de iOS está calibrado para un monorepo de gran escala basado en **Tuist + Swift Package Manager** (por ejemplo, el repositorio de Rappi iOS). Sus responsabilidades:

1. **Detectar el tipo de proyecto**
   - Si el directorio raíz contiene `.xcodeproj`, `.xcworkspace`, `Tuist.swift` o `Workspace.swift`, asume un monorepo Tuist.
   - Si solo existe `Package.swift`, cae a un proyecto SPM plano.

2. **Build strategy (`buildStrategy` en el job: `resolve` | `xcodebuild` | `tuist` | `auto`)**
   - `resolve` (default recomendado para grandes monorepos Tuist): solo ejecuta `swift package resolve`. Rápido, no compila el módulo; deja la validación de compilación para CI.
   - `tuist`: ejecuta `tuist build [scheme]` (con `tuist generate` previo si es necesario). Elige esta opción cuando quieras validación local completa y el repo soporte simulador.
   - `xcodebuild`: ejecuta `xcodebuild build` con el scheme `module` (o `App`).
   - `auto` (default): intenta `tuist build`, luego `xcodebuild build`, y finalmente cae a `swift package resolve` si todo falla.
   - `xcode-runner.ts` descubre el flag correcto (`-workspace` raíz si existe, luego `-project` del módulo) y elige un simulador iOS disponible con `xcrun simctl list devices`.

3. **Test**
   - `skill.test(repoPath, module)` ejecuta `xcodebuild test` con el mismo descubrimiento de workspace/proyecto y scheme.
   - Para SPM plano usa `swift build` como proxy de prueba (no hay un commando de test cross-plataforma sin Xcode).

4. **Analyze (lint)**
   - `skill.analyze(repoPath, module)` ejecuta `swiftlint lint`.
   - Si `module` se provee y existe un `.swiftlint.yml` dentro de la carpeta del módulo (`features/{Module}/{Module}Feature/.swiftlint.yml`), el linter corre desde ese directorio para aplicar la configuración local del módulo. Si no, lintea desde raíz.

5. **Prompt context (`getPromptContext`)**
   - Incluye reglas arquitectónicas específicas del monorepo: MVVM + Coordinator, VIPER, SwiftUI Feature, `Feature`/ `FeatureInterface` modules, `@Inject` + `MainComponent.resolve`, Design System, y prohibiciones (no force unwrap, no UIKit en lógica de negocio, etc.).
   - Los placeholders de paths usan la convención `{Module}Feature/Sources/...` y `{Module}FeatureInterface/Sources/...`.

El runner de Xcode está testeado en `tests/xcode-runner.test.ts` y el plugin en `tests/ios-skill.test.ts`, ambos con mocks de `child_process` y `fs/promises`.

---

## Plugin System

### ¿Cómo funciona?

Cada agente llama a `loadSkill(platform, repoPath)` **después** de clonar el repo. La función sigue esta precedencia:

```
1. <repo>/.gaia/plugins/<platform>/index.js   ← override completo del skill (build, test, analyze, prompts)
2. src/plugins/<platform>                      ← built-in del harness (fallback)
```

Además, si el repo contiene archivos en `docs/`, el `PluginLoader` los inyecta como contexto adicional en los prompts LLM:

```
3. <repo>/docs/RULES.md        ← reglas de código en markdown libre
4. <repo>/docs/UNIT_TESTS.md   ← convenciones de tests
5. <repo>/docs/gaia.json       ← config estructurada (patrones, naming, reglas)
```

### Estructura en el repo del proyecto

```
mi-repo/
├── .gaia/
│   └── plugins/
│       └── ios/
│           └── index.js     ← override completo (opcional)
└── docs/
    ├── gaia.json            ← manifest + config (opcional)
    ├── RULES.md             ← reglas de código (opcional)
    └── UNIT_TESTS.md        ← convenciones de tests (opcional)
```

### Archivos que lee el harness en el repo del proyecto

| Archivo                             | Requerido | Para qué                                                              |
| ----------------------------------- | --------- | --------------------------------------------------------------------- |
| `.gaia/plugins/<platform>/index.js` | No        | Override completo del skill: build, test, analyze, getPromptContext   |
| `docs/gaia.json`                    | No        | Manifest: nombre, versión, config (patrones, naming, codeRules...)    |
| `docs/RULES.md`                     | No        | Reglas de código/tests en texto libre — se inyectan como contexto LLM |
| `docs/UNIT_TESTS.md`                | No        | Reglas de testing específicas — se inyectan como contexto LLM         |

> Si existe `docs/RULES.md`, los campos `codeRules`, `testRules` y `forbidden` de `gaia.json` se omiten para evitar duplicación. `RULES.md` tiene prioridad.

### Sin archivos en el repo

Si el repo no tiene ninguno de estos archivos, el harness usa el built-in `src/plugins/<platform>` con su contexto de prompts por defecto. **El comportamiento es idéntico al de antes**.

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
GITHUB_OWNER=tu-org

# Jira (opcional)
JIRA_BASE_URL=https://tu-org.atlassian.net
JIRA_EMAIL=...
JIRA_API_TOKEN=...

# LLM (para generación real de código)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Workspace
REPOS_BASE_PATH=/tmp/gaia-workspace

# Modo B (CLI) — no requiere DB
LOCAL_REPOS_PATH=/path/to/repos   # repos locales en lugar de clonar desde GitHub

# Modo C (Webhook)
WEBHOOK_SECRET=...                # HMAC-SHA256 para verificar firma X-GAIA-Signature
DEFAULT_REPO=tu-org/tu-repo      # repo por defecto si el ticket Jira no tiene label repo:
DEFAULT_PLATFORM=flutter          # plataforma por defecto si el ticket no tiene label
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

### ¿Por qué tres modos?

- **Modo A** (HTTP): integrable en cualquier CI/CD, permite monitoreo y aprobación remota.
- **Modo B** (CLI): cero infraestructura, ideal para desarrollo local y demostraciones rápidas.
- **Modo C** (Webhook): totalmente automático; sistemas externos (Jira, Slack) disparan el pipeline sin intervención manual.

Los tres comparten el mismo `leader.ts` y agentes — la diferencia es solo el adaptador de entrada y el backend de estado.

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
