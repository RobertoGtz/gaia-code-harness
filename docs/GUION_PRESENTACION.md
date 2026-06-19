# Guion de Presentación - Gaia Code Harness

> Presentación de 15-20 minutos
> Audiencia: Equipo de producto + desarrollo

---

## Estructura (15 min + 5 min preguntas)

| Bloque           | Duración | Qué                                   |
| ---------------- | -------- | ------------------------------------- |
| 1. El Problema   | 2 min    | Por qué existe esto                   |
| 2. La Idea       | 2 min    | Harness Engineering + Spec-Driven Dev |
| 3. Cómo Funciona | 3 min    | Flujo y agentes                       |
| 4. Demo en Vivo  | 5 min    | Correr el flujo completo              |
| 5. Qué Falta     | 2 min    | Roadmap y discusión                   |
| 6. Preguntas     | 5 min    | Q&A                                   |

---

## Bloque 1: El Problema (2 min)

**Lo que dices:**

> "Hoy quiero mostrarles algo en lo que estamos trabajando.
>
> Empecemos con el problema: cuando producto define una feature — digamos 'agregar un banner de promociones en el home' — pasan varias cosas:
>
> 1. **Producto escribe los criterios** de aceptación en Jira
> 2. **Un dev los lee**, los interpreta, y empieza a escribir código
> 3. **Alguien revisa** el PR
> 4. **Alguien verifica** que cumple los criterios originales
>
> Ese proceso tiene fricción: contexto que se pierde, interpretaciones diferentes, ida y vuelta.
>
> La pregunta es: **¿Podemos automatizar parte de ese flujo sin perder control?**"

---

## Bloque 2: La Idea (2 min)

**Lo que dices:**

> "La respuesta es sí, pero con reglas claras. No es 'darle todo a la IA y cruzar los dedos'.
>
> Usamos dos conceptos:
>
> **Spec-Driven Development**: Antes de escribir código, el sistema genera un plan técnico — qué archivos crear, qué modificar, qué tests escribir — y **un humano lo aprueba**. Sin aprobación, no se toca ni una línea de código.
>
> **Harness Engineering**: La IA trabaja dentro de un arnés. No puede hacer lo que quiera. Solo tiene 5 herramientas: leer archivos, buscar código, modificar archivos, correr tests, y crear PRs. Nada más.
>
> Es como darle a un junior un checklist muy claro y supervisarlo en cada paso."

---

## Bloque 3: Cómo Funciona (3 min)

**Lo que dices (mientras muestras el diagrama):**

> "El flujo es así:

```
  Producto                  Sistema                     Resultado
     │                         │                            │
     │── Criterios de ────────→│                            │
     │   aceptación            │── 1. Genera plan ─────────→│
     │                         │   técnico (spec)           │
     │←── ¿Apruebas? ─────────│                            │
     │                         │                            │
     │── Sí, adelante ────────→│                            │
     │                         │── 2. Clona el repo         │
     │                         │── 3. Crea branch           │
     │                         │── 4. Escribe código        │
     │                         │── 5. Corre tests           │
     │                         │── 6. Crea Pull Request ───→│ PR listo
     │                         │                            │
```

> Internamente hay 3 agentes por plataforma, como 3 roles en un equipo:
>
> - **SpecAuthor** — Es como un tech lead que lee los criterios y arma el plan
> - **Implementer** — Es como un dev que ejecuta el plan: escribe código, corre tests
> - **Reviewer** — Es como un code reviewer que valida todo y crea el PR
>
> Y esto funciona para **Flutter, iOS y Android**. Cada plataforma tiene sus propios agentes especializados con sus herramientas nativas (dart analyze, swiftlint, gradle lint).
>
> Cada agente hace una sola cosa. Si algo falla, reintenta hasta 3 veces y si no puede, reporta el error."

---

## Bloque 4: Demo en Vivo (5 min)

### Preparación (antes de presentar)

Asegúrate de tener todo listo:

```bash
# Terminal 1 — Base de datos
docker start gaia-postgres

# Terminal 2 — Servidor
cd ~/Desktop/gaia-code-harness
npm run dev

# Limpiar workspaces anteriores
rm -rf /tmp/gaia-workspace
```

### Durante la presentación

**Lo que dices:**

> "Vamos a verlo en acción. Voy a simular lo que pasaría cuando producto pide una feature."

**Paso 1 — Crear el job:**

> "Le mando al sistema los criterios de aceptación: quiero un banner de promos en el home, con paginación cuando hay más de 3, y que al tocar navegue a los detalles."

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
      "targetBranch": "develop",
      "requireTests": false,
      "maxFilesToTouch": 6
    }
  }' | python3 -m json.tool
```

> "Ya se creó el job. Fíjense en el status: `pending`. Ahora el SpecAuthor está analizando el repo y generando el plan."
>
> **Tip para presentadores:** Si tienes configurado Jira, puedes enviar solo `"jiraTicketId": "DEMO-100"` y el sistema fetcheará el título, descripción y criterios de aceptación del ticket. Pasa `requireTests: false` para que la demo no dependa de tener Flutter, Xcode o Android Studio instalados.

**Paso 2 — Ver el spec (esperar ~3 segundos):**

```bash
curl -s http://localhost:3000/jobs/JOB_ID | python3 -m json.tool
```

> "El status ya es `spec_ready`. Miren el spec que generó:
>
> - 3 requirements mapeados 1 a 1 con los criterios de aceptación
> - 3 tasks: crear el widget, integrarlo en el home, escribir tests
> - Riesgos identificados: performance con muchas imágenes
>
> **Este es el checkpoint humano.** En producción, el tech lead vería esto en Gaia y decidiría si el plan está bien."

**Paso 3 — Aprobar:**

> "Yo lo apruebo."

```bash
curl -s -X POST http://localhost:3000/jobs/JOB_ID/approve \
  -H "Content-Type: application/json" \
  -d '{"approved": true}' | python3 -m json.tool
```

> "Status: `implementing`. Ahora el Implementer está clonando el repo, creando un branch, escribiendo código y corriendo tests."

**Paso 4 — Esperar (~30 segundos):**

> "Esperamos unos segundos..."

```bash
# Repetir cada 10 segundos hasta ver "done"
curl -s http://localhost:3000/jobs/JOB_ID | python3 -c "
import json,sys
j=json.load(sys.stdin)['job']
print(f'Status: {j[\"status\"]}')
print(f'PR: {j.get(\"prUrl\",\"pending...\")}')"
```

**Paso 5 — Resultado final:**

> "Listo. Status: `done`. El sistema:
>
> - Clonó el repo
> - Creó un branch
> - Escribió el código
> - Corrió los tests (pasaron)
> - Creó un Pull Request
>
> En esta demo el PR es un dry-run porque no tenemos token de GitHub. En producción sería un PR real, listo para code review.
>
> **Todo en menos de un minuto. Sin que un dev escribiera una línea.**"

---

## Bloque 5: Qué Falta (2 min)

**Lo que dices:**

> "Esto es un MVP funcional. Qué tenemos y qué falta:

| ✅ Funciona hoy                            | 🔜 Próximos pasos                                  |
| ------------------------------------------ | -------------------------------------------------- |
| Pipeline completo de spec → code → PR      | Generación real de código con LLM (GPT-4 / Claude) |
| Checkpoint humano obligatorio              | Integración con Jira real (leer tickets)           |
| Tests automáticos (flutter test)           | UI en Gaia para aprobar specs visualmente          |
| Soporte monorepo (melos) y single-package  | Deploy a staging                                   |
| **Multi-plataforma (Flutter/iOS/Android)** | Métricas de éxito por feature                      |
| Dry-run sin GitHub token                   | Soporte Backend (Node/Python)                      |

> Lo más importante que falta es **conectar un LLM real** para que el código generado sea funcional, no una plantilla. La infraestructura para recibirlo ya está lista.
>
> ¿Preguntas?"

---

## Bloque 6: Preguntas Frecuentes

**Si preguntan: "¿Esto reemplaza a los devs?"**

> "No. Esto es como un copiloto muy estructurado. Genera un primer borrador que un dev revisa en el PR. Elimina el trabajo repetitivo, no el criterio humano."

**Si preguntan: "¿Qué pasa si el código generado está mal?"**

> "No se mergea sin code review. El PR se crea, pero un humano lo revisa como cualquier otro PR. Además, los tests deben pasar antes de que se cree el PR."

**Si preguntan: "¿Solo funciona con Flutter?"**

> "No, ya soporta **Flutter, iOS/Swift y Android/Kotlin**. Cada plataforma tiene agentes especializados con sus herramientas nativas. Puedes verlo en el demo: `./scripts/demo.sh ios` o `./scripts/demo.sh android`. La arquitectura permite agregar más plataformas fácilmente (ej: Backend)."

**Si preguntan: "¿Cuánto tarda una feature real?"**

> "Depende de la complejidad, pero estimamos 2-5 minutos para features simples una vez que tengamos el LLM conectado. El cuello de botella es la aprobación humana, no el sistema."

**Si preguntan: "¿Cuánto cuesta en tokens de LLM?"**

> "Estimamos $0.10-$0.50 por feature con GPT-4 Turbo. Mucho menos que el tiempo de un dev."

---

## Checklist Pre-Presentación

- [ ] Docker corriendo: `docker start gaia-postgres`
- [ ] Servidor corriendo: `cd ~/Desktop/gaia-code-harness && npm run dev`
- [ ] Workspace limpio: `rm -rf /tmp/gaia-workspace`
- [ ] Demo repos existen: `ls ~/Desktop/repos/demo-repo ~/Desktop/repos/demo-repo-ios ~/Desktop/repos/demo-repo-android`
- [ ] Probar demo para las 3 plataformas antes de presentar
- [ ] Tener esta guía abierta como referencia

---

## Material de referencia

- `docs/DEMO_GUIDE.md` — Guía paso a paso para no-técnicos
- `docs/ARCHITECTURE.md` — Arquitectura detallada
- `README.md` — Documentación completa + preguntas abiertas
