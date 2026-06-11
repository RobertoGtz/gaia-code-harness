# Guion de Presentación - Gaia Code Harness

> Presentación de 20 minutos para el equipo
> Ticket: RPCO-37575

---

## 🎯 Objetivo de la Presentación

Presentar el Gaia Code Harness al equipo de Rappi, explicar por qué existe, cómo funciona, y discutir las dudas arquitectónicas.

---

## 📊 Estructura (20 minutos)

### Slide 1: Intro (2 min)

**Título:** "Gaia Code Harness: Controlled AI Code Generation"

**Diálogo:**
"Hoy les presento el Gaia Code Harness, un sistema que permite usar IA para generar código, pero con el mismo nivel de control y calidad que esperamos de un desarrollador senior.

No es magia. Es Harness Engineering."

---

### Slide 2: El Problema (3 min)

**Título:** "¿Por qué existe esto?"

**Puntos:**
1. **AI genera código rápido pero sin control**
   - Hallucinations (código que no existe)
   - Wrong assumptions (suposiciones incorrectas)
   - Missing context (pierde contexto del proyecto)

2. **Specs de producto no se traducen automáticamente**
   - PM escribe criterios de aceptación
   - Dev debe interpretar y escribir código
   - Mucha fricción en la traducción

3. **No hay validación automática**
   - ¿El código cumple los requisitos?
   - ¿Pasó los tests?
   - ¿Sigue las convenciones del equipo?

**Diálogo:**
"Los tres problemas principales: La IA genera código rápido pero sin control, los specs de producto no se traducen automáticamente a código, y no hay validación automática de calidad."

---

### Slide 3: La Solución (3 min)

**Título:** "La Solución: Harness Engineering"

**Conceptos clave:**
- ✅ **Limited, powerful tools**: Solo read/search/patch/test/create-pr
- ✅ **External memory**: PostgreSQL, no contexto del LLM
- ✅ **Multi-agent system**: Cada agente hace una cosa bien
- ✅ **Human checkpoints**: Aprobación humana obligatoria
- ✅ **Verification required**: Tests + lint deben pasar

**Diálogo:**
"En lugar de dejar la IA libre, le ponemos un arnés: herramientas limitadas pero poderosas, memoria externa en PostgreSQL, sistema multi-agente donde cada uno hace una cosa bien, checkpoints humanos obligatorios, y verificación automática."

---

### Slide 4: Arquitectura (3 min)

**Diagrama:**
```
Gaia Platform → API REST → Leader/Orchestrator → 3 Agentes
                                      ↓
                              PostgreSQL (estado)
                                      ↓
                         GitHub PR / Jira Comment
```

**3 Agentes:**
1. **SpecAuthor**: Genera spec técnico desde requirements
2. **Implementer**: Escribe código según spec
3. **Reviewer**: Valida y crea PR

**Diálogo:**
"La arquitectura tiene tres agentes especializados: SpecAuthor genera la especificación técnica, Implementer escribe el código, y Reviewer valida y crea el PR. Todo el estado se guarda en PostgreSQL para persistencia y auditoría."

---

### Slide 5: Spec-Driven Development (3 min)

**Título:** "Spec-Driven Development (SDD)"

**Concepto:**
"La especificación es la fuente de verdad, no el código."

**Formato EARS:**
```
WHEN [condition] THEN [action]

Ejemplo:
WHEN user opens home screen 
THEN display promotional banner carousel
```

**Flujo:**
1. PM escribe acceptance criteria (EARS)
2. SpecAuthor genera spec técnico
3. **⭐ Tech Lead aprueba el spec**
4. Implementer escribe código
5. Reviewer valida contra el spec

**Diálogo:**
"Spec-Driven Development: la especificación es la fuente de verdad. Usamos formato EARS: WHEN condición THEN acción. El spec debe ser aprobado por un humano antes de escribir código."

---

### Slide 6: Demo (4 min)

**Título:** "Demo en vivo"

**Pasos:**
1. Mostrar server corriendo
2. Ejecutar `./scripts/demo.sh`
3. Explicar cada paso:
   - Crear job
   - Generar spec
   - Aprobar spec
   - Implementar
   - Crear PR

**Diálogo:**
"Veamos una demo del flujo completo. El script crea un job, genera una especificación, espera aprobación, implementa el código, y crea un PR."

---

### Slide 7: Roadmap & Dudas (2 min)

**Título:** "¿Qué sigue?"

**Roadmap:**
- ✅ MVP: Funcionalidad básica
- 🔄 Integrar LLM real (OpenAI/Anthropic)
- 🔄 Integrar MCP Jira
- 🔄 Deploy a producción

**Dudas para discutir:**
"Tenemos 18 dudas documentadas en el README, incluyendo:
- ¿Un agente por lenguaje o uno universal?
- ¿Cómo manejamos dependencias entre iniciativas?
- ¿Rate limiting por equipo o global?"

---

## 🎤 Diálogo Completo

### Introducción (2 min)
```
"Buenos días. Hoy les presento el Gaia Code Harness.

¿Qué es? Es un puente entre las iniciativas de producto en Gaia 
y el código real en nuestros repos.

Cuando un PM crea una iniciativa, el harness:
1. Genera una especificación técnica
2. Espera aprobación humana
3. Implementa el código
4. Valida tests
5. Crea un Pull Request

Todo esto siguiendo Harness Engineering para controlar la IA
y Spec-Driven Development para mantener calidad."
```

### El Problema (3 min)
```
"¿Por qué existe esto? Porque tenemos tres problemas:

Primero: La IA genera código rápido pero sin control. 
Tiene hallucinations, hace suposiciones incorrectas, 
y pierde contexto del proyecto.

Segundo: Los specs de producto no se traducen automáticamente.
El PM escribe criterios de aceptación, pero el dev debe 
interpretar y escribir código manualmente.

Tercero: No hay validación automática. No sabemos si el código 
cumple los requisitos, pasó los tests, o sigue convenciones."
```

### La Solución (3 min)
```
"La solución es Harness Engineering. En lugar de dejar 
la IA libre, le ponemos un arnés con 5 principios:

Uno: Herramientas limitadas pero poderosas. Solo puede hacer 
read, search, patch, test, y create-pr.

Dos: Memoria externa. Todo el estado se guarda en PostgreSQL, 
no depende del contexto del LLM.

Tres: Multi-agente. Cada agente hace una cosa y la hace bien.

Cuatro: Checkpoints humanos obligatorios. Un humano debe 
aprobar antes de continuar.

Cinco: Verificación automática. Tests y lint deben pasar."
```

### Demo (4 min)
```
"Veamos una demo. Primero verificamos que el server está corriendo.
[curl health]

Ahora ejecutamos el demo script que hace todo el flujo automáticamente.
[./scripts/demo.sh]

El script:
1. Crea un job con acceptance criteria
2. Espera a que el SpecAuthor genere el spec
3. Muestra el spec generado
4. Aprueba el spec
5. Espera implementación
6. Muestra el PR creado

Como ven, el flujo completo toma unos minutos y requiere 
aprobación humana en el punto crítico: la especificación."
```

### Cierre (2 min)
```
"¿Qué sigue? Tenemos el MVP funcional. Los próximos pasos son:
- Integrar LLM real (OpenAI/Anthropic)
- Integrar MCP Jira para tickets reales  
- Deploy a staging y producción

También tenemos 18 dudas arquitectónicas documentadas 
que me gustaría discutir con el equipo.

¿Preguntas?"
```

---

## 📎 Material de Soporte

### Links importantes:
- `docs/ARCHITECTURE.md` - Diagramas detallados
- `API.md` - Referencia de endpoints
- `README.md` - 18 dudas para discutir
- `scripts/demo.sh` - Script de demo

### Requisitos técnicos para la presentación:
- Server corriendo localmente (`npm run dev`)
- Acceso a la terminal para ejecutar demo.sh
- Proyector para mostrar código

---

## ✅ Checklist Pre-Presentación

- [ ] Server corriendo: `npm run dev`
- [ ] Base de datos inicializada: `npm run db:init`
- [ ] Demo script probado: `./scripts/demo.sh`
- [ ] Presentación script lista: `./scripts/present.sh`
- [ ] README revisado (18 dudas)
- [ ] Arquitectura diagrama preparado

---

**Ticket:** RPCO-37575
**Duración:** 20 minutos
**Audiencia:** Equipo de desarrollo Rappi
