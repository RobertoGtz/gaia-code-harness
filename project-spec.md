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

- `src/plugins/ios/index.ts` — selección de estrategia y orquestación.
- `src/tools/xcode-runner.ts` — `runTuistBuild`, `runXcodeBuild`, `ensureTuistGenerated`, etc.
- `src/tools/repo.ts` — `setupRepository` con cache y upstream preservation.
- `src/tools/git.ts` — remote parsing, PR creation, token injection.
- `src/types/index.ts` y `src/db/index.ts` — campo `buildStrategy`.
- `src/api/routes/jobs.ts` y `src/cli/run.ts` — aceptan `buildStrategy` en requests.

## Feature #3: Update Flutter Web skill for RPP multiplatform monorepos

### Propósito

El skill de Flutter Web del harness GAIA debe reflejar la estructura real de
los repositorios multiplataforma de RPP, que son monorepos `melos` con FVM,
dependencias privadas en Bitbucket y aplicaciones web desplegadas en
subrutas específicas. Hasta ahora el skill asumía navegación con `go_router`
y estructura `lib/src/web/`, lo cual no coincide con el código real de RPP.

### Repo de referencia

- `rpp-co/rpp-account-basics-multiplatform-pyme` (GitHub, owner `rpp-co`)
- App principal: `apps/app` (`rpp_pyme_app`)
- Features: `packages/features/{account_summary,breb,certificates,limits,vaults}`
- Shared base: `packages/base/pay_multiplatform_account_basics_common`
- Flutter SDK: `3.35.7` (FVM `.fvmrc`)
- Dart SDK: `3.9.2` (`melos.yaml` environment)
- Melos: `6.3.2`

### Estructura de paquete de feature

Cada feature publica su API desde `lib/{feature}.dart` y organiza el código:

```
lib/
  {feature}.dart              # exporta router + routes
  src/
    core/{feature}_router.dart  # fluro Handler + configuration map
    core/{feature}_routes.dart  # constantes de ruta
    data/models/...             # freezed/json_serializable models
    data/repositories/...       # repositories abstract + impl
    presentation/...            # widgets, providers, hooks
```

### Decisiones de diseño

1. **Melos bootstrap es el primer paso.** Los paquetes dependen entre sí y
   de paquetes base compartidos vía `pubspec_overrides.yaml`. Ejecutar
   `melos bootstrap` primero vincula los paquetes locales antes de que
   `flutter pub get` resuelva las dependencias externas.

2. **Navegación con `fluro`, no `go_router`.** El router expone un `Map<String,
Handler>` con la ruta como clave y un `Handler` de fluro. El root app
   (`apps/app`) reúne las configuraciones de todas las features y las pasa al
   `router.configureRoutes(...)`. El skill no debe generar `Navigator.push` ni
   `MaterialPageRoute` directamente.

3. **Paquetes compartidos vienen de Bitbucket.** `pubspec_overrides.yaml`
   apunta a `bitbucket.org/rappinc/rappi-pay-multiplatform-app.git` y a
   `bitbucket.org/rappinc/rpp-multiplatform-common-web.git`. Las credenciales
   se inyectan en CI con `USERNAME_REPOSITORY` y `PASSWORD_REPOSITORY`. Esto es
   independiente del `GITHUB_TOKEN` usado para crear PRs en GitHub. El skill
   debe documentar que existen dos sets de credenciales: GitHub para PRs y
   Bitbucket para dependencias privadas.

4. **Build web requiere `--base-href` y `dart-define`.** El Dockerfile usa
   `--base-href=/banking-accounts/pyme/account-basics/` y define variables
   `BACKEND_API`, `FIREBASE_*`, `AMPLITUD_*`, `SHARED_SERVICES_API`, `BRAZE_*`
   y `FLUTTER_WEB_USE_SKIA=true`. El skill debe pasar estos valores si están
   disponibles en el job.

5. **Tests y coverage son por paquete de feature.** `scripts/coverage.sh` corre
   `flutter test --coverage` dentro de cada `packages/features/<feature>` y
   luego mergea los `lcov.info`. El skill no corre todos los tests desde la
   raíz, sino que ejecuta en el paquete objetivo.

6. **Análisis estático excluye archivos generados.** `*.g.dart`,
   `*.freezed.dart` y `*.config.dart` deben ignorarse. El linter base es
   `very_good_analysis` (aunque se puede heredar de
   `pay_multiplatform_analysis` en los paquetes que lo usan).

7. **Estructura de monorepo con apps/ y packages/.** No es un proyecto plano
   con `lib/` en la raíz. Si hay `melos.yaml`, el skill debe tratar el repo
   como monorepo y resolver módulos con `packages/features/<module>` y la app
   con `apps/app`.

### Casos límite

- `.fvmrc` presente pero `flutter` en PATH no coincide con la versión: se
  advierte que FVM puede seleccionar la versión correcta si está activado.
- `pubspec_overrides.yaml` con placeholders de credenciales: el build de CI
  las reemplaza, pero en local se necesita exportar credenciales de Bitbucket.
- Feature package sin `test/`: el skill reporta "no tests" sin fallar el job.
- App con rutas en `apps/app` y features en `packages/features/`: la build web
  siempre corre desde `apps/app`, mientras que tests y analyze corren desde el
  paquete de feature.
- Repo owner distinto (`rpp-co` vs `rappi-inc`): el skill hereda owner y token
  del job, no del default global.

### Artefactos

- `src/plugins/flutter_web/index.ts` — prompt context, verificación, build, test, analyze.
- `src/tools/test-runner.ts` — `runMelosBootstrap`, `runFlutterPubGet`, `runFlutterTests`, `runDartAnalyze`.
- `feature_list.json` — feature `flutter-web-skill`.
- `features/flutter-web-skill.feature` — contrato Gherkin.
- `progress/tdd_flutter-web-skill.md` — mapa de escenarios a tests.
- `progress/mutation_flutter-web-skill.md` — resultados de mutación.

<!-- spec_partner añade una sección por feature aquí -->
