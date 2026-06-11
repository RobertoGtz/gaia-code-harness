# Guía de Instalación - Gaia Code Harness

> Setup completo para desarrollo local
> Ticket: RPCO-37575

---

## 📋 Requisitos Previos

- **Node.js** 18+
- **PostgreSQL** 14+
- **Git**
- **Flutter** (para testing con repos reales)

---

## 🚀 Quick Start (5 minutos)

### 1. Clonar y Instalar

```bash
cd ~/Desktop/gaia-code-harness
npm install
```

### 2. Configurar Base de Datos

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

**Mínimo necesario para probar:**

```bash
PORT=3000
DATABASE_URL=postgresql://localhost:5432/gaia_harness
```

### 4. Inicializar Base de Datos

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

## 🔧 Configuración Detallada

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

# Crear un repo Flutter de demo
mkdir -p ~/Desktop/repos/demo-repo
cd ~/Desktop/repos/demo-repo
flutter create . --project-name demo_app
git init && git checkout -b develop
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
   GITHUB_OWNER=rappi
   ```

### Jira API Token (Opcional)

1. Ir a: https://id.atlassian.com/manage-profile/security/api-tokens
2. Crear token
3. Copiar a `.env`:
   ```
   JIRA_BASE_URL=https://rappi.atlassian.net
   JIRA_EMAIL=tu.email@rappi.com
   JIRA_API_TOKEN=xxxxxxxx
   ```

---

## 🧪 Testing

### Verificar Instalación

```bash
# 1. Server corriendo
curl http://localhost:3000/health

# 2. Crear un job de prueba
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "fullContext": {
      "title": "Test de instalación",
      "acceptanceCriteria": ["WHEN test THEN success"],
      "platform": "flutter",
      "repo": "test-repo"
    }
  }'

# 3. Verificar jobs
curl http://localhost:3000/jobs
```

### Run Demo Script

```bash
./scripts/demo.sh
```

---

## 🛠️ Solución de Problemas

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

## 📁 Estructura del Proyecto

```
gaia-code-harness/
├── src/
│   ├── index.ts              # Entry point
│   ├── types/                # TypeScript types
│   ├── db/                   # PostgreSQL
│   ├── api/                  # REST API
│   ├── agents/               # Agentes por plataforma
│   │   ├── base.ts           # BaseAgent abstract class
│   │   ├── registry.ts       # Factory: selecciona agentes según platform
│   │   ├── flutter/          # Agentes Flutter/Dart
│   │   ├── ios/              # Agentes iOS/Swift
│   │   └── android/          # Agentes Android/Kotlin
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

## 🎯 Próximos Pasos

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
   - `docs/ARCHITECTURE.md` - Arquitectura profunda
   - `API.md` - Referencia API
   - `PLUGINS.md` - Custom agents

---

## ✅ Checklist de Verificación

- [ ] Node.js 18+ instalado
- [ ] PostgreSQL corriendo
- [ ] `npm install` completado
- [ ] `.env` configurado
- [ ] `npm run db:init` exitoso
- [ ] `npm run build` sin errores
- [ ] `curl http://localhost:3000/health` responde OK
- [ ] Demo script funciona

---

**¿Problemas?** Revisar `PROJECT_REVIEW.md` para diagnóstico detallado.
