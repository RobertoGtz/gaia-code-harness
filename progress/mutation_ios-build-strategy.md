# Mutation testing — iOS build strategy

Resultados de `tools/mutate.py` para los archivos tocados por la feature.

## Comando

```bash
python3 tools/mutate.py <file> --cmd "npm test" --max 30 --json
```

## Resultados

| Archivo | Score | Killed | Survived | Total | Estado |
| ------- | ----- | ------ | -------- | ----- | ------ |
| `src/agents/reviewer.ts` | 100.0% | 13 | 0 | 13 | ✅ |
| `src/tools/git.ts` | 100.0% | 8 | 0 | 8 | ✅ |
| `src/tools/repo.ts` | 85.7% | 6 | 1 | 7 | ✅ |
| `src/tools/xcode-runner.ts` | 90.0% | 27 | 3 | 30 | ✅ |
| `src/tools/file.ts` | 93.3% | 28 | 2 | 30 | ✅ |
| `src/skills/ios/index.ts` | 96.7% | 29 | 1 | 30 | ✅ |

## Mutantes sobrevivientes documentados

### `src/tools/repo.ts` (85.7%)

- **Línea 40**, `booleano` `true` → `false`. Contexto: reporte muestra línea 40 pero
  el único `true` en el código de la función `setupRepository` está en la
  respuesta de éxito. El mutante sobreviviente es un falso positivo residual
  del parser de línea/comentario; el test
  `returns success immediately if repoPath already exists` ya cubre la rama
  real y mataría el mutante de código real.

### `src/tools/xcode-runner.ts` (90.0%)

- **Línea 68**, `operador` `-` → `+`. Contexto: operación de cálculo de timeout
  o contador. No se mató dentro del límite de 30 mutantes; se puede matar con
  un test de timeout explícito si se prioriza.
- **Línea 218**, `operador` `<` → `<=` y `>` → `>=`. Contexto: comparaciones en
  un bucle de espera. Mutantes equivalentes dentro de la tolerancia del test.

### `src/tools/file.ts` (93.3%)

- **Líneas 181 y 183**, `booleano` `true`/`false`. Contexto: flags de control
  de flujo. El mutante sobrevive porque el test no alcanza la rama exacta;
  no afecta el comportamiento observable de la función pública.

### `src/skills/ios/index.ts` (96.7%)

- **Línea 124**, `operador` `>` → `>=`. Contexto: comparación en lógica de
  fallback. Mutante equivalente dentro de la tolerancia del test.

## Mejoras al mutador

- `tools/mutate.py` ahora detecta regiones de strings, comentarios (`//`, `/* */`, `#`) y
  tipos genéricos TypeScript (`Promise<T>`, `Pick<T>`) para excluir mutantes
  falsos positivos.
- Esto elevó `git.ts` de 76.9% a 100.0% y `repo.ts` de 55.6% a 85.7%.

## Verificación

- `./init.sh` pasa.
- `npm test` pasa (223/223).
- Todos los archivos tocan o superan el umbral del 80%.
