# API Reference - Gaia Code Harness

> Documentación completa de la API REST  
> Modos soportados: **HTTP + Postgres**, **Claude Code CLI**, **CI / Webhook**

---

## 🌐 Base URL

```
Local: http://localhost:3000
Production: https://gaia-harness.rappi.com
```

---

## 📋 Endpoints

### Health Check

```http
GET /health
```

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

### Crear Job

```http
POST /jobs
Content-Type: application/json
```

**Request Body (Opción A - Flat body, recomendado):**

```json
{
  "platform": "flutter",
  "title": "Agregar banner de promociones",
  "jiraTicketId": "RPP-1234",
  "repo": "rpp-pyme-multiplatform",
  "module": "pay_multiplatform_home_web",
  "targetBranch": "develop",
  "description": "Mostrar carrusel de promociones destacadas",
  "figmaUrl": "https://figma.com/file/abc123/promo-banner",
  "tddMode": false,
  "requireTests": true,
  "maxFilesToTouch": 6,
  "acceptanceCriteria": [
    "WHEN user opens home screen THEN display promotional banner carousel",
    "WHEN there are more than 3 promotions THEN show pagination dots"
  ]
}
```

> Pasa `"tddMode": true` para activar el ciclo Red-Green-Refactor (un test a la vez).  
> Pasa `"requireTests": false` para deshabilitar la ejecución de tests en Implementer y Reviewer (útil para demos o ambientes sin toolchain).  
> `maxFilesToTouch` limita cuántos archivos puede modificar el agente (default: 5).

**Request Body (Opción B - fullContext wrapper, legacy):**

```json
{
  "jiraTicketId": "RPP-1234",
  "tddMode": true,
  "fullContext": {
    "title": "Agregar banner de promociones",
    "platform": "flutter",
    "repo": "rpp-pyme-multiplatform",
    "acceptanceCriteria": [
      "WHEN user opens home screen THEN display promotional banner carousel"
    ]
  }
}
```

**Request Body (Opción C - Solo Jira ticket):**

```json
{
  "jiraTicketId": "RPP-1234",
  "requireTests": false,
  "maxFilesToTouch": 6
}
```

El sistema fetchea el ticket de Jira (`JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`) y extrae:

- título, descripción, prioridad, labels
- plataforma (inferida del label `flutter`, `ios`, `android`)
- criterios de aceptación (descripción o campo personalizado)
- URL de Figma (si aparece en la descripción)
- repo (label `repo:nombre` o `DEFAULT_REPO`)

Si no puede inferir la plataforma, devuelve **400** con instrucciones para agregar un label.

**Response (201 Created):**

```json
{
  "job": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "pending",
    "title": "Agregar banner de promociones",
    "platform": "flutter",
    "repo": "rpp-pyme-multiplatform",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

---

### Obtener Job

```http
GET /jobs/:id
```

**Response:**

```json
{
  "job": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "spec_ready",
    "currentAgent": "SpecAuthor",
    "title": "Agregar banner de promociones",
    "progressLogs": [
      "[2024-01-15T10:30:01Z] [SpecAuthor] Generating spec...",
      "[2024-01-15T10:30:05Z] [SpecAuthor] Specification generated"
    ],
    "spec": {
      "requirements": [
        {
          "id": "req-1",
          "content": "WHEN user opens home screen THEN display promotional banner carousel",
          "sourceAcId": "ac-0"
        }
      ],
      "design": {
        "affectedFiles": ["packages/.../home_screen.dart"],
        "newFiles": [
          "packages/.../promo_banner.dart",
          "packages/.../promo_banner_test.dart"
        ],
        "architectureDecisions": [
          "Create reusable widget for promotional banners"
        ],
        "uiComponents": ["PromoBanner", "PromoCarousel"]
      },
      "tasks": [
        {
          "id": "task-1",
          "description": "Create PromoBanner widget",
          "filePath": "packages/.../promo_banner.dart",
          "type": "create",
          "status": "pending"
        }
      ],
      "risks": ["May affect home screen performance"]
    },
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:35:00.000Z"
  }
}
```

---

### Listar Jobs

```http
GET /jobs
```

**Query Parameters:**

- `initiativeId` (optional) - Filtrar por iniciativa

**Response:**

```json
{
  "jobs": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "spec_ready",
      "title": "Agregar banner de promociones",
      "platform": "flutter",
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

---

### Aprobar Spec

```http
POST /jobs/:id/approve
Content-Type: application/json
```

**Request Body:**

```json
{
  "approved": true,
  "feedback": "Optional feedback if rejected"
}
```

**Response (Aprobado):**

```json
{
  "job": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "spec_approved",
    "title": "Agregar banner de promociones"
  }
}
```

**Response (Rechazado):**

```json
{
  "job": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "pending",
    "title": "Agregar banner de promociones"
  }
}
```

---

### Reintentar Job

```http
POST /jobs/:id/retry
```

**Notas:**

- Funciona para cualquier estado de error: `failed`, `env_error`, `repo_error`, `build_error`, `test_error`, `review_error`, `spec_error`
- Reinicia el flujo desde `pending`

**Response:**

```json
{
  "job": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "pending",
    "title": "Agregar banner de promociones"
  }
}
```

---

## 🔄 Estados de Job

| Estado            | Descripción              | UI Sugerida            |
| ----------------- | ------------------------ | ---------------------- |
| `pending`         | Iniciando                | 🟡 Iniciando...        |
| `fetching_jira`   | Obteniendo info de Jira  | 🟡 Leyendo ticket...   |
| `spec_generating` | IA generando spec        | 🟡 Generando spec...   |
| `spec_ready`      | **Listo para revisión**  | 🔵 Revisión requerida  |
| `spec_approved`   | Aprobado, implementando  | 🟡 Implementando...    |
| `implementing`    | Escribiendo código       | 🟡 Generando código... |
| `reviewing`       | Validando y creando PR   | 🟡 Creando PR...       |
| `pr_created`      | PR listo                 | 🟣 PR creado           |
| `done`            | **Completado**           | ✅ Completado          |
| `failed`          | Error inesperado (retry) | ❌ Error               |
| `env_error`       | SDK no encontrado        | ❌ Env error           |
| `repo_error`      | Git clone/push falló     | ❌ Repo error          |
| `build_error`     | Deps no resueltas        | ❌ Build error         |
| `test_error`      | Tests fallaron           | ❌ Test error          |
| `review_error`    | Reviewer falló           | ❌ Review error        |
| `spec_error`      | LLM no pudo generar spec | ❌ Spec error          |

---

## ❌ Error Responses

### 400 Bad Request

```json
{
  "error": "Must provide jiraTicketId, jiraEpicId, or fullContext"
}
```

### 404 Not Found

```json
{
  "error": "Job not found"
}
```

### 500 Internal Server Error

```json
{
  "error": "Failed to create job"
}
```

---

## 🎯 Flujo Típico

```bash
# 1. Crear job
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{"fullContext": {...}}'

# 2. Poll hasta spec_ready
while true; do
  STATUS=$(curl -s http://localhost:3000/jobs/$JOB_ID | jq -r '.job.status')
  echo "Status: $STATUS"
  [ "$STATUS" = "spec_ready" ] && break
  sleep 2
done

# 3. Aprobar spec
curl -X POST http://localhost:3000/jobs/$JOB_ID/approve \
  -H "Content-Type: application/json" \
  -d '{"approved": true}'

# 4. Poll hasta done
while true; do
  STATUS=$(curl -s http://localhost:3000/jobs/$JOB_ID | jq -r '.job.status')
  echo "Status: $STATUS"
  [ "$STATUS" = "done" ] && break
  sleep 5
done

# 5. Obtener PR URL
curl -s http://localhost:3000/jobs/$JOB_ID | jq -r '.job.prUrl'
```

---

## 📊 Rate Limits

| Endpoint      | Limit | Window     |
| ------------- | ----- | ---------- |
| POST /jobs    | 10    | por minuto |
| GET /jobs/:id | 60    | por minuto |
| POST /approve | 30    | por minuto |

---

## 🔐 Autenticación

**Nota:** Actualmente la API no requiere autenticación.

**Para producción:**

- Agregar API Key en header: `X-API-Key: your-key`
- O usar OAuth2/JWT

---

---

---

## 🔔 CI / Webhook Mode

### Trigger — Inbound webhook

```http
POST /webhook/trigger
Content-Type: application/json
```

Acepta tres formatos de payload:

**Formato A — Generic GAIA JSON (recomendado para integraciones propias):**

```json
{
  "title": "Add loyalty points banner",
  "platform": "flutter",
  "repo": "rpp-pyme-multiplatform",
  "targetBranch": "develop",
  "tddMode": true,
  "acceptanceCriteria": [
    { "id": "ac-1", "text": "WHEN user has points THEN show banner" }
  ]
}
```

**Formato B — Jira issue webhook** (configura en Jira → Project settings → Webhooks):

```json
{
  "webhookEvent": "jira:issue_created",
  "issue": {
    "key": "PROJ-123",
    "fields": {
      "summary": "Add loyalty points banner",
      "labels": ["flutter", "tdd"]
    }
  }
}
```

> La plataforma se detecta de los labels. Requiere `DEFAULT_REPO` en `.env`.

**Formato C — Slack slash command** (`/gaia flutter my-repo Feature title here`):

```
POST /webhook/trigger
Content-Type: application/x-www-form-urlencoded

command=/gaia&text=flutter my-repo Feature title here
```

**Response (202 Accepted):**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "accepted",
  "title": "Add loyalty points banner",
  "platform": "flutter",
  "tddMode": true,
  "message": "Job created and pipeline started"
}
```

**Seguridad — firma HMAC-SHA256:**

```bash
# Configura WEBHOOK_SECRET en .env
# El sistema verifica X-GAIA-Signature: sha256=<hmac>
curl -X POST http://localhost:3000/webhook/trigger \
  -H "Content-Type: application/json" \
  -H "X-GAIA-Signature: sha256=$(echo -n '{"title":"..."}' | openssl dgst -sha256 -hmac $WEBHOOK_SECRET | cut -d' ' -f2)" \
  -d '{"title":"Add loyalty points banner","platform":"flutter","repo":"my-repo"}'
```

---

### Notificaciones — Outbound events

Configura una o más variables en `.env` para activar notificaciones de salida:

| Variable                                               | Notifier activado | Qué envía                                                                  |
| ------------------------------------------------------ | ----------------- | -------------------------------------------------------------------------- |
| `SLACK_WEBHOOK_URL`                                    | Slack             | Block Kit message por estado                                               |
| `GITHUB_CHECKS_TOKEN` + `GITHUB_OWNER` + `GITHUB_REPO` | GitHub Checks API | Check Run por job                                                          |
| `NOTIFY_WEBHOOK_URL`                                   | Generic HTTP      | JSON completo del evento                                                   |
| `NOTIFY_WEBHOOK_SECRET`                                | (firma outbound)  | `X-GAIA-Signature` header                                                  |
| `JIRA_BASE_URL` + `JIRA_EMAIL` + `JIRA_API_TOKEN`      | Jira              | Comentarios + transiciones de estado en el ticket                          |
| `JIRA_TRANSITION_MAP`                                  | (configura Jira)  | JSON para renombrar transiciones: `{"done":"Resolved","failed":"Blocked"}` |

**Eventos emitidos:**

| Evento             | Cuándo                           |
| ------------------ | -------------------------------- |
| `job.created`      | Job creado (`pending`)           |
| `job.spec_ready`   | Spec lista, esperando aprobación |
| `job.implementing` | Implementación iniciada          |
| `job.reviewing`    | Revisión en curso                |
| `job.done`         | Job completado con PR            |
| `job.failed`       | Error en el pipeline             |

**Ejemplo payload outbound (Slack / Generic):**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "event": "job.done",
  "status": "done",
  "title": "Add loyalty points banner",
  "platform": "flutter",
  "timestamp": "2024-01-15T10:35:42.000Z",
  "tddMode": true,
  "prUrl": "https://github.com/org/repo/pull/42",
  "mutationScore": 87.5
}
```

---

## 🧑‍💻 Claude Code Mode

Alternativa sin servidor HTTP. Usa un `DiskBackend` (JSON en `progress/`) en lugar de Postgres.

```bash
# Listar jobs
npx ts-node src/cli/run.ts --list

# Crear y correr un job desde archivo JSON
npx ts-node src/cli/run.ts --job job.json

# Retomar job existente
npx ts-node src/cli/run.ts --id <uuid>
```

El `job.json` acepta los mismos campos que `POST /jobs` body flat (incluido `tddMode`).

---

**Documentación relacionada:**

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) - Arquitectura interna
- [CLAUDE.md](./CLAUDE.md) - Instrucciones para Claude Code orchestration mode
- [README.md](./README.md) - Guía general
