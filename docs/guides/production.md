# Production checklist — GAIA Code Harness

> What to verify and configure before using the harness in production.  
> The system already generates real code, creates real PRs, and integrates Jira. It only requires credentials and environment.

---

## 1. Minimum credentials

### LLM (at least one)

- [ ] `OPENAI_API_KEY` — get at https://platform.openai.com/api-keys
- [ ] `ANTHROPIC_API_KEY` — get at https://console.anthropic.com/

### GitHub (required for PRs)

- [ ] `GITHUB_TOKEN` — PAT with `repo` scope → https://github.com/settings/tokens
- [ ] `GITHUB_OWNER` — org or user owning the target repos
- [ ] The target repo must exist under `GITHUB_OWNER/repo-name`
- [ ] The token must have write access to the repo

### Jira (if using tickets)

- [ ] `JIRA_BASE_URL` — **exact** tenant subdomain (e.g. `https://your-org.atlassian.net`)
- [ ] `JIRA_EMAIL` — Jira account email
- [ ] `JIRA_API_TOKEN` — get at https://id.atlassian.com/manage-profile/security/api-tokens
- [ ] `DEFAULT_PLATFORM` — default platform if ticket has no label (`flutter`)
- [ ] `DEFAULT_REPO` — default repo if ticket has no `repo:org/name` label

### Figma (optional, to enrich specs with design)

- [ ] `FIGMA_ACCESS_TOKEN` — get at https://help.figma.com/hc/en-us/articles/8085703771159-Manage-personal-access-tokens (scope `file_read`)
- [ ] Include `figmaUrl` in the job or let Jira extract it from the ticket

---

## 2. Database

**Modes A and C** (require PostgreSQL):

- [ ] PostgreSQL 15+ available (local or remote)
- [ ] `DATABASE_URL` configured in `.env`
- [ ] Schema initialized: `npm run db:init`

**Mode B** (CLI — no database required):

- [ ] `progress/.state/` writable by the user running the CLI
- [ ] `LOCAL_REPOS_PATH` configured if using local repos instead of cloning from GitHub

---

## 3. Toolchains by platform

Only install the SDK for the platform you will use.

**Flutter:**

- [ ] Flutter SDK ≥ 3.x installed (`flutter --version`)
- [ ] `flutter pub get` works in the target repo

**iOS (macOS only):**

- [ ] Xcode with Swift 5.9+ installed
- [ ] `swift test` works in the target repo
- [ ] SwiftLint installed (`brew install swiftlint`) — optional

**Android:**

- [ ] JDK 17+ installed (`java -version`)
- [ ] Gradle available via wrapper `./gradlew` in the target repo
- [ ] `./gradlew test` works in the target repo

**All:**

- [ ] Git configured with write access to the repo (SSH key or token)

---

## 4. Remote deploy

To run the harness on a server instead of localhost:

### Minimum infrastructure

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

| Option                         | Complexity | Approx. cost | When to use              |
| ------------------------------ | ----------- | ------------ | ------------------------ |
| Simple VM (EC2/GCE)            | Low         | ~$30/month   | Proof of concept         |
| Docker on VM                   | Medium      | ~$30/month   | Staging                  |
| ECS / Cloud Run                | Medium      | ~$50/month   | Production               |
| **CLI in GitHub Actions / CI** | Low         | $0 (Actions) | Mode B without a server    |

### Security

- [ ] HTTPS enabled (Let's Encrypt or similar)
- [ ] Environment variables in secrets manager (not in files)
- [ ] Firewall: only the trigger source has access to `POST /jobs` and `POST /webhook/trigger`
- [ ] `WEBHOOK_SECRET` configured if using the Jira/Slack webhook
