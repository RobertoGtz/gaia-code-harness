# Índice de Documentación - Gaia Code Harness

> Documentación completa del proyecto Gaia Code Harness
> Ticket: **RPCO-37575**

---

## 📚 Documentación Principal (12 documentos)

| #   | Documento                                        | Descripción                          | Cuándo usar            |
| --- | ------------------------------------------------ | ------------------------------------ | ---------------------- |
| 1   | [README.md](../README.md)                        | Overview, instalación, API, 18 dudas | **Primero**            |
| 2   | [SETUP.md](./SETUP.md)                           | Guía de instalación paso a paso      | Setup local            |
| 3   | [SETUP_CHECKLIST.md](../SETUP_CHECKLIST.md)      | Checklist de lo que falta instalar   | Verificar setup        |
| 4   | [TESTING.md](./TESTING.md)                       | Cómo probar el proyecto local        | Testing local          |
| 5   | [ARCHITECTURE.md](./ARCHITECTURE.md)             | Arquitectura profunda, diagramas     | Entender internos      |
| 6   | [GAIA_INTEGRATION.md](./GAIA_INTEGRATION.md)     | Input/Output Gaia ↔ Harness          | Integración            |
| 7   | [HOW_REMOTE_WORKS.md](./HOW_REMOTE_WORKS.md)     | Flujo remoto visual                  | Deploy producción      |
| 8   | [DEPLOYMENT.md](./DEPLOYMENT.md)                 | AWS/GCP/Azure deployment             | Subir a producción     |
| 9   | [PLUGINS.md](../PLUGINS.md)                      | Sistema de plugins                   | Agentes personalizados |
| 10  | [API.md](../API.md)                              | API REST reference                   | Desarrollo API         |
| 11  | [PROJECT_REVIEW.md](../PROJECT_REVIEW.md)        | Revisión exhaustiva                  | Verificación           |
| 12  | [GUION_PRESENTACION.md](./GUION_PRESENTACION.md) | Guion para presentar al equipo       | Presentación           |

---

## 🎬 Scripts

| Script                              | Descripción                       | Uso                                       |
| ----------------------------------- | --------------------------------- | ----------------------------------------- |
| [demo.sh](../scripts/demo.sh)       | Demo interactivo multi-plataforma | `./scripts/demo.sh flutter\|ios\|android` |
| [present.sh](../scripts/present.sh) | Presentación con slides           | `./scripts/present.sh`                    |

---

## 📂 Estructura de Código

```
src/
├── index.ts                    # Punto de entrada (carga dotenv)
├── types/
│   └── index.ts               # Tipos TypeScript (documentados)
├── db/
│   └── index.ts               # PostgreSQL CRUD
├── api/
│   ├── server.ts              # Fastify server
│   └── routes/
│       └── jobs.ts            # 6 endpoints REST
├── agents/
│   ├── base.ts                # Clase base abstracta
│   ├── spec-author.ts         # SpecAuthorAgent genérico (todas las plataformas)
│   ├── implementer.ts         # ImplementerAgent genérico (todas las plataformas)
│   ├── reviewer.ts            # ReviewerAgent genérico (todas las plataformas)
│   └── registry.ts            # getAgentsForPlatform() — retorna los 3 agentes
├── skills/
│   ├── index.ts               # PlatformSkill interface + loadSkill(platform)
│   ├── flutter/index.ts       # Flutter mobile: pub get, flutter test, dart analyze
│   ├── flutter_web/index.ts   # Flutter Web: web constraints + forbidden pkg check
│   ├── ios/index.ts           # iOS: swift pkg resolve, swift test, swiftlint
│   └── android/index.ts       # Android: gradlew deps, test, lintDebug, ktlint
├── harness/
│   ├── leader.ts              # Orchestrador (10 estados)
│   └── plugin-loader.ts       # Sistema de plugins
└── tools/
    ├── file.ts                # File system ops
    ├── git.ts                 # Git + GitHub API (force push para re-runs)
    ├── repo.ts                # Setup repositorios (shared)
    ├── test-runner.ts         # Flutter test runner (usado por skills flutter/flutter_web)
    ├── xcode-runner.ts        # Swift test, swiftlint, xcodebuild (usado por skill ios)
    └── gradle-runner.ts       # Gradle test, lint, build (usado por skill android)
```

---

## 📦 Configuración

| Archivo                           | Descripción              |
| --------------------------------- | ------------------------ |
| [package.json](../package.json)   | Dependencias y scripts   |
| [tsconfig.json](../tsconfig.json) | TypeScript config        |
| [.env.example](../.env.example)   | Variables de entorno (9) |

---

## 🎯 Ejemplos

| Ejemplo                                                                                         | Descripción                  |
| ----------------------------------------------------------------------------------------------- | ---------------------------- |
| [examples/.gaia/gaia.json](../examples/.gaia/gaia.json)                                         | Manifest de plugin           |
| [examples/.gaia/agents/flutter-spec-author.ts](../examples/.gaia/agents/flutter-spec-author.ts) | Agente Flutter personalizado |

---

## 🚀 Quick Start

```bash
# 1. Setup
createdb gaia_harness
cp .env.example .env
# Editar .env

# 2. Instalar y compilar
npm install
npm run db:init
npm run build

# 3. Correr
npm run dev

# 4. Verificar
curl http://localhost:3000/health

# 5. Demo (elegir plataforma)
./scripts/demo.sh flutter    # o ios, android
```

---

## 📊 Estadísticas del Proyecto

- **Líneas de código:** ~2,500 TypeScript
- **Archivos fuente:** ~18
- **Documentos:** 12
- **Endpoints REST:** 6
- **Estados de job:** 10
- **Agentes:** 3 genéricos + 1 base + 1 registry
- **Skills:** 4 (flutter, flutter_web, ios, android)
- **Plataformas:** Flutter, Flutter Web, iOS, Android
- **Dependencias:** 19 paquetes

---

## 🔗 Links Externos

- **Harness Engineering**: https://www.youtube.com/watch?v=q9Vaoz0hd0U
- **Spec-Driven Development**: https://www.youtube.com/watch?v=ElGlTv2A_bM
- **GitHub Token**: https://github.com/settings/tokens
- **Jira API Token**: https://id.atlassian.com/manage-profile/security/api-tokens

---

**Ticket:** RPCO-37575  
**Estado:** Listo para presentación al equipo
