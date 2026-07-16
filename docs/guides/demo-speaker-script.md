# Guión para presentador — Demo GAIA en `rpp-cashflow-multiplatform-pyme` (CLI + `.claude`)

> Demo de ~5 minutos usando **Modo B (CLI)** y **Modo `.claude`**. No requiere servidor ni Docker.
> El objetivo es mostrar, con el mismo requerimiento, cómo GAIA genera un Pull Request en cada modo.

---

## Preparación antes de salir a escena

1. Abre una terminal en `~/Desktop/gaia-code-harness`.
2. Verifica que `GITHUB_TOKEN_RPP` esté en el `.env` (token para `rpp-co`).
3. Verifica que `OPENAI_API_KEY` o `ANTHROPIC_API_KEY` estén configuradas.
4. Ejecuta `./init.sh` una vez para validar el entorno.
5. Crea el job de demo en `/tmp/demo-cashflow-job.json`:

```bash
cat > /tmp/demo-cashflow-job.json <<'JSON'
{
  "initiativeId": "demo",
  "title": "Demo: add DemoAnalytics feature with event model and repository to bre_b core",
  "platform": "flutter_web",
  "repo": "rpp-co/rpp-cashflow-multiplatform-pyme",
  "targetBranch": "master",
  "module": "bre_b",
  "description": "Presentation-only demo change: add a DemoAnalyticsEvent model, a DemoAnalyticsRepository class with a logEvent method, and export both from bre_b_core.dart. No business logic changes and no unit tests are required for this demo-only feature.",
  "acceptanceCriteria": [
    "WHEN DemoAnalyticsEvent is constructed THEN it has name, timestamp and payload fields",
    "WHEN DemoAnalyticsRepository.logEvent is called THEN it stores the event in an internal list",
    "WHEN DemoAnalyticsEvent and DemoAnalyticsRepository are exported from bre_b_core.dart THEN they are reachable from the core library"
  ],
  "maxFilesToTouch": 4,
  "requireTests": false,
  "tddMode": false
}
JSON
```

> **Nota:** `requireTests: false` hace que la demo sea rápida y predecible. En producción se usa `true` y GAIA exige tests verdes antes de crear el PR.

6. Limpia PRs de demos anteriores si es necesario (opcional).

---

## ¿Qué es Harness Engineering?

**Qué decir (45 seg):**

> "Antes de mostrar el producto, quiero explicar el concepto. Llamamos a esto **Harness Engineering**. No es dejar que la IA escriba código libremente; es ponerla dentro de un arnés de procesos, reglas y puntos de control."

**Mostrar en pantalla (diapositiva o terminal):**

```
┌─────────────────────────────────────────────────────────┐
│                  HARNESS ENGINEERING                     │
├─────────────────────────────────────────────────────────┤
│  1. Spec-first          → plan antes de código           │
│  2. Human-in-the-loop   → aprobación antes de tocar repo│
│  3. Scope limits        → maxFilesToTouch, allowed dirs│
│  4. Automated validation→ lint + tests + mutation tests│
│  5. Traceability        → PR ↔ spec ↔ ACs ↔ job log   │
│  6. Notifications       → Jira / Slack / GitHub Checks  │
└─────────────────────────────────────────────────────────┘
```

**Analogía útil:**

> "Un arnés de seguridad no impide que trepes; te permite trepar más alto sabiendo que, si resbalas, no caes. Harness Engineering hace lo mismo con la IA: aceleras, pero dentro de guardarraíles."

**Puntos clave a mencionar:**

- Sin spec no hay código.
- Sin aprobación humana no se toca el repo.
- Los límites de scope evitan reescrituras masivas.
- Cada PR es trazable a un spec y a criterios de aceptación.

---

## Cómo mostrar el código durante la demo

Durante la demo vas a mostrar **tres cosas** que demuestran trazabilidad:

### 1. El progreso del job

```bash
# Obtén el ID del job más reciente y ábrelo
ls -t progress/*.md | head -1
# o si conocés el ID
open progress/<JOB_ID>.md
```

**Qué mostrar:** el archivo `progress/<JOB_ID>.md` contiene el status, el spec, los errores y el resumen final. Es la bitácora auditable.

### 2. El spec y los escenarios Gherkin

```bash
# Muestra el spec técnico generado
ls /tmp/gaia-workspace/<JOB_ID>/specs/<JOB_ID>
```

**Qué mostrar:**

- `spec.json` — requerimientos, tareas, archivos afectados, riesgos.
- `scenarios.feature` — escenarios Gherkin que son el contrato ejecutable.

### 3. El diff de código y el PR

```bash
cd /tmp/gaia-workspace/<JOB_ID>/repo
# Resumen de archivos tocados
git show --stat HEAD
# Diff completo
git show HEAD
```

**Qué mostrar:**

- Sólo los archivos que el spec autorizó.
- Cómo se crean `demo_analytics_event.dart` y `demo_analytics_repository.dart`.
- Cómo `bre_b_core.dart` exporta el modelo y el repositorio.
- Ausencia de cambios en CI/CD, secrets, o archivos de infraestructura.

> **Tip:** Si querés resaltar que la IA no toca lo que no debe, corrés `git show --stat HEAD` y mostrás que los archivos modificados están dentro del módulo `bre_b`.

---

## Intro 0 — Presentar el proyecto GAIA Code Harness (1 min)

Antes de entrar al repo objetivo, presentá brevemente el propio sistema para que la audiencia entienda qué están viendo correr.

**Qué decir:**

> "Esto que tenemos abierto es el repo de **GAIA Code Harness**: el arnés que orquesta a varios agentes de IA para generar código de forma controlada. No es un chatbot que escribe a ciegas; es un pipeline con estados, persistencia y puntos de aprobación humana."

**Mostrar en pantalla:**

```bash
# Estructura de alto nivel del proyecto
tree -L 2 -I 'node_modules|.git' /Users/robertogutierrezgonzalez/Desktop/gaia-code-harness
```

O, si no tenés `tree`, usá:

```bash
ls -1 /Users/robertogutierrezgonzalez/Desktop/gaia-code-harness
```

**Archivos clave para mostrar y explicar:**

```bash
# Agentes del pipeline
open /Users/robertogutierrezgonzalez/Desktop/gaia-code-harness/src/agents/reviewer.ts
open /Users/robertogutierrezgonzalez/Desktop/gaia-code-harness/src/agents/implementer.ts
open /Users/robertogutierrezgonzalez/Desktop/gaia-code-harness/src/agents/spec-author.ts

# Orquestador (máquina de estados)
open /Users/robertogutierrezgonzalez/Desktop/gaia-code-harness/src/harness/leader.ts

# Plugins de plataforma
open /Users/robertogutierrezgonzalez/Desktop/gaia-code-harness/src/plugins/index.ts

# Documentación para humanos
open /Users/robertogutierrezgonzalez/Desktop/gaia-code-harness/AGENTS.md
open /Users/robertogutierrezgonzalez/Desktop/gaia-code-harness/docs/engineering/workflow.md
```

**Qué explicar mientras se ven los archivos:**

- **`src/agents/`**: cada agente tiene un rol definido:
  - `SpecAuthorAgent` → genera el spec técnico.
  - `ImplementerAgent` → escribe el código a partir del spec.
  - `ReviewerAgent` → valida y crea el PR.
  - `MutationTesterAgent` → evalúa calidad de tests.
- **`src/harness/leader.ts`**: la máquina de estados que mueve el job por `pending → spec_ready → implementing → reviewing → done`.
- **`src/plugins/`**: skills de plataforma (`flutter_web`, `ios`, `android`, `backend`) que inyectan reglas específicas de cada repo.
- **`src/state/`**: persistencia en Postgres (Modo A/C) o en disco (Modo B).
- **`AGENTS.md`** y **`docs/engineering/workflow.md`**: mapa para agentes IA y el pipeline completo.
- **`scripts/present.sh`**: si querés, también podés mostrar que ya existe un script de presentación con slides.

**Puntos clave a mencionar:**

- GAIA no es un solo prompt gigante; son agentes especializados que se llaman en cadena.
- Cada agente lee y escribe handoffs en el workspace (`progress/`, `specs/`).
- Los 3 modos (HTTP API, CLI, Webhook) usan los mismos agentes y la misma máquina de estados.

**Frase clave:**

> "La demo que siguen viendo no es un truco de presentación: es exactamente el mismo código que correría en producción."

---

## Intro — Presentar el proyecto objetivo, el código a cambiar y la explicación (1 min)

Antes de lanzar el pipeline, mostrá el contexto al público para que entiendan qué van a ver cambiar.

**Qué decir:**

> "Este es `rpp-cashflow-multiplatform-pyme`, el repo real de la app de cashflow. Dentro del repo hay un módulo llamado `bre_b` (Bre-B). Vamos a pedirle a GAIA que agregue una pequeña bandera booleana `isDemoBuild` en el core de ese módulo. Es un cambio de una línea, pero les va a permitir ver todo el pipeline: spec, aprobación, código, PR."

**Mostrar en pantalla:**

```bash
# URL del repo en GitHub
open https://github.com/rpp-co/rpp-cashflow-multiplatform-pyme

# Estructura del módulo bre_b (desde el workspace clonado o el repo local)
ls packages/features/bre_b/lib/src
```

También mostrá el archivo que se va a modificar **antes** del cambio:

```bash
# Si ya tenés el repo clonado en el workspace de un job anterior
cat /tmp/gaia-workspace/<JOB_ID>/repo/packages/features/bre_b/lib/bre_b_core.dart
# o abrilo en el IDE
open packages/features/bre_b/lib/bre_b_core.dart
```

**Puntos clave a mencionar:**

- **Proyecto:** app de cashflow multiplataforma; GAIA la trata como repo Flutter Web con estructura Melos/FVM.
- **Código:** `bre_b_core.dart` es el entry point del core del módulo Bre-B; ahí agregaremos `const isDemoBuild = false;`.
- **Explicación:** GAIA no toca `master`; creará una feature branch, hará commit y abrirá un PR.
- **Por qué este cambio:** es lo suficientemente pequeño para terminar en ~1 minuto, pero representa el flujo completo.

**Frase clave:**

> "No estamos haciendo magia: estamos corriendo un proceso sobre un repo real. En un minuto van a ver el diff exacto que GAIA propone."

---

## Diapositiva 1 — Intro y estructura de la demo (45 seg)

**Qué decir:**

> "En los próximos 5 minutos vamos a: 1) pedirle a GAIA una feature pequeña, 2) ver cómo genera un plan técnico, 3) aprobar ese plan, 4) dejar que escriba el código y abra un Pull Request real en `rpp-co/rpp-cashflow-multiplatform-pyme`."

**Mostrar en pantalla:**

```
Flujo de la demo
1. Job JSON  →  2. SpecAuthor  →  3. Aprobación  →  4. Implementer  →  5. Reviewer/PR
```

**Puntos clave a mencionar:**

- Spec-first: la IA propone un plan antes de tocar código.
- Aprobación humana: siempre hay un gate antes de implementar.
- Límite de archivos: `maxFilesToTouch` evita reescrituras sorpresa.
- Traceability: cada PR se puede rastrear a su spec y sus criterios.
- **Tiempo total esperado:** 50-90 segundos.
- **Momento de correr el demo en vivo:** al finalizar las diapositivas explicativas, usar el launcher de `scripts/present-cli-claude.sh`. Presionando `q` en cualquier slide se salta directo al launcher.

---

## Diapositiva 2 — El job de demo (45 seg)

**Qué decir:**

> "Vamos a pedirle a GAIA que agregue una mini feature de analytics de demo en el core del módulo `bre_b`: un modelo `DemoAnalyticsEvent`, un repositorio `DemoAnalyticsRepository` con `logEvent`, y la exportación desde `bre_b_core.dart`. Genera tres archivos y es 100 % código de demo. El repo es real: `rpp-co/rpp-cashflow-multiplatform-pyme`."

**Mostrar en pantalla:**

```bash
cat /tmp/demo-cashflow-job.json
```

**Destacar mientras se ve el JSON:**

- `"platform": "flutter_web"` — GAIA carga el skill de Flutter Web y conoce la estructura Melos + FVM del repo.
- `"maxFilesToTouch": 4` — seguridad de scope (dos archivos nuevos + exportación + margen).
- `"module": "bre_b"` — restringe aún más el contexto.
- `"requireTests": false` — para la demo lo desactivamos; en producción se exigen tests verdes.

**Mencionar:**

> "Si quisiéramos TDD, pondríamos `tddMode: true`. El Implementer escribiría primero el test rojo, luego haría que pase. Para la demo desactivamos tests para que termine en PR de forma predecible."

---

## Diapositiva 3 — Lanzar el pipeline (30 seg)

**Qué decir:**

> "Ejecutamos el CLI con `--approve` para que, después de generar el spec, siga automáticamente. En producción ese `--approve` sería un humano revisando el spec en Jira, Slack o el dashboard."

**Mostrar en pantalla:**

```bash
npm run gaia -- /tmp/demo-cashflow-job.json --approve
```

> **Tip:** Si querés algo aún más corto, agregá este alias a tu shell (`~/.zshrc` o `~/.bashrc`):
>
> ```bash
> alias gaia='npm run gaia --'
> ```
>
> Después podés correr simplemente `gaia /tmp/demo-cashflow-job.json --approve`.

**Empieza a correr.** Mientras el output avanza, narra cada fase.

**Plan B:** Si el comando tarda en arrancar, di:

> "Mientras arranca, recuerden que esto corre local: no hay servidor ni Docker. Toda la orquestación ocurre en este proceso."

---

## Diapositiva 4 — Fase 1: SpecAuthor (1 min)

**Qué decir mientras ves en el output:**

> "El primer agente es `SpecAuthor`. No escribe código todavía. Lee el repo, entiende la estructura y produce un TechnicalSpec: requerimientos, tareas, archivos afectados y riesgos. También genera escenarios Gherkin que sirven como contrato ejecutable."

**Mostrar en pantalla (cuando termine SpecAuthor):**

```bash
# Identificá el job ID
ls -td /tmp/gaia-workspace/*/ | head -1
# o
ls -t progress/*.md | head -1
```

Luego mostrá el spec:

```bash
JOB_ID=<id>
cat /tmp/gaia-workspace/$JOB_ID/specs/$JOB_ID/spec.json | head -80
```

**Puntos a destacar:**

- `requirements` — derivados de los ACs.
- `tasks` — plan file-level.
- `design.affectedFiles` — scope boundary.
- `gherkinScenarios` — contrato ejecutable.

**Frase clave:**

> "Esta es la magia del spec-first: antes de que exista una sola línea de código, tenemos un plan que un humano puede aprobar o rechazar."

---

## Diapositiva 5 — Fase 2: Aprobación humana (30 seg)

**Qué decir cuando ves:**

```
[Leader] ⚠ Spec ready — waiting for human approval
Auto-approving spec...
```

> "Aquí está el gate humano. Sin aprobación, GAIA no toca el código. En este demo usamos `--approve`; en un flujo real el equipo revisa el spec y pulsa aprobar, o lo rechaza con feedback."

**Mostrar en pantalla:**

Si tuviéramos aprobación manual, el comando sería:

```bash
curl -s -X POST http://localhost:3000/jobs/<JOB_ID>/approve \
  -H "Content-Type: application/json" \
  -d '{"approved": true}'
```

**Puntos clave:**

- Dos checkpoints humanos: spec approval + PR review.
- Rechazo con feedback regenera el spec.

---

## Diapositiva 6 — Fase 3: Implementer (1 min)

**Qué decir mientras ves:**

> "El agente `Implementer` crea una rama nueva, escribe el cambio y hace commit. Por diseño, GAIA nunca hace push a `master`; siempre va a una feature branch."

**Mostrar en pantalla (en una segunda terminal):**

```bash
JOB_ID=<id>
cd /tmp/gaia-workspace/$JOB_ID/repo
# Rama actual y commits
git branch --show-current
git log --oneline -3
# Resumen de archivos tocados
git show --stat HEAD
```

**Puntos a destacar:**

- Rama feature creada automáticamente.
- Commit con mensaje descriptivo.
- El plan autorizó 3 archivos: `demo_analytics_event.dart` (modelo), `demo_analytics_repository.dart` (repositorio) y `bre_b_core.dart` (exportación).
- El modelo tiene campos tipados y el repositorio almacena eventos en una lista interna.
- No se tocaron widgets, navegación ni infraestructura.

**Luego, mostrá el diff:**

```bash
# Nuevos archivos
git show HEAD -- packages/features/bre_b/lib/src/data/models/demo_analytics_event.dart
git show HEAD -- packages/features/bre_b/lib/src/data/repositories/demo_analytics_repository.dart
# Exportación
git show HEAD -- packages/features/bre_b/lib/bre_b_core.dart
```

**Frase clave:**

> "No hay black box: podemos ver exactamente qué cambió, por qué lo cambió y en qué rama quedó."

---

## Diapositiva 7 — Fase 4: Reviewer y PR (1 min)

**Qué decir cuando ves:**

> "El agente `Reviewer` revisa límites de scope, corre análisis estático y, si todo está bien, crea el Pull Request. En producción, después de esto entra el mutation tester para asegurar que los tests sean robustos."

**Mostrar en pantalla:**

```bash
# Copiá la PR URL del output y mostrala
open <PR_URL>
```

**En el navegador, mostrá:**

- Título y descripción del PR.
- Files changed: `demo_analytics_event.dart` (modelo) + `demo_analytics_repository.dart` (repositorio) + `bre_b_core.dart` (exportación), todo dentro del módulo `bre_b`.
- No hay cambios en `pubspec_overrides.yaml`, `build/`, `.dart_tool/`, ni CI/CD.

**Si tenés tiempo, mostrá la trazabilidad:**

```bash
# El job ID está en el cuerpo del PR o en progress/<JOB_ID>.md
open progress/<JOB_ID>.md
```

**Frase clave:**

> "El PR se revisa como cualquier otro. La diferencia es que llega con un spec aprobado, tests verdes —en producción— y un registro completo de decisiones."

---

## Diapositiva 8 — Modos de ejecución: CLI vs `.claude` (1 min)

**Qué decir:**

> "GAIA no impone una sola interfaz. Hoy vamos a ver dos modos: el **CLI** y el **`.claude`**. Ambos corren exactamente el mismo pipeline y los mismos agentes; lo que cambia es dónde pones el control humano."

**Mostrar en pantalla — comparación rápida:**

```text
| Modo        | Arranca con                  | Orquestador                  | Aprobación de spec              |
| ----------- | ---------------------------- | ---------------------------- | ------------------------------- |
| CLI         | npm run gaia -- <job.json>   | src/cli/run.ts + leader.ts   | --approve flag                  |
| .claude     | Conversación o `/run_gaia`        | craftsman_lead + subagentes  | Pausa humana en Gherkin         |
```

### Bloque A — Modo CLI (rápido y predecible)

**Qué decir:**

> "El CLI es lo que acabamos de usar: le pasás un `job.json` y, si ponés `--approve`, el pipeline corre de punta a punta sin detenerse. Detrás está `src/cli/run.ts`, que invoca a los agentes TypeScript de `src/agents/`. Es ideal para demos, CI/CD o tareas bien definidas."

**Mostrar en pantalla:**

```bash
cat /tmp/demo-cashflow-job.json | head -20
npm run gaia -- /tmp/demo-cashflow-job.json --approve
```

**Archivos del harness que mostrar:**

- `src/cli/run.ts` — entry point del CLI.
- `src/harness/leader.ts` — máquina de estados que avanza entre agentes.
- `src/agents/implementer.ts` — agente que escribe el código.
- `src/agents/reviewer.ts` — agente que revisa y crea el PR.

**Frase clave:**

> "CLI es velocidad y reproducibilidad: mismo pipeline, un solo comando."

### Bloque B — Modo `.claude` (artesanal con control humano)

**Qué decir:**

> "El modo `.claude` corre dentro de Claude Code. En lugar de un comando, Claude actúa como `craftsman_lead` y coordina subagentes: `spec_partner`, `gherkin_author`, `tdd_craftsman`, `judge` y `mutation_tester`. La gran diferencia es que hay una pausa humana obligatoria después de los escenarios Gherkin."

**Mostrar en pantalla:**

```text
/run_gaia --job /tmp/demo-cashflow-job.json --approve
```

o, para paso a paso:

```text
Implementá la siguiente feature pendiente
```

**Archivos de `.claude/` que mostrar:**

- `.claude/agents/craftsman_lead.md` — rol del conductor del pipeline.
- `.claude/agents/spec_partner.md` — conversa y escribe `project-spec.md`.
- `.claude/agents/gherkin_author.md` — destila `features/<name>.feature`.
- `.claude/commands/run_gaia.md` — slash command `/run_gaia` que usa el CLI por detrás.
- `CLAUDE.md` — contexto que Claude lee al arrancar.

**Frase clave:**

> "`.claude` es transparencia: la IA propone, el humano aprueba cada escenario, y solo después se escribe código."

### Bloque C — Cómo alternar entre ambos

**Qué decir:**

> "Ambos modos no se pelean; se complementan. Arrancás una idea en `.claude` para conversarla, aprobar los escenarios y validar TDD. Cuando la tarea es repetible y bien definida, la mandás por CLI."

**Mostrar en pantalla:**

```text
Claude Code → /run_gaia --job job.json --approve
                     │
                     ▼
         src/cli/run.ts → leader.ts → Implementer → Reviewer → PR
```

**Puntos a destacar:**

- El `/run_gaia` de `.claude` usa los **mismos agentes TypeScript** que el CLI.
- La aprobación humana en `.claude` está en los `.feature`; en CLI se salta con `--approve`.
- En producción se usa `--approve=false` o la aprobación manual en los escenarios Gherkin de `.claude`.

**Frase clave:**

> "CLI es para velocidad; `.claude` es para colaboración. El mismo harness, distinta forma de conducir."

---

## Diapositiva 9 — Cierre y preguntas (45 seg)

**Qué decir:**

> "En resumen: dimos un requerimiento en lenguaje natural, GAIA propuso un plan, nosotros aprobamos, y GAIA entregó código en un Pull Request real. El valor no es 'que la IA escriba código'; es que lo haga dentro de un proceso con spec, aprobación humana, límites de scope y trazabilidad."

**Mostrar en pantalla (resumen visual):**

```
Product Manager  ──ACs──▶  SpecAuthor  ──spec──▶  Humano (aprobar)
                                      │
                                      ▼
                           Implementer ──código──▶  Reviewer ──PR──▶  Equipo
                                      │
                                      ▼
                           MutationTester (producción)
```

**Preguntas de cierre opcionales:**

- "¿Qué tan cómodos estarían aprobando specs generados por IA?"
- "¿Qué repo o feature quisiéramos pilotear primero?"
- "¿Prefieren Modo A (HTTP API), B (CLI) o C (webhook con Jira)?"
- "¿Necesitarían notificaciones en Slack/Jira o GitHub Checks?"

---

## Plan B — Si algo sale mal en vivo

### El spec tarda más de lo esperado

> "Como ven, el spec requiere leer el repo y llamar al LLM. En repos grandes puede tomar un minuto. Mientras tanto, mostremos la estructura del repo."

Comando de emergencia:

```bash
# En otra terminal, seguí el progreso en tiempo real
tail -f progress/<JOB_ID>.md
```

### El job falla con `test_error`

> "Esto es justamente una de las ventajas del harness: si los tests fallan, el pipeline se detiene. En producción el Implementer reintenta hasta 2 veces; si persiste, queda en `test_error` para revisión humana."

**Para salvar la demo al instante:**

```bash
# Re-lanzar con requireTests false
npm run gaia -- /tmp/demo-cashflow-job.json --approve
```

### No se crea el PR

> "Si no hay `GITHUB_TOKEN_RPP` configurado, el sistema hace un dry-run: genera todo el código pero crea un PR simulado. El valor del pipeline sigue siendo visible."

Verificá el token:

```bash
grep GITHUB_TOKEN_RPP .env
```

### Se incluyen archivos inesperados en el commit

> "GAIA tiene una lista de archivos que nunca commitea: `pubspec_overrides.yaml`, `build/`, `.dart_tool/`, caches. Si aparecieran, es un bug y se arregla en `src/tools/git.ts`."

Verificá rápidamente:

```bash
cd /tmp/gaia-workspace/<JOB_ID>/repo
git show --stat HEAD
```

---

## Notas extendidas para el presentador

- **Tiempo real:** La demo suele durar 50-90 segundos con `requireTests: false`. Con `tddMode: true` puede durar 3-5 minutos.
- **Demo repos reales:** El script usa `rpp-co/rpp-cashflow-multiplatform-pyme`. Si preferís no tocar producción, cambiá `repo` por un repo demo.
- **Orquestación visible:** Todo queda en `progress/<JOB_ID>.md`; es tu mejor aliado si necesitás improvisar.
- **Skills de plataforma:** El skill de `flutter_web` inyecta reglas específicas del repo (`docs/RULES.md`, `docs/UNIT_TESTS.md`) en los prompts de todos los agentes.
- **Reproducibilidad:** El job JSON es idempotente en intención; cada ejecución crea una nueva rama y un nuevo PR.
- **Limpieza post-demo:** Borrá las branches `feature/*-demo-*` y los PRs de prueba para no contaminar el repo.
- **No hardcodees tokens:** El `GITHUB_TOKEN_RPP` debe venir del `.env`, nunca del guión.

---

## Preguntas frecuentes (FAQ) para la audiencia

### ¿Esto reemplaza a los desarrolladores?

> No. GAIA automatiza el ciclo de escribir código repetitivo y bien acotado. El juicio arquitectónico, la revisión de PR y las decisiones de producto siguen siendo humanas. Es un acelerador, no un reemplazo.

### ¿Cómo evita que la IA toque archivos críticos?

> Hay varias capas:
>
> 1. `maxFilesToTouch` limita cuántos archivos puede modificar.
> 2. El spec define `affectedFiles`; el Implementer se restringe a ese scope.
> 3. El Reviewer aplica un file-count guard y rechaza PRs que excedan el límite.
> 4. El `unstageNeverCommitFiles` en `src/tools/git.ts` evita que se commiteen archivos de build, overrides y caches.

### ¿Y si la IA genera código inseguro o con secretos?

> Los prompts del sistema incluyen guardrails de seguridad (`docs/engineering/security.md` y `.claude/rules/security-and-conventions.md`). Además, el Reviewer hace análisis estático y los PRs pasan por revisión humana. Nunca se mergea automáticamente.

### ¿Qué pasa si los tests fallan?

> El pipeline se detiene en `test_error`. En Modo A y C el Implementer reintenta automáticamente hasta 2 veces usando el feedback del error. Si persiste, queda a la espera de un humano. En Modo B la decisión de reintentar es manual.

### ¿Se puede integrar con Jira?

> Sí. El Modo C (`POST /webhook/trigger`) acepta webhooks de Jira. También puedes pasar solo `jiraTicketId` en Modo A y GAIA fetcheará título, descripción, ACs y URL de Figma. Los comentarios y transiciones de estado son automáticos.

### ¿Y Slack o GitHub Checks?

> Sí. Configurando `SLACK_WEBHOOK_URL`, `GITHUB_CHECKS_TOKEN` o `NOTIFY_WEBHOOK_URL` en `.env`, cada cambio de estado dispara notificaciones. Si no configuras nada, usa `NullNotifier` y no hay overhead.

### ¿Soporta TDD?

> Sí. Activando `tddMode: true`, el Implementer sigue el ciclo **Red-Green-Refactor**: escribe primero el test que falla, luego implementa el código mínimo para que pase, y repite por cada escenario Gherkin. Es más lento pero genera tests más robustos.

### ¿Qué es mutation testing?

> Después de que el Reviewer crea el PR, el `MutationTester` introduce pequeñas mutaciones en el código (`true → false`, `+ → -`, `return null`, etc.) y verifica que los tests las detecten. Si el _mutation score_ es ≥ 80%, el job termina. Si no, en Modo A/C el feedback vuelve al Implementer para reforzar los tests.

### ¿Se puede usar con repos privados?

> Sí. El token de GitHub (`GITHUB_TOKEN_RPP` para `rpp-co`) determina a qué repos puede acceder GAIA. Nunca se hardcodea; siempre viene de variables de entorno.

### ¿Cuál es la diferencia entre Modo A, B y C?

> - **Modo A (HTTP API):** Ideal para producción, dashboards internos y CI. Requiere servidor + Postgres.
> - **Modo B (CLI):** Ideal para desarrollo local, debugging y demos rápidas. Sin servidor.
> - **Modo C (Webhook):** Ideal para Jira Automation, Slack slash commands o GitHub Actions.

### ¿Qué pasa si no apruebo el spec?

> Puedes rechazarlo con feedback y el sistema regenera el plan:

```bash
curl -s -X POST http://localhost:3000/jobs/<JOB_ID>/approve \
  -H "Content-Type: application/json" \
  -d '{"approved": false, "feedback": "Necesita incluir analytics"}'
```

### ¿El código generado es de buena calidad?

> Depende del contexto que le des. Si el repo tiene `docs/RULES.md`, `docs/UNIT_TESTS.md` y plugins específicos, GAIA los inyecta en cada prompt. La calidad mejora con buena documentación local del repo.

### ¿Puedo ejecutar esto sin internet?

> No. GAIA requiere acceso a la API de OpenAI o Anthropic. El resto del pipeline corre local o en tu infraestructura.

### ¿Dónde queda el registro de cada job?

> En Modo A/C: Postgres + logs. En Modo B: `progress/<JOB_ID>.md`, `progress/.state/` y `specs/<JOB_ID>/`. Todo es auditable.

### ¿Cómo reporto un bug del pipeline?

> Abre un issue en el repo del harness adjuntando `progress/<JOB_ID>.md` y, si aplica, el diff del commit (`git show HEAD` desde el workspace del job).

### ¿Cuánto cuesta usarlo?

> El harness es código abierto. Pagás lo que consuman las llamadas a la API de OpenAI/Anthropic. En repos pequeños y features acotadas, un job completo suele costar centavos de dólar. Los jobs con `tddMode: true` o mutation testing hacen más llamadas, por lo que salen un poco más caros.

### ¿Soporta otros lenguajes además de Dart/Flutter?

> Sí. La arquitectura es extensible: cada plataforma tiene un skill en `src/plugins/<platform>/`. Hoy hay skills para `flutter`, `flutter_web`, `ios`, `android` y `backend`. Agregar uno nuevo implica implementar `Skill` (clone, context, apply, test, analyze) y registrarlo en `src/plugins/index.ts`.

### ¿Qué pasa si la IA toca un archivo que no debe?

> Hay tres salvaguardas:
>
> 1. El spec lista `affectedFiles` y `newFiles`; el Implementer se restringe a esos paths.
> 2. `maxFilesToTouch` es un límite duro; si se excede, el Reviewer rechaza el PR.
> 3. El diff es visible en el PR; cualquier desviación se detecta en revisión humana.

### ¿Puede actualizar un PR existente o rehacer uno anterior?

> Sí. Si un job falla en `test_error` o `review_error`, podés reintentarlo con `npm run gaia -- --id <JOB_ID> --retry`. El Implementer usa la rama existente, aplica fixes y hace push. También podés pasar un nuevo job con el mismo `targetBranch` y título relacionado.

### ¿Cómo veo el spec que generó la IA?

> En Modo B (CLI) queda en `specs/<JOB_ID>/spec.json` y los escenarios Gherkin en `specs/<JOB_ID>/scenarios.feature`. Además, el body del PR incluye un enlace al `progress/<JOB_ID>.md` que resume el plan, los agentes ejecutados y el resultado.

### ¿Respeta convenciones de commits y estilo de código?

> Sí, si el repo se lo pedís. El skill de cada plataforma inyecta guías de estilo (`docs/RULES.md`, `docs/UNIT_TESTS.md`, linters) en los prompts. El Implementer genera commits descriptivos y el Reviewer valida que no se commiteen archivos prohibidos.

### ¿Puede correr en CI/CD?

> Sí. El Modo C (`POST /webhook/trigger`) está pensado para eso: un GitHub Action, Jira Automation o Slack slash command puede disparar un job. También podés correr el CLI en un runner si exportás las variables de entorno necesarias.

### ¿En qué se diferencia de Copilot o Cursor?

> Copilot/Cursor asisten mientras escribís código. GAIA orquesta un **proceso**: recibe un requerimiento, genera spec, permite aprobación humana, implementa, revisa, crea PR y mide robustez con mutation testing. Está diseñado para tareas completas, no para sugerencias inline.

### ¿Qué tareas NO son adecuadas para GAIA?

> Las que requieren juicio de producto profundo, diseño de arquitectura nueva sin precedentes en el repo, refactorings masivos sin tests de respaldo, o cambios en infraestructura crítica (secrets, CI/CD, permisos). GAIA funciona mejor con cambios bien acotados y documentados.

---

## Datos para generar diapositivas con IA

Copiá este brief en un generador de slides (Gamma, Beautiful.ai, Canva Magic, ChatGPT, etc.) para crear una presentación visual automáticamente.

### Estilo sugerido

- **Tono:** técnico pero accesible; dirigido a ingeniería y producto.
- **Paleta:** oscura (azul `#0B1220`, acento cian `#38BDF8`, verde `#4ADE80`, magenta `#F472B6` para `.claude`).
- **Tipografía:** sans-serif moderna (Inter, SF Pro, Roboto).
- **Elementos visuales:** diagramas de flujo, tarjetas de agente, tablas comparativas, capturas de terminal estilizadas.

### Brief por diapositiva

```json
{
  "slides": [
    {
      "number": 1,
      "title": "GAIA Code Harness — Demo: DemoAnalyticsRepository",
      "subtitle": "Modos CLI y .claude sobre el repo rpp-cashflow-multiplatform-pyme",
      "key_points": [
        "Demo de ~5 minutos",
        "No requiere servidor ni Docker",
        "Job: agregar DemoAnalyticsEvent + DemoAnalyticsRepository en bre_b core"
      ],
      "visual": "Título grande + logo concepto + dos badges: CLI y .claude"
    },
    {
      "number": 2,
      "title": "El job de demo",
      "key_points": [
        "platform: flutter_web",
        "repo: rpp-co/rpp-cashflow-multiplatform-pyme",
        "module: bre_b",
        "maxFilesToTouch: 4",
        "requireTests: false para velocidad de demo"
      ],
      "visual": "Tarjeta con el JSON del job resaltado; flechas señalando cada campo importante"
    },
    {
      "number": 3,
      "title": "Lanzar el pipeline (CLI)",
      "key_points": [
        "Comando: npm run gaia -- job.json --approve",
        "El pipeline arranca localmente",
        "Se puede pausar en spec_ready para aprobación manual"
      ],
      "visual": "Terminal estilizada con el comando y un timeline de estados debajo"
    },
    {
      "number": 4,
      "title": "Fase 1: SpecAuthor",
      "key_points": [
        "Lee el repo y entiende convenciones",
        "Genera TechnicalSpec: requerimientos, tareas, riesgos, archivos afectados",
        "Produce escenarios Gherkin como contrato ejecutable"
      ],
      "visual": "Diagrama: Repo -> SpecAuthor -> spec.json + scenarios.feature"
    },
    {
      "number": 5,
      "title": "Fase 2: Aprobación humana",
      "key_points": [
        "Spec ready -> waiting for human approval",
        "Sin aprobación no se toca código",
        "En producción: POST /jobs/:id/approve o pausa en .claude"
      ],
      "visual": "Icono de mano/persona deteniendo/avanzando el flujo entre SpecAuthor e Implementer"
    },
    {
      "number": 6,
      "title": "Fase 3: Implementer",
      "key_points": [
        "Crea rama feature",
        "Escribe solo archivos autorizados",
        "Commit descriptivo"
      ],
      "visual": "Lista de archivos: demo_analytics_event.dart, demo_analytics_repository.dart, bre_b_core.dart"
    },
    {
      "number": 7,
      "title": "Fase 4: Reviewer y PR",
      "key_points": [
        "Valida scope y análisis estático",
        "Crea el Pull Request en GitHub",
        "Trazabilidad completa: PR -> spec -> ACs -> job log"
      ],
      "visual": "Mockup de un PR de GitHub con los files changed y el link al job"
    },
    {
      "number": 8,
      "title": "CLI vs .claude",
      "key_points": [
        "CLI: velocidad y reproducibilidad, --approve automático",
        ".claude: control humano en Gherkin, slash command /run_gaia",
        "Ambos usan los mismos agentes TypeScript por detrás"
      ],
      "visual": "Tabla comparativa de dos columnas con íconos de terminal y chat"
    },
    {
      "number": 9,
      "title": "Cierre",
      "key_points": [
        "El valor no es 'IA escribe código'",
        "El valor es 'IA dentro de un proceso controlado'",
        "Spec -> Aprobación -> Scope -> Review -> Mutation testing -> PR"
      ],
      "visual": "Diagrama de flujo final conectando todas las fases y una pregunta al público"
    }
  ]
}
```

### Prompt listo para copiar

> "Create a 9-slide technical presentation in dark mode using the following JSON brief. Each slide should have a title, 2-4 bullet points, and a visual suggestion. Use cyan and green accents. Keep the style clean and engineering-friendly."

---

## Comandos rápidos

```bash
# Ver el job más reciente
ls -t progress/*.md | head -1

# Ver los últimos jobs guardados
npm run gaia -- --list

# Seguir un job en tiempo real
tail -f progress/<JOB_ID>.md

# Reintentar un job desde test_error/review_error
npm run gaia -- --id <JOB_ID> --retry

# Ver diff del commit generado
cd /tmp/gaia-workspace/<JOB_ID>/repo
git show --stat HEAD
git show HEAD
```
