# Gaia Code Harness 🤖

> **Code Generation Harness** para la plataforma Gaia - Implementa **Spec-Driven Development** con **Harness Engineering**.

## ¿Qué es esto?

Este proyecto es el **puente entre las iniciativas de producto en Gaia y el código real en los repos de Rappi**.

Cuando un Product Manager crea una iniciativa en Gaia (ej: "Agregar modo oscuro"), este harness:

1. **Genera** una especificación técnica detallada (requirements + design + tasks)
2. **Espera** aprobación humana del spec antes de tocar código
3. **Implementa** los cambios en el repo (Flutter/iOS/Android/Backend)
4. **Valida** que los tests pasan
5. **Crea** un Pull Request en GitHub
6. **Actualiza** el ticket de Jira con el link al PR

Todo esto siguiendo los principios de **Harness Engineering** para controlar la IA y **Spec-Driven Development** para mantener la calidad.

---

## ¿Por qué existe?

### El problema

- Las herramientas de IA generan código rápido pero sin control
- Los specs de producto no se traducen automáticamente a código
- No hay validación automática de que el código cumple los requisitos
- El contexto se pierde entre producto, diseño y desarrollo

### La solución (Harness Engineering)

En lugar de dejar la IA libre, le ponemos un **arnés** (harness):

- **Herramientas controladas**: Solo puede usar read/search/patch/test/create-pr
- **Memoria externa**: El estado vive en PostgreSQL, no en el contexto del LLM
- **Multi-agentes**: Cada agente hace una cosa y la hace bien
- **Verificación obligatoria**: Tests deben pasar, lint debe pasar, humano debe aprobar
- **Auditoría completa**: Todo se loguea, todo es trazable

### Inspiración

- **Vercel**: Eliminaron 80% de herramientas de sus agentes → 3x velocidad
- **Antropic**: Artículo sobre cómo construir arneses efectivos
- **Spec-Driven Development**: La especificación es la fuente de verdad, no el código

---

## Arquitectura en 30 segundos

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   GAIA      │────→│  Code Harness    │────→│  REPO RAPPI     │
│  Platform   │     │  (this service)  │     │  (Flutter/iOS)  │
└─────────────┘     └──────────────────┘     └─────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │  JIRA    │    │  Postgre │    │  GitHub  │
    │  (MCP)   │    │   SQL    │    │   (PR)   │
    └──────────┘    └──────────┘    └──────────┘
```

**Flujo:**

1. Gaia manda POST `/jobs` con criterios de aceptación
2. **SpecAuthor** genera spec (requirements + design + tasks)
3. **Humano aprueba** el spec en la UI de Gaia
4. **Implementer** modifica código y ejecuta tests
5. **Reviewer** valida y crea PR en GitHub
6. Jira se actualiza con link al PR

**Ver documentación completa:**

- 📚 [`docs/SETUP.md`](./docs/SETUP.md) - Guía de instalación paso a paso
- 🏗️ [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) - Arquitectura detallada
- 🎬 [`scripts/demo.sh`](./scripts/demo.sh) - Script de demo interactivo

---

## Instalación Rápida (5 minutos)

### Prerrequisitos

```bash
# Verificar que tienes todo instalado
node --version        # v18+
psql --version        # 14+
flutter --version     # 3.35+
which melos           # debe existir
```

### Setup

```bash
# 1. Clonar y entrar
cd ~/Desktop/gaia-code-harness

# 2. Instalar dependencias
npm install

# 3. Configurar PostgreSQL
createdb gaia_harness    # crear DB

# 4. Configurar variables de entorno
cp .env.example .env
# Editar .env con:
# - DATABASE_URL
# - GITHUB_TOKEN (desde https://github.com/settings/tokens)
# - GITHUB_OWNER=rappi

# 5. Inicializar DB y compilar
npm run db:init
npm run build

# 6. Correr!
npm run dev
```

**Servidor corriendo en:** `http://localhost:3000`

---

## Demo Interactivo 🎬

```bash
# Ejecutar demo automático (todos los pasos)
./scripts/demo.sh

# O modo interactivo paso a paso
./scripts/demo.sh interactive

# O verificar salud del sistema
./scripts/demo.sh health
```

**El demo te muestra:**

1. Cómo crear un job desde cero
2. Cómo se genera el spec automáticamente
3. Dónde el humano debe aprobar
4. Cómo se implementa el código
5. Cómo se crea el PR en GitHub

---

## API Endpoints

### Crear un job de generación de código

```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "jiraTicketId": "RPP-1234",
    "fullContext": {
      "title": "Agregar banner de promociones",
      "acceptanceCriteria": [
        "WHEN usuario abre home THEN mostrar banner carousel",
        "WHEN hay >3 promos THEN mostrar dots de paginación",
        "WHEN toca banner THEN navegar a /promos"
      ],
      "platform": "flutter",
      "repo": "rpp-pyme-multiplatform",
      "module": "pay_multiplatform_home_web",
      "targetBranch": "develop",
      "figmaUrl": "https://figma.com/..."
    }
  }'
```

**Response:**

```json
{
  "job": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "pending",
    "title": "Agregar banner de promociones",
    "acceptanceCriteria": [...]
  }
}
```

### Ver estado del job

```bash
curl http://localhost:3000/jobs/{jobId}
```

**Response:**

```json
{
  "job": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "spec_ready",
    "title": "Agregar banner de promociones",
    "spec": {
      "requirements": [...],
      "design": { "affectedFiles": [...] },
      "tasks": [...]
    }
  }
}
```

### Aprobar spec (human in the loop) ✅

```bash
curl -X POST http://localhost:3000/jobs/{jobId}/approve \
  -H "Content-Type: application/json" \
  -d '{"approved": true}'
```

Esto desbloquea la implementación. Sin este paso, el harness **no toca el código**.

### Listar todos los jobs

```bash
curl http://localhost:3000/jobs
```

### Reintentar job fallido

```bash
curl -X POST http://localhost:3000/jobs/{jobId}/retry
```

---

## Flujo de Estados (Máquina de Estados)

```
┌──────────┐
│  START   │
└────┬─────┘
     │
     ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   PENDING    │────→│ FETCHING_JIRA│────→│SPEC_GENERAT- │
└──────────────┘     │ (lee ticket) │     │   ING        │
     │               └──────────────┘     └──────┬───────┘
     │                                           │
     │         ┌─────────────────┐               │
     │         │ SPEC_AUTHOR     │◄──────────────┘
     │         │ - Genera specs  │
     │         └────────┬────────┘
     │                  │
     │    ┌─────────────▼──────────┐
     │    │   SPEC_READY           │
     │    │   ⏸️ PAUSA HUMANA      │◄────── Aquí el humano decide
     │    │                        │
     │    │   POST /jobs/:id/      │
     │    │   approve              │
     │    └─────────────┬──────────┘
     │                  │
     │    ┌─────────────▼──────────┐
     │    │   SPEC_APPROVED       │
     │    └─────────────┬──────────┘
     │                  │
     │    ┌─────────────▼──────────┐
     │    │   IMPLEMENTING        │
     │    │   - Crea branch       │
     │    │   - Modifica código   │
     │    │   - Corre tests       │
     │    │   - Commit & push     │
     │    └─────────────┬──────────┘
     │                  │
     │    ┌─────────────▼──────────┐
     │    │   REVIEWING           │
     │    │   - Valida tests      │
     │    │   - Dart analyze      │
     │    │   - Crea PR GitHub    │
     │    │   - Comenta Jira      │
     │    └─────────────┬──────────┘
     │                  │
     │    ┌─────────────▼──────────┐
     └────┤   DONE ✅              │
          └───────────────────────┘

┌──────────┐
│  FAILED  │◄────── Cualquier error (con reintentos)
└────┬─────┘
     │ POST /jobs/:id/retry
     └────────────────────────────────→ PENDING
```

---

## Agentes (El Corazón del Sistema)

### 🤖 SpecAuthor

**Propósito:** Transformar criterios de aceptación de producto en especificación técnica ejecutable.

**Input:**

- Acceptance criteria (formato EARS: "WHEN ... THEN ...")
- Figma URL
- Nombre del módulo
- Estructura del repo

**Output:**

- `requirements.json` - Lista de requerimientos testeables
- `design.json` - Qué archivos tocar, decisiones de arquitectura
- `tasks.json` - Tareas concretas para el implementer
- `risks` - Riesgos técnicos identificados

**Ejemplo:**

```json
{
  "requirements": [
    {
      "id": "req-1",
      "content": "WHEN usuario abre home THEN mostrar banner carousel",
      "sourceAcId": "ac-1"
    }
  ],
  "design": {
    "affectedFiles": ["lib/src/screens/home.dart"],
    "newFiles": ["lib/src/widgets/promo_banner.dart"],
    "architectureDecisions": ["Usar PageView para carousel"]
  },
  "tasks": [
    {
      "id": "T1",
      "description": "Crear PromoBanner widget",
      "filePath": "lib/src/widgets/promo_banner.dart",
      "type": "create",
      "status": "pending"
    }
  ]
}
```

### 🔧 Implementer

**Propósito:** Ejecutar las tareas del spec y modificar el código real.

**Pasos:**

1. Verificar entorno Flutter (`flutter doctor`, `melos --version`)
2. Clonar repo o usar copia local
3. Crear branch (`feature/RPP-1234-nombre-de-la-feature`)
4. Ejecutar `melos bootstrap`
5. Para cada tarea en `tasks.json`:
   - Leer archivo existente (si es modify)
   - Generar/Modificar código (con LLM o mock)
   - Aplicar cambios
   - Marcar tarea como done
6. Ejecutar `flutter test`
7. Si pasan: commit y push
8. Si fallan: reportar error y retry (máximo 3 veces)

**Restricciones de seguridad:**

- ❌ No puede borrar carpetas completas
- ❌ No puede tocar archivos fuera del módulo
- ❌ No puede modificar CI/CD sin aprobación
- ❌ No puede tocar más de `maxFilesToTouch` archivos

### 🔍 Reviewer

**Propósito:** Validar que la implementación cumple el spec y crear el PR.

**Validaciones:**

1. ✅ Tests pasan (`flutter test` exit code 0)
2. ✅ Linting pasa (`dart analyze` sin errores)
3. ✅ Cantidad de archivos ≤ `maxFilesToTouch`
4. ✅ Trazabilidad: todas las tareas del spec están done
5. ✅ No hay archivos sospechosos (CI, secrets, etc.)

**Si pasa:**

1. Crear PR en GitHub vía API
2. Comentar en Jira con link al PR
3. Marcar job como done

**Si falla:**

- Regresar a estado IMPLEMENTING
- Incluir el error específico en los logs
- Permitir reintento (hasta 3 veces)

---

## Variables de Entorno (.env)

### Obligatorias

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/gaia_harness

# GitHub (para crear PRs)
# Obtener token desde: https://github.com/settings/tokens
# Scope requerido: 'repo' (Full control of private repositories)
GITHUB_TOKEN=ghp_your_github_personal_access_token
GITHUB_OWNER=rappi  # GitHub organization o user name
```

### Opcionales (para integraciones)

```bash
# Jira (para leer tickets y comentar)
JIRA_BASE_URL=https://rappi.atlassian.net
JIRA_EMAIL=your.email@rappi.com
JIRA_API_TOKEN=your_jira_api_token

# LLM (para generación real de código - si no, usa mocks)
OPENAI_API_KEY=sk-your_openai_key
ANTHROPIC_API_KEY=sk-ant-your_anthropic_key

# Paths
REPOS_BASE_PATH=/tmp/gaia-workspace
LOCAL_REPOS_PATH=/Users/robertogutierrezgonzalez/Desktop/repos
PORT=3000
```

---

## Integración con Gaia

### Cómo conectar

1. **Gaia manda POST a tu harness:**

   ```
   POST http://harness-url:3000/jobs
   {
     "jiraTicketId": "RPP-1234",
     "fullContext": { ... }
   }
   ```

2. **Harness responde con jobId:**

   ```
   { "job": { "id": "uuid", "status": "pending" } }
   ```

3. **Gaia muestra estado en UI:**
   - Polling a `GET /jobs/{jobId}` cada 5 segundos
   - O webhook cuando el harness notifique cambios

4. **Gaia muestra spec para aprobación:**
   - Cuando `status` sea `spec_ready`
   - Renderizar `spec.requirements`, `spec.design`, `spec.tasks`
   - Botón "Aprobar y continuar"

5. **Gaia llama approve:**

   ```
   POST /jobs/{jobId}/approve
   { "approved": true }
   ```

6. **Gaia muestra progreso de implementación:**
   - `currentAgent`, `progressLogs`
   - Link al PR cuando `status` sea `pr_created`

### Webhooks (Futuro)

```bash
# Harness puede llamar webhook de Gaia para notificar:
POST https://gaia.internal/webhooks/harness/progress
{
  "jobId": "uuid",
  "status": "spec_ready",
  "message": "Spec generated, waiting for approval"
}
```

---

## Principios Aplicados

### 1. Harness Engineering

> "Un arnés no es darle más herramientas a la IA, es darle las herramientas correctas con límites claros."

- **Vercel lo demostró:** Eliminaron 80% de tools → 3x velocidad, 37% menos tokens
- **Nuestra aplicación:** Solo 5 tools (read, search, patch, test, git)

### 2. Spec-Driven Development

> "El spec es la fuente de verdad. El código es un artefacto derivado."

- **Producto escribe:** Acceptance criteria en formato EARS
- **SpecAuthor genera:** Requirements + Design + Tasks
- **Humano aprueba:** Antes de que se toque código
- **Implementer ejecuta:** Contra el spec aprobado
- **Reviewer valida:** Que el código cumple el spec

### 3. Memoria Externa

> "La ventana de contexto del LLM se degrada después del 20-40%."

- Todo el estado va a PostgreSQL
- Los specs se guardan en archivos JSON
- Los logs son trazables
- Cada agente recibe solo el contexto mínimo necesario

### 4. Human-in-the-loop

> "Nunca dejes la IA trabajando 24h sola."

- Aprobación humana del spec (obligatoria)
- Revisión del PR antes de merge (en GitHub)
- Retry manual si falla (con contexto del error)

### 5. Verificación Obligatoria

> "El código debe demostrar que funciona, no solo parecer que funciona."

- Tests deben pasar (no negociable)
- Lint debe pasar (no negociable)
- Trazabilidad spec→código (no negociable)

---

## Próximos Pasos (TODO)

### Alta Prioridad (MVP)

- [x] Arquitectura base con Fastify + PostgreSQL
- [x] Agentes: SpecAuthor, Implementer, Reviewer
- [x] GitHub integration (crear PRs)
- [ ] Integrar LLM real (OpenAI/Anthropic)
- [ ] MCP Jira (leer tickets reales)
- [ ] Tests con repo real de Rappi

### Media Prioridad

- [ ] Corrección automática de errores (retry loop inteligente)
- [ ] WebSocket para UI en tiempo real
- [ ] Caché de análisis de repos
- [ ] Queue system (BullMQ + Redis)
- [ ] Soporte iOS nativo (Swift/Xcode)
- [ ] Soporte Android nativo (Kotlin)
- [ ] Soporte Backend (Node/Python/Go)

### Baja Prioridad

- [ ] Plugin system para custom agents
- [ ] Métricas y observabilidad (Datadog/Grafana)
- [ ] Vector DB para semantic search
- [ ] Multi-idioma (specs en español/inglés)
- [ ] Auto-mejoramiento del harness (meta-learning)

---

## Dudas y Preguntas Abiertas 🤔

### Arquitectura y Diseño

1. **¿Deberíamos usar un message queue (Redis/BullMQ) en lugar de llamadas síncronas?**
   - _Contexto:_ Ahora el Leader llama agentes directamente. Si un job tarda 10 minutos, el request HTTP se queda esperando.
   - _Opciones:_
     - A) Mantener síncrono (más simple, más lento)
     - B) Async con job queue (más complejo, más escalable)
   - _Mi opinión:_ Empezar con A, migrar a B cuando tengamos >100 jobs/día.

2. **¿Dónde debería vivir el spec aprobado?**
   - _Opción A:_ En la DB (como ahora) - más fácil de query, más lento de leer para humanos
   - _Opción B:_ En el repo de código (ej: `.gaia/specs/RPP-1234.md`) - versionado con git, más transparente
   - _Opción C:_ Ambos - DB para queries, archivos para humanos
   - _Pregunta:_ ¿Los devs quieren ver los specs en el repo? ¿O solo en Gaia?

3. **¿Cómo manejamos dependencias entre jobs?**
   - Ej: Job B depende de que Job A esté mergeado
   - ¿Block until A is done? ¿Crear PR draft? ¿Auto-merge A si pasa CI?

### Integración con Rappi

4. **¿Tenemos acceso a crear PRs en los repos de GitHub?**
   - Necesitamos un token con scope `repo` para la org `rappi`
   - ¿Quién genera este token? ¿Cuál es el proceso de seguridad?

5. **¿Cómo corremos `flutter test` en los repos de Rappi?**
   - Opción A: En la máquina local donde corre el harness (requiere Flutter instalado)
   - Opción B: En CI (GitHub Actions) - el harness crea PR, CI corre tests
   - Opción C: En contenedor Docker con Flutter preinstalado
   - _Nota:_ Los repos de Rappi usan Melos, necesitamos `melos bs` antes de tests.

6. **¿Qué pasa si el repo tiene dependencias privadas?**
   - Ej: Otros packages de Rappi en GitHub Packages o private npm
   - ¿El harness necesita auth adicional para `flutter pub get`?

### Seguridad y Permisos

7. **¿Quién puede aprobar specs?**
   - ¿Cualquiera con acceso a Gaia?
   - ¿Solo tech leads?
   - ¿El owner del módulo?
   - ¿Requerimos CODEOWNERS en el PR de GitHub?

8. **¿Qué archivos NUNCA debería tocar el harness?**
   - CI/CD (.github/workflows/, bitbucket-pipelines.yml)
   - Secrets (cualquier archivo con "secret", "key", "password")
   - Configuración de infraestructura (Terraform, K8s)
   - ¿Dónde definimos esta lista? ¿En el repo (`.gaia/ignore`)? ¿En la DB?

9. **¿Cómo auditamos qué hizo el harness?**
   - Logs en DB (tenemos esto)
   - ¿Video/GIF de los cambios? (como Vercel hace con deploys)
   - ¿Diff interactivo antes de aprobar?

### UX y Producto

10. **¿Cómo se ve el spec en la UI de Gaia?**
    - ¿Tabla con requerimientos? ¿Diagrama de flujo? ¿Markdown renderizado?
    - ¿Mostramos el diff estimado antes de aprobar?

11. **¿Qué pasa si el humano rechaza el spec?**
    - ¿Vuelve a SpecAuthor con feedback? (loop)
    - ¿Se cancela el job? (requiere nuevo POST)
    - ¿El humano edita el spec directamente?

12. **¿Cómo manejamos errores de CI?**
    - El harness crea PR → GitHub Actions corre tests → Falla
    - ¿El harness intenta auto-corregir? (muy peligroso)
    - ¿Notifica al humano con el error? (más seguro)
    - ¿Cuántos reintentos automáticos? (mi recomendación: 0)

### Técnico

13. **¿Usamos OpenAI o Anthropic?**
    - GPT-4 Turbo: Mejor en código, más caro, rate limits
    - Claude 3.5 Sonnet: Mejor en seguir instrucciones, más barato
    - ¿Ambos con fallback?

14. **¿Cómo parseamos `flutter test --machine` correctamente?**
    - El output es JSON lines, pero hay casos edge (crashes, timeouts)
    - ¿Necesitamos usar `xcresult` para iOS?

15. **¿Cómo manejamos repos muy grandes?**
    - El monorepo de Rappi tiene cientos de packages
    - ¿Clonamos todo? ¿Solo el módulo afectado?
    - ¿Usamos sparse checkout?

### Negocio

16. **¿Cuál es el ROI esperado?**
    - ¿Tiempo ahorrado por feature?
    - ¿Reducción de bugs?
    - ¿Costo de LLM tokens vs salario de dev?
    - ¿Métricas de éxito?

17. **¿Qué pasa si el harness está mal?**
    - ¿Rollback strategy?
    - ¿Kill switch para deshabilitar?
    - ¿Quién tiene pager duty?

18. **¿Los agentes deben ser centralizados o específicos por proyecto?**
    - **Opción A:** Agentes genéricos en el harness (más simple, menos personalizado)
    - **Opción B:** Agentes en cada repo `.gaia/agents/` (más personalizado, más complejo)
    - **Opción C:** Hybrid - base genérica + overrides por proyecto (RECOMMENDED)
    - _Nota:_ Ya implementamos el plugin system ([PLUGINS.md](./PLUGINS.md)). Cada equipo puede tener agentes que entiendan sus convenciones específicas (Rappi Flutter, Rappi iOS, etc.)

---

## Cómo Contribuir

```bash
# 1. Fork y clone
git clone https://github.com/rappi/gaia-code-harness.git

# 2. Branch
git checkout -b feature/mi-cambio

# 3. Cambios
# ... editar código ...

# 4. Test
npm test

# 5. Commit
git commit -m "feat: descripción clara"

# 6. PR
gh pr create --title "feat: ..." --body "..."
```

---

## Equipo y Contacto

- **Owner:** [Tu nombre] - [tu email]
- **Slack:** #gaia-code-harness
- **Notion:** [Link a documentación interna]
- **On-call:** [Link a PagerDuty/Opsgenie]

---

## Licencia

Proyecto privado de Rappi. No distribuir fuera de la organización.

---
