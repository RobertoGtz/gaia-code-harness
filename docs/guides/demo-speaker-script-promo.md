# Demo Speaker Script — Carrusel de Promociones (Flutter)

Guion para presentar GAIA Code Harness con una feature realista: **"Agregar banner de promociones"** en un módulo Flutter. Incluye ejecución en **modo CLI** y **modo `.claude`**, explicación de cada agente y textos para decir en cada fase.

---

## Diapositiva 1 — Título y hook (30 seg)

**Qué decir:**

> "Hoy vamos a ver cómo GAIA Code Harness toma un requerimiento de producto —con Jira, Figma y criterios de aceptación— y lo convierte en un Pull Request real. La feature: un carrusel de promociones en la pantalla de inicio de una app Flutter."

**Mostrar en pantalla:**

```text
GAIA CODE HARNESS
Controlled AI Code Generation

Feature: Agregar banner de promociones (Flutter)
Repo:    mi-org/mi-repo
Ticket:  PROJ-123
Figma:   https://figma.com/file/abc123/promo-banner
```

**Frase clave:**

> "No es magia: es un proceso con spec, aprobación humana, scope controlado y trazabilidad."

---

## Diapositiva 2 — ¿Qué es Harness Engineering? (1 min)

**Qué decir:**

> "En lugar de pedirle a la IA que 'escriba código', le damos un arnés: primero debe proponer un plan, luego un humano lo aprueba, después escribe solo lo autorizado y finalmente pasa por review. Eso es Harness Engineering."

**Mostrar el diagrama:**

```text
Requerimiento (Jira/Figma/ACs)
          │
          ▼
   ┌──────────────┐
   │  SpecAuthor   │  ← analiza el repo y propone plan
   └──────────────┘
          │
          ▼
   ┌──────────────┐
   │   Humano     │  ← aprueba/rechaza el spec
   └──────────────┘
          │
          ▼
   ┌──────────────┐
   │  Implementer │  ← escribe el código
   └──────────────┘
          │
          ▼
   ┌──────────────┐
   │   Reviewer   │  ← valida y crea PR
   └──────────────┘
          │
          ▼
   ┌──────────────┐
   │MutationTester│  ← valida calidad de tests
   └──────────────┘
```

**Puntos a destacar:**

- Especificación antes de código.
- Dos checkpoints humanos: spec y PR.
- La IA nunca mergea: solo abre el PR.
- Scope limitado por `maxFilesToTouch` y el plan técnico.

---

## Diapositiva 3 — Los agentes y qué hace cada uno (1 min)

**Qué decir:**

> "GAIA no es un solo prompt. Son agentes especializados que se encadenan. En el modo CLI/HTTP usamos los agentes TypeScript; en modo `.claude` usamos subagentes conversacionales, pero el trabajo es el mismo."

**Agentes del modo CLI / HTTP (TypeScript):**

| Agente                | Rol                                                         | Entrega                                                |
| --------------------- | ----------------------------------------------------------- | ------------------------------------------------------ |
| `SpecAuthorAgent`     | Lee el repo, entiende convenciones y genera el plan técnico | `TechnicalSpec` JSON + escenarios Gherkin (`.feature`) |
| `ImplementerAgent`    | Escribe/modifica archivos según el spec y los ACs           | Código en una rama feature + commits                   |
| `ReviewerAgent`       | Valida scope, lint/tests y crea el Pull Request             | PR en GitHub con descripción y trazabilidad            |
| `MutationTesterAgent` | Muta el código para ver si los tests detectan cambios       | Mutation score; si es bajo, pide reforzar tests        |

**Agentes del modo `.claude`:**

| Agente            | Rol                                                      | Entrega                           |
| ----------------- | -------------------------------------------------------- | --------------------------------- |
| `craftsman_lead`  | Coordina el pipeline desde el chat                       | Mensajes de progreso y decisiones |
| `spec_partner`    | Conversa contigo para entender la feature                | `project-spec.md`                 |
| `gherkin_author`  | Destila los criterios de aceptación a Gherkin            | `features/<name>.feature`         |
| `tdd_craftsman`   | Implementa código (Red-Green-Refactor si `tddMode=true`) | Código + tests                    |
| `judge`           | Revisa calidad del código                                | `progress/judge_<name>.md`        |
| `mutation_tester` | Mide robustez de tests                                   | `progress/mutation_<name>.md`     |

**Frase clave:**

> "Cada agente tiene una sola responsabilidad. Así podemos depurar, mejorar prompts y auditar qué pasó."

---

## Diapositiva 4 — El job de ejemplo (45 seg)

**Qué decir:**

> "Este es el input que le vamos a dar a GAIA. Tiene ticket de Jira, link de Figma, plataforma, branch objetivo y criterios de aceptación en formato EARS."

**Mostrar el JSON:**

```bash
cat > /tmp/demo-promo-job.json <<'JSON'
{
  "platform": "flutter",
  "title": "Agregar banner de promociones",
  "jiraTicketId": "PROJ-123",
  "repo": "mi-org/mi-repo",
  "module": "home_screen",
  "targetBranch": "develop",
  "description": "Mostrar carrusel de promociones destacadas",
  "figmaUrl": "https://figma.com/file/abc123/promo-banner",
  "tddMode": false,
  "buildStrategy": "resolve",
  "requireTests": true,
  "maxFilesToTouch": 6,
  "acceptanceCriteria": [
    "WHEN user opens home screen THEN display promotional banner carousel",
    "WHEN there are more than 3 promotions THEN show pagination dots"
  ]
}
JSON
```

**Destacar mientras se ve el JSON:**

- `"platform": "flutter"` — GAIA carga el skill de Flutter y conoce la estructura del repo.
- `"module": "home_screen"` — restringe el contexto a un módulo.
- `"maxFilesToTouch": 6` — límite de seguridad de scope.
- `"requireTests": true` — exige tests verdes antes de crear el PR.
- `"tddMode": false` — genera el código de una vez; con `true` haría Red-Green-Refactor test por test.
- `"buildStrategy": "resolve"` — para iOS/Tuist en repos grandes resuelve dependencias sin compilar todo; en Flutter se ajusta al skill.

---

## Diapositiva 5 — Modo CLI: demo paso a paso (2 min)

**Qué decir:**

> "Primero vamos a correr el modo CLI. Es el más rápido para demos: un solo comando, no necesita servidor ni Postgres."

### Paso 1 — Ejecutar sin aprobar (mostrar el spec)

**Comando:**

```bash
cd ~/Desktop/gaia-code-harness
npx ts-node src/cli/run.ts --job /tmp/demo-promo-job.json
```

**Qué decir mientras corre:**

> "El `SpecAuthor` está leyendo el repo, entendiendo convenciones y generando un plan técnico. No escribe código todavía."

**Cuando se detenga en `spec_ready`, mostrar:**

```bash
# ID del job (copiar del output)
JOB_ID=<id>

# Spec técnico generado
cat /tmp/gaia-workspace/$JOB_ID/specs/$JOB_ID/spec.json | jq '.requirements, .design'

# Escenarios Gherkin
cat /tmp/gaia-workspace/$JOB_ID/specs/$JOB_ID/scenarios.feature
```

**Frase clave:**

> "Acá está la puerta humana: vemos el plan antes de que se escriba una línea de código."

### Paso 2 — Aprobar y continuar

**Comando:**

```bash
npx ts-node src/cli/run.ts --id $JOB_ID --approve
```

**Qué decir mientras corre:**

> "Ahora el `Implementer` escribe el código en una rama nueva, el `Reviewer` valida y crea el PR. Todo se guarda en `progress/$JOB_ID.md`."

**Cuando termine, mostrar:**

```bash
# Abrir el PR
open <PR_URL>

# O ver el resumen
git -C /tmp/gaia-workspace/$JOB_ID/repo show --stat HEAD
```

**Puntos a destacar:**

- Rama feature creada automáticamente.
- Solo los archivos que el plan autorizó.
- El PR tiene trazabilidad al job y al spec.

---

## Diapositiva 6 — Modo `.claude`: demo paso a paso (2 min)

**Qué decir:**

> "Ahora veamos el modo `.claude`. En lugar de un comando, conversamos con Claude Code. Es más artesanal y deja ver cada paso."

### Paso 1 — Arrancar desde el chat

**Opción A: automática (igual que CLI, desde el chat)**

```text
/gaia_code_generator --job /tmp/demo-promo-job.json --approve
```

**Opción B: paso a paso con control humano (ejemplo típico de `.claude/commands/gaia_code_generator.md`)**

```text
Implementá la siguiente feature pendiente
```

**Qué decir mientras corre:**

> "Claude actúa como `craftsman_lead`. Lee `AGENTS.md`, `feature_list.json` y `progress/current.md`, ejecuta `./init.sh` y elige la siguiente feature pendiente. Primero delega en `spec_partner` para entender la feature y escribir `project-spec.md`."

### Paso 2 — Mostrar los artefactos del spec

**Archivos a abrir en el IDE:**

```bash
open project-spec.md
open features/agregar-banner-de-promociones.feature
```

**Qué decir:**

> "Acá Claude como `gherkin_author` convirtió los criterios de aceptación en escenarios Gherkin. El humano los lee y aprueba antes de continuar."

**Mensaje de aprobación:**

```text
Aprobado, continuar con la implementación.
```

### Paso 3 — Implementación y review

**Qué decir mientras corre:**

> "Ahora entra `tdd_craftsman` para escribir código. Si `tddMode` está activo, hará Red-Green-Refactor: test rojo, código mínimo, refactor. Luego `judge` revisa calidad y `mutation_tester` valida robustez."

**Artefactos a mostrar:**

```bash
open progress/judge_agregar-banner-de-promociones.md
open progress/mutation_agregar-banner-de-promociones.md
```

**Frase clave:**

> "En `.claude` la IA propone y el humano aprueba cada escenario. Es el mismo pipeline, pero con conversación."

---

## Diapositiva 7 — Comparación CLI vs `.claude` (1 min)

**Mostrar tabla:**

```text
| Aspecto          | Modo CLI                        | Modo .claude                      |
| ---------------- | ------------------------------- | --------------------------------- |
| Cómo arranca     | `npx ts-node src/cli/run.ts ...`| Chat o `/gaia_code_generator`                     |
| Orquestador      | `src/cli/run.ts` + `leader.ts`    | `craftsman_lead` + subagentes    |
| Aprobación spec  | `--approve` (auto)              | Pausa humana en Gherkin           |
| Velocidad        | Más rápido                      | Más lento, más conversación       |
| Ideal para       | Demos, CI/CD, tareas definidas  | Features ambiguas, debugging, TDD |
| Mismo pipeline   | Si                              | Si                                |
```

**Qué decir:**

> "CLI es para velocidad y reproducibilidad. `.claude` es para cuando querés conversar la feature, revisar cada escenario y mostrar TDD. Ambos usan los mismos agentes TypeScript por detrás."

---

## Diapositiva 8 — Qué mostrar del repo resultante (1 min)

**Qué decir:**

> "Una vez generado el PR, mostremos exactamente qué cambió. No hay caja negra."

**Comandos:**

```bash
cd /tmp/gaia-workspace/<JOB_ID>/repo
git branch --show-current
git log --oneline -3
git show --stat HEAD
```

**Qué destacar:**

- Archivos esperados: widget del carrusel, modelos de promoción, provider/StateNotifier, tests, exportaciones.
- No se tocaron archivos de CI/CD, secrets ni infraestructura.
- `pubspec_overrides.yaml`, `build/`, `.dart_tool/` no están en el commit.

**Ver el diff:**

```bash
git show HEAD -- packages/features/home_screen/lib/src/...
```

---

## Diapositiva 9 — Preguntas frecuentes (1 min)

### ¿Por qué `requireTests: true` en este ejemplo?

> "Porque es una feature real de producto. En demos rápidas podemos ponerlo en `false`, pero en producción queremos tests verdes y mutation score alto."

### ¿Y si no tenemos Figma?

> "El `figmaUrl` es opcional. Sin él, el spec se basa solo en descripción y ACs. Con Figma, el agente puede referenciar diseño si hay integración."

### ¿El modo CLI puede leer Jira?

> "Sí. Podés pasar `--jira PROJ-123` y GAIA fetchea título, descripción y ACs. En el job.json también podés incluir `jiraTicketId`."

### ¿Se puede ejecutar en CI?

> "Sí. Modo HTTP API o Webhook. Un GitHub Action puede hacer `POST /webhook/trigger` con el ticket."

### ¿Qué pasa si el spec no me gusta?

> "Lo rechazás con feedback y se regenera. En CLI: `curl -X POST .../approve -d '{"approved":false,"feedback":"..."}'`. En `.claude`: decís 'rechazado, falta ...'."

---

## Diapositiva 10 — Cierre y próximos pasos (30 seg)

**Qué decir:**

> "Lo importante no es que la IA escriba código. Es que lo haga dentro de un proceso que entendemos, controlamos y podemos auditar: spec, aprobación, scope, review, mutation testing."

**Preguntas para la audiencia:**

- "¿Qué modo les interesa más para empezar: CLI, HTTP API o `.claude`?"
- "¿Qué feature de su backlog podríamos pilotear primero?"
- "¿Necesitan integración con Jira, Slack o GitHub Checks?"

**Recursos:**

- `docs/guides/demo-speaker-script-promo.md` — este guion.
- `scripts/present-promo.sh` — script para mostrar las diapositivas.
- `API.md` — referencia de la API REST.
- `docs/guides/claude-mode.md` — guía del modo `.claude`.

---

## Comandos rápidos

```bash
# Crear job JSON
cat > /tmp/demo-promo-job.json <<'JSON'
{
  "platform": "flutter",
  "title": "Agregar banner de promociones",
  "jiraTicketId": "PROJ-123",
  "repo": "mi-org/mi-repo",
  "module": "home_screen",
  "targetBranch": "develop",
  "description": "Mostrar carrusel de promociones destacadas",
  "figmaUrl": "https://figma.com/file/abc123/promo-banner",
  "tddMode": false,
  "buildStrategy": "resolve",
  "requireTests": true,
  "maxFilesToTouch": 6,
  "acceptanceCriteria": [
    "WHEN user opens home screen THEN display promotional banner carousel",
    "WHEN there are more than 3 promotions THEN show pagination dots"
  ]
}
JSON

# Modo CLI paso a paso
npx ts-node src/cli/run.ts --job /tmp/demo-promo-job.json
npx ts-node src/cli/run.ts --id <JOB_ID> --approve

# Modo .claude
# En Claude Code escribir: /gaia_code_generator --job /tmp/demo-promo-job.json --approve
# O para paso a paso: "Implementá la feature PROJ-123: Agregar banner de promociones"

# Ver diff generado
cd /tmp/gaia-workspace/<JOB_ID>/repo
git show --stat HEAD
git show HEAD
```
