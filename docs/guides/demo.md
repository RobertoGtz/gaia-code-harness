# Demo Guide — GAIA Code Harness

> Step-by-step to see the system in action, from acceptance criteria to Pull Request.  
> You don't need to know how to program to follow this guide.

> **Giving a live demo?** Use [`demo-speaker-script.md`](demo-speaker-script.md): it has a script of what to say in each phase, a ready `job.json`, and exact commands for a sample project.

---

## What will we see?

We will simulate what happens when a Product Manager asks for a new feature:

1. **You tell the system what you want** (acceptance criteria)
2. **The system generates a technical plan** (spec)
3. **You approve it** (human in the loop)
4. **The system writes the code automatically** (normal mode or TDD Red-Green cycle)
5. **The system validates everything works** (tests + mutation testing)
6. **The system creates a Pull Request** ready for review

All this happens in ~50–90 seconds.

---

## Choose your mode

| Mode             | When to use it                            | Go to                                           |
| ---------------- | ----------------------------------------- | ----------------------------------------------- |
| **A — HTTP API** | Demo with Postman, CI/CD, presentations  | [Step 1 ↓](#step-1-prepare-the-database)        |
| **B — CLI**      | Local development, no Docker or DB          | [Demo Mode B ↓](#demo--mode-b-cli-no-server)    |
| **C — Webhook**  | Jira/Slack integration, automated CI      | [Demo Mode C ↓](#demo--mode-c--webhook)         |

---

## Before you start

> **Only for Modes A and C.** If you use Mode B (CLI), jump directly to [Demo — Mode B](#demo--mode-b-cli-no-server) — no Docker or database needed.

You need to have installed:

- **Docker Desktop** — [Download here](https://www.docker.com/products/docker-desktop/)
- **Node.js 18+** — [Download here](https://nodejs.org/)
- **Flutter** — [Download here](https://docs.flutter.dev/get-started/install) (for Flutter demo)
- **Swift 5.9+** — Included with Xcode (for iOS demo)
- **Java/JDK 17+** — (for Android demo, optional)

If you are not sure whether you already have them, open Terminal and type:

```
node --version
docker --version
flutter --version   # for Flutter
swift --version     # for iOS
java -version       # for Android
```

If you see version numbers, you have them installed.

> **Note:** You only need the tools for the platform you want to try. Node.js and Docker are required.

---

## Demo — Mode A (HTTP API + PostgreSQL)

### Step 1: Prepare the database

Open **Terminal** (find it with Spotlight Cmd+Space → "Terminal").

Copy and paste this command:

```bash
docker start gaia-postgres 2>/dev/null || docker run -d \
  --name gaia-postgres \
  -e POSTGRES_DB=gaia_harness \
  -e POSTGRES_USER=gaia \
  -e POSTGRES_PASSWORD=gaia \
  -p 5432:5432 \
  postgres:15
```

> **What does this do?** Starts a database where the system stores each job's progress.

You should see something like:

```
abc123def456...  (a long ID)
```

That means the database is running. ✅

---

### Step 2: Start the server

In the **same terminal**, type:

```bash
cd /path/to/project/gaia-code-harness
npm run dev
```

You should see:

```
Database initialized
Server running on port 3000
```

> **What does this do?** Starts the service that processes code generation requests.

Leave this terminal open. **Do not close it.** ✅

---

### Step 3: Run the automatic demo

The easiest way is to use the **demo script**, which does all steps automatically.

Open a **second terminal** (Cmd+N or Shell → New Window).

```bash
# Flutter demo (default)
./scripts/demo.sh flutter

# iOS/Swift demo
./scripts/demo.sh ios

# Android/Kotlin demo
./scripts/demo.sh android
```

The script creates the job, waits for the spec, approves it, monitors implementation, and shows the PR.

> **Tip:** If you prefer to do it manually step by step, keep reading.

#### Step 3b: Create a job manually

If you prefer manual control, copy and paste:

```bash
curl -s -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "flutter",
    "title": "Add promotional banner to home screen",
    "jiraTicketId": "PROJ-1000",
    "repo": "my-org/my-repo",
    "targetBranch": "develop",
    "tddMode": false,
    "requireTests": false,
    "maxFilesToTouch": 6,
    "acceptanceCriteria": [
      "WHEN user opens home screen THEN display promotional banner carousel",
      "WHEN there are more than 3 promotions THEN show pagination dots",
      "WHEN user taps a banner THEN navigate to promotion details"
    ]
  }' | python3 -m json.tool
```

> Change `"platform"` to `"ios"` and `"repo"` to `"my-org/demo-repo-ios"` for iOS, or `"android"` / `"my-org/demo-repo-android"` for Android.
>
> Pass `"tddMode": true` to activate the **Red-Green-Refactor** cycle (one test at a time — the implementer first writes the failing test, then makes it pass).
>
> Pass `"requireTests": false` so the system does not try to run Flutter/Xcode/Gradle tests during the demo (useful if you don't have the toolchain installed). Implementation and PR are still created.
>
> You can also send only the `jiraTicketId` if you have `JIRA_BASE_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN` configured. The system will fetch title, description, acceptance criteria, and Figma URL directly from Jira:
>
> ```json
> { "jiraTicketId": "PROJ-1234", "repo": "my-org/my-repo" }
> ```
>
> **`JIRA_BASE_URL`** must point to your tenant's exact subdomain (e.g. `https://your-org.atlassian.net`).
>
> **Platform** is inferred in this order: ticket labels → title prefix (`[MOBILE]` → `DEFAULT_PLATFORM`, `[WEB]` → `flutter_web`) → keywords in title → `DEFAULT_PLATFORM` in `.env`.
>
> If the ticket has no `repo` defined (label `repo:org/name`), pass it explicitly in the body.

You should see a response with an `"id"` (a long code). **Copy that ID**, you will need it.

Example:

```json
{
  "job": {
    "id": "e22105e6-eb14-4f7d-9873-d55ab835ca57",
    "status": "pending",
    "title": "Add promotional banner to home screen"
  }
}
```

✅

---

### Step 4: View the generated spec

Wait 3 seconds and then type (replace `YOUR_JOB_ID` with the ID you copied):

```bash
curl -s http://localhost:3000/jobs/YOUR_JOB_ID | python3 -m json.tool
```

You should see that `"status"` changed to `"spec_ready"` and there is a `"spec"` section with:

- **requirements** — Technical requirements derived from your acceptance criteria
- **tasks** — Concrete tasks the system will execute
- **design** — Architecture decisions (which files to create/modify)
- **risks** — Identified technical risks

> **What happened?** The **SpecAuthor** agent analyzed the code repository and generated a technical plan based on your acceptance criteria.

This is the moment where **you decide whether the plan is good**. ✅

---

### Step 5: Approve the spec (Human in the Loop)

If the spec looks good, approve it:

```bash
curl -s -X POST http://localhost:3000/jobs/YOUR_JOB_ID/approve \
  -H "Content-Type: application/json" \
  -d '{"approved": true}' | python3 -m json.tool
```

> **What does this do?** You tell the system: "Go ahead, implement this plan."
>
> **Important:** Without this step, the system **never touches the code**. It always waits for human approval.

The status should change to `"implementing"`. ✅

---

### Step 6: Wait for it to finish

The system is now:

1. Cloning the repository
2. Creating a new branch
3. Writing code
4. Running tests
5. Creating a Pull Request

You can check progress:

```bash
curl -s http://localhost:3000/jobs/YOUR_JOB_ID | python3 -m json.tool
```

The statuses you will see in order:

| Status         | What it means                            |
| -------------- | ---------------------------------------- |
| `implementing` | Writing code and running tests           |
| `reviewing`    | Lint + tests + creating PR             |
| `pr_created`   | PR ready, running mutation tests         |
| `done`         | Finished successfully + mutation score OK |

Retryable error states: `test_error`, `build_error`, `review_error`, `failed`.

> **Tip:** Repeat the command every 10 seconds until you see `"done"` or an `_error` state.

---

### Step 7: View the final result

When the status is `"done"`, the response will show:

- **`prUrl`** — Link to the Pull Request on GitHub (or `dry-run` if `GITHUB_TOKEN` is not configured)
- **`progressLogs`** — Full log of what the system did
- **`spec`** — The technical plan you approved

---

### Flow summary

```
You (Product)                  System (Harness)
     │                                  │
     │── "I want a banner" ───────────→│
     │                                  │── SpecAuthor: generates technical spec
     │                                  │
     │←── "Do you approve this plan?" ─│
     │                                  │
     │── "Yes, approved" ─────────────→│
     │                                  │── Implementer: writes code
     │                                  │    (normal: bulk | tddMode: RED→GREEN)
     │                                  │── Reviewer: lint + tests + PR
     │                                  │── MutationTester: validates tests
     │                                  │
     │←── "Done, here is the PR" ────────│
     │                                  │
```

**Total time: ~50–90 seconds**

---

## Demo — Mode B (CLI, no server)

Does not require Docker or an HTTP server. Ideal for local development and quick demos.

```bash
# 1. Create job.json
cat > /tmp/demo-job.json <<'EOF'
{
  "platform": "flutter",
  "title": "Add promotional banner to home screen",
  "repo": "my-org/demo-repo",
  "targetBranch": "develop",
  "requireTests": false,
  "maxFilesToTouch": 6,
  "acceptanceCriteria": [
    "WHEN user opens home screen THEN display promotional banner",
    "WHEN user taps banner THEN navigate to promotion details"
  ]
}
EOF

# 2. Run (automatic spec approval)
npx ts-node src/cli/run.ts --job /tmp/demo-job.json --approve

# With TDD (Red-Green-Refactor)
npx ts-node src/cli/run.ts --job /tmp/demo-job.json --tdd --approve

# From a Jira ticket
npx ts-node src/cli/run.ts --jira PROJ-123 --approve

# View all jobs stored on disk
npx ts-node src/cli/run.ts --list
```

Progress is saved in `progress/<JOB_ID>.md` — open it in another terminal to follow it in real time:

```bash
tail -f progress/<JOB_ID>.md
```

> **Key difference vs. Mode A:** no server or Postgres — the CLI runs the full pipeline in the same process and exits. Jobs persist in `progress/.state/`.

---

## Demo — Mode C / Webhook

This mode allows external systems (Jira, Slack, GitHub Actions, etc.) to start a job automatically and receive real-time notifications.

### Step A: Configure notifications (optional)

Edit `.env` and add the variables you want to enable:

```bash
# Slack — you will receive a message for each state change
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T000/B000/xxxx

# GitHub Checks — a Check Run appears on the PR
GITHUB_CHECKS_TOKEN=github_pat_xxxxx
GITHUB_OWNER=your-org
GITHUB_REPO=your-repo

# Generic webhook — any HTTP endpoint
NOTIFY_WEBHOOK_URL=https://your-endpoint.com/gaia

# Jira — comments on the ticket and transitions states automatically
# (uses the same vars you already have for reading tickets)
JIRA_BASE_URL=https://your-org.atlassian.net
JIRA_EMAIL=you@email.com
JIRA_API_TOKEN=your-token
# Optional: rename transitions if your workflow uses different names
# JIRA_TRANSITION_MAP={"implementing":"In Progress","done":"Resolved","failed":"Blocked"}
```

> If you don't configure any, the system uses `NullNotifier` — zero overhead, no errors.

**What JiraNotifier does per event:**

| Event            | Action in Jira                                                    |
| ---------------- | ------------------------------------------------------------------ |
| `job.spec_ready` | Adds comment with generated spec + approval instructions          |
| `job.implementing` | Transitions ticket → **In Progress** + comment                    |
| `job.done`       | Transitions → **Done** + comment with PR link and mutation score    |
| `job.failed`     | Transitions → **Blocked** + comment with error and retry link       |

> The ticket is detected automatically from the job title (looks for pattern `PROJ-123`).

### Step B: Trigger a job via webhook

```bash
curl -s -X POST http://localhost:3000/webhook/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Add loyalty points banner",
    "platform": "flutter",
    "repo": "my-org/demo-repo",
    "targetBranch": "develop",
    "tddMode": true,
    "acceptanceCriteria": [
      { "id": "ac-1", "text": "WHEN user has points THEN show banner" }
    ]
  }' | python3 -m json.tool
```

Immediate response (202):

```json
{
  "jobId": "e22105e6-eb14-4f7d-9873-d55ab835ca57",
  "status": "accepted",
  "platform": "flutter",
  "tddMode": true,
  "message": "Job created and pipeline started"
}
```

The pipeline starts in the background just like `POST /jobs`. Monitor with:

```bash
curl -s http://localhost:3000/jobs/e22105e6-eb14-4f7d-9873-d55ab835ca57 | python3 -m json.tool
```

### Step C: Simulate a Jira webhook

```bash
curl -s -X POST http://localhost:3000/webhook/trigger \
  -H "Content-Type: application/json" \
  -H "X-Atlassian-Token: no-check" \
  -d '{
    "webhookEvent": "jira:issue_created",
    "issue": {
      "key": "PROJ-99",
      "fields": {
        "summary": "Add dark mode toggle",
        "labels": ["flutter", "tdd"]
      }
    }
  }' | python3 -m json.tool
```

> The `tdd` label on the ticket activates `tddMode: true` automatically. Requires `DEFAULT_REPO=your-org/your-repo` in `.env`.

### Step D: Slack slash command

Configure a Slash Command in your workspace pointing to `POST http://<your-ip>:3000/webhook/trigger` and type in Slack:

```
/gaia flutter my-org/demo-repo Add dark mode toggle
```

### Security with HMAC signature

```bash
BODY='{"title":"Test","platform":"flutter","repo":"my-org/demo-repo"}'
SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | cut -d' ' -f2)

curl -s -X POST http://localhost:3000/webhook/trigger \
  -H "Content-Type: application/json" \
  -H "X-GAIA-Signature: sha256=$SIG" \
  -d "$BODY" | python3 -m json.tool
```

---

## If something goes wrong

### "Connection refused"

The server is not running. Go back to **Step 2**.

### "Job not found"

Verify you copied the job ID correctly. You can view all jobs with:

```bash
curl -s http://localhost:3000/jobs | python3 -m json.tool
```

### Status "failed"

You can retry with:

```bash
curl -s -X POST http://localhost:3000/jobs/YOUR_JOB_ID/retry | python3 -m json.tool
```

### To stop everything

1. In the server terminal: press **Ctrl+C**
2. Stop the database: `docker stop gaia-postgres`

---

## FAQ

**Does this generate real code?**
Yes. The harness calls OpenAI or Anthropic (configure `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` in `.env`) and generates real code based on the spec and repository.

**Does it create a real PR on GitHub?**
Yes, if you have `GITHUB_TOKEN` configured. Without it, it returns a "dry-run" mock PR.

**What is `tddMode`?**
When active, the Implementer applies the **Red-Green-Refactor** cycle: first writes a failing test, then makes it pass, repeating for each scenario. It generates more robust tests but takes longer.

**What does the Mutation Tester do?**
After the reviewer, the harness applies small mutations (e.g. `true → false`, `return null`) to the generated code and verifies the tests detect them. If the score is ≥ 80%, the job finishes. Otherwise, the feedback returns to the ImplementerAgent to strengthen the tests (up to 5 retries) before marking `test_error`; the loop is automatic in all modes.

**Does it only work with Flutter?**
No. It supports **Flutter**, **Flutter Web**, **iOS/Swift**, and **Android/Kotlin**. Change `"platform"` in the request to choose the platform.

**Can it touch any file in the repo?**
No. It has configurable limits (`maxFilesToTouch: 5`) and cannot touch CI/CD, secrets, or infrastructure files.

**What if I don't approve the spec?**
You can reject it with feedback and the system regenerates the plan:

```bash
curl -s -X POST http://localhost:3000/jobs/YOUR_JOB_ID/approve \
  -H "Content-Type: application/json" \
  -d '{"approved": false, "feedback": "Needs to include analytics"}' | python3 -m json.tool
```

---

> **Questions?** See [`docs/guides/testing.md`](testing.md) for detailed troubleshooting.
