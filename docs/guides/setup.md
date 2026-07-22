# Setup Guide — GAIA Code Harness

> Full setup for local development

---

## Requirements

| Requirement    | Mode A (HTTP API) |   Mode B (CLI)    | Mode C (Webhook) |
| -------------- | :---------------: | :---------------: | :---------------: |
| Node.js 18+    |        ✅         |        ✅         |        ✅         |
| PostgreSQL 14+ |        ✅         |  ❌ not required  |        ✅         |
| Git            |        ✅         |        ✅         |        ✅         |
| Flutter SDK    | Flutter jobs only | Flutter jobs only | Flutter jobs only |
| Swift 5.9+     |   iOS jobs only   |   iOS jobs only   |   iOS jobs only   |
| JDK 17+        | Android jobs only | Android jobs only | Android jobs only |

---

## Quick start (5 minutes)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Database _(Modes A and C — skip in Mode B)_

```bash
# Create database
createdb gaia_harness

# Or with psql:
psql -c "CREATE DATABASE gaia_harness;"
```

### 3. Configure Environment Variables

```bash
cp .env.example .env
# Edit .env with your credentials
```

**Minimum required — Modes A and C (HTTP server):**

```bash
PORT=3000
DATABASE_URL=postgresql://localhost:5432/gaia_harness
OPENAI_API_KEY=sk-...        # or ANTHROPIC_API_KEY
GITHUB_TOKEN=ghp_...
GITHUB_OWNER=your-org

# Optional — read Figma designs
FIGMA_ACCESS_TOKEN=...       # personal access token with scope file_read
```

**Minimum required — Mode B (CLI, no Postgres):**

```bash
OPENAI_API_KEY=sk-...        # or ANTHROPIC_API_KEY
GITHUB_TOKEN=ghp_...
GITHUB_OWNER=your-org

# Optional — read Figma designs
FIGMA_ACCESS_TOKEN=...       # personal access token with scope file_read
```

### 4. Initialize Database _(Modes A and C — skip in Mode B)_

```bash
npm run db:init
```

### 5. Build and Run

**Modes A and C (HTTP server + Postgres):**

```bash
npm run build
npm start        # or: npm run dev (auto-reload)
```

**Mode B (CLI, no server):**

```bash
npm run build
npx ts-node src/cli/run.ts --job my-job.json --approve
```

> In Mode B there is no server to start — the CLI creates the job, processes it, and exits.

### 6. Verify

**Modes A and C:**

```bash
curl http://localhost:3000/health
# → { "status": "ok", "timestamp": "..." }
```

**Mode B:**

```bash
npx ts-node src/cli/run.ts --list
# → List of jobs on disk (empty at first)
```

---

## Detailed configuration

### PostgreSQL Database

#### Option A: Local PostgreSQL

```bash
# macOS with Homebrew
brew install postgresql
brew services start postgresql

# Create user and DB
psql -c "CREATE DATABASE gaia_harness;"
```

#### Option B: Docker (Recommended for demo)

```bash
docker run -d \
  --name gaia-postgres \
  -e POSTGRES_DB=gaia_harness \
  -e POSTGRES_USER=user \
  -e POSTGRES_PASSWORD=pass \
  -p 5432:5432 \
  postgres:15
```

With Docker, use this `DATABASE_URL` in `.env`:

```
DATABASE_URL=postgresql://user:pass@localhost:5432/gaia_harness
```

### Local Repos Path (For demo without GitHub)

If you want to use local repos instead of cloning from GitHub:

```bash
# Create directory for local repos
mkdir -p /path/to/repos

# Create Flutter demo repo
mkdir -p /path/to/repos/demo-repo
cd /path/to/repos/demo-repo
flutter create . --project-name demo_app
git init && git checkout -b develop
git add . && git commit -m "Initial commit"

# Create iOS demo repo (SPM)
mkdir -p /path/to/repos/demo-repo-ios
cd /path/to/repos/demo-repo-ios
git init && git checkout -b develop
# Create Package.swift, Sources/, Tests/ (see scripts/demo.sh)
git add . && git commit -m "Initial commit"

# Create Android demo repo (Gradle Kotlin DSL)
mkdir -p /path/to/repos/demo-repo-android
cd /path/to/repos/demo-repo-android
git init && git checkout -b develop
# Create build.gradle.kts, app/, settings.gradle.kts
git add . && git commit -m "Initial commit"
```

Configure in `.env`:

```
LOCAL_REPOS_PATH=/path/to/repos
```

The harness will clone from the local path (preserving `.git`) instead of trying to clone from GitHub.

### GitHub Token (Optional for PRs)

1. Go to: https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Scopes: `repo` (full control)
4. Copy token to `.env`:
   ```
   GITHUB_TOKEN=ghp_xxxxxxxx
   GITHUB_OWNER=your-org
   ```

### Jira API Token (Optional)

1. Go to: https://id.atlassian.com/manage-profile/security/api-tokens
2. Create token
3. Copy to `.env`:
   ```
   JIRA_BASE_URL=https://your-org.atlassian.net
   JIRA_EMAIL=your.email@your-org.com
   JIRA_API_TOKEN=xxxxxxxx
   DEFAULT_PLATFORM=flutter          # platform if ticket has no label
   DEFAULT_REPO=your-org/your-repo   # repo if ticket has no repo label
   ```

---

## Setup verification

### Verify installation

```bash
# 1. Server running
curl http://localhost:3000/health

# 2. Create a test job (flat format)
curl -s -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Installation test",
    "platform": "flutter",
    "repo": "my-org/demo-repo",
    "acceptanceCriteria": [
      {"id":"ac-1","text":"WHEN test THEN success","testable":true}
    ]
  }'

# 3. Verify jobs
curl http://localhost:3000/jobs
```

### Demo script

```bash
# Flutter (default)
./scripts/demo.sh flutter

# iOS/Swift
./scripts/demo.sh ios

# Android/Kotlin
./scripts/demo.sh android
```

---

## Troubleshooting

### Error: "Cannot find module"

```bash
# Clean and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Error: "Connection refused" (PostgreSQL)

```bash
# Verify PostgreSQL is running
brew services list | grep postgresql
# or
docker ps | grep postgres

# Verify credentials in .env
```

### Error: "Port already in use"

```bash
# Change port in .env
PORT=3001
```

### Error: "Flutter not found"

```bash
# Install Flutter (only for real testing)
https://docs.flutter.dev/get-started/install
```

---

## Project structure

```
gaia-code-harness/
├── src/
│   ├── index.ts              # Entry point
│   ├── types/                # TypeScript types
│   ├── db/                   # PostgreSQL
│   ├── api/                  # REST API
│   ├── agents/               # Generic agents (platform-agnostic)
│   │   ├── base.ts           # BaseAgent abstract class
│   │   ├── spec-author.ts    # SpecAuthorAgent
│   │   ├── implementer.ts    # ImplementerAgent (+ executeTDD)
│   │   ├── reviewer.ts       # ReviewerAgent
│   │   └── mutation-tester.ts# MutationTesterAgent
│   ├── plugins/              # Platform plugins (swappable, with repo override)
│   │   ├── index.ts          # loadSkill() with repo-local override logic
│   │   ├── flutter/          # FlutterSkill (built-in)
│   │   ├── flutter_web/      # FlutterWebSkill (built-in)
│   │   ├── ios/              # IosSkill (built-in)
│   │   └── android/          # AndroidSkill (built-in)
│   ├── harness/              # Orchestrator (Leader)
│   ├── cli/run.ts            # CLI entry point (Mode B)
│   └── tools/                # Shared utilities
│       ├── file.ts           # File operations
│       ├── git.ts            # Git + GitHub API (with dry-run)
│       ├── repo.ts           # Repository setup (shared)
│       ├── test-runner.ts    # Flutter test, dart analyze, pub get
│       ├── xcode-runner.ts   # swift test, swiftlint, xcodebuild
│       └── gradle-runner.ts  # gradle test, lint, build
├── docs/                     # Documentation
├── scripts/                  # Demo & presentation
├── package.json             # Dependencies
├── tsconfig.json            # TypeScript config
└── .env.example             # Template env vars
```

---

## Next steps

1. **Verify setup:**

   ```bash
   npm run build
   npm start
   ```

2. **Run demo:**

   ```bash
   ./scripts/demo.sh
   ```

3. **Explore documentation:**
   - [`docs/guides/testing.md`](testing.md) — Commands per mode (A/B/C)
   - [`docs/engineering/architecture.md`](../engineering/architecture.md) — Deep architecture
   - [`API.md`](../../API.md) — Complete API reference

---

## Verification checklist

- [ ] Node.js 18+ installed
- [ ] PostgreSQL running _(Modes A and C only)_
- [ ] `npm install` completed
- [ ] `.env` configured
- [ ] `npm run db:init` successful _(Modes A and C only)_
- [ ] `npm run build` without errors
- [ ] `curl http://localhost:3000/health` responds OK _(Modes A and C)_
- [ ] `npx ts-node src/cli/run.ts --list` works _(Mode B)_
- [ ] Demo script works (`./scripts/demo.sh flutter`, `ios`, `android`)

---

**Problems?** See the troubleshooting table in [`docs/guides/testing.md`](testing.md#troubleshooting).
