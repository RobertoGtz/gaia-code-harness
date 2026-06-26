# GAIA Code Harness

> Orquestador de generación de código con IA y supervisión humana obligatoria.  
> Genera un plan técnico, espera aprobación, escribe código y abre un Pull Request — en ~60 segundos.

---

## ¿Qué hace?

Le das criterios de aceptación. El sistema genera un plan técnico, espera tu aprobación, escribe el código y abre un Pull Request — sin que toques una línea de código.

```
PM escribe ACs
      │
      ▼
 SpecAuthor      → analiza el repo + genera TechnicalSpec
      │
      ⏸  Human aprueba el plan  ← único punto de control obligatorio
      │
      ▼
 Implementer     → escribe código  (bulk o TDD Red-Green-Refactor)
      │
      ▼
 Reviewer        → lint + tests + abre GitHub PR
      │
      ▼
 MutationTester  → valida que los tests detecten bugs reales (≥ 80%)
      │
      ▼
 ✅  Pull Request listo  (~60 segundos)
```

**Plataformas:** Flutter · Flutter Web · iOS/Swift · Android/Kotlin

---

## Tres modos de uso

| Modo             | Cómo arranca                                          | Cuándo usarlo                   |
| ---------------- | ----------------------------------------------------- | ------------------------------- |
| **A — HTTP API** | `POST /jobs` (curl, Postman, CI/CD)                   | Integraciones, automatización   |
| **B — CLI**      | `npx ts-node src/cli/run.ts --job mi-job.json`        | Desarrollo local, demos rápidos |
| **C — Webhook**  | `POST /webhook/trigger` (Jira, Slack, GitHub Actions) | Producción, trigger automático  |

→ Guía completa con ejemplos: **[`docs/guides/quick-start.md`](docs/guides/quick-start.md)**

---

## Setup rápido

### 1. Prerequisitos

| Herramienta       | Versión   | Para qué               |
| ----------------- | --------- | ---------------------- |
| Node.js           | ≥ 18      | Siempre requerido      |
| Docker            | cualquier | Postgres (Modos A y C) |
| Flutter SDK       | ≥ 3.x     | Jobs Flutter           |
| Xcode + Swift     | ≥ 5.9     | Jobs iOS (macOS)       |
| Java JDK + Gradle | JDK 17+   | Jobs Android           |

> Solo necesitas el SDK de la plataforma que quieras usar.

### 2. Instalar

```bash
git clone https://github.com/RobertoGtz/gaia-code-harness.git
cd gaia-code-harness
npm install && npm run build
```

### 3. Configurar `.env`

```bash
cp .env.example .env
```

Variables mínimas:

```bash
# LLM — al menos una
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# GitHub — para crear PRs reales
GITHUB_TOKEN=ghp_...
GITHUB_OWNER=tu-org

# Jira — solo si usas tickets
JIRA_BASE_URL=https://tu-org.atlassian.net     # subdominio exacto de tu tenant
JIRA_EMAIL=tu@email.com
JIRA_API_TOKEN=...
DEFAULT_PLATFORM=flutter      # fallback si el ticket no tiene label de plataforma
DEFAULT_REPO=tu-org/tu-repo   # fallback si el ticket no tiene repo
```

### 4. Levantar el servidor (Modos A y C)

```bash
# Postgres
docker run -d --name gaia-postgres \
  -e POSTGRES_DB=gaia_harness -e POSTGRES_USER=gaia -e POSTGRES_PASSWORD=gaia \
  -p 5432:5432 postgres:15

# Servidor
npm run dev
# → Server running on port 3000
```

### 5. Crear tu primer job

**Con todos los datos:**

```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "flutter",
    "title": "Add promotional banner",
    "repo": "tu-org/tu-repo",
    "targetBranch": "develop",
    "requireTests": false,
    "acceptanceCriteria": [
      "WHEN user opens home THEN show promotional banner",
      "WHEN user taps banner THEN navigate to promotion details"
    ]
  }'
```

**Solo con ticket de Jira:**

```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{"jiraTicketId": "PROJ-1234", "repo": "tu-org/tu-repo"}'
```

**Aprobar el spec cuando esté `spec_ready`:**

```bash
curl -X POST http://localhost:3000/jobs/<JOB_ID>/approve \
  -H "Content-Type: application/json" \
  -d '{"approved": true}'
```

### 6. Demo automático (todo en un comando)

```bash
./scripts/demo.sh flutter      # Modo A + Flutter
./scripts/demo.sh ios b        # Modo B (CLI) + iOS
./scripts/demo.sh android c    # Modo C (Webhook) + Android
```

---

## Integración con Jira

El sistema lee del ticket: título, descripción, criterios de aceptación, URL de Figma.

**Plataforma inferida en orden:**

1. Labels del ticket — `flutter`, `ios`, `android`, `flutter_web`
2. Prefijo del título — `[MOBILE]` → `DEFAULT_PLATFORM`, `[WEB]` → `flutter_web`
3. Palabras clave en el título — `swift`, `kotlin`, etc.
4. Variable `DEFAULT_PLATFORM` en `.env`

**Repo:** si el ticket no tiene label `repo:org/nombre`, pásalo en el body del request.

> `JIRA_BASE_URL` debe ser el subdominio exacto de tu tenant (ej. `https://tu-org.atlassian.net`). Un subdominio incorrecto da error 404.

---

## Documentación completa

| Documento                                                                  | Descripción                                            |
| -------------------------------------------------------------------------- | ------------------------------------------------------ |
| **[`docs/guides/quick-start.md`](docs/guides/quick-start.md)**             | Guía completa paso a paso de los 3 modos               |
| **[`docs/guides/demo.md`](docs/guides/demo.md)**                           | Demo con comandos listos para copiar                   |
| **[`API.md`](API.md)**                                                     | Referencia completa de endpoints REST + Webhook        |
| **[`docs/engineering/architecture.md`](docs/engineering/architecture.md)** | Arquitectura interna, máquina de estados, agentes      |
| **[`docs/guides/setup.md`](docs/guides/setup.md)**                         | Setup detallado por plataforma (Flutter, iOS, Android) |
| **[`docs/INDEX.md`](docs/INDEX.md)**                                       | Mapa completo de toda la documentación                 |
| **[`AGENTS.md`](AGENTS.md)**                                               | Mapa de navegación para agentes IA (Claude Code mode)  |

---

## License

MIT
