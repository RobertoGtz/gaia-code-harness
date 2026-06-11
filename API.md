# API Reference - Gaia Code Harness

> Documentación completa de la API REST
> Ticket: RPCO-37575

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

**Request Body (Opción A - Contexto completo):**
```json
{
  "fullContext": {
    "title": "Agregar banner de promociones",
    "description": "Mostrar carrusel de promociones destacadas",
    "acceptanceCriteria": [
      "WHEN user opens home screen THEN display promotional banner carousel",
      "WHEN there are more than 3 promotions THEN show pagination dots"
    ],
    "platform": "flutter",
    "repo": "rpp-pyme-multiplatform",
    "module": "pay_multiplatform_home_web",
    "targetBranch": "develop",
    "figmaUrl": "https://figma.com/file/abc123/promo-banner"
  }
}
```

**Request Body (Opción B - Solo Jira ticket):**
```json
{
  "jiraTicketId": "RPP-1234"
}
```

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
        "affectedFiles": [
          "packages/.../home_screen.dart"
        ],
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
      "risks": [
        "May affect home screen performance"
      ]
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
- Solo funciona para jobs en estado `failed`
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

| Estado | Descripción | UI Sugerida |
|--------|-------------|-------------|
| `pending` | Iniciando | 🟡 Iniciando... |
| `fetching_jira` | Obteniendo info de Jira | 🟡 Leyendo ticket... |
| `spec_generating` | IA generando spec | 🟡 Generando spec... |
| `spec_ready` | **Listo para revisión** | 🔵 Revisión requerida |
| `spec_approved` | Aprobado, implementando | 🟡 Implementando... |
| `implementing` | Escribiendo código | 🟡 Generando código... |
| `reviewing` | Validando y creando PR | 🟡 Creando PR... |
| `pr_created` | PR listo | 🟣 PR creado |
| `done` | **Completado** | ✅ Completado |
| `failed` | Error (retry disponible) | ❌ Error |

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

| Endpoint | Limit | Window |
|----------|-------|--------|
| POST /jobs | 10 | por minuto |
| GET /jobs/:id | 60 | por minuto |
| POST /approve | 30 | por minuto |

---

## 🔐 Autenticación

**Nota:** Actualmente la API no requiere autenticación.

**Para producción:**
- Agregar API Key en header: `X-API-Key: your-key`
- O usar OAuth2/JWT

---

**Documentación relacionada:**
- [GAIA_INTEGRATION.md](./docs/GAIA_INTEGRATION.md) - Integración con Gaia
- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) - Arquitectura interna
