# Gherkin — GAIA Code Harness

> "Once the project-spec.md is done, I have it create a set of .feature
> files from the project-spec.md." Los `.feature` son lo que el humano
> aprueba en la puerta, y el mapa que el `tdd_craftsman` recorre.

Los archivos viven en `features/<name>.feature`, donde `<name>` coincide
con el campo `name` de `feature_list.json`.

## Estructura

```gherkin
Feature: <propósito en una frase>
  Como <rol> quiero <capacidad> para <beneficio>.   # contexto opcional

  @s1
  Scenario: <comportamiento observable>
    Given <estado de partida>
    When <acción concreta del usuario>
    Then <resultado medible: stdout / stderr / exit code / pantalla>

  @s2
  Scenario: <caso límite o error>
    Given ...
    When ...
    Then ...
```

## Reglas duras

- **Un `Scenario` por comportamiento observable**, incluidos los caminos de
  error (id inexistente, flag inválido, red caída, lista vacía). Si el
  `project-spec.md` menciona un caso límite, tiene su escenario.
- **Tags estables** `@s1`, `@s2`, … Son el identificador que el
  `tdd_craftsman` (mapa `@s → test`) y el `judge` (cobertura) citan.
- **Cada `Then` afirma algo medible.** Prohibido "el sistema funciona" o
  "el comportamiento es correcto". Válido: "la pantalla muestra X", "el
  código de salida es 0", "el PR fue creado en GitHub", "el log contiene Y".
- **Un solo `When` por escenario** (la acción bajo prueba). Si necesitas
  dos acciones, probablemente son dos escenarios.
- **Sin detalles de implementación.** El `.feature` describe comportamiento,
  no funciones ni clases. "Cuando se llama a `executeTDD()`" es incorrecto;
  "Cuando el job se crea con tddMode: true" es correcto.

## Ejemplo (feature `pull_to_refresh` — plataforma iOS)

```gherkin
Feature: Pull-to-refresh en el feed
  Como usuario quiero actualizar el feed arrastrando hacia abajo para ver
  contenido reciente sin reiniciar la app.

  @s1
  Scenario: El feed se actualiza al hacer pull-to-refresh
    Given la pantalla de feed está visible con contenido cargado
    When el usuario arrastra la lista hacia abajo y suelta
    Then el indicador de carga es visible durante la actualización
    And la lista muestra los nuevos items recibidos del servidor

  @s2
  Scenario: Indicador de carga desaparece al completar la actualización
    Given el usuario ha iniciado un pull-to-refresh
    When la respuesta del servidor llega
    Then el indicador de carga desaparece
    And la lista queda en estado idle

  @s3
  Scenario: El pull-to-refresh no duplica los items existentes
    Given el feed tiene 3 items
    When el usuario hace pull-to-refresh y el servidor devuelve los mismos 3 items
    Then la lista sigue mostrando exactamente 3 items

  @s4
  Scenario: Error de red durante pull-to-refresh
    Given el servidor no está disponible
    When el usuario hace pull-to-refresh
    Then se muestra un mensaje de error
    And los items previos siguen visibles en la lista
```

## De Gherkin a test (sin framework BDD)

No usamos `behave`, `XCTest-Gherkin` ni similares para no añadir
dependencias. Cada `Scenario` se traduce **a mano** a un test cuyo nombre
cita el escenario:

```
@s1 → testFeedRefreshesOnPullToRefresh
@s2 → testLoadingIndicatorDisappearsAfterRefresh
@s3 → testPullToRefreshDoesNotDuplicateItems
@s4 → testNetworkErrorShowsMessageDuringRefresh
```

El `tdd_craftsman` escribe estos tests uno a uno (Rojo→Verde→Refactor) y
deja el mapa en `progress/tdd_<name>.md`. Así el `.feature` sigue siendo la
fuente de verdad legible por el humano, sin pagar el coste de un framework.

## Errores comunes a evitar

| ❌ Incorrecto | ✅ Correcto |
|---|---|
| `Then el código funciona` | `Then la salida contiene "3 items"` |
| `Given el sistema está configurado` | `Given el almacén tiene 3 notas guardadas` |
| `When se ejecuta la feature` | `When el usuario toca el botón "Refresh"` |
| Escenario sin tag `@s` | Todo escenario tiene `@s1`, `@s2`, etc. |
| Múltiples `When` en un escenario | Un `When` por escenario |
