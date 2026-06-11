# Checklist para Producción - Gaia Code Harness

> Qué falta para que genere código real, cree PRs reales, y corra de forma remota.

---

## 1. Generación Real de Código

Hoy el código es una plantilla fija (mock). Para que sea real:

### LLM Integration

- [ ] **Elegir proveedor de LLM** — OpenAI (GPT-4 Turbo) o Anthropic (Claude 3.5 Sonnet)
- [ ] **Obtener API key** y guardarla como variable de entorno (`OPENAI_API_KEY` o `ANTHROPIC_API_KEY`)
- [ ] **Instalar SDK** — `npm install openai` o `npm install @anthropic-ai/sdk`
- [ ] **Crear servicio LLM** — `src/tools/llm.ts` con función genérica que envíe prompts y reciba código
- [ ] **Reemplazar `generateMockCode`** en los implementers de cada plataforma (`src/agents/flutter/implementer.ts`, `src/agents/ios/implementer.ts`, `src/agents/android/implementer.ts`) con llamada real al LLM
  - Enviar como contexto: spec tasks, acceptance criteria, código existente del repo, convenciones
  - Parsear la respuesta y extraer los archivos generados
- [ ] **Reemplazar spec mock** en `src/agents/spec-author.ts` con llamada real al LLM
  - Enviar como contexto: estructura del repo, archivos existentes, acceptance criteria
  - Que el LLM genere requirements, tasks, design decisions, y risks reales
- [ ] **Manejar errores de LLM** — reintentos, rate limits, timeouts, respuestas malformadas
- [ ] **Agregar validación de output** — verificar que el código generado compila antes de commitear

### Estimado: 3-5 días de trabajo

---

## 2. Pull Requests Reales en GitHub

Hoy el PR es un dry-run. Para que sea real:

### GitHub Token

- [ ] **Crear GitHub Personal Access Token** con scope `repo`
  - Ir a https://github.com/settings/tokens
  - O usar un GitHub App con permisos instalados en la org
- [ ] **Configurar en `.env`:**
  ```
  GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
  GITHUB_OWNER=tu-org-o-usuario
  ```
- [ ] **Verificar permisos** — el token debe tener acceso de escritura al repo target
- [ ] **El repo debe existir en GitHub** bajo `GITHUB_OWNER/repo-name`

### PR Enhancements (opcional pero recomendado)

- [ ] **PR template** — mejorar el body del PR con checklist de requirements, design decisions, y links a Jira
- [ ] **Labels automáticos** — agregar labels como `ai-generated`, `needs-review`
- [ ] **Reviewers automáticos** — asignar reviewers basados en CODEOWNERS
- [ ] **Branch protection** — asegurar que el PR no se puede mergear sin review humano

### Estimado: 1 día de trabajo (con token ya creado)

---

## 3. Integración con Jira Real

Hoy Jira se salta (se usa `fullContext` directo). Para que sea real:

- [ ] **Obtener credenciales de Jira:**
  ```
  JIRA_BASE_URL=https://tu-org.atlassian.net
  JIRA_EMAIL=tu.email@org.com
  JIRA_API_TOKEN=xxxxx   (desde https://id.atlassian.com/manage-profile/security/api-tokens)
  ```
- [ ] **Implementar `fetchJiraTicket`** en `src/tools/jira.ts` — leer título, descripción, acceptance criteria desde el ticket
- [ ] **Implementar `commentOnJira`** — comentar en el ticket con link al PR cuando se cree
- [ ] **Implementar `transitionJira`** — mover el ticket a "In Review" cuando el PR se cree

### Estimado: 2 días de trabajo

---

## 4. Hacerlo Remoto (Deploy)

Hoy corre en localhost. Para que corra en un servidor:

### Infraestructura Mínima

- [ ] **Dockerizar la app:**
  ```dockerfile
  FROM node:20-alpine
  WORKDIR /app
  COPY package*.json ./
  RUN npm ci --only=production
  COPY . .
  RUN npm run build
  EXPOSE 3000
  CMD ["npm", "start"]
  ```
- [ ] **Crear `docker-compose.yml`** con app + PostgreSQL
- [ ] **PostgreSQL remoto** — usar RDS (AWS), Cloud SQL (GCP), o managed Postgres
- [ ] **Variables de entorno** — configurar secrets en el servidor (no en archivos)

### Toolchains por Plataforma en el Servidor

**Flutter:**

- [ ] **Instalar Flutter en el servidor** — necesario para `flutter test` y `flutter pub get`
  - Opción A: Docker image con Flutter pre-instalado (ej: `cirrusci/flutter`)
  - Opción B: Instalar Flutter en la VM/container
- [ ] **Verificar que `flutter test` funciona** en el ambiente remoto

**iOS/Swift:**

- [ ] **Instalar Swift toolchain** — necesario para `swift test` y `swift build`
  - En macOS: incluido con Xcode
  - En Linux: instalar via swift.org
- [ ] **SwiftLint** (opcional) — `brew install swiftlint` o descargar binario
- [ ] **Verificar que `swift test` funciona** en el ambiente remoto

**Android/Kotlin:**

- [ ] **Instalar JDK 17+** — necesario para Gradle y compilación Kotlin
- [ ] **Instalar Gradle** o usar el wrapper `./gradlew`
- [ ] **Android SDK** (opcional, para builds completos)
- [ ] **Verificar que `gradle test` funciona** en el ambiente remoto

**Compartido:**

- [ ] **Git credentials** — el servidor necesita poder clonar repos privados
  - SSH key o token de acceso configurado

### Opciones de Deploy

| Opción                  | Complejidad | Costo      | Recomendado para |
| ----------------------- | ----------- | ---------- | ---------------- |
| **VM simple** (EC2/GCE) | Baja        | ~$30/mes   | Proof of concept |
| **Docker en VM**        | Media       | ~$30/mes   | Staging          |
| **ECS/Cloud Run**       | Media-Alta  | ~$50/mes   | Producción       |
| **Kubernetes**          | Alta        | ~$100+/mes | Escala grande    |

### Red y Seguridad

- [ ] **HTTPS** — certificado SSL (Let's Encrypt o similar)
- [ ] **Autenticación** — agregar auth a la API (API key, JWT, o OAuth)
- [ ] **Firewall** — solo permitir tráfico de Gaia Platform al harness
- [ ] **Secrets management** — usar AWS Secrets Manager, Vault, o similar
- [ ] **Logs** — centralizar logs (CloudWatch, Datadog, etc.)

### DNS y Acceso

- [ ] **Dominio/URL** — asignar URL accesible (ej: `harness.internal.tu-org.com`)
- [ ] **Conectar con Gaia** — Gaia Platform debe apuntar POST /jobs a la URL del harness

### Estimado: 3-5 días de trabajo (deploy básico en VM)

---

## Resumen de Prioridad

| #   | Qué                       | Esfuerzo | Impacto                                        | Prioridad |
| --- | ------------------------- | -------- | ---------------------------------------------- | --------- |
| 1   | **LLM para código real**  | 3-5 días | Crítico — sin esto no hay valor real           | 🔴 Alta   |
| 2   | **GitHub token para PRs** | 1 día    | Crítico — sin esto no hay output visible       | 🔴 Alta   |
| 3   | **Deploy básico**         | 3-5 días | Necesario — sin esto solo corre local          | 🟡 Media  |
| 4   | **Jira integration**      | 2 días   | Nice to have — se puede seguir con fullContext | 🟢 Baja   |

### Ruta más rápida a "demo real":

1. Conseguir `GITHUB_TOKEN` con acceso al repo → **PRs reales en 1 hora**
2. Agregar `OPENAI_API_KEY` + implementar LLM calls → **código real en 3-5 días**
3. Dockerizar + deploy en VM → **acceso remoto en 2-3 días**

---

## Variables de Entorno para Producción

```bash
# Server
PORT=3000
NODE_ENV=production

# Database (PostgreSQL remoto)
DATABASE_URL=postgresql://user:pass@db-host:5432/gaia_harness

# LLM (elegir uno)
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
# ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxx

# GitHub
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_OWNER=tu-org

# Jira (opcional)
JIRA_BASE_URL=https://tu-org.atlassian.net
JIRA_EMAIL=harness@tu-org.com
JIRA_API_TOKEN=xxxxxxxx

# Workspace
REPOS_BASE_PATH=/tmp/gaia-workspace
# LOCAL_REPOS_PATH no se usa en producción (se clona de GitHub)
```
