# Guía de Testing — GAIA Code Harness

> Cómo verificar y probar el sistema localmente en los tres modos.

---

## Verificación rápida del entorno

```bash
./init.sh          # verifica Node, TS, archivos base, toolchains nativos
./init.sh --http   # + verifica Postgres accesible
./init.sh --quick  # solo Node + compilación TS
```

---

## Unit tests del harness

Tests unitarios internos que no requieren servidor ni Postgres ni LLM:

```bash
npm test                  # corre toda la suite Jest (120 tests, 12 suites)
npm test -- --watch       # modo watch durante desarrollo
npm test -- webhook       # filtra por nombre de suite
```

| Suite                      | Qué cubre                                                         |
| -------------------------- | ----------------------------------------------------------------- |
| `webhook-parsers.test.ts`  | `parseGenericBody` + `parseJiraWebhook` (Modo C)                  |
| `jira-errors.test.ts`      | Clases de error Jira (`JiraAuthError`, etc.)                      |
| `jira-parsers.test.ts`     | `extractTextFromADF` + `parseACFromText`                          |
| `disk-backend.test.ts`     | `DiskBackend` completo — CRUD, persistencia (Modo B)              |
| `state-backend.test.ts`    | Singleton `StateBackend` + wrappers de conveniencia               |
| `git-errors.test.ts`       | Clases de error Git/GitHub (`GitHubAuthError`, etc.)              |
| `llm-utils.test.ts`        | `extractJSON` — parseo de JSON de respuestas LLM                  |
| `repo-setup.test.ts`       | `setupRepository` — local clone, GitHub clone, errores            |
| `agent-registry.test.ts`   | `getAgentsForPlatform` — plataformas soportadas, singleton, error |
| `notifier-factory.test.ts`  | `buildNotifier` — NullNotifier, Slack, Webhook, Jira, composite   |
| `generic-notifier.test.ts`  | `GenericWebhookNotifier` — POST, HMAC signing, error resilience   |
| `plugin-loader.test.ts`     | `PluginLoader` — gaia.json, RULES.md, UNIT_TESTS.md, getRulesAsContext |

> Estos tests son los más rápidos de correr y deben pasar siempre. Si alguno falla, hay un bug en el harness mismo, no en el workspace del job.

---

## Modo A — HTTP API

### Iniciar servidor

```bash
npm run dev
```

### Health check

```bash
curl http://localhost:3000/health
# → { "status": "ok", "timestamp": "..." }
```

### Crear job con contexto completo (formato flat)

```bash
curl -s -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Agregar banner promocional en home",
    "platform": "flutter",
    "repo": "mi-org/mi-repo",
    "targetBranch": "develop",
    "requireTests": false,
    "maxFilesToTouch": 6,
    "acceptanceCriteria": [
      { "id": "ac-1", "text": "WHEN user opens home THEN show promotional banner", "testable": true },
      { "id": "ac-2", "text": "WHEN user taps banner THEN navigate to promotion details", "testable": true }
    ]
  }' | jq '{id: .job.id, status: .job.status}'
```

### Crear job solo con Jira

```bash
curl -s -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{"jiraTicketId": "PROJ-123"}' | jq '{id: .job.id, status: .job.status}'
```

### Monitorear estado

```bash
JOB_ID=<id-del-job>

# Estado actual
curl -s http://localhost:3000/jobs/$JOB_ID | jq '.job.status'

# Progress logs
curl -s http://localhost:3000/jobs/$JOB_ID | jq '.job.progressLogs'

# Spec generado
curl -s http://localhost:3000/jobs/$JOB_ID | jq '.job.spec'
```

### Aprobar spec

```bash
curl -s -X POST http://localhost:3000/jobs/$JOB_ID/approve \
  -H "Content-Type: application/json" \
  -d '{"approved": true}'

# Rechazar con feedback
curl -s -X POST http://localhost:3000/jobs/$JOB_ID/approve \
  -H "Content-Type: application/json" \
  -d '{"approved": false, "feedback": "Necesita más detalle en el caso de error"}'
```

### Reintentar job en error

```bash
curl -s -X POST http://localhost:3000/jobs/$JOB_ID/retry
```

### Script de flujo completo (Modo A)

```bash
BASE="http://localhost:3000"

# 1. Crear
JOB_ID=$(curl -s -X POST $BASE/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test job",
    "platform": "flutter",
    "repo": "mi-org/demo-repo",
    "acceptanceCriteria": [
      {"id":"ac-1","text":"WHEN test THEN pass","testable":true}
    ]
  }' | python3 -c "import sys,json; print(json.load(sys.stdin)['job']['id'])")
echo "Job: $JOB_ID"

# 2. Esperar spec_ready
for i in $(seq 1 15); do
  ST=$(curl -s $BASE/jobs/$JOB_ID | python3 -c "import sys,json; print(json.load(sys.stdin)['job']['status'])")
  echo "  → $ST"; [ "$ST" = "spec_ready" ] && break; sleep 3
done

# 3. Aprobar
curl -s -X POST $BASE/jobs/$JOB_ID/approve \
  -H "Content-Type: application/json" -d '{"approved":true}' > /dev/null

# 4. Esperar done
for i in $(seq 1 20); do
  ST=$(curl -s $BASE/jobs/$JOB_ID | python3 -c "import sys,json; print(json.load(sys.stdin)['job']['status'])")
  echo "  → $ST"; [ "$ST" = "done" ] && break; sleep 4
done

# 5. Resultado
curl -s $BASE/jobs/$JOB_ID | python3 -c "import sys,json; j=json.load(sys.stdin)['job']; print(j.get('prUrl','No PR'))"
```

---

## Modo B — CLI

No requiere servidor ni Postgres. Usa disco (`progress/.state/`).

```bash
# Job con archivo JSON
cat > /tmp/test-job.json <<'EOF'
{
  "title": "Agregar banner promocional",
  "platform": "flutter",
  "repo": "mi-org/mi-repo",
  "targetBranch": "develop",
  "requireTests": false,
  "acceptanceCriteria": [
    {"id":"ac-1","text":"WHEN user opens home THEN show banner","testable":true}
  ]
}
EOF

# Correr con aprobación automática de spec
npx ts-node src/cli/run.ts --job /tmp/test-job.json --approve

# Con TDD (Red-Green-Refactor)
npx ts-node src/cli/run.ts --job /tmp/test-job.json --tdd --approve

# Listar jobs guardados en disco
npx ts-node src/cli/run.ts --list

# Reanudar job existente
npx ts-node src/cli/run.ts --id <JOB_ID>

# Demo completo con script
./scripts/demo.sh flutter b   # Flutter
./scripts/demo.sh ios b       # iOS
./scripts/demo.sh android b   # Android
```

---

## Modo C — Webhook

Requiere servidor corriendo (`npm run dev`).

```bash
# Trigger genérico
curl -s -X POST http://localhost:3000/webhook/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Agregar banner promocional",
    "platform": "flutter",
    "repo": "mi-org/mi-repo",
    "targetBranch": "develop",
    "tddMode": false,
    "acceptanceCriteria": [
      {"id":"ac-1","text":"WHEN user opens home THEN show banner"}
    ]
  }' | jq '{jobId: .jobId, status: .status}'

# Trigger simulando Jira
curl -s -X POST http://localhost:3000/webhook/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "webhookEvent": "jira:issue_created",
    "issue": {
      "key": "PROJ-123",
      "fields": {
        "summary": "[MOBILE] Agregar banner promocional",
        "description": "Descripción del ticket"
      }
    }
  }' | jq '{jobId: .jobId, status: .status}'

# Demo con script
./scripts/demo.sh flutter c
```

---

## Troubleshooting

| Síntoma          | Causa probable         | Solución                                                   |
| ---------------- | ---------------------- | ---------------------------------------------------------- |
| Job en `pending` | Leader no procesa      | Verificar que `orchestrateJob` fue llamado; revisar logs   |
| `spec_error`     | Falla LLM              | Verificar `OPENAI_API_KEY` o `ANTHROPIC_API_KEY` en `.env` |
| `env_error`      | Toolchain faltante     | Correr `./init.sh` para ver qué falta                      |
| `repo_error`     | Acceso a repo          | Verificar `GITHUB_TOKEN` y permisos del repo               |
| `build_error`    | Dependencias           | Revisar que el repo tenga lockfile correcto                |
| No aprueba spec  | Job no en `spec_ready` | Esperar más; monitorear con `/jobs/$JOB_ID`                |
| Webhook `401`    | Firma inválida         | Verificar `WEBHOOK_SECRET` en `.env`                       |

---

## Tiempos esperados

| Fase         | Tiempo típico |
| ------------ | ------------- |
| Health check | < 1 s         |
| Crear job    | < 2 s         |
| Generar spec | 15–45 s       |
| Aprobar spec | < 1 s         |
| Implementar  | 30–90 s       |
| Crear PR     | < 10 s        |
| **Total**    | **~2–3 min**  |
