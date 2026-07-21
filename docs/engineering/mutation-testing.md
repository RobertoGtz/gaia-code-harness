# Mutation Testing — GAIA Code Harness

> Valida que tu suite de tests realmente detectaría bugs. Score mínimo aceptable: 80%.

---

## El problema que resuelve

Una suite verde dice "el código no explota con estas entradas". **No** dice
"los tests fallarían si el código estuviera mal". Un test sin asserts
fuertes pasa siempre y no protege nada.

La prueba de mutación lo mide al revés: introduce un defecto pequeño
(un _mutante_) y observa la suite.

- Si **algún test falla** → el mutante está **muerto** (killed). La red
  atrapó el defecto.
- Si **todos los tests pasan** → el mutante **sobrevive** (survived). Hay
  un agujero: falta un assert o un caso.

**Puntuación = `killed / total`**. Cuanto más alta, más muerden los tests.

---

## La herramienta: `tools/mutate.py`

Sin dependencias externas (solo stdlib Python 3.9+). Soporta:

- **Python** — tokenizer nativo (sin falsos positivos en strings/comments)
- **TypeScript / JavaScript** — regex consciente de strings y template literals
- **Swift** — regex para operadores y keywords Swift
- **Kotlin** — mismo motor que TS/Swift

### Catálogo de mutaciones

| Categoría   | Ejemplos                                 |
| ----------- | ---------------------------------------- |
| Comparación | `<=` → `<`, `==` → `!=`, `===` → `!==`   |
| Aritmética  | `+` → `-`, `-` → `+`                     |
| Lógica      | `&&` → `\|\|`, `true` → `false`          |
| Retorno     | `return <expr>` → `return null/nil/None` |
| Constantes  | `0` → `1`, `1` → `0` (solo Python)       |

El script **restaura siempre** el archivo original (`finally`), incluso ante Ctrl-C.

### Uso rápido

```bash
# TypeScript (harness interno)
python3 tools/mutate.py src/agents/implementer.ts \
  --cmd "npx jest --passWithNoTests" \
  --threshold 80

# Swift / iOS (workspace del job)
python3 tools/mutate.py /tmp/gaia-workspace/<jobId>/Sources/App.swift \
  --cmd "swift test" \
  --cwd /tmp/gaia-workspace/<jobId> \
  --threshold 80

# Android / Kotlin
python3 tools/mutate.py app/src/main/kotlin/Foo.kt \
  --cmd "./gradlew testDebugUnitTest" \
  --cwd /path/to/android/project

# Flutter (Dart)
python3 tools/mutate.py lib/features/feed/data/repository.dart \
  --cmd "flutter test" \
  --cwd /tmp/gaia-workspace/<jobId>

# Acotar el número de mutantes (runs largos)
python3 tools/mutate.py src/agents/implementer.ts \
  --cmd "npx jest --passWithNoTests" --max 60

# Salida JSON (para MutationTesterAgent.ts)
python3 tools/mutate.py src/agents/implementer.ts \
  --cmd "npx jest" --json
```

### Exit codes

| Código | Significado                                           |
| ------ | ----------------------------------------------------- |
| `0`    | Score ≥ threshold — **PASS**                          |
| `1`    | Score < threshold — **FAIL**                          |
| `2`    | Suite roja antes de mutar — arregla los tests primero |

---

## El umbral

- **100% sobre las líneas nuevas o tocadas** por la feature es el ideal.
- Mínimo aceptable: **80%** — alineado con `MutationTesterAgent.ts`.
- Para código heredado no tocado por la feature, se mide pero no se bloquea.
- Un mutante **equivalente** (no cambia comportamiento observable) puede
  excluirse, pero **solo** con justificación explícita en
  `progress/mutation_<name>.md`. Abusar de esto es hacer trampa al juez.

---

## Quién hace qué

| Mode             | Runner                                       | Effect when score < 80%                                       |
| ---------------- | -------------------------------------------- | ------------------------------------------------------------- |
| **Claude Code**  | `mutation_tester` agent (human in the loop) | Blocks; returns to `tdd_craftsman`                            |
| **A — HTTP API** | `MutationTesterAgent.ts` (automatic)         | Closed-loop: feedback to `ImplementerAgent` (≤ 5×)            |
| **B — CLI**      | `MutationTesterAgent.ts` (automatic)           | Closed-loop: feedback to `ImplementerAgent` (≤ 5×)            |
| **C — Webhook**  | `MutationTesterAgent.ts` (automatic)           | Closed-loop: feedback to `ImplementerAgent` (≤ 5×)            |

`mutation_tester` **measures and reports**. It does not edit code directly.
If a mutant survives, `MutationTesterAgent.ts` returns `TEST_ERROR` with the
details; the `Leader` persists that feedback in `reviewFeedback` and re-runs
`ImplementerAgent` (up to 5 retries) before marking the job as `test_error`.
In any mode you can retry manually with
`npx ts-node src/cli/run.ts --id <jobId> --retry` or `POST /jobs/:id/retry`.
A surviving mutant is the implementer's job: write the red test that kills it
and run it through the `judge`/reviewer again.

---

## Por qué vale el coste

Reejecutar toda la suite por cada mutante es caro. Pero ese es el
desplazamiento que describe Uncle Bob: el límite ya no es lo rápido que
teclea un humano, sino cuánta validación puede pagar tu CPU. La corrección
del código es el retorno, y compensa cada ciclo.
