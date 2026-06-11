# Guía de Demo - Gaia Code Harness

> Guía paso a paso para ver cómo funciona el sistema de generación de código.
> No necesitas saber programar para seguir esta guía.

---

## ¿Qué vamos a ver?

Vamos a simular lo que pasa cuando un Product Manager pide una nueva feature:

1. **Tú le dices al sistema qué quieres** (criterios de aceptación)
2. **El sistema genera un plan técnico** (spec)
3. **Tú lo apruebas** (human in the loop)
4. **El sistema escribe el código automáticamente**
5. **El sistema valida que todo funcione** (tests)
6. **El sistema crea un Pull Request** listo para revisión

Todo esto sucede en ~50 segundos.

---

## Antes de empezar

Necesitas tener instalado:

- **Docker Desktop** — [Descargar aquí](https://www.docker.com/products/docker-desktop/)
- **Node.js 18+** — [Descargar aquí](https://nodejs.org/)
- **Flutter** — [Descargar aquí](https://docs.flutter.dev/get-started/install)

Si no estás seguro si ya los tienes, abre la Terminal y escribe:

```
node --version
flutter --version
docker --version
```

Si ves números de versión, ya los tienes instalados.

---

## Paso 1: Preparar la base de datos

Abre la **Terminal** (búscala en Spotlight con Cmd+Space → "Terminal").

Copia y pega este comando:

```bash
docker start gaia-postgres 2>/dev/null || docker run -d \
  --name gaia-postgres \
  -e POSTGRES_DB=gaia_harness \
  -e POSTGRES_USER=user \
  -e POSTGRES_PASSWORD=pass \
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

## Paso 3: Crear un job (simular solicitud de producto)

Abre una **segunda terminal** (Cmd+N o Shell → New Window).

Copia y pega este comando:

```bash
curl -s -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "jiraTicketId": "DEMO-100",
    "fullContext": {
      "title": "Add promotional banner to home screen",
      "description": "Display a carousel of promotions on the home screen",
      "acceptanceCriteria": [
        "WHEN user opens home screen THEN display promotional banner carousel",
        "WHEN there are more than 3 promotions THEN show pagination dots",
        "WHEN user taps a banner THEN navigate to promotion details"
      ],
      "platform": "flutter",
      "repo": "demo-repo",
      "targetBranch": "develop"
    }
  }' | python3 -m json.tool
```

> **¿Qué hace esto?** Le dice al sistema: "Quiero un banner de promociones en la pantalla de inicio, con estas 3 reglas de negocio."

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

| Status | Qué significa |
|--------|--------------|
| `implementing` | Escribiendo código y corriendo tests |
| `reviewing` | Validando que todo esté bien |
| `done` | Terminó exitosamente |

> **Tip:** Repite el comando cada 10 segundos hasta ver `"done"`.

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
     │                                  │── Genera spec técnico
     │                                  │
     │←── "¿Apruebas este plan?" ──────│
     │                                  │
     │── "Sí, aprobado" ─────────────→ │
     │                                  │── Clona repo
     │                                  │── Crea branch
     │                                  │── Escribe código
     │                                  │── Corre tests
     │                                  │── Crea Pull Request
     │                                  │
     │←── "Listo, aquí está el PR" ────│
     │                                  │
```

**Tiempo total: ~50 segundos**

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
En esta demo el código es mock (plantilla fija). En producción se conectaría a un LLM (como GPT-4 o Claude) para generar código real basado en el spec.

**¿Crea un PR real en GitHub?**
No en esta demo. Necesitaría un token de GitHub configurado. En producción crearía un PR real que un dev puede revisar.

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
