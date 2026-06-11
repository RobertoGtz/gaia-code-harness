# Arquitectura del Gaia Code Harness

> Documentación técnica profunda de la arquitectura
> Ticket: RPCO-37575

---

## 📐 Diagrama de Arquitectura

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
│  Máquina de estados con 10 estados:                                           │
│                                                                              │
│  pending ──► fetching_jira ──► spec_generating ──► spec_ready              │
│                                                          │                   │
│  done ◄── pr_created ◄── reviewing ◄── implementing ◄── spec_approved       │
│                                                                              │
│  Cada estado tiene un handler que ejecuta el agente correspondiente         │
└──────────┬─────────────────┬─────────────────┬──────────────────────────────┘
           │                 │                 │
           ▼                 ▼                 ▼
┌──────────────┐  ┌────────────────┐  ┌────────────────┐
│ SpecAuthor   │  │  Implementer   │  │   Reviewer     │
│   Agent      │  │     Agent      │  │     Agent      │
└──────────────┘  └────────────────┘  └────────────────┘
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

## 🔄 Flujo de Datos

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
  1. Setup repo (shared setupRepository tool)
  2. Verifica Flutter environment
  3. Crea branch
  4. Dependencias: melos bootstrap || flutter pub get
  5. Escribe/modifica archivos
  6. Ejecuta tests
  7. Commit & push
         ↓
  DB: status='reviewing'
```

### 5. Review y PR

```
ReviewerAgent:
  1. dart analyze
  2. flutter test
  3. Verifica cambios vs spec
  4. Crea GitHub PR
  5. Comenta en Jira (opcional)
         ↓
  DB: status='pr_created' → 'done'
```

---

## 🗄️ Estructura de Datos

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
  platform TEXT NOT NULL,  -- flutter | ios | android | backend
  repo TEXT NOT NULL,
  module TEXT,             -- ej: pay_multiplatform_home_web
  target_branch TEXT NOT NULL DEFAULT 'develop',

  -- Contexto
  description TEXT,
  acceptance_criteria JSONB NOT NULL DEFAULT '[]',
  figma_url TEXT,
  technical_constraints JSONB DEFAULT '[]',

  -- Límites
  max_files_to_touch INTEGER DEFAULT 5,
  require_tests BOOLEAN DEFAULT true,

  -- Estado
  status TEXT NOT NULL DEFAULT 'pending',
  current_agent TEXT,
  progress_logs JSONB NOT NULL DEFAULT '[]',

  -- Outputs
  spec JSONB,              -- TechnicalSpec generado
  branch_name TEXT,
  pr_url TEXT,
  pr_id TEXT,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_jobs_status ON code_generation_jobs(status);
CREATE INDEX idx_jobs_initiative ON code_generation_jobs(initiative_id);
```

---

## 🧠 Agentes

### Arquitectura Multi-Plataforma

Los agentes están organizados por plataforma en `src/agents/{platform}/`. El Leader usa el **Agent Registry** (`src/agents/registry.ts`) para obtener los agentes correctos según `job.platform`:

```typescript
const agents = getAgentsForPlatform(job.platform); // 'flutter', 'ios', etc.
await agents.specAuthor.execute(context);
await agents.implementer.execute(context);
await agents.reviewer.execute(context);
```

**Plataformas registradas:**

- `flutter` / `flutter_web` → `src/agents/flutter/` (implementado)
- `ios` → `src/agents/ios/` (pendiente)
- `android` → `src/agents/android/` (pendiente)

Para agregar una plataforma nueva:

1. Crear directorio `src/agents/{platform}/` con `spec-author.ts`, `implementer.ts`, `reviewer.ts`
2. Registrar en `src/agents/registry.ts`
3. El Leader lo usa automáticamente

### FlutterSpecAuthorAgent

**Responsabilidad:** Generar especificación técnica desde requerimientos de producto

**Input:**

- Job con acceptance criteria
- Path al repo

**Output:**

- TechnicalSpec (requirements, design, tasks, risks)
- Archivos JSON guardados en workspace

**Proceso:**

1. Setup repo via shared `setupRepository` (clona desde path local o GitHub)
2. Explora estructura del repo
3. Identifica archivos relevantes (lib/, test/)
4. Genera lista de tareas
5. Identifica riesgos
6. Guarda spec en disco

### FlutterImplementerAgent

**Responsabilidad:** Modificar código Flutter/Dart según la spec aprobada

**Input:**

- Job con spec aprobado
- Workspace path

**Output:**

- Archivos modificados/creados
- Branch en GitHub
- Tests pasando

**Proceso:**

1. Verifica Flutter environment
2. Setup repo via shared `setupRepository` (clona desde path local o GitHub)
3. Create branch
4. Resolver dependencias:
   - Si existe `melos.yaml` → `melos bootstrap`
   - Si no → `flutter pub get`
5. Por cada task:
   - Genera código (mock por ahora, LLM en futuro)
   - Escribe archivo
6. Ejecuta `flutter test`
7. Commit & push

**Retry Logic:**

- Si falla, reintenta hasta 3 veces
- Cada retry incluye el error previo como contexto

### FlutterReviewerAgent

**Responsabilidad:** Validar implementación Flutter y crear PR

**Input:**

- Job con código implementado
- Workspace path

**Output:**

- Validación exitosa/fallida
- GitHub PR URL
- Comentario en Jira (opcional)

**Validaciones:**

1. dart analyze - sin errores
2. flutter test - todos pasan
3. Número de archivos ≤ maxFilesToTouch
4. Traceability: cada cambio linkea a spec

**GitHub PR:**

- Título: `[TICKET-123] Feature description`
- Body: Checklist de requirements + design decisions
- **Dry-run mode:** Si `GITHUB_TOKEN` no está configurado, retorna un PR mock sin llamar a la API de GitHub

---

## 🔌 Plugin System

### ¿Cómo funciona?

```
Repo del proyecto
└── .gaia/
    ├── gaia.json          ← Manifest
    └── agents/
        ├── flutter-spec-author.ts
        ├── flutter-implementer.ts
        └── flutter-reviewer.ts
```

### Orden de búsqueda

1. **Platform-specific:** `.gaia/agents/{platform}-{agentType}.ts`
2. **Generic:** `.gaia/agents/{agentType}.ts`
3. **Manifest-specified:** `gaia.json → agents.{agentType}`
4. **Default:** Usar agente del harness

### Ejemplo gaia.json

```json
{
  "name": "rappi-flutter",
  "version": "1.0.0",
  "agents": {
    "specAuthor": "flutter-spec-author.ts"
  },
  "config": {
    "maxFilesToTouch": 10,
    "patterns": {
      "component": "lib/src/presentation/widgets/{name}.dart",
      "test": "test/widgets/{name}_test.dart"
    }
  }
}
```

---

## 🛡️ Seguridad y Control

### Human-in-the-Loop

| Checkpoint    | Quién     | Qué decide                    |
| ------------- | --------- | ----------------------------- |
| Spec approval | Tech Lead | ¿El spec técnico es correcto? |
| PR review     | Dev Team  | ¿El código cumple estándares? |

### Límites Automáticos

- `maxFilesToTouch`: Previene cambios masivos no revisables
- `requireTests`: Fuerza tests para cada feature
- Dart analyze: Código limpio obligatorio
- Flutter test: Tests pasando obligatorio

### Auditoría

Todo se guarda en DB:

- Cada cambio de estado
- Cada log de progreso
- Spec generado
- Archivos modificados
- PR creado

---

## 📊 Escalabilidad

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

## 🔧 Configuración

### Variables de Entorno Críticas

```bash
# Server
PORT=3000

# Database
DATABASE_URL=postgresql://...

# GitHub (para crear PRs)
GITHUB_TOKEN=ghp_...
GITHUB_OWNER=rappi

# Jira (opcional)
JIRA_BASE_URL=https://rappi.atlassian.net
JIRA_EMAIL=...
JIRA_API_TOKEN=...

# LLM (para generación real de código)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Workspace
REPOS_BASE_PATH=/tmp/gaia-workspace
```

---

## 🚀 Deployment

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

Ver `DEPLOYMENT.md` para detalles completos.

---

## 📈 Métricas

| Métrica           | Valor Actual   | Target       |
| ----------------- | -------------- | ------------ |
| Jobs/hour         | 10 (estimado)  | 50+          |
| Success rate      | 80% (estimado) | 95%+         |
| Avg time          | 5 min          | 2 min        |
| Human checkpoints | 2              | 2 (mantener) |

---

## 🎯 Decisiones de Diseño

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

- [API.md](../API.md) - Referencia de endpoints
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Guía de deploy
- [PLUGINS.md](../PLUGINS.md) - Sistema de plugins
