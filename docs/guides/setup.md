# Guía de Instalación — GAIA Code Harness

> Setup completo para desarrollo local

---

## Requisitos Previos

| Requisito      | Modo A (HTTP API) |   Modo B (CLI)    | Modo C (Webhook)  |
| -------------- | :---------------: | :---------------: | :---------------: |
| Node.js 18+    |        ✅         |        ✅         |        ✅         |
| PostgreSQL 14+ |        ✅         |  ❌ no necesario  |        ✅         |
| Git            |        ✅         |        ✅         |        ✅         |
| Flutter SDK    | Solo jobs Flutter | Solo jobs Flutter | Solo jobs Flutter |
| Swift 5.9+     |   Solo jobs iOS   |   Solo jobs iOS   |   Solo jobs iOS   |
| JDK 17+        | Solo jobs Android | Solo jobs Android | Solo jobs Android |

---

## Quick Start (5 minutos)

### 1. Clonar y Instalar

```bash
cd ~/Desktop/gaia-code-harness
npm install
```

### 2. Configurar Base de Datos _(Modos A y C — omitir en Modo B)_

```bash
# Crear base de datos
createdb gaia_harness

# O con psql:
psql -c "CREATE DATABASE gaia_harness;"
```

### 3. Configurar Variables de Entorno

```bash
cp .env.example .env
# Editar .env con tus credenciales
```

**Mínimo necesario — Modos A y C (servidor HTTP):**

```bash
PORT=3000
DATABASE_URL=postgresql://localhost:5432/gaia_harness
OPENAI_API_KEY=sk-...        # o ANTHROPIC_API_KEY
GITHUB_TOKEN=ghp_...
GITHUB_OWNER=mi-org
```

**Mínimo necesario — Modo B (CLI, sin Postgres):**

```bash
OPENAI_API_KEY=sk-...        # o ANTHROPIC_API_KEY
GITHUB_TOKEN=ghp_...
GITHUB_OWNER=mi-org
```

### 4. Inicializar Base de Datos _(Modos A y C — omitir en Modo B)_

```bash
npm run db:init
```

### 5. Compilar y Correr

```bash
npm run build
npm start
```

O en modo desarrollo (con auto-reload):

```bash
npm run dev
```

### 6. Verificar

```bash
curl http://localhost:3000/health
```

Debería responder:

```json
{ "status": "ok", "timestamp": "2024-01-15T..." }
```

---

## Configuración Detallada

### Base de Datos PostgreSQL

#### Opción A: PostgreSQL Local

```bash
# macOS con Homebrew
brew install postgresql
brew services start postgresql

# Crear usuario y DB
psql -c "CREATE DATABASE gaia_harness;"
```

#### Opción B: Docker (Recomendado para demo)

```bash
docker run -d \
  --name gaia-postgres \
  -e POSTGRES_DB=gaia_harness \
  -e POSTGRES_USER=user \
  -e POSTGRES_PASSWORD=pass \
  -p 5432:5432 \
  postgres:15
```

Con Docker, usa este `DATABASE_URL` en `.env`:

```
DATABASE_URL=postgresql://user:pass@localhost:5432/gaia_harness
```

### Local Repos Path (Para demo sin GitHub)

Si quieres usar repos locales en lugar de clonar desde GitHub:

```bash
# Crear directorio para repos locales
mkdir -p ~/Desktop/repos

# Crear repo Flutter de demo
mkdir -p ~/Desktop/repos/demo-repo
cd ~/Desktop/repos/demo-repo
flutter create . --project-name demo_app
git init && git checkout -b develop
git add . && git commit -m "Initial commit"

# Crear repo iOS de demo (SPM)
mkdir -p ~/Desktop/repos/demo-repo-ios
cd ~/Desktop/repos/demo-repo-ios
git init && git checkout -b develop
# Crear Package.swift, Sources/, Tests/ (ver scripts/demo.sh)
git add . && git commit -m "Initial commit"

# Crear repo Android de demo (Gradle Kotlin DSL)
mkdir -p ~/Desktop/repos/demo-repo-android
cd ~/Desktop/repos/demo-repo-android
git init && git checkout -b develop
# Crear build.gradle.kts, app/, settings.gradle.kts
git add . && git commit -m "Initial commit"
```

Configurar en `.env`:

```
LOCAL_REPOS_PATH=/Users/tu-usuario/Desktop/repos
```

El harness clonará desde el path local (preservando `.git`) en vez de intentar clonar desde GitHub.

### GitHub Token (Opcional para PRs)

1. Ir a: https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Scopes: `repo` (full control)
4. Copiar token a `.env`:
   ```
   GITHUB_TOKEN=ghp_xxxxxxxx
   GITHUB_OWNER=mi-org
   ```

### Jira API Token (Opcional)

1. Ir a: https://id.atlassian.com/manage-profile/security/api-tokens
2. Crear token
3. Copiar a `.env`:
   ```
   JIRA_BASE_URL=https://tu-org.atlassian.net
   JIRA_EMAIL=tu.email@tu-org.com
   JIRA_API_TOKEN=xxxxxxxx
   DEFAULT_PLATFORM=flutter          # plataforma si el ticket no tiene label
   DEFAULT_REPO=mi-org/mi-repo       # repo si el ticket no tiene label repo:
   ```

---

## Testing

### Verificar Instalación

```bash
# 1. Server corriendo
curl http://localhost:3000/health

# 2. Crear un job de prueba (formato flat)
curl -s -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test de instalación",
    "platform": "flutter",
    "repo": "mi-org/demo-repo",
    "acceptanceCriteria": [
      {"id":"ac-1","text":"WHEN test THEN success","testable":true}
    ]
  }'

# 3. Verificar jobs
curl http://localhost:3000/jobs
```

### Run Demo Script

```bash
# Flutter (default)
./scripts/demo.sh flutter

# iOS/Swift
./scripts/demo.sh ios

# Android/Kotlin
./scripts/demo.sh android
```

---

## Solución de Problemas

### Error: "Cannot find module"

```bash
# Limpiar y reinstalar
rm -rf node_modules package-lock.json
npm install
```

### Error: "Connection refused" (PostgreSQL)

```bash
# Verificar PostgreSQL corriendo
brew services list | grep postgresql
# o
docker ps | grep postgres

# Verificar credenciales en .env
```

### Error: "Port already in use"

```bash
# Cambiar puerto en .env
PORT=3001
```

### Error: "Flutter not found"

```bash
# Instalar Flutter (solo para testing real)
https://docs.flutter.dev/get-started/install
```

---

## Estructura del Proyecto

```
gaia-code-harness/
├── src/
│   ├── index.ts              # Entry point
│   ├── types/                # TypeScript types
│   ├── db/                   # PostgreSQL
│   ├── api/                  # REST API
│   ├── agents/               # Agentes genéricos (platform-agnostic)
│   │   ├── base.ts           # BaseAgent abstract class
│   │   ├── spec-author.ts    # SpecAuthorAgent
│   │   ├── implementer.ts    # ImplementerAgent (+ executeTDD)
│   │   ├── reviewer.ts       # ReviewerAgent
│   │   └── mutation-tester.ts# MutationTesterAgent
│   ├── skills/               # Lógica específica por plataforma
│   │   ├── flutter/          # FlutterSkill
│   │   ├── flutter_web/      # FlutterWebSkill
│   │   ├── ios/              # IosSkill
│   │   └── android/          # AndroidSkill
│   ├── harness/              # Orchestrator (Leader)
│   └── tools/                # Utilidades compartidas
│       ├── file.ts           # Operaciones de archivos
│       ├── git.ts            # Git + GitHub API (con dry-run)
│       ├── repo.ts           # Setup de repositorios (shared)
│       ├── test-runner.ts    # Flutter test, dart analyze, pub get
│       ├── xcode-runner.ts   # swift test, swiftlint, xcodebuild
│       └── gradle-runner.ts  # gradle test, lint, build
├── docs/                     # Documentación
├── scripts/                  # Demo & presentación
├── package.json             # Dependencias
├── tsconfig.json            # TypeScript config
└── .env.example             # Template env vars
```

---

## Próximos Pasos

1. **Verificar setup:**

   ```bash
   npm run build
   npm start
   ```

2. **Correr demo:**

   ```bash
   ./scripts/demo.sh
   ```

3. **Explorar documentación:**
   - [`docs/guides/testing.md`](testing.md) — Comandos por modo (A/B/C)
   - [`docs/engineering/architecture.md`](../engineering/architecture.md) — Arquitectura profunda
   - [`API.md`](../../API.md) — Referencia API completa

---

## Checklist de Verificación

- [ ] Node.js 18+ instalado
- [ ] PostgreSQL corriendo _(solo Modos A y C)_
- [ ] `npm install` completado
- [ ] `.env` configurado
- [ ] `npm run db:init` exitoso _(solo Modos A y C)_
- [ ] `npm run build` sin errores
- [ ] `curl http://localhost:3000/health` responde OK _(Modos A y C)_
- [ ] Demo script funciona (`./scripts/demo.sh flutter`, `ios`, `android`)

---

**¿Problemas?** Ver la tabla de troubleshooting en [`docs/guides/testing.md`](testing.md#troubleshooting).
