# Checklist de producción — GAIA Code Harness

> Lo que debes verificar y configurar antes de usar el harness en producción.  
> El sistema ya genera código real, crea PRs reales e integra Jira. Solo requiere credenciales y entorno.

---

## 1. Credenciales mínimas

### LLM (al menos una)

- [ ] `OPENAI_API_KEY` — obtener en https://platform.openai.com/api-keys
- [ ] `ANTHROPIC_API_KEY` — obtener en https://console.anthropic.com/

### GitHub (obligatorio para PRs)

- [ ] `GITHUB_TOKEN` — PAT con scope `repo` → https://github.com/settings/tokens
- [ ] `GITHUB_OWNER` — org o usuario dueño de los repos target
- [ ] El repo target debe existir bajo `GITHUB_OWNER/repo-name`
- [ ] El token debe tener acceso de escritura al repo

### Jira (si se usan tickets)

- [ ] `JIRA_BASE_URL` — subdominio **exacto** del tenant (ej. `https://tu-org.atlassian.net`)
- [ ] `JIRA_EMAIL` — email de la cuenta Jira
- [ ] `JIRA_API_TOKEN` — obtener en https://id.atlassian.com/manage-profile/security/api-tokens
- [ ] `DEFAULT_PLATFORM` — plataforma por defecto si el ticket no tiene label (`flutter`)
- [ ] `DEFAULT_REPO` — repo por defecto si el ticket no tiene label `repo:org/nombre`

### Figma (opcional, para enriquecer specs con diseño)

- [ ] `FIGMA_ACCESS_TOKEN` — obtener en https://help.figma.com/hc/en-us/articles/8085703771159-Manage-personal-access-tokens (scope `file_read`)
- [ ] Incluir `figmaUrl` en el job o que Jira lo extraiga del ticket

---

## 2. Base de datos

**Modos A y C** (requieren PostgreSQL):

- [ ] PostgreSQL 15+ disponible (local o remoto)
- [ ] `DATABASE_URL` configurado en `.env`
- [ ] Schema inicializado: `npm run db:init`

**Modo B** (CLI — no requiere base de datos):

- [ ] `progress/.state/` con permisos de escritura para el usuario que corre el CLI
- [ ] `LOCAL_REPOS_PATH` configurado si usas repos locales en lugar de clonar desde GitHub

---

## 3. Toolchains por plataforma

Solo instala el SDK de la plataforma que vayas a usar.

**Flutter:**

- [ ] Flutter SDK ≥ 3.x instalado (`flutter --version`)
- [ ] `flutter pub get` funciona en el repo target

**iOS (solo macOS):**

- [ ] Xcode con Swift 5.9+ instalado
- [ ] `swift test` funciona en el repo target
- [ ] SwiftLint instalado (`brew install swiftlint`) — opcional

**Android:**

- [ ] JDK 17+ instalado (`java -version`)
- [ ] Gradle disponible vía wrapper `./gradlew` en el repo target
- [ ] `./gradlew test` funciona en el repo target

**Todos:**

- [ ] Git configurado con acceso de escritura al repo (SSH key o token)

---

## 4. Deploy remoto

Para correr el harness en un servidor en lugar de localhost:

### Infraestructura mínima

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

| Opción                         | Complejidad | Costo aprox. | Cuándo usarla       |
| ------------------------------ | ----------- | ------------ | ------------------- |
| VM simple (EC2/GCE)            | Baja        | ~$30/mes     | Proof of concept    |
| Docker en VM                   | Media       | ~$30/mes     | Staging             |
| ECS / Cloud Run                | Media       | ~$50/mes     | Producción          |
| **CLI en GitHub Actions / CI** | Baja        | $0 (Actions) | Modo B sin servidor |

### Seguridad

- [ ] HTTPS habilitado (Let's Encrypt o similar)
- [ ] Variables de entorno en secrets manager (no en archivos)
- [ ] Firewall: solo la fuente de triggers tiene acceso a `POST /jobs` y `POST /webhook/trigger`
- [ ] `WEBHOOK_SECRET` configurado si usas el webhook de Jira/Slack
