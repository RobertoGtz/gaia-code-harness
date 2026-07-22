# Guide to the Three Modes — GAIA Code Harness

> Step-by-step for each usage mode. For a system overview see [`README.md`](../README.md).

---

## Which mode should I use?

| Situation                                                                  | Recommended mode      |
| -------------------------------------------------------------------------- | --------------------- |
| I want to call the system from Postman, a script, or CI/CD                   | **Mode A — HTTP API** |
| I am a developer and want to run it from the terminal locally              | **Mode B — CLI**      |
| I use Jira/Slack and want the system to start when I create a ticket       | **Mode C — Webhook**  |

---

## Prerequisites (all modes)

Before using any mode, make sure you have:

### 1. Environment variables configured

Copy the example file and edit it:

```bash
cp .env.example .env
```

The most important variables:

```bash
# LLM — at least one of the two
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# GitHub — to create real PRs
GITHUB_TOKEN=ghp_...
GITHUB_OWNER=your-org-or-user

# Jira — to read tickets (optional, only if you use Jira)
# IMPORTANT: use the exact tenant subdomain
JIRA_BASE_URL=https://your-org.atlassian.net
JIRA_EMAIL=you@email.com
JIRA_API_TOKEN=your-token

# Default repo when the ticket has no repo:org/name label
DEFAULT_REPO=your-org/your-repo

# Default platform when the ticket has no platform label
# Tickets with prefix [MOBILE] use this value (default: flutter)
DEFAULT_PLATFORM=flutter

# Figma — optional, enriches the spec with design context
FIGMA_ACCESS_TOKEN=your-figma-token
```

> **Don't have these values?**
>
> - `OPENAI_API_KEY`: create one at [platform.openai.com](https://platform.openai.com/api-keys)
> - `GITHUB_TOKEN`: create one at [github.com/settings/tokens](https://github.com/settings/tokens) (enable the `repo` scope)
> - `JIRA_API_TOKEN`: create one at [id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens)
> - `FIGMA_ACCESS_TOKEN`: create one at [help.figma.com/hc/en-us/articles/8085703771159-Manage-personal-access-tokens](https://help.figma.com/hc/en-us/articles/8085703771159-Manage-personal-access-tokens) (scope `file_read`)

### 2. Dependencies installed

```bash
npm install
npm run build
```

---

## Mode A — HTTP API

**Ideal for:** integrations, automated scripts, CI/CD, Postman.

The server exposes a REST API. You send an HTTP request and the system processes the job in the background.

### Step 1: Start the database (PostgreSQL)

```bash
docker start gaia-postgres 2>/dev/null || docker run -d \
  --name gaia-postgres \
  -e POSTGRES_DB=gaia_harness \
  -e POSTGRES_USER=gaia \
  -e POSTGRES_PASSWORD=gaia \
  -p 5432:5432 \
  postgres:15
```

> The database stores each job's state (which step it is running, logs, generated spec, etc.)

### Step 2: Start the server

```bash
npm run dev
```

You should see:

```
Database initialized
Server running on port 3000
```

> **Keep this terminal open.** The server must be running while you make requests.

### Step 3: Create a job

Open another terminal and send this request (customize the fields):

**Option A — With full details:**

```bash
curl -s -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "flutter",
    "title": "Add promotional banner to home screen",
    "repo": "my-org/demo-repo",
    "targetBranch": "develop",
    "requireTests": false,
    "maxFilesToTouch": 6,
    "figmaUrl": "https://figma.com/design/ABC123/home-screen?node-id=1-234",
    "acceptanceCriteria": [
      "WHEN user opens home screen THEN display promotional banner",
      "WHEN there are 3+ promotions THEN show pagination dots",
      "WHEN user taps banner THEN navigate to promotion details"
    ]
  }' | python3 -m json.tool
```

> If you include `figmaUrl`, `SpecAuthorAgent` will read the Figma frame/node and add its layout, text, colors, and component hierarchy to the spec prompt.

**Option B — With only the Jira ticket (the system fetches the rest):**

```bash
curl -s -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "jiraTicketId": "PROJ-1234",
    "repo": "my-org/my-repo"
  }' | python3 -m json.tool
```

> The system reads the title, description, acceptance criteria, and Figma URL directly from Jira.  
> Requires `JIRA_BASE_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN` in `.env`.
>
> **Platform** is inferred in this order:
>
> 1. Ticket labels — `flutter`, `ios`, `android`, `flutter_web`
> 2. Title prefix — `[MOBILE]` → `DEFAULT_PLATFORM`, `[WEB]` → `flutter_web`
> 3. Keywords in the title — `swift`, `kotlin`, etc.
> 4. `DEFAULT_PLATFORM` variable in `.env`
>
> **Repo**: if the ticket has no `repo:org/name` label, pass it explicitly in the body.

The response includes an `id` — save it:

```json
{
  "job": {
    "id": "e22105e6-eb14-4f7d-9873-d55ab835ca57",
    "status": "pending",
    "title": "Add promotional banner to home screen"
  }
}
```

### Step 4: Monitor progress

Replace `YOUR_JOB_ID` with the id you received:

```bash
curl -s http://localhost:3000/jobs/YOUR_JOB_ID | python3 -m json.tool
```

States you will see in order:

| State             | What is happening                              |
| ----------------- | ---------------------------------------------- |
| `pending`         | Job created, waiting to start                  |
| `fetching_jira`   | Reading Jira ticket data                       |
| `spec_generating` | Analyzing the repo and generating technical plan |
| `spec_ready`      | Plan ready — **waiting for your approval**     |
| `implementing`    | Writing code                                   |
| `reviewing`       | Lint/tests + LLM review + creating PR          |
| `pr_created`      | PR created — running mutation tests            |
| `done`            | Done!                                          |

### Step 5: Approve the spec

When the status is `spec_ready`, the system paused and is waiting for your approval:

```bash
# Approve
curl -s -X POST http://localhost:3000/jobs/YOUR_JOB_ID/approve \
  -H "Content-Type: application/json" \
  -d '{"approved": true}' | python3 -m json.tool

# Reject with feedback (the system regenerates the plan; maximum 5 retries)
curl -s -X POST http://localhost:3000/jobs/YOUR_JOB_ID/approve \
  -H "Content-Type: application/json" \
  -d '{"approved": false, "feedback": "Needs to include analytics"}' | python3 -m json.tool

# If the 5 retries are exceeded, create a new job or use POST /jobs/YOUR_JOB_ID/retry
```

### Step 6: See the result

When the status is `done`:

```bash
curl -s http://localhost:3000/jobs/YOUR_JOB_ID | python3 -m json.tool | grep prUrl
```

You will see the link to the Pull Request on GitHub.

### Retry on error

If the job failed (`test_error`, `build_error`, etc.):

**Mode A / C (HTTP API / Webhook):**

```bash
curl -s -X POST http://localhost:3000/jobs/YOUR_JOB_ID/retry | python3 -m json.tool
```

**Mode B (CLI):**

```bash
npx ts-node src/cli/run.ts --id YOUR_JOB_ID --retry
```

> In Mode B, feedback loops are automatic just like in Modes A/C. The `--retry` flag is used to retry manually after automatic retries are exhausted, or to force a new attempt from `review_error`, `test_error`, or `failed`.

### Using the automatic demo script

If you don't want to do every step manually, the script does it all:

```bash
./scripts/demo.sh flutter a   # HTTP API + Flutter
./scripts/demo.sh ios a       # HTTP API + iOS
./scripts/demo.sh android a   # HTTP API + Android
```

---

## Mode B — CLI

**Best for:** developers who want to run the system locally without starting a server or database.

CLI mode uses disk files instead of Postgres. You don't need Docker or a running server.

### Step 1: Prepare a job file

Create a JSON file with the description of what you want, for example `my-job.json`:

```json
{
  "platform": "flutter",
  "title": "Add promotional banner to home screen",
  "jiraTicketId": "DEMO-100",
  "repo": "my-org/demo-repo",
  "targetBranch": "develop",
  "requireTests": false,
  "maxFilesToTouch": 6,
  "acceptanceCriteria": [
    "WHEN user opens home screen THEN display promotional banner carousel",
    "WHEN there are more than 3 promotions THEN show pagination dots",
    "WHEN user taps a banner THEN navigate to promotion details"
  ]
}
```

Available platforms: `flutter`, `flutter_web`, `ios`, `android`

### Step 2: Run the job

```bash
npx ts-node src/cli/run.ts --job my-job.json
```

The CLI prints progress to the terminal in real time:

```
[SpecAuthor] Analyzing repository...
[SpecAuthor] Generating spec...
[SpecAuthor] Spec ready — status: spec_ready
```

### Step 3: Approve the spec (or auto-approve)

**Manual option:** the CLI pauses and waits. Run in another terminal:

```bash
# Approve
npx ts-node src/cli/run.ts --id YOUR_JOB_ID --approve

# Reject with feedback (maximum 5 retries)
npx ts-node src/cli/run.ts --id YOUR_JOB_ID --reject "Needs to include analytics"
```

**Auto-approval option (ideal for demos):** add `--approve` to the original command and the spec is approved automatically:

```bash
npx ts-node src/cli/run.ts --job my-job.json --approve
```

> With `--approve`, the pipeline runs end to end without manual intervention.

**TDD mode (Red-Green-Refactor):** add `--tdd` to activate the red-green cycle per test:

```bash
npx ts-node src/cli/run.ts --job my-job.json --tdd --approve
```

### Step 4: Use with Jira directly

If you have the Jira variables in `.env`, you can create a job directly from a ticket:

```bash
npx ts-node src/cli/run.ts --jira PROJ-123 --approve
npx ts-node src/cli/run.ts --jira PROJ-123 --tdd --approve  # with TDD
```

The system reads the title, description, and acceptance criteria from Jira automatically.

### Step 5: View previous jobs

```bash
npx ts-node src/cli/run.ts --list
```

View details of a specific job:

```bash
npx ts-node src/cli/run.ts --id YOUR_JOB_ID
```

Retry a failed job (`review_error`, `test_error`, `failed`):

```bash
npx ts-node src/cli/run.ts --id YOUR_JOB_ID --retry
```

### Saved state on disk

The CLI saves jobs in `progress/`:

```
progress/
  56bdcf05-8d56-494f-bfaa-aa4a68e6a26d.md   ← progress log
  .state/
    56bdcf05-8d56-494f-bfaa-aa4a68e6a26d.json  ← job state
```

### Using the automatic demo script

```bash
./scripts/demo.sh flutter b   # CLI + Flutter
./scripts/demo.sh ios b       # CLI + iOS
./scripts/demo.sh android b   # CLI + Android
```

---

## Mode C — Webhook

**Best for:** integrations with Jira, Slack, or any external system that sends events.

In this mode, an external system calls the `POST /webhook/trigger` endpoint and the job starts automatically.

> **Key difference vs. Mode A:** The webhook initiates the job, but the pipeline still pauses at `spec_ready` just like in Mode A; it is approved/rejected with `POST /jobs/:id/approve`. The webhook only automates the *trigger*, not the spec approval.

### Step 1: Start the server (same as Mode A)

```bash
docker start gaia-postgres 2>/dev/null || \
  docker run -d --name gaia-postgres \
  -e POSTGRES_DB=gaia_harness -e POSTGRES_USER=gaia -e POSTGRES_PASSWORD=gaia \
  -p 5432:5432 postgres:15
npm run dev
```

### Step 2: Trigger a generic webhook

This is the simplest format — any system can call it:

```bash
curl -s -X POST http://localhost:3000/webhook/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Add loyalty points banner",
    "platform": "flutter",
    "repo": "my-org/demo-repo",
    "targetBranch": "develop",
    "requireTests": false,
    "maxFilesToTouch": 5,
    "acceptanceCriteria": [
      { "id": "ac-1", "text": "WHEN user has points THEN show banner" },
      { "id": "ac-2", "text": "WHEN user taps banner THEN show rewards" }
    ]
  }' | python3 -m json.tool
```

Immediate response (202 Accepted):

```json
{
  "jobId": "924417e7-5c06-4a9c-ad0e-72c1fa091994",
  "status": "accepted",
  "platform": "flutter",
  "message": "Job created and pipeline started"
}
```

The pipeline runs in the background. Monitor it just like in Mode A:

```bash
curl -s http://localhost:3000/jobs/924417e7-5c06-4a9c-ad0e-72c1fa091994 | python3 -m json.tool
```

### Step 3: Simulate a Jira webhook

When an issue is created in Jira, Jira can automatically call the webhook. This is what the payload looks like:

```bash
curl -s -X POST http://localhost:3000/webhook/trigger \
  -H "Content-Type: application/json" \
  -H "X-Atlassian-Token: no-check" \
  -d '{
    "webhookEvent": "jira:issue_created",
    "issue": {
      "key": "PROJ-123",
      "fields": {
        "summary": "Add dark mode toggle to settings",
        "labels": ["flutter", "skip-tests"],
        "customfield_repo": "my-org/demo-repo"
      }
    }
  }' | python3 -m json.tool
```

> **Note:** The `skip-tests` label in Jira automatically activates `requireTests: false`.  
> The `customfield_repo` field tells the system which repo to work on.  
> If absent, it uses `DEFAULT_REPO` from `.env`.

### Step 4: Integrate with Slack (slash command)

Configure a Slash Command in your Slack workspace pointing to:

```
POST http://<your-public-ip>:3000/webhook/trigger
```

Then in Slack write:

```
/gaia flutter my-org/demo-repo Add dark mode toggle
```

Format: `/gaia <platform> <repo> <feature description>`

### Step 5: Security with HMAC signature

For production, configure `WEBHOOK_SECRET` in `.env` and sign each request:

```bash
WEBHOOK_SECRET=my-super-secure-secret
```

```bash
BODY='{"title":"Test","platform":"flutter","repo":"my-org/demo-repo"}'
SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "my-super-secure-secret" | cut -d' ' -f2)

curl -s -X POST http://localhost:3000/webhook/trigger \
  -H "Content-Type: application/json" \
  -H "X-GAIA-Signature: sha256=$SIG" \
  -d "$BODY"
```

> If the signature does not match, the server responds `401 Invalid webhook signature`.

### Configure automatic notifications

When the job advances in state, the system can notify:

**Slack:**

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T000/B000/xxxx
```

**Jira (comments on the ticket and state transitions):**

```bash
JIRA_BASE_URL=https://your-org.atlassian.net
JIRA_EMAIL=you@email.com
JIRA_API_TOKEN=your-token
```

| Event          | What JiraNotifier does                                |
| -------------- | ----------------------------------------------------- |
| `spec_ready`   | Adds a comment with the technical plan                |
| `implementing` | Moves the ticket to "In Progress"                     |
| `done`         | Moves the ticket to "Done" + PR link                  |
| `failed`       | Moves the ticket to "Blocked" + error description     |

**Generic webhook (any HTTP endpoint):**

```bash
NOTIFY_WEBHOOK_URL=https://your-system.com/gaia-events
```

> If you don't configure anything, the system uses a null notifier — no errors or overhead.

### Using the automatic demo script

```bash
./scripts/demo.sh flutter c    # Webhook + Flutter
./scripts/demo.sh ios c        # Webhook + iOS
./scripts/demo.sh android c    # Webhook + Android
```

---

## Important parameters

### `requireTests` (boolean, default: `true`)

Controls whether the system tries to run the platform test suite (Flutter test, Xcode test, Gradle test).

```json
"requireTests": false
```

> Use `false` when you don't have the platform tools installed (for example, on a server without Flutter). The code and PR are still generated — only test execution is skipped.

In Jira webhook: add the `skip-tests` label to the ticket to activate `requireTests: false`.

### `maxFilesToTouch` (number, default: `5`)

Maximum number of files the system can modify. If the implementer touches more files than allowed, the reviewer rejects the change.

```json
"maxFilesToTouch": 8
```

> Use it for large features. The default value of 5 is conservative for small changes.

### `tddMode` (boolean, default: `false`)

Activates the **Red-Green-Refactor** cycle (strict TDD). The implementer:

1. Writes the failing test (red)
2. Writes the minimum code to make it pass (green)
3. Refactors

```json
"tddMode": true
```

In Mode B (CLI) the equivalent flag is `--tdd`:

```bash
npx ts-node src/cli/run.ts --job my-job.json --tdd --approve
```

> Generates more robust tests but takes twice as long. Ideal for critical features.

---

## Comparison of the three modes

|                              | Mode A — HTTP API    | Mode B — CLI              | Mode C — Webhook                     |
| ---------------------------- | -------------------- | ------------------------- | ------------------------------------ |
| **Requires server**          | Yes                  | No                        | Yes                                  |
| **Requires Postgres/Docker** | Yes                  | No (uses disk)            | Yes                                  |
| **Spec approval**            | Manual via API       | Manual, `--approve` or `--reject` | Pauses at `spec_ready`; `POST /jobs/:id/approve` |
| **Integrates with Jira/Slack** | Manual             | `--jira PROJ-123`         | Automatic                            |
| **Best for**                 | CI/CD, APIs, Postman | Local dev, quick demos    | Production, automation               |
| **Logs**                     | REST API + Postgres  | Terminal + `.md` files    | REST API + Postgres + notifications  |
| **Notifications**            | Configurable         | No                        | Slack, Jira, generic webhook         |
| **TDD (`tddMode`)**          | `"tddMode": true`    | `--tdd`                   | `"tddMode": true` in payload         |

---

## Internal flow (same in all three modes)

```
TRIGGER (API / CLI / Webhook)
        │
        ▼
  ┌─────────────┐
  │  SpecAuthor │  Analyzes repo + generates technical plan + Gherkin
  └──────┬──────┘  └─ writes handoff.md
         │  spec_ready
         ▼
   ⏸ HUMAN APPROVAL  ← only in Modes A and B
         │  (automatic in Mode C)
         ▼
  ┌──────────────┐
  │  Implementer │  Writes code (bulk or TDD)
  └──────┬───────┘  └─ reads handoff.md + reviewFeedback
         │
         ▼
  ┌──────────────┐
  │   Reviewer   │  Lint + tests + critical LLM review → GitHub PR
  └──────┬───────┘  └─ writes handoff.md
         │
         ▼
  ┌──────────────────┐
  │  MutationTester  │  Validates that tests detect bugs
  └──────┬───────────┘
         │
         └── fails? → feedback to Implementer (up to 5×)
              │
              ▼
            done ✅
           (PR ready for human review)
```

**Typical time: 50–90 seconds per job**

---

## Troubleshooting common issues

### "Connection refused" when running curl

The server is not running. Verify with:

```bash
curl http://localhost:3000/health
```

If it fails, go back to Step 2 of the mode you are using.

### "Jira ticket not found"

- Verify the ticket exists and your account has access to the project
- Verify `JIRA_BASE_URL` (must not end with `/`)
- Verify `JIRA_API_TOKEN` is an API token, not your password

### "Authentication failed" (GitHub)

- `GITHUB_TOKEN` does not have the `repo` scope — create a new one at [github.com/settings/tokens](https://github.com/settings/tokens)
- The token expired — generate a new one

### Job in `test_error` or `build_error`

If you don't want to install the platform toolchain:

```bash
# Use requireTests: false in the payload
"requireTests": false
```

To retry a failed job:

```bash
curl -s -X POST http://localhost:3000/jobs/YOUR_JOB_ID/retry
```

### View all jobs (Modes A and C)

```bash
curl -s http://localhost:3000/jobs | python3 -m json.tool
```

### Clean CLI jobs

```bash
rm -rf progress/.state/ progress/*.md
```

---

## Next steps

Once the system creates the Pull Request, a developer reviews it in GitHub like any other PR:

1. Read the code diff
2. Review PR comments (include the approved spec)
3. Request changes if needed
4. Merge when ready

> The system does not merge automatically. Merge always requires human approval.

---

## Quick references

| Resource             | Link                                                                 |
| -------------------- | -------------------------------------------------------------------- |
| Full API             | [`API.md`](../API.md)                                                |
| Internal architecture | [`docs/engineering/architecture.md`](../engineering/architecture.md) |
| Detailed setup       | [`docs/guides/setup.md`](../guides/setup.md)                         |
| Demo script          | [`scripts/demo.sh`](../scripts/demo.sh)                              |
| Environment variables | [`.env.example`](../.env.example)                                    |

---

> **Something not working?** Check the server logs (`npm run dev`) — each error includes a specific message with the cause and how to resolve it.
