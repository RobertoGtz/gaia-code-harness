# Setup Checklist - Gaia Code Harness

> Checklist para verificar que todo está listo
> Ticket: RPCO-37575

---

## ✅ Setup Local

### Requisitos Previos

- [ ] Node.js 18+ instalado (`node --version`)
- [ ] PostgreSQL 14+ instalado (`psql --version`) o Docker
- [ ] Git instalado (`git --version`)
- [ ] Flutter SDK (para demo Flutter, `flutter --version`)
- [ ] Swift 5.9+ (para demo iOS, `swift --version`, opcional)
- [ ] Java/JDK 17+ (para demo Android, `java -version`, opcional)

### Paso 1: Base de Datos

```bash
# Crear base de datos
createdb gaia_harness

# Verificar
psql -c "\l" | grep gaia_harness
```

- [ ] Base de datos creada

### Paso 2: Variables de Entorno

```bash
cp .env.example .env
# Editar .env con tus valores
```

**Mínimo requerido:**

```bash
PORT=3000
DATABASE_URL=postgresql://localhost:5432/gaia_harness
```

- [ ] `.env` creado
- [ ] `PORT` configurado
- [ ] `DATABASE_URL` configurado

### Paso 3: Instalación

```bash
cd ~/Desktop/gaia-code-harness
npm install
```

- [ ] `npm install` completado sin errores

### Paso 4: Inicializar DB

```bash
npm run db:init
```

- [ ] Tablas creadas exitosamente
- [ ] Mensaje: "Database initialized"

### Paso 5: Compilar

```bash
npm run build
```

- [ ] Compilación exitosa
- [ ] Carpeta `dist/` creada

### Paso 6: Iniciar Server

```bash
npm run dev
```

- [ ] Server iniciado en puerto 3000
- [ ] Mensaje: "Server running on port 3000"

### Paso 7: Verificar Health

```bash
curl http://localhost:3000/health
```

- [ ] Responde: `{"status":"ok"}`

---

## ✅ Pruebas

### Test 1: Crear Job

```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "fullContext": {
      "title": "Test de setup",
      "acceptanceCriteria": ["WHEN test THEN success"],
      "platform": "flutter",
      "repo": "test-repo"
    }
  }'
```

- [ ] Job creado (status 201)
- [ ] Devuelve ID del job

### Test 2: Listar Jobs

```bash
curl http://localhost:3000/jobs
```

- [ ] Lista de jobs devuelta
- [ ] Job creado aparece en la lista

### Test 3: Obtener Job

```bash
curl http://localhost:3000/jobs/$JOB_ID
```

- [ ] Job detalles devueltos
- [ ] Status es "pending" o "spec_generating"

### Test 4: Demo Script (Multi-Plataforma)

```bash
./scripts/demo.sh flutter
./scripts/demo.sh ios
./scripts/demo.sh android
```

- [ ] Flutter demo ejecuta sin errores
- [ ] iOS demo ejecuta sin errores
- [ ] Android demo ejecuta sin errores
- [ ] Crea job exitosamente para cada plataforma
- [ ] Genera spec (status: spec_ready)
- [ ] Puede aprobar spec
- [ ] Completa flujo con PR URL (dry-run)

---

## ✅ Setup para Producción (AWS/GCP)

### Requisitos Infraestructura

- [ ] Cuenta AWS/GCP/Azure
- [ ] VPC configurada
- [ ] Subnets públicas y privadas
- [ ] Security groups configurados

### Base de Datos (RDS/Cloud SQL)

- [ ] PostgreSQL 15+ creado
- [ ] Multi-AZ habilitado
- [ ] Backups configurados
- [ ] Security group permite conexiones desde ECS
- [ ] URL de conexión obtenida

### Container Registry

- [ ] ECR (AWS) o Artifact Registry (GCP) configurado
- [ ] Imagen Docker subida

### ECS/Cloud Run

- [ ] Cluster creado
- [ ] Task definition configurada
- [ ] Service con auto-scaling
- [ ] Load balancer configurado
- [ ] Health checks funcionando

### Variables de Entorno (Producción)

```bash
# Server
PORT=3000

# Database (RDS/Cloud SQL)
DATABASE_URL=postgresql://user:pass@host:5432/gaia_harness

# GitHub (para PRs)
GITHUB_TOKEN=ghp_...
GITHUB_OWNER=rappi

# Jira (opcional)
JIRA_BASE_URL=https://rappi.atlassian.net
JIRA_EMAIL=...
JIRA_API_TOKEN=...

# LLM (para generación real)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Workspace (EBS/EFS mount)
REPOS_BASE_PATH=/mnt/gaia-workspace
```

---

## ✅ Pre-Presentación

### Código

- [ ] Última versión del código
- [ ] Sin errores de compilación
- [ ] Scripts ejecutables (`chmod +x scripts/*.sh`)

### Documentación

- [ ] README.md revisado
- [ ] Guion de presentación listo
- [ ] Diagramas de arquitectura preparados

### Demo

- [ ] Server corriendo localmente
- [ ] Base de datos inicializada
- [ ] Demo repos creados (`demo-repo`, `demo-repo-ios`, `demo-repo-android`)
- [ ] Demo script probado para las 3 plataformas
- [ ] Backup plan si demo falla

### DUDAS (para discutir)

- [ ] 18 dudas del README revisadas
- [ ] Prioridad de dudas definida
- [ ] Notas para cada duda

---

## ❌ Troubleshooting Común

### Error: "Cannot find module"

```bash
rm -rf node_modules package-lock.json
npm install
```

### Error: "Connection refused" (PostgreSQL)

```bash
# Verificar PostgreSQL corriendo
brew services start postgresql
# o
docker ps | grep postgres
```

### Error: "Port already in use"

```bash
# Cambiar puerto en .env
PORT=3001
```

### Error: "Database not found"

```bash
createdb gaia_harness
npm run db:init
```

---

## 📊 Métricas de Éxito

| Métrica        | Valor Esperado | Estado |
| -------------- | -------------- | ------ |
| Server startup | < 5 segundos   | ⬜     |
| Health check   | 200 OK         | ⬜     |
| Crear job      | < 2 segundos   | ⬜     |
| Generar spec   | < 30 segundos  | ⬜     |
| Demo completo  | < 3 minutos    | ⬜     |

---

**Ticket:** RPCO-37575
**Última actualización:** 2025-06-11
