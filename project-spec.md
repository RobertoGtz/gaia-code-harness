# Project Spec

Mantenido por `spec_partner`. Cada sección captura las decisiones tomadas durante la conversación de especificación.

---

## Feature #2: iOS build strategy for large Tuist monorepos

### Propósito

El harness GAIA debe poder ejecutar jobs de generación de código iOS contra
diferentes tipos de repositorios:

- Grandes monorepos Tuist (Rappi iOS) con decenas de miles de archivos,
  symlinks rotos y dependencias privadas.
- Módulos Tuist individuales dentro de esos monorepos.
- Proyectos iOS no-Tuist (SPM o Xcode puro) que no usan Tuist.

La elección de estrategia de build (`buildStrategy`) permite adaptar la
validación sin cambiar el resto del pipeline.

### Estrategias soportadas

| Estrategia   | Cuándo usar                      | Comportamiento esperado                                                                                                      |
| ------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `resolve`    | Monorepos Tuist grandes          | Solo ejecuta `swift package resolve` / tuist install para validar dependencias. Rápido.                                      |
| `tuist`      | Módulo Tuist con `Project.swift` | Genera el proyecto (`tuist generate`) si es necesario y ejecuta `tuist build`.                                               |
| `xcodebuild` | Proyecto Xcode/SPM sin Tuist     | Compila con `xcodebuild` directamente, descubriendo `.xcodeproj` o `.xcworkspace`.                                           |
| `auto`       | Default                          | Intenta `tuist build`; si falla, `xcodebuild`; si falla, `resolve`. Si no hay Tuist, salta a `xcodebuild` y luego `resolve`. |

### Decisiones de diseño

1. **Resolver por default en monorepos grandes.** Compilar toda la app Rappi
   toma > 20 minutos. `resolve` valida que las dependencias sean resolubles
   sin pagar el costo de compilación completa. El agente LLM sigue teniendo
   feedback real de tipos y módulos via `tuist build` / `swift package resolve`.

2. **Preservar el upstream real de GitHub.** En la Rappi setup usan un
   `LOCAL_REPOS_PATH` con clones locales. Si no se restaura la URL de GitHub
   en `origin`, el `ReviewerAgent` intenta crear el PR contra el dueño
   definido por `GITHUB_OWNER`, que puede no coincidir con el upstream real.
   `setupRepository` guarda la URL original de GitHub antes de copiar y la
   restaura después.

3. **Copiar `Tuist/.build` del repo local.** Las dependencias de plugins Tuist
   y paquetes resueltos ya están en el clone local. Copiar el cache ahorra
   descargas y evita fallos de autenticación contra repos privados. Si el
   destino ya existe, se omite la copia para no sobreescribir.

4. **Evitar generación Tuist innecesaria para proyectos no-Tuist.** Si el
   workspace del job no contiene `Tuist.swift`, `Workspace.swift` ni
   `Project.swift`, `auto` salta directamente a `xcodebuild` y luego a
   `resolve`, sin invocar `tuist generate`.

5. **Manejo de symlinks rotos y estructuras gigantes.** El monorepo Rappi
   tiene ~14k archivos a profundidad 3 y symlinks rotos. `getDirectoryStructure`
   y `searchFiles` ahora los ignoran y limitan la estructura a 500 archivos
   para no saturar el contexto del LLM.

### Casos límite

- Repo no existe localmente: se clona desde GitHub con `GITHUB_TOKEN`.
- Repo existe pero no es el esperado: se reutiliza si `repoPath` ya existe.
- `tuist build` falla por plugin no resuelto: `auto` cae a `xcodebuild`.
- `xcodebuild` falla por dependencias externas (CocoaPods/script): se cae a
  `resolve`.
- No hay toolset iOS instalado: `verifyIosEnvironment` falla antes de build.

### Artefactos

- `src/skills/ios/index.ts` — selección de estrategia y orquestación.
- `src/tools/xcode-runner.ts` — `runTuistBuild`, `runXcodeBuild`, `ensureTuistGenerated`, etc.
- `src/tools/repo.ts` — `setupRepository` con cache y upstream preservation.
- `src/tools/git.ts` — remote parsing, PR creation, token injection.
- `src/types/index.ts` y `src/db/index.ts` — campo `buildStrategy`.
- `src/api/routes/jobs.ts` y `src/cli/run.ts` — aceptan `buildStrategy` en requests.

<!-- spec_partner añade una sección por feature aquí -->
