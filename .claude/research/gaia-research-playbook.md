# GAIA Research Playbook

> Guía de investigación estructurada antes de escribir specs o implementar features en GAIA.

## When to use

- La feature es ambigua o toca múltiples componentes.
- No se conoce bien el estado actual del código objetivo.
- Hay que decidir entre varias alternativas de diseño.

## Steps

1. **Preguntas de cierre**
   - ¿Qué problema resolvemos exactamente?
   - ¿Quién es el usuario final?
   - ¿Cuál es el comportamiento observable correcto?
   - ¿Qué restricciones tenemos (tiempo, complejidad, legacy)?
2. **Exploración del repo**
   - `find` / `grep` para ubicar archivos relevantes.
   - Lee `README.md`, `docs/engineering/architecture.md` y `docs/engineering/workflow.md`.
   - Identifica plugins, agents o tools relacionados.
3. **Mapa de impacto**
   - Lista archivos que probablemente cambien.
   - Identifica tests existentes que deban actualizarse.
   - Detecta dependencias externas (APIs, tokens, DB).
4. **Alternativas y trade-offs**
   - Escribe 2-3 opciones de diseño.
   - Evalúa cada una en costo, riesgo, mantenibilidad y alineación con arquitectura.
5. **Contrato Gherkin preliminar**
   - Escribe 3-5 escenarios `Given/When/Then` sin implementación.
   - Usa esos escenarios para validar con el humano antes de avanzar.
6. **Documentar**
   - Guarda el research en `progress/research-<feature>.md`.
   - Referencia ese archivo desde `project-spec.md`.

## Output

- `progress/research-<feature>.md` con preguntas, hallazgos, alternativas y escenarios preliminares.
- El humano valida antes de pasar a `spec_partner` formal.
