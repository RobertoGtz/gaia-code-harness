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
│   ├── registry.ts            # Registry: selecciona agentes según plataforma
│   ├── flutter/               # Agentes Flutter/Dart
│   │   ├── spec-author.ts     #   SpecAuthor Flutter
│   │   ├── implementer.ts     #   Implementer (flutter test, pub get)
│   │   └── reviewer.ts        #   Reviewer (dart analyze)
│   ├── ios/                   # Agentes iOS/Swift
│   │   ├── spec-author.ts     #   SpecAuthor iOS
│   │   ├── implementer.ts     #   Implementer (swift test, SPM)
│   │   └── reviewer.ts        #   Reviewer (swiftlint)
│   └── android/               # Agentes Android/Kotlin
│       ├── spec-author.ts     #   SpecAuthor Android
│       ├── implementer.ts     #   Implementer (gradle test)
│       └── reviewer.ts        #   Reviewer (gradle lint)
├── harness/
│   ├── leader.ts              # Orchestrador (10 estados)
│   └── plugin-loader.ts       # Sistema de plugins
└── tools/
    ├── file.ts                # File system ops
    ├── git.ts                 # Git + GitHub API (force push para re-runs)
    ├── repo.ts                # Setup repositorios (shared)
    ├── test-runner.ts         # Flutter test runner
    ├── xcode-runner.ts        # Swift test, swiftlint, xcodebuild
    └── gradle-runner.ts       # Gradle test, lint, build
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
- **Archivos fuente:** 14
- **Documentos:** 12
- **Endpoints REST:** 6
- **Estados de job:** 10
- **Agentes:** 9 (3 por plataforma) + 1 base + 1 registry
- **Plataformas:** Flutter, iOS, Android
- **Dependencias:** 19 paquetes
- **Dudas documentadas:** 18

---

## 🔗 Links Externos

- **Harness Engineering**: https://www.youtube.com/watch?v=q9Vaoz0hd0U
- **Spec-Driven Development**: https://www.youtube.com/watch?v=ElGlTv2A_bM
- **GitHub Token**: https://github.com/settings/tokens
- **Jira API Token**: https://id.atlassian.com/manage-profile/security/api-tokens

---

**Ticket:** RPCO-37575  
**Estado:** Listo para presentación al equipo
