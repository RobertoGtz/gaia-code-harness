# Guía de Demo — GAIA Code Harness

> Paso a paso para ver el sistema en acción, desde los ACs hasta el Pull Request.  
> No necesitas saber programar para seguir esta guía.

---

## ¿Qué vamos a ver?

Vamos a simular lo que pasa cuando un Product Manager pide una nueva feature:

1. **Tú le dices al sistema qué quieres** (criterios de aceptación)
2. **El sistema genera un plan técnico** (spec)
3. **Tú lo apruebas** (human in the loop)
4. **El sistema escribe el código automáticamente** (modo normal o TDD ciclo Rojo-Verde)
5. **El sistema valida que todo funcione** (tests + mutation testing)
6. **El sistema crea un Pull Request** listo para revisión

Todo esto sucede en ~50–90 segundos.

---

## Antes de empezar

Necesitas tener instalado:

- **Docker Desktop** — [Descargar aquí](https://www.docker.com/products/docker-desktop/)
- **Node.js 18+** — [Descargar aquí](https://nodejs.org/)
- **Flutter** — [Descargar aquí](https://docs.flutter.dev/get-started/install) (para demo Flutter)
- **Swift 5.9+** — Incluido con Xcode (para demo iOS)
- **Java/JDK 17+** — (para demo Android, opcional)

Si no estás seguro si ya los tienes, abre la Terminal y escribe:

```
node --version
docker --version
flutter --version   # para Flutter
swift --version     # para iOS
java -version       # para Android
```

Si ves números de versión, ya los tienes instalados.

> **Nota:** Solo necesitas las herramientas de la plataforma que quieras probar. Node.js y Docker son obligatorios.

---

## Paso 1: Preparar la base de datos

Abre la **Terminal** (búscala en Spotlight con Cmd+Space → "Terminal").

Copia y pega este comando:

```bash
docker start gaia-postgres 2>/dev/null || docker run -d \
  --name gaia-postgres \
  -e POSTGRES_DB=gaia_harness \
  -e POSTGRES_USER=gaia \
  -e POSTGRES_PASSWORD=gaia \
  -p 5432:5432 \
  postgres:15
```

> **¿Qué hace esto?** Levanta una base de datos donde el sistema guarda el progreso de cada job.

Deberías ver algo como:

```
abc123def456...  (un ID largo)
```

Eso significa que la base de datos está corriendo. ✅

---

## Paso 2: Iniciar el servidor

En la **misma terminal**, escribe:

```bash
cd ~/Desktop/gaia-code-harness
npm run dev
```

Deberías ver:

```
Database initialized
Server running on port 3000
```

> **¿Qué hace esto?** Inicia el servicio que procesa las solicitudes de generación de código.

Deja esta terminal abierta. **No la cierres.** ✅

---

## Paso 3: Ejecutar el demo automático

La forma más fácil es usar el **script de demo**, que hace todos los pasos automáticamente.

Abre una **segunda terminal** (Cmd+N o Shell → New Window).

```bash
# Demo Flutter (default)
./scripts/demo.sh flutter

# Demo iOS/Swift
./scripts/demo.sh ios

# Demo Android/Kotlin
./scripts/demo.sh android
```

El script crea el job, espera el spec, lo aprueba, monitorea la implementación y muestra el PR.

> **Tip:** Si prefieres hacerlo manual paso a paso, sigue leyendo.

### Paso 3b: Crear un job manualmente

Si prefieres el control manual, copia y pega:

```bash
curl -s -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "flutter",
    "title": "Add promotional banner to home screen",
    "jiraTicketId": "RPCO-1000",
    "repo": "web-cashflow",
    "targetBranch": "develop",
    "tddMode": false,
    "requireTests": false,
    "maxFilesToTouch": 6,
    "acceptanceCriteria": [
      "WHEN user opens home screen THEN display promotional banner carousel",
      "WHEN there are more than 3 promotions THEN show pagination dots",
      "WHEN user taps a banner THEN navigate to promotion details"
    ]
  }' | python3 -m json.tool
```

> Cambia `"platform"` a `"ios"` y `"repo"` a `"demo-repo-ios"` para iOS, o `"android"` / `"demo-repo-android"` para Android.
>
> Pasa `"tddMode": true` para activar el ciclo **Red-Green-Refactor** (un test a la vez — el implementador escribe primero el test que falla, luego hace que pase).
>
> Pasa `"requireTests": false` para que el sistema no intente correr tests de Flutter/Xcode/Gradle durante la demo (útil si no tienes el toolchain instalado). La implementación y el PR se crean igual.
>
> También puedes enviar solo el `jiraTicketId` si tienes configuradas `JIRA_BASE_URL`, `JIRA_EMAIL` y `JIRA_API_TOKEN`. El sistema fetcheará título, descripción, criterios de aceptación y URL de Figma directamente de Jira:
>
> ```json
> { "jiraTicketId": "RPCO-37712", "repo": "RappiPay/web-cashflow" }
> ```
>
> **`JIRA_BASE_URL`** debe apuntar al subdominio correcto (e.g. `https://rappidev.atlassian.net`).
>
> **Plataforma** se infiere en orden: labels del ticket → prefijo del título (`[MOBILE]` → `DEFAULT_PLATFORM`, `[WEB]` → `flutter_web`) → palabras clave en título → `DEFAULT_PLATFORM` en `.env`.
>
> Si el ticket no tiene `repo` definido (label `repo:org/nombre`), pásalo explícitamente en el body.

Deberías ver una respuesta con un `"id"` (un código largo). **Copia ese ID**, lo vas a necesitar.

Ejemplo:

```json
{
  "job": {
    "id": "e22105e6-eb14-4f7d-9873-d55ab835ca57",
    "status": "pending",
    "title": "Add promotional banner to home screen"
  }
}
```

✅

---

## Paso 4: Ver el spec generado

Espera 3 segundos y luego escribe (reemplaza `TU_JOB_ID` con el ID que copiaste):

```bash
curl -s http://localhost:3000/jobs/TU_JOB_ID | python3 -m json.tool
```

Deberías ver que el `"status"` cambió a `"spec_ready"` y hay una sección `"spec"` con:

- **requirements** — Los requerimientos técnicos derivados de tus criterios de aceptación
- **tasks** — Las tareas concretas que el sistema va a ejecutar
- **design** — Decisiones de arquitectura (qué archivos crear/modificar)
- **risks** — Riesgos técnicos identificados

> **¿Qué pasó?** El agente **SpecAuthor** analizó el repositorio de código y generó un plan técnico basado en tus criterios de aceptación.

Este es el momento donde **tú decides si el plan está bien**. ✅

---

## Paso 5: Aprobar el spec (Human in the Loop)

Si el spec te parece bien, apruébalo:

```bash
curl -s -X POST http://localhost:3000/jobs/TU_JOB_ID/approve \
  -H "Content-Type: application/json" \
  -d '{"approved": true}' | python3 -m json.tool
```

> **¿Qué hace esto?** Le dices al sistema: "Adelante, implementa este plan."
>
> **Importante:** Sin este paso, el sistema **nunca toca el código**. Siempre espera aprobación humana.

El status debería cambiar a `"implementing"`. ✅

---

## Paso 6: Esperar a que termine

El sistema ahora está:

1. Clonando el repositorio
2. Creando una rama nueva
3. Escribiendo código
4. Corriendo tests
5. Creando un Pull Request

Puedes ir verificando el progreso:

```bash
curl -s http://localhost:3000/jobs/TU_JOB_ID | python3 -m json.tool
```

Los estados que verás en orden:

| Status         | Qué significa                            |
| -------------- | ---------------------------------------- |
| `implementing` | Escribiendo código y corriendo tests     |
| `reviewing`    | Lint + tests + creando PR                |
| `pr_created`   | PR listo, corriendo mutation tests       |
| `done`         | Terminó exitosamente + mutation score OK |

Estados de error retryables: `test_error`, `build_error`, `review_error`, `failed`.

> **Tip:** Repite el comando cada 10 segundos hasta ver `"done"` o un estado `_error`.

---

## Paso 7: Ver el resultado final

Cuando el status sea `"done"`, en la respuesta verás:

- **`prUrl`** — Link al Pull Request (en modo demo dice "dry-run" porque no tenemos token de GitHub)
- **`progressLogs`** — Toda la bitácora de lo que hizo el sistema
- **`spec`** — El plan técnico que aprobaste

> **En producción**, el `prUrl` sería un link real a GitHub donde un desarrollador puede revisar el código antes de hacer merge.

---

## Resumen del flujo

```
Tú (Producto)                    Sistema (Harness)
     │                                  │
     │── "Quiero un banner" ──────────→ │
     │                                  │── SpecAuthor: genera spec técnico
     │                                  │
     │←── "¿Apruebas este plan?" ──────│
     │                                  │
     │── "Sí, aprobado" ─────────────→ │
     │                                  │── Implementer: escribe código
     │                                  │    (normal: bulk | tddMode: RED→GREEN)
     │                                  │── Reviewer: lint + tests + PR
     │                                  │── MutationTester: valida tests
     │                                  │
     │←── "Listo, aquí está el PR" ────│
     │                                  │
```

**Tiempo total: ~50–90 segundos**

---

---

## Demo — Modo CI / Webhook

Este modo permite que sistemas externos (Jira, Slack, GitHub Actions, etc.) arranquen un job automáticamente y reciban notificaciones en tiempo real.

### Paso A: Configurar notificaciones (opcional)

Edita `.env` y añade las variables que quieras activar:

```bash
# Slack — recibirás un mensaje por cada cambio de estado
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T000/B000/xxxx

# GitHub Checks — aparece un Check Run en el PR
GITHUB_CHECKS_TOKEN=github_pat_xxxxx
GITHUB_OWNER=tu-org
GITHUB_REPO=tu-repo

# Webhook genérico — cualquier endpoint HTTP
NOTIFY_WEBHOOK_URL=https://tu-endpoint.com/gaia

# Jira — comenta en el ticket y transiciona estados automáticamente
# (usa las mismas vars que ya tienes para leer tickets)
JIRA_BASE_URL=https://tu-org.atlassian.net
JIRA_EMAIL=tu@email.com
JIRA_API_TOKEN=tu-token
# Opcional: renombra las transiciones si tu workflow usa nombres distintos
# JIRA_TRANSITION_MAP={"implementing":"En Progreso","done":"Resuelto","failed":"Bloqueado"}
```

> Si no configuras ninguna, el sistema usa `NullNotifier` — cero overhead, sin errores.

**Qué hace el JiraNotifier por evento:**

| Evento             | Acción en Jira                                                       |
| ------------------ | -------------------------------------------------------------------- |
| `job.spec_ready`   | Agrega comentario con la spec generada + instrucciones de aprobación |
| `job.implementing` | Transiciona el ticket → **In Progress** + comentario                 |
| `job.done`         | Transiciona → **Done** + comentario con link al PR y mutation score  |
| `job.failed`       | Transiciona → **Blocked** + comentario con el error y link de retry  |

> El ticket se detecta automáticamente del título del job (busca patrón `PROJ-123`).

### Paso B: Disparar un job vía webhook

```bash
curl -s -X POST http://localhost:3000/webhook/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Add loyalty points banner",
    "platform": "flutter",
    "repo": "demo-repo",
    "targetBranch": "develop",
    "tddMode": true,
    "acceptanceCriteria": [
      { "id": "ac-1", "text": "WHEN user has points THEN show banner" }
    ]
  }' | python3 -m json.tool
```

Respuesta inmediata (202):

```json
{
  "jobId": "e22105e6-eb14-4f7d-9873-d55ab835ca57",
  "status": "accepted",
  "platform": "flutter",
  "tddMode": true,
  "message": "Job created and pipeline started"
}
```

El pipeline arranca en background igual que `POST /jobs`. Monitorea con:

```bash
curl -s http://localhost:3000/jobs/e22105e6-eb14-4f7d-9873-d55ab835ca57 | python3 -m json.tool
```

### Paso C: Simular un webhook de Jira

```bash
curl -s -X POST http://localhost:3000/webhook/trigger \
  -H "Content-Type: application/json" \
  -H "X-Atlassian-Token: no-check" \
  -d '{
    "webhookEvent": "jira:issue_created",
    "issue": {
      "key": "PROJ-99",
      "fields": {
        "summary": "Add dark mode toggle",
        "labels": ["flutter", "tdd"]
      }
    }
  }' | python3 -m json.tool
```

> Requiere `DEFAULT_REPO=tu-org/tu-repo` en `.env`.

### Paso D: Slack slash command

Configura un Slash Command en tu workspace apuntando a `POST http://<tu-ip>:3000/webhook/trigger` y escribe en Slack:

```
/gaia flutter demo-repo Add dark mode toggle
```

### Seguridad con firma HMAC

```bash
BODY='{"title":"Test","platform":"flutter","repo":"demo-repo"}'
SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | cut -d' ' -f2)

curl -s -X POST http://localhost:3000/webhook/trigger \
  -H "Content-Type: application/json" \
  -H "X-GAIA-Signature: sha256=$SIG" \
  -d "$BODY" | python3 -m json.tool
```

---

## Si algo sale mal

### "Connection refused"

El servidor no está corriendo. Vuelve al **Paso 2**.

### "Job not found"

Verifica que copiaste bien el ID del job. Puedes ver todos los jobs con:

```bash
curl -s http://localhost:3000/jobs | python3 -m json.tool
```

### Status "failed"

Puedes reintentar con:

```bash
curl -s -X POST http://localhost:3000/jobs/TU_JOB_ID/retry | python3 -m json.tool
```

### Para detener todo

1. En la terminal del servidor: presiona **Ctrl+C**
2. Para la base de datos: `docker stop gaia-postgres`

---

## Preguntas frecuentes

**¿Esto genera código real?**
Sí. El harness llama a OpenAI o Anthropic (configura `OPENAI_API_KEY` o `ANTHROPIC_API_KEY` en `.env`) y genera código real basado en el spec y el repositorio.

**¿Crea un PR real en GitHub?**
Sí, si tienes `GITHUB_TOKEN` configurado. Sin él, retorna un PR mock de "dry-run".

**¿Qué es `tddMode`?**
Cuando está activo, el Implementer aplica el ciclo **Red-Green-Refactor**: primero escribe un test que falla, luego hace que pase, repitiendo por cada escenario. Genera tests más robustos pero tarda más.

**¿Qué hace el Mutation Tester?**
Despues del reviewer, el harness aplica pequeñas mutaciones (ej. `true → false`, `return null`) al código generado y verifica que los tests las detecten. Si el score es ≥ 80% el job sigue; si no, se emite un warning en los logs pero el PR se crea igual.

**¿Solo funciona con Flutter?**
No. Soporta **Flutter**, **Flutter Web**, **iOS/Swift** y **Android/Kotlin**. Cambia `"platform"` en el request para elegir la plataforma.

**¿Puede tocar cualquier archivo del repo?**
No. Tiene límites configurables (`maxFilesToTouch: 5`) y no puede tocar archivos de CI/CD, secrets, o infraestructura.

**¿Qué pasa si no apruebo el spec?**
Puedes rechazarlo con feedback y el sistema regenera el plan:

```bash
curl -s -X POST http://localhost:3000/jobs/TU_JOB_ID/approve \
  -H "Content-Type: application/json" \
  -d '{"approved": false, "feedback": "Necesita incluir analytics"}' | python3 -m json.tool
```

---

> **¿Dudas?** Contacta al equipo en #gaia-code-harness en Slack.
