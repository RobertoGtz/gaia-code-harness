# GAIA Code Harness

> AI code generation orchestrator with mandatory human oversight.  
> Generates a technical plan, waits for approval, writes code, and opens a Pull Request — in ~60 seconds.

---

## What does it do?

You give it acceptance criteria. The system generates a technical plan, waits for your approval, writes the code, and opens a Pull Request — without you touching a single line of code.

```
PM writes ACs
      │
      ▼
 SpecAuthor      → analyzes repo + Figma (optional) + generates TechnicalSpec + Gherkin
      │            └─ writes handoff.md for the next agent
      ⏸  Human approves the plan  ← only mandatory control point
      │
      ▼
 Implementer     → writes code (bulk or TDD Red-Green-Refactor)
      │            └─ reads handoff.md and reviewFeedback from previous iterations
      │
      ▼
 Reviewer        → lint + tests + critical LLM review (few-shot)
      │            └─ opens GitHub PR if everything passes
      │
      ▼
 MutationTester  → validates that tests catch real bugs (≥ 80%)
      │
      └─ failed? → feedback returns to Implementer (up to 5 retries; all modes)
           ✅  Pull Request ready  (~60 seconds)
```

**Platforms:** Flutter · Flutter Web · iOS/Swift · Android/Kotlin

---

## Three usage modes

| Mode             | How to start                                          | Spec approval            | TDD              | When to use                     |
| ---------------- | ----------------------------------------------------- | ------------------------ | ---------------- | ------------------------------- |
| **A — HTTP API** | `POST /jobs` (curl, Postman, CI/CD)                   | `POST /jobs/:id/approve` | `"tddMode":true` | Integrations, automation        |
| **B — CLI**      | `npx ts-node src/cli/run.ts --job my-job.json`        | `--approve` / `--reject "feedback"` | flag `--tdd`     | Local development, quick demos  |
| **C — Webhook**  | `POST /webhook/trigger` (Jira, Slack, GitHub Actions) | Pause at `spec_ready`; `POST /jobs/:id/approve` | label `tdd`      | Production, automatic triggers  |

→ Full guide with examples: **[`docs/guides/quick-start.md`](docs/guides/quick-start.md)**

---

## Quick setup

### 1. Prerequisites

| Tool              | Version   | For what               |
| ----------------- | --------- | ---------------------- |
| Node.js           | ≥ 18      | Always required        |
| Docker            | any       | Postgres (Modes A & C) |
| Flutter SDK       | ≥ 3.x     | Flutter jobs           |
| Xcode + Swift     | ≥ 5.9     | iOS jobs (macOS)       |
| Java JDK + Gradle | JDK 17+   | Android jobs           |

> You only need the SDK for the platform you want to use.

### 2. Install

```bash
git clone https://github.com/RobertoGtz/gaia-code-harness.git
cd gaia-code-harness
npm install && npm run build
```

### 3. Configure `.env`

```bash
cp .env.example .env
```

Minimum variables:

```bash
# LLM — at least one
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# GitHub — to create real PRs
GITHUB_TOKEN=ghp_...
GITHUB_OWNER=your-org

# Jira — only if you use tickets
JIRA_BASE_URL=https://your-org.atlassian.net     # exact tenant subdomain
JIRA_EMAIL=you@email.com
JIRA_API_TOKEN=...
DEFAULT_PLATFORM=flutter      # fallback if ticket has no platform label
DEFAULT_REPO=your-org/your-repo   # fallback if ticket has no repo

# Figma — optional, to enrich spec with design context
FIGMA_ACCESS_TOKEN=...        # personal access token with file_read scope
```

### 4. Start the server (Modes A & C)

```bash
# Postgres
docker run -d --name gaia-postgres \
  -e POSTGRES_DB=gaia_harness -e POSTGRES_USER=gaia -e POSTGRES_PASSWORD=gaia \
  -p 5432:5432 postgres:15

# Server
npm run dev
# → Server running on port 3000
```

### 5. Create your first job

**Mode A — HTTP API** (requires server running):

```bash
# With direct acceptance criteria
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "flutter",
    "title": "Add promotional banner",
    "repo": "your-org/your-repo",
    "targetBranch": "develop",
    "requireTests": false,
    "acceptanceCriteria": [
      "WHEN user opens home THEN show promotional banner",
      "WHEN user taps banner THEN navigate to promotion details"
    ]
  }'

# With just a Jira ticket
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{"jiraTicketId": "PROJ-1234", "repo": "your-org/your-repo"}'

# Approve the spec when it reaches spec_ready
curl -X POST http://localhost:3000/jobs/<JOB_ID>/approve \
  -H "Content-Type: application/json" \
  -d '{"approved": true}'
```

**Mode B — CLI** (no server or Docker):

```bash
npx ts-node src/cli/run.ts --job my-job.json --approve
npx ts-node src/cli/run.ts --job my-job.json --reject "Needs to include analytics"  # regenerate spec
npx ts-node src/cli/run.ts --job my-job.json --tdd --approve   # with TDD
npx ts-node src/cli/run.ts --jira PROJ-1234 --approve          # from Jira
```

### 6. Automatic demo (everything in one command)

```bash
./scripts/demo.sh flutter      # Mode A + Flutter
./scripts/demo.sh ios b        # Mode B (CLI) + iOS
./scripts/demo.sh android c    # Mode C (Webhook) + Android
```

---

## Jira integration

The system reads from the ticket: title, description, acceptance criteria, Figma URL.

**Platform inferred in order:**

1. Ticket labels — `flutter`, `ios`, `android`, `flutter_web`
2. Title prefix — `[MOBILE]` → `DEFAULT_PLATFORM`, `[WEB]` → `flutter_web`
3. Keywords in the title — `swift`, `kotlin`, etc.
4. `DEFAULT_PLATFORM` variable in `.env`

**Repo:** if the ticket has no `repo:org/name` label, pass it in the request body.

> `JIRA_BASE_URL` must be the exact tenant subdomain (e.g. `https://your-org.atlassian.net`). An incorrect subdomain returns a 404.

---

## Full documentation

| Document                                                                  | Description                                            |
| ------------------------------------------------------------------------- | ------------------------------------------------------ |
| **[`docs/guides/quick-start.md`](docs/guides/quick-start.md)**             | Complete step-by-step guide for the 3 modes            |
| **[`docs/guides/demo.md`](docs/guides/demo.md)**                           | Demo with ready-to-copy commands                       |
| **[`API.md`](API.md)**                                                     | Complete REST + Webhook endpoint reference             |
| **[`docs/engineering/architecture.md`](docs/engineering/architecture.md)** | Internal architecture, state machine, agents           |
| **[`docs/guides/setup.md`](docs/guides/setup.md)**                         | Detailed platform setup (Flutter, iOS, Android)        |
| **[`docs/INDEX.md`](docs/INDEX.md)**                                       | Full documentation map                                 |
| **[`AGENTS.md`](AGENTS.md)**                                               | Navigation map for AI agents (Claude Code mode)        |

---

## License

MIT
