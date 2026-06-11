# Guía de Testing - Gaia Code Harness

> Cómo probar el proyecto localmente
> Ticket: RPCO-37575

---

## 🧪 Testing Rápido (5 minutos)

### 1. Verificar Instalación

```bash
# Verificar que el server está corriendo
curl http://localhost:3000/health
```

**Esperado:**

```json
{ "status": "ok", "timestamp": "2024-01-15T..." }
```

### 2. Crear un Job de Prueba

```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "jiraTicketId": "TEST-123",
    "fullContext": {
      "title": "Agregar botón de login",
      "description": "Botón para iniciar sesión en la app",
      "acceptanceCriteria": [
        "WHEN user taps login button THEN show login form",
        "WHEN login succeeds THEN navigate to home"
      ],
      "platform": "flutter",
      "repo": "test-repo",
      "targetBranch": "main"
    }
  }'
```

**Esperado:** Status 201 con objeto `job` incluyendo `id`.

### 3. Verificar Job

```bash
# Reemplazar $JOB_ID con el ID devuelto
curl http://localhost:3000/jobs/$JOB_ID | jq .
```

**Esperado:** Job con status "pending" o "spec_generating".

### 4. Ejecutar Demo Completo

```bash
# Flutter
./scripts/demo.sh flutter

# iOS
./scripts/demo.sh ios

# Android
./scripts/demo.sh android
```

**Esperado:** Script completa todo el flujo y muestra PR URL para la plataforma elegida.

---

## 🔧 Testing Manual de Componentes

### Testing de Agentes

#### SpecAuthorAgent

```typescript
// Test directo del agente
import { SpecAuthorAgent } from "./src/agents/spec-author";

const agent = new SpecAuthorAgent();
const result = await agent.execute({
  job: {
    id: "test-123",
    title: "Test feature",
    acceptanceCriteria: [
      { id: "1", text: "WHEN test THEN success", testable: true },
    ],
    platform: "flutter",
    repo: "test-repo",
    targetBranch: "main",
    maxFilesToTouch: 5,
    requireTests: true,
    initiativeId: "test",
    status: "pending",
    progressLogs: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  workspacePath: "/tmp/test",
});

console.log(result.spec);
```

#### ImplementerAgent

Requiere:

- Repo de la plataforma clonado (Flutter/iOS/Android)
- Herramientas de la plataforma instaladas (Flutter SDK, Swift, Gradle)
- Git configurado

#### ReviewerAgent

Requiere:

- Código implementado
- Tests pasando (`flutter test` / `swift test` / `gradle test`)
- Lint pasando (`dart analyze` / `swiftlint` / `gradle lint`)
- GitHub token configurado (opcional, usa dry-run sin él)

---

## 🧪 Testing de API

### Colección de Requests

#### Health Check

```bash
curl http://localhost:3000/health
```

#### Listar Jobs

```bash
curl http://localhost:3000/jobs
```

#### Crear Job (Contexto Completo)

```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "fullContext": {
      "title": "Feature title",
      "acceptanceCriteria": ["WHEN x THEN y"],
      "platform": "flutter",
      "repo": "rpp-pyme-multiplatform",
      "module": "pay_multiplatform_home_web",
      "targetBranch": "develop"
    }
  }'
```

#### Crear Job (Solo Jira)

```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{"jiraTicketId": "RPP-1234"}'
```

#### Aprobar Spec

```bash
curl -X POST http://localhost:3000/jobs/$JOB_ID/approve \
  -H "Content-Type: application/json" \
  -d '{"approved": true}'
```

#### Rechazar Spec

```bash
curl -X POST http://localhost:3000/jobs/$JOB_ID/approve \
  -H "Content-Type: application/json" \
  -d '{"approved": false, "feedback": "Need more details"}'
```

#### Reintentar Job

```bash
curl -X POST http://localhost:3000/jobs/$JOB_ID/retry
```

---

## 🔍 Debugging

### Ver Logs del Server

```bash
# Terminal 1: Server con logs	npm run dev

# Terminal 2: Monitorear
watch -n 2 'curl -s http://localhost:3000/jobs/$JOB_ID | jq .status'
```

### Ver Progress Logs

```bash
curl http://localhost:3000/jobs/$JOB_ID | jq '.job.progressLogs'
```

### Ver Especificación Generada

```bash
curl http://localhost:3000/jobs/$JOB_ID | jq '.job.spec'
```

---

## 🧪 Testing de Flujo Completo

### Script de Testing Automatizado

```bash
#!/bin/bash

BASE_URL="http://localhost:3000"

echo "=== Testing Gaia Code Harness ==="

# 1. Health check
echo "[1/6] Health check..."
curl -s $BASE_URL/health | jq .

# 2. Create job
echo "[2/6] Creating job..."
JOB_RESPONSE=$(curl -s -X POST $BASE_URL/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "fullContext": {
      "title": "Test job",
      "acceptanceCriteria": ["WHEN test THEN pass"],
      "platform": "flutter",
      "repo": "demo-repo"
    }
  }')

JOB_ID=$(echo $JOB_RESPONSE | jq -r '.job.id')
echo "Created job: $JOB_ID"

# Nota: cambiar platform a "ios"/"android" y repo a
# "demo-repo-ios"/"demo-repo-android" para otras plataformas

# 3. Wait for spec_ready
echo "[3/6] Waiting for spec..."
for i in {1..10}; do
  STATUS=$(curl -s $BASE_URL/jobs/$JOB_ID | jq -r '.job.status')
  echo "  Status: $STATUS"
  [ "$STATUS" = "spec_ready" ] && break
  sleep 2
done

# 4. Approve spec
echo "[4/6] Approving spec..."
curl -s -X POST $BASE_URL/jobs/$JOB_ID/approve \
  -H "Content-Type: application/json" \
  -d '{"approved": true}' | jq .

# 5. Wait for completion
echo "[5/6] Waiting for completion..."
for i in {1..20}; do
  STATUS=$(curl -s $BASE_URL/jobs/$JOB_ID | jq -r '.job.status')
  echo "  Status: $STATUS"
  [ "$STATUS" = "done" ] && break
  sleep 3
done

# 6. Final result
echo "[6/6] Final result:"
curl -s $BASE_URL/jobs/$JOB_ID | jq '{id, status, prUrl}'

echo "=== Test Complete ==="
```

---

## 🐛 Troubleshooting

### Problema: Job se queda en "pending"

**Causa:** Leader no está procesando.
**Solución:** Verificar que `orchestrateJob` fue llamado.

### Problema: Spec no se genera

**Causa:** SpecAuthorAgent falló silenciosamente.
**Solución:** Verificar logs del server.

### Problema: "Cannot approve spec"

**Causa:** Job no está en estado "spec_ready".
**Solución:** Esperar a que termine de generar.

### Problema: PR no se crea

**Causa:** GitHub token no configurado.
**Solución:** Verificar `GITHUB_TOKEN` en `.env`.

---

## 📊 Métricas de Testing

| Test         | Tiempo Esperado | Status |
| ------------ | --------------- | ------ |
| Health check | < 1s            | ⬜     |
| Crear job    | < 2s            | ⬜     |
| Generar spec | < 30s           | ⬜     |
| Aprobar spec | < 1s            | ⬜     |
| Implementar  | < 60s           | ⬜     |
| Crear PR     | < 10s           | ⬜     |
| **Total**    | **< 2 min**     | ⬜     |

---

**Ticket:** RPCO-37575
