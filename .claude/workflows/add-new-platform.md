# Add New Platform Workflow

> Agrega soporte para una nueva plataforma de destino en GAIA (e.g., `react`, `python`, `go`).

## When to use

- Se quiere que GAIA pueda generar código para una tecnología nueva.
- La plataforma sigue el contrato de `PlatformSkill`.

## Steps

1. **Definir el skill**
   - Crea `src/plugins/<platform>/index.ts` implementando la interfaz `PlatformSkill`.
   - Define `displayName`, `srcDirs`, `sourceExtension`, `testCommand`, `buildCommand`.
2. **Prompt context**
   - Implementa `getPromptContext(job)` con las convenciones y comandos de la plataforma.
3. **Verificación de entorno**
   - Implementa `verifyEnvironment(repoPath)` que valide toolchain instalado.
4. **Build y test**
   - Implementa `build(repoPath, module, strategy)`.
   - Implementa `test(repoPath, module)`.
5. **Análisis opcional**
   - Implementa `analyze(repoPath, module)` para lint/style checks.
6. **Registrar el plugin**
   - Actualiza `src/plugins/index.ts` para exportar y registrar la nueva plataforma.
7. **Tests del harness**
   - Agrega tests unitarios en `tests/plugins/<platform>.test.ts` o extiende los existentes.
   - Corre `npm test` y `npx tsc --noEmit`.
8. **Documentación**
   - Agrega guía en `docs/guides/<platform>.md` si aplica.
   - Actualiza `README.md` y `docs/index.md` listando la plataforma soportada.

## Verification

- `./init.sh` pasa.
- `npx tsc --noEmit` pasa.
- `npm test` pasa.
- Se puede crear un `job.json` con `"platform": "<platform>"` y `npx ts-node src/cli/run.ts --job job.json --approve` llega a implementación sin errores de skill no encontrado.

## Output

- `progress/add-platform-<platform>.md` con decisiones, comandos y validaciones.
