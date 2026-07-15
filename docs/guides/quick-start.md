# Guía de los tres modos — GAIA Code Harness

> Paso a paso para cada modo de uso. Para un resumen general del sistema ver [`README.md`](../README.md).

---

## ¿Qué modo usar?

| Situación                                                                  | Modo recomendado      |
| -------------------------------------------------------------------------- | --------------------- |
| Quiero llamar al sistema desde Postman, un script o CI/CD                  | **Modo A — HTTP API** |
| Soy desarrollador y quiero correrlo desde la terminal localmente           | **Modo B — CLI**      |
| Uso Jira/Slack y quiero que el sistema arranque solo cuando creo un ticket | **Modo C — Webhook**  |

---

## Prerrequisitos (todos los modos)

Antes de usar cualquier modo, asegúrate de tener:

### 1. Variables de entorno configuradas

Copia el archivo de ejemplo y edítalo:

```bash
cp .env.example .env
```

Las variables más importantes:

```bash
# LLM — al menos una de las dos
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# GitHub — para crear PRs reales
GITHUB_TOKEN=ghp_...
GITHUB_OWNER=tu-org-o-usuario

# Jira — para leer tickets (opcional, solo si usas Jira)
# IMPORTANTE: usa el subdominio exacto de tu tenant
JIRA_BASE_URL=https://tu-org.atlassian.net
JIRA_EMAIL=tu@email.com
JIRA_API_TOKEN=tu-token

# Repo por defecto cuando el ticket no tiene label repo:org/nombre
DEFAULT_REPO=tu-org/tu-repo

# Plataforma por defecto cuando el ticket no tiene label de plataforma
# Tickets con prefijo [MOBILE] usan este valor (default: flutter)
DEFAULT_PLATFORM=flutter
```

> **¿No tienes estos valores?**
>
> - `OPENAI_API_KEY`: crea uno en [platform.openai.com](https://platform.openai.com/api-keys)
> - `GITHUB_TOKEN`: crea uno en [github.com/settings/tokens](https://github.com/settings/tokens) (activa el scope `repo`)
> - `JIRA_API_TOKEN`: crea uno en [id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens)

### 2. Dependencias instaladas

```bash
npm install
npm run build
```

---

## Modo A — HTTP API

**Ideal para:** integraciones, scripts automáticos, CI/CD, Postman.

El servidor expone una API REST. Tú envías una petición HTTP y el sistema procesa el job en background.

### Paso 1: Levantar la base de datos (PostgreSQL)

```bash
docker start gaia-postgres 2>/dev/null || docker run -d \
  --name gaia-postgres \
  -e POSTGRES_DB=gaia_harness \
  -e POSTGRES_USER=gaia \
  -e POSTGRES_PASSWORD=gaia \
  -p 5432:5432 \
  postgres:15
```

> La base de datos guarda el estado de cada job (qué paso está ejecutando, logs, spec generada, etc.)

### Paso 2: Iniciar el servidor

```bash
npm run dev
```

Deberías ver:

```
Database initialized
Server running on port 3000
```

> **Deja esta terminal abierta.** El servidor debe estar corriendo mientras haces requests.

### Paso 3: Crear un job

Abre otra terminal y envía este request (personaliza los campos):

**Opción A — Con todos los detalles:**

```bash
curl -s -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "flutter",
    "title": "Add promotional banner to home screen",
    "repo": "mi-org/demo-repo",
    "targetBranch": "develop",
    "requireTests": false,
    "maxFilesToTouch": 6,
    "acceptanceCriteria": [
      "WHEN user opens home screen THEN display promotional banner",
      "WHEN there are 3+ promotions THEN show pagination dots",
      "WHEN user taps banner THEN navigate to promotion details"
    ]
  }' | python3 -m json.tool
```

**Opción B — Solo con el ticket de Jira (el sistema fetcha el resto):**

```bash
curl -s -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "jiraTicketId": "PROJ-1234",
    "repo": "mi-org/mi-repo"
  }' | python3 -m json.tool
```

> El sistema lee el título, descripción, criterios de aceptación y URL de Figma directamente de Jira.  
> Requiere `JIRA_BASE_URL`, `JIRA_EMAIL` y `JIRA_API_TOKEN` en `.env`.
>
> **Plataforma** se infiere en este orden:
>
> 1. Labels del ticket — `flutter`, `ios`, `android`, `flutter_web`
> 2. Prefijo del título — `[MOBILE]` → `DEFAULT_PLATFORM`, `[WEB]` → `flutter_web`
> 3. Palabras clave en el título — `swift`, `kotlin`, etc.
> 4. Variable `DEFAULT_PLATFORM` en `.env`
>
> **Repo**: si el ticket no tiene label `repo:org/nombre`, pásalo explícitamente en el body.

La respuesta incluye un `id` — guárdalo:

```json
{
  "job": {
    "id": "e22105e6-eb14-4f7d-9873-d55ab835ca57",
    "status": "pending",
    "title": "Add promotional banner to home screen"
  }
}
```

### Paso 4: Monitorear el progreso

Reemplaza `TU_JOB_ID` con el id que recibiste:

```bash
curl -s http://localhost:3000/jobs/TU_JOB_ID | python3 -m json.tool
```

Los estados que verás en orden:

| Estado            | Qué está pasando                               |
| ----------------- | ---------------------------------------------- |
| `pending`         | Job creado, esperando inicio                   |
| `fetching_jira`   | Leyendo datos del ticket de Jira               |
| `spec_generating` | Analizando el repo y generando el plan técnico |
| `spec_ready`      | Plan listo — **esperando tu aprobación**       |
| `implementing`    | Escribiendo código                             |
| `reviewing`       | Lint/tests + LLM review + creando PR           |
| `pr_created`      | PR creado — corriendo mutation tests           |
| `done`            | ¡Listo!                                        |

### Paso 5: Aprobar el spec

Cuando el status sea `spec_ready`, el sistema pausó y espera tu aprobación:

```bash
# Aprobar
curl -s -X POST http://localhost:3000/jobs/TU_JOB_ID/approve \
  -H "Content-Type: application/json" \
  -d '{"approved": true}' | python3 -m json.tool

# Rechazar con feedback (el sistema regenera el plan)
curl -s -X POST http://localhost:3000/jobs/TU_JOB_ID/approve \
  -H "Content-Type: application/json" \
  -d '{"approved": false, "feedback": "Necesita incluir analytics"}' | python3 -m json.tool
```

### Paso 6: Ver el resultado

Cuando el status sea `done`:

```bash
curl -s http://localhost:3000/jobs/TU_JOB_ID | python3 -m json.tool | grep prUrl
```

Verás el link al Pull Request en GitHub.

### Reintento en caso de error

Si el job falló (`test_error`, `build_error`, etc.):

```bash
curl -s -X POST http://localhost:3000/jobs/TU_JOB_ID/retry | python3 -m json.tool
```

### Usando el script de demo automático

Si no quieres hacer todos los pasos a mano, el script lo hace todo solo:

```bash
./scripts/demo.sh flutter a   # HTTP API + Flutter
./scripts/demo.sh ios a       # HTTP API + iOS
./scripts/demo.sh android a   # HTTP API + Android
```

---

## Modo B — CLI

**Ideal para:** desarrolladores que quieren correr el sistema localmente sin levantar servidor ni base de datos.

El modo CLI usa archivos en disco en lugar de Postgres. No necesitas Docker ni un servidor corriendo.

### Paso 1: Preparar un archivo de job

Crea un archivo JSON con la descripción de lo que quieres, por ejemplo `mi-job.json`:

```json
{
  "platform": "flutter",
  "title": "Add promotional banner to home screen",
  "jiraTicketId": "DEMO-100",
  "repo": "mi-org/demo-repo",
  "targetBranch": "develop",
  "requireTests": false,
  "maxFilesToTouch": 6,
  "acceptanceCriteria": [
    "WHEN user opens home screen THEN display promotional banner carousel",
    "WHEN there are more than 3 promotions THEN show pagination dots",
    "WHEN user taps a banner THEN navigate to promotion details"
  ]
}
```

Plataformas disponibles: `flutter`, `flutter_web`, `ios`, `android`

### Paso 2: Correr el job

```bash
npx ts-node src/cli/run.ts --job mi-job.json
```

El CLI imprime el progreso en la terminal en tiempo real:

```
[SpecAuthor] Analizando repositorio...
[SpecAuthor] Generando spec...
[SpecAuthor] Spec lista — status: spec_ready
```

### Paso 3: Aprobar el spec (o auto-aprobar)

**Opción manual:** el CLI pausa y espera. Corre en otra terminal:

```bash
npx ts-node src/cli/run.ts --id TU_JOB_ID --approve
```

**Opción auto-aprobación (ideal para demos):** agrega `--approve` al comando original y el spec se aprueba automáticamente:

```bash
npx ts-node src/cli/run.ts --job mi-job.json --approve
```

> Con `--approve`, el pipeline corre de punta a punta sin intervención manual.

**Modo TDD (Red-Green-Refactor):** agrega `--tdd` para activar el ciclo rojo-verde por test:

```bash
npx ts-node src/cli/run.ts --job mi-job.json --tdd --approve
```

### Paso 4: Usar con Jira directamente

Si tienes las variables de Jira en `.env`, puedes crear un job directamente desde un ticket:

```bash
npx ts-node src/cli/run.ts --jira PROJ-123 --approve
npx ts-node src/cli/run.ts --jira PROJ-123 --tdd --approve  # con TDD
```

El sistema lee el título, descripción y criterios de aceptación de Jira automáticamente.

### Paso 5: Ver jobs previos

```bash
npx ts-node src/cli/run.ts --list
```

Ver detalles de un job específico:

```bash
npx ts-node src/cli/run.ts --id TU_JOB_ID
```

### Estado guardado en disco

El CLI guarda los jobs en `progress/`:

```
progress/
  56bdcf05-8d56-494f-bfaa-aa4a68e6a26d.md   ← log de progreso
  .state/
    56bdcf05-8d56-494f-bfaa-aa4a68e6a26d.json  ← estado del job
```

### Usando el script de demo automático

```bash
./scripts/demo.sh flutter b   # CLI + Flutter
./scripts/demo.sh ios b       # CLI + iOS
./scripts/demo.sh android b   # CLI + Android
```

---

## Modo C — Webhook

**Ideal para:** integraciones con Jira, Slack o cualquier sistema externo que envíe eventos.

En este modo, un sistema externo llama al endpoint `POST /webhook/trigger` y el job arranca automáticamente sin que nadie tenga que intervenir manualmente.

> **Diferencia clave vs. Modo A:** En el webhook no hay paso de aprobación del spec — el pipeline corre completo de forma autónoma. Es para automatización total.

### Paso 1: Levantar el servidor (mismo que Modo A)

```bash
docker start gaia-postgres 2>/dev/null || \
  docker run -d --name gaia-postgres \
  -e POSTGRES_DB=gaia_harness -e POSTGRES_USER=gaia -e POSTGRES_PASSWORD=gaia \
  -p 5432:5432 postgres:15
npm run dev
```

### Paso 2: Disparar un webhook genérico

Este es el formato más simple — cualquier sistema puede llamarlo:

```bash
curl -s -X POST http://localhost:3000/webhook/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Add loyalty points banner",
    "platform": "flutter",
    "repo": "mi-org/demo-repo",
    "targetBranch": "develop",
    "requireTests": false,
    "maxFilesToTouch": 5,
    "acceptanceCriteria": [
      { "id": "ac-1", "text": "WHEN user has points THEN show banner" },
      { "id": "ac-2", "text": "WHEN user taps banner THEN show rewards" }
    ]
  }' | python3 -m json.tool
```

Respuesta inmediata (202 Accepted):

```json
{
  "jobId": "924417e7-5c06-4a9c-ad0e-72c1fa091994",
  "status": "accepted",
  "platform": "flutter",
  "message": "Job created and pipeline started"
}
```

El pipeline corre en background. Monitorea igual que en Modo A:

```bash
curl -s http://localhost:3000/jobs/924417e7-5c06-4a9c-ad0e-72c1fa091994 | python3 -m json.tool
```

### Paso 3: Simular un webhook de Jira

Cuando se crea un issue en Jira, Jira puede llamar automáticamente al webhook. Así se ve el payload:

```bash
curl -s -X POST http://localhost:3000/webhook/trigger \
  -H "Content-Type: application/json" \
  -H "X-Atlassian-Token: no-check" \
  -d '{
    "webhookEvent": "jira:issue_created",
    "issue": {
      "key": "PROJ-123",
      "fields": {
        "summary": "Add dark mode toggle to settings",
        "labels": ["flutter", "skip-tests"],
        "customfield_repo": "mi-org/demo-repo"
      }
    }
  }' | python3 -m json.tool
```

> **Nota:** La etiqueta `skip-tests` en Jira activa automáticamente `requireTests: false`.  
> El campo `customfield_repo` le dice al sistema en qué repo trabajar.  
> Si no está, usa el valor de `DEFAULT_REPO` en `.env`.

### Paso 4: Integrar con Slack (slash command)

Configura un Slash Command en tu workspace de Slack apuntando a:

```
POST http://<tu-ip-publica>:3000/webhook/trigger
```

Luego en Slack escribe:

```
/gaia flutter mi-org/demo-repo Add dark mode toggle
```

El formato es: `/gaia <plataforma> <repo> <descripción del feature>`

### Paso 5: Seguridad con firma HMAC

Para producción, configura `WEBHOOK_SECRET` en `.env` y firma cada request:

```bash
WEBHOOK_SECRET=mi-secreto-super-seguro
```

```bash
BODY='{"title":"Test","platform":"flutter","repo":"mi-org/demo-repo"}'
SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "mi-secreto-super-seguro" | cut -d' ' -f2)

curl -s -X POST http://localhost:3000/webhook/trigger \
  -H "Content-Type: application/json" \
  -H "X-GAIA-Signature: sha256=$SIG" \
  -d "$BODY"
```

> Si la firma no coincide, el servidor responde `401 Invalid webhook signature`.

### Configurar notificaciones automáticas

Cuando el job avanza de estado, el sistema puede notificar a:

**Slack:**

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T000/B000/xxxx
```

**Jira (comenta en el ticket y mueve estados):**

```bash
JIRA_BASE_URL=https://tu-org.atlassian.net
JIRA_EMAIL=tu@email.com
JIRA_API_TOKEN=tu-token
```

| Evento         | Qué hace el JiraNotifier                            |
| -------------- | --------------------------------------------------- |
| `spec_ready`   | Agrega comentario con el plan técnico               |
| `implementing` | Mueve el ticket a "In Progress"                     |
| `done`         | Mueve el ticket a "Done" + link al PR               |
| `failed`       | Mueve el ticket a "Blocked" + descripción del error |

**Webhook genérico (cualquier endpoint HTTP):**

```bash
NOTIFY_WEBHOOK_URL=https://tu-sistema.com/gaia-events
```

> Si no configuras nada, el sistema usa un notifier vacío — no hay errores ni overhead.

### Usando el script de demo automático

```bash
./scripts/demo.sh flutter c    # Webhook + Flutter
./scripts/demo.sh ios c        # Webhook + iOS
./scripts/demo.sh android c    # Webhook + Android
```

---

## Parámetros importantes

### `requireTests` (boolean, default: `true`)

Controla si el sistema intenta correr el suite de tests de la plataforma (Flutter test, Xcode test, Gradle test).

```json
"requireTests": false
```

> Usa `false` cuando no tienes las herramientas de la plataforma instaladas (por ejemplo, en un servidor sin Flutter). El código y el PR se generan igual — solo se omite la ejecución de tests.

En Jira webhook: añade la etiqueta `skip-tests` al ticket para activar `requireTests: false`.

### `maxFilesToTouch` (number, default: `5`)

Límite máximo de archivos que el sistema puede modificar. Si el implementador toca más archivos de los permitidos, el reviewer rechaza el cambio.

```json
"maxFilesToTouch": 8
```

> Úsalo para features grandes. El valor por defecto de 5 es conservador para cambios pequeños.

### `tddMode` (boolean, default: `false`)

Activa el ciclo **Red-Green-Refactor** (TDD estricto). El implementador:

1. Escribe el test que falla (rojo)
2. Escribe el mínimo código para que pase (verde)
3. Refactoriza

```json
"tddMode": true
```

En Modo B (CLI) el flag equivalente es `--tdd`:

```bash
npx ts-node src/cli/run.ts --job mi-job.json --tdd --approve
```

> Genera tests más robustos pero tarda el doble. Ideal para features críticas.

---

## Comparativa de los tres modos

|                              | Modo A — HTTP API    | Modo B — CLI              | Modo C — Webhook                     |
| ---------------------------- | -------------------- | ------------------------- | ------------------------------------ |
| **Requiere servidor**        | Sí                   | No                        | Sí                                   |
| **Requiere Postgres/Docker** | Sí                   | No (usa disco)            | Sí                                   |
| **Aprobación de spec**       | Manual via API       | Manual o `--approve`      | Automática (sin pausa)               |
| **Integra con Jira/Slack**   | Manual               | `--jira PROJ-123`         | Automático                           |
| **Ideal para**               | CI/CD, APIs, Postman | Dev local, demos rápidos  | Producción, automatización           |
| **Logs**                     | API REST + Postgres  | Terminal + archivos `.md` | API REST + Postgres + notificaciones |
| **Notificaciones**           | Configurable         | No                        | Slack, Jira, Webhook genérico        |
| **TDD (`tddMode`)**          | `"tddMode": true`    | `--tdd`                   | `"tddMode": true` en payload         |

---

## Flujo interno (igual en los tres modos)

```
TRIGGER (API / CLI / Webhook)
        │
        ▼
  ┌─────────────┐
  │  SpecAuthor │  Analiza el repo + genera plan técnico + Gherkin
  └──────┬──────┘  └─ escribe handoff.md
         │  spec_ready
         ▼
   ⏸ APROBACIÓN HUMANA  ← solo en Modos A y B
         │  (automática en Modo C)
         ▼
  ┌──────────────┐
  │  Implementer │  Escribe código (bulk o TDD)
  └──────┬───────┘  └─ lee handoff.md + reviewFeedback
         │
         ▼
  ┌──────────────┐
  │   Reviewer   │  Lint + tests + LLM review crítico → GitHub PR
  └──────┬───────┘  └─ escribe handoff.md
         │
         ▼
  ┌──────────────────┐
  │  MutationTester  │  Valida que los tests detecten bugs
  └──────┬───────────┘
         │
         └── ¿falla? → feedback al Implementer (hasta 2×)
              │
              ▼
            done ✅
           (PR listo para revisión humana)
```

**Tiempo típico: 50–90 segundos por job**

---

## Solución de problemas comunes

### "Connection refused" al hacer curl

El servidor no está corriendo. Verifica con:

```bash
curl http://localhost:3000/health
```

Si falla, vuelve al Paso 2 del modo que estés usando.

### "Jira ticket not found"

- Verifica que el ticket existe y que tu cuenta tiene acceso al proyecto
- Verifica `JIRA_BASE_URL` (debe terminar sin `/`)
- Verifica que `JIRA_API_TOKEN` es un token de API, no tu contraseña

### "Authentication failed" (GitHub)

- `GITHUB_TOKEN` no tiene el scope `repo` — créalo de nuevo en [github.com/settings/tokens](https://github.com/settings/tokens)
- El token expiró — genera uno nuevo

### Job en estado `test_error` o `build_error`

Si no quieres instalar el toolchain de la plataforma:

```bash
# Usa requireTests: false en el payload
"requireTests": false
```

Para reintentar un job fallido:

```bash
curl -s -X POST http://localhost:3000/jobs/TU_JOB_ID/retry
```

### Ver todos los jobs (Modo A y C)

```bash
curl -s http://localhost:3000/jobs | python3 -m json.tool
```

### Limpiar jobs del CLI

```bash
rm -rf progress/.state/ progress/*.md
```

---

## Próximos pasos

Una vez que el sistema crea el Pull Request, un desarrollador lo revisa en GitHub como cualquier otro PR:

1. Lee el diff del código generado
2. Revisa los comentarios del PR (incluyen el spec aprobado)
3. Solicita cambios si es necesario
4. Hace merge cuando esté listo

> El sistema no hace merge automáticamente. El merge siempre requiere aprobación humana.

---

## Referencias rápidas

| Recurso              | Link                                                                 |
| -------------------- | -------------------------------------------------------------------- |
| API completa         | [`API.md`](../API.md)                                                |
| Arquitectura interna | [`docs/engineering/architecture.md`](../engineering/architecture.md) |
| Setup detallado      | [`docs/guides/setup.md`](../guides/setup.md)                         |
| Script de demo       | [`scripts/demo.sh`](../scripts/demo.sh)                              |
| Variables de entorno | [`.env.example`](../.env.example)                                    |

---

> **¿Algo no funciona?** Revisa los logs del servidor (`npm run dev`) — cada error incluye un mensaje específico con la causa y qué hacer para resolverlo.
