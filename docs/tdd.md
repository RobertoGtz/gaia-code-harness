# TDD estricto — GAIA Code Harness

> "Do you let it write all tests up front, then code or single test
> followed by code (TDD)?" — La respuesta de esta rama: **single test
> followed by code**. Un test a la vez. Nunca toda la batería por delante.

## Las Tres Leyes del TDD

1. **No escribes código de producción** salvo para hacer pasar un test que
   está fallando.
2. **No escribes más de un test del necesario para fallar** — y que no
   compile o no importe cuenta como fallar.
3. **No escribes más código de producción del necesario** para pasar el
   único test que falla.

El efecto: nunca tienes código sin un test que lo justifique, ni un test
que no esté empujando código real. El alcance no se infla.

## El ciclo, en pequeño y repetido

```
   ┌──────────────────────────────────────────────┐
   │                                              │
   ▼                                              │
 ROJO           VERDE               REFACTOR      │
 escribe UN  →  mínimo código    →  limpia con  ──┘
 test que       para ponerlo        la barra
 falla          verde               verde
```

- **ROJO** — el test deriva del siguiente escenario `@s` del `.feature`.
  Verifícalo fallando de verdad. Un test que pasa a la primera no demuestra
  nada: ajústalo o sospecha del montaje.
- **VERDE** — la implementación **mínima**. Está permitido devolver una
  constante si aún no hay test que lo desmienta. El siguiente ciclo forzará
  la generalización.
- **REFACTOR** — solo en verde. Elimina duplicación, mejora nombres, parte
  funciones largas. Vuelve a correr los tests tras cada cambio. Si algo se
  pone rojo, no estás refactorizando: estás cambiando comportamiento.

## Granularidad: un escenario, uno o más ciclos

Cada `@s` del `.feature` se traduce en al menos un ciclo Rojo-Verde-Refactor.
Un escenario con varias aristas puede necesitar dos ciclos para forzar la
generalización del código.

## Trazabilidad obligatoria

Al cerrar, cada `@s` debe estar cubierto por al menos un test concreto.
El `tdd_craftsman` escribe el mapa en `progress/tdd_<name>.md`:

```markdown
## Trazabilidad
- @s1 (archivo vacío → 0)        → test_count_archivo_vacio
- @s2 (tres notas → 3)           → test_count_varias_notas
- @s3 (no modifica el archivo)   → test_count_no_muta_archivo
```

El `judge` rechaza si algún `@s` queda sin test, y el `mutation_tester`
rechaza si los tests existen pero no muerden.

## Cómo correr los tests por plataforma

```bash
# TypeScript (harness interno)
npx jest --passWithNoTests

# Swift / iOS
swift test                               # en el workspace del job

# Android / Kotlin
./gradlew testDebugUnitTest              # en el directorio del proyecto

# Flutter
flutter test                             # en el directorio del proyecto

# Python (fallback)
python3 -m unittest discover -s tests -v
```

## Olores que el `judge` busca

- Código de producción que **ningún test rojo** pidió (viola la Ley 1).
- Tests escritos "a futuro" para escenarios que aún no toca.
- Refactors hechos en rojo.
- Funciones largas o nombres opacos que sobrevivieron al REFACTOR.
- Tests sin asserts (siempre verdes, no muerden nada).
