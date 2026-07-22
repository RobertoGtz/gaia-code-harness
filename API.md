# API Reference — GAIA Code Harness

> Complete reference for the REST API and inbound webhook.  
> See [`docs/guides/quick-start.md`](docs/guides/quick-start.md) for usage guides with examples.

---

## Base URL

```
Local:      http://localhost:3000
Production: https://<your-domain>
```

---

## Endpoints

### Health Check

```http
GET /health
```

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

### Create Job

```http
POST /jobs
Content-Type: application/json
```

**Request Body (Option A - Flat body, recommended):**

```json
{
  "platform": "flutter",
  "title": "Add promotional banner",
  "jiraTicketId": "PROJ-123",
  "repo": "my-org/my-repo",
  "module": "home_screen",
  "targetBranch": "develop",
  "description": "Show featured promotional carousel",
  "figmaUrl": "https://figma.com/file/abc123/promo-banner",
  "tddMode": false,
  "buildStrategy": "resolve",
  "requireTests": true,
  "maxFilesToTouch": 6,
  "acceptanceCriteria": [
    "WHEN user opens home screen THEN display promotional banner carousel",
    "WHEN there are more than 3 promotions THEN show pagination dots"
  ]
}
```

> Pass `"tddMode": true` to activate the Red-Green-Refactor cycle (one test at a time).  
> Pass `"buildStrategy": "resolve"` for iOS in large Tuist monorepos; use `"tuist"` or `"xcodebuild"` for full local build validation.  
> Pass `"requireTests": false` to disable test execution in Implementer and Reviewer (useful for demos or environments without the toolchain).  
> `maxFilesToTouch` limits how many files the agent can modify (default: 5).

**Request Body (Option B - fullContext wrapper, legacy):**

```json
{
  "jiraTicketId": "PROJ-123",
  "tddMode": true,
  "buildStrategy": "resolve",
  "fullContext": {
    "title": "Add promotional banner",
    "platform": "flutter",
    "repo": "my-org/my-repo",
    "acceptanceCriteria": [
      "WHEN user opens home screen THEN display promotional banner carousel"
    ]
  }
}
```

**Request Body (Option C - Jira ticket only):**

```json
{
  "jiraTicketId": "PROJ-123",
  "requireTests": false,
  "maxFilesToTouch": 6
}
```

The system fetches the Jira ticket (`JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`) and extracts:

- title, description, priority, labels
- acceptance criteria (description or custom field)
- Figma URL (if it appears in the description as a text link)
- repo (label `repo:org/name`, custom field, or `DEFAULT_REPO`)
- platform — inferred in this order:
  1. **Ticket labels** — `flutter`, `ios`, `android`, `flutter_web`
  2. **Title prefix** — `[MOBILE]` → `DEFAULT_PLATFORM` (default: `flutter`), `[WEB]` → `flutter_web`, `[iOS]` → `ios`, `[ANDROID]` → `android`
  3. **Keywords** in the title — `swift`, `kotlin`, etc.
  4. `DEFAULT_PLATFORM` in `.env`

> **Note:** `JIRA_BASE_URL` must point to the exact tenant subdomain (e.g. `https://your-org.atlassian.net`). An incorrect subdomain returns 404.

If the system cannot infer the platform, it returns **400** with instructions. If `repo` is not in the ticket, pass it in the body along with `jiraTicketId`.

**Response (201 Created):**

```json
{
  "job": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "pending",
    "title": "Add promotional banner",
    "platform": "flutter",
    "repo": "my-org/my-repo",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

---

### Get Job

```http
GET /jobs/:id
```

**Response:**

```json
{
  "job": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "spec_ready",
    "currentAgent": "SpecAuthor",
    "title": "Add promotional banner",
    "progressLogs": [
      "[2024-01-15T10:30:01Z] [SpecAuthor] Generating spec...",
      "[2024-01-15T10:30:05Z] [SpecAuthor] Specification generated"
    ],
    "spec": {
      "requirements": [
        {
          "id": "req-1",
          "content": "WHEN user opens home screen THEN display promotional banner carousel",
          "sourceAcId": "ac-0"
        }
      ],
      "design": {
        "affectedFiles": ["packages/.../home_screen.dart"],
        "newFiles": [
          "packages/.../promo_banner.dart",
          "packages/.../promo_banner_test.dart"
        ],
        "architectureDecisions": [
          "Create reusable widget for promotional banners"
        ],
        "uiComponents": ["PromoBanner", "PromoCarousel"]
      },
      "tasks": [
        {
          "id": "task-1",
          "description": "Create PromoBanner widget",
          "filePath": "packages/.../promo_banner.dart",
          "type": "create",
          "status": "pending"
        }
      ],
      "risks": ["May affect home screen performance"]
    },
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:35:00.000Z"
  }
}
```

---

### List Jobs

```http
GET /jobs
```

**Query Parameters:**

- `initiativeId` (optional) - Filter by initiative

**Response:**

```json
{
  "jobs": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "spec_ready",
      "title": "Add promotional banner",
      "platform": "flutter",
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

---

### Approve or Reject Spec

```http
POST /jobs/:id/approve
Content-Type: application/json
```

**Request Body:**

```json
{
  "approved": true,
  "feedback": "Optional feedback if rejected"
}
```

**Response (Approved):**

```json
{
  "job": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "spec_approved",
    "title": "Add promotional banner"
  }
}
```

**Response (Rejected with feedback):**

```json
{
  "job": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "spec_generating",
    "specFeedback": "Needs to include analytics",
    "title": "Add promotional banner"
  }
}
```

> If `approved: false`, the spec is regenerated using `feedback`. Maximum 5 retries; exceeding the limit returns `400`.

---

### Retry Job

```http
POST /jobs/:id/retry
```

**Notes:**

- Works for any error status: `failed`, `env_error`, `repo_error`, `build_error`, `test_error`, `review_error`, `spec_error`
- Restarts the flow from `pending`

**Response:**

```json
{
  "job": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "pending",
    "title": "Add promotional banner"
  }
}
```

---

## Job States

| State             | Description                    | Suggested UI           |
| ----------------- | ------------------------------ | ---------------------- |
| `pending`         | Starting                       | 🟡 Starting...         |
| `fetching_jira`   | Fetching Jira info             | 🟡 Reading ticket...   |
| `spec_generating` | AI generating spec               | 🟡 Generating spec...  |
| `spec_ready`      | **Ready for review**           | 🔵 Review required     |
| `spec_approved`   | Approved, implementing         | 🟡 Implementing...     |
| `implementing`    | Writing code                   | 🟡 Generating code...  |
| `reviewing`       | Lint + tests + LLM review + PR | 🟡 Creating PR...      |
| `pr_created`      | Mutation testing post-PR       | 🟣 PR created          |
| `done`            | **Completed**                  | ✅ Completed           |
| `failed`          | Unexpected error (retry)       | ❌ Error               |
| `env_error`       | SDK not found                  | ❌ Env error           |
| `repo_error`      | Git clone/push failed          | ❌ Repo error          |
| `build_error`     | Dependencies not resolved      | ❌ Build error         |
| `test_error`      | Tests failed                   | ❌ Test error          |
| `review_error`    | Reviewer failed                | ❌ Review error        |
| `spec_error`      | LLM could not generate spec    | ❌ Spec error          |

---

## Error Responses

### 400 Bad Request

```json
{
  "error": "Must provide jiraTicketId, jiraEpicId, or fullContext"
}
```

### 404 Not Found

```json
{
  "error": "Job not found"
}
```

### 500 Internal Server Error

```json
{
  "error": "Failed to create job"
}
```

---

## Typical Flow

```bash
# 1. Create job
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{"fullContext": {...}}'

# 2. Poll until spec_ready
while true; do
  STATUS=$(curl -s http://localhost:3000/jobs/$JOB_ID | jq -r '.job.status')
  echo "Status: $STATUS"
  [ "$STATUS" = "spec_ready" ] && break
  sleep 2
done

# 3. Approve spec
curl -X POST http://localhost:3000/jobs/$JOB_ID/approve \
  -H "Content-Type: application/json" \
  -d '{"approved": true}'

# 4. Poll until done
while true; do
  STATUS=$(curl -s http://localhost:3000/jobs/$JOB_ID | jq -r '.job.status')
  echo "Status: $STATUS"
  [ "$STATUS" = "done" ] && break
  sleep 5
done

# 5. Get PR URL
curl -s http://localhost:3000/jobs/$JOB_ID | jq -r '.job.prUrl'
```

---

## CI / Webhook

### Trigger — Inbound webhook

```http
POST /webhook/trigger
Content-Type: application/json
```

Accepts three payload formats:

**Format A — Generic GAIA JSON (recommended for custom integrations):**

```json
{
  "title": "Add loyalty points banner",
  "platform": "flutter",
  "repo": "my-org/my-repo",
  "targetBranch": "develop",
  "tddMode": true,
  "buildStrategy": "resolve",
  "requireTests": false,
  "maxFilesToTouch": 6,
  "description": "Optional feature description",
  "module": "home",
  "figmaUrl": "https://figma.com/file/abc/design",
  "jiraEpicId": "EPIC-42",
  "acceptanceCriteria": [
    { "id": "ac-1", "text": "WHEN user has points THEN show banner" }
  ]
}
```

> Fields `description`, `module`, `figmaUrl` and `jiraEpicId` are optional and propagate to the job just like in `POST /jobs`.

**Format B — Jira issue webhook** (configure in Jira → Project settings → Webhooks):

> If the ticket has the `skip-tests` label, the job is created with `requireTests: false`. Pass `requireTests`/`maxFilesToTouch` directly in the generic payload (Format A).

```json
{
  "webhookEvent": "jira:issue_created",
  "issue": {
    "key": "PROJ-123",
    "fields": {
      "summary": "Add loyalty points banner",
      "labels": ["flutter", "tdd"]
    }
  }
}
```

> Platform is detected from labels (`flutter`, `ios`, `android`, `flutter_web`). The `tdd` label activates `tddMode: true`. Requires `DEFAULT_REPO` in `.env`.
> If the ticket has `JIRA_*` configured, the harness automatically enriches the job with ACs, `epicKey`, `figmaUrl` and the full ticket platform.

**Format C — Slack slash command** (`/gaia flutter my-org/demo-repo Feature title here`):

```
POST /webhook/trigger
Content-Type: application/x-www-form-urlencoded

command=/gaia&text=flutter my-org/demo-repo Feature title here
```

**Response (202 Accepted):**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "accepted",
  "title": "Add loyalty points banner",
  "platform": "flutter",
  "tddMode": true,
  "message": "Job created and pipeline started"
}
```

**Security — HMAC-SHA256 signature:**

```bash
# Configure WEBHOOK_SECRET in .env
# The system verifies X-GAIA-Signature: sha256=<hmac>
curl -X POST http://localhost:3000/webhook/trigger \
  -H "Content-Type: application/json" \
  -H "X-GAIA-Signature: sha256=$(echo -n '{"title":"..."}' | openssl dgst -sha256 -hmac $WEBHOOK_SECRET | cut -d' ' -f2)" \
  -d '{"title":"Add loyalty points banner","platform":"flutter","repo":"my-org/demo-repo"}'
```

---

### Notifications — Outbound events

Configure one or more variables in `.env` to activate outbound notifications:

| Variable                                               | Notifier enabled  | What it sends                                                                        |
| ------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------ |
| `SLACK_WEBHOOK_URL`                                    | Slack             | Block Kit message per state                                                          |
| `GITHUB_CHECKS_TOKEN` + `GITHUB_OWNER` + `GITHUB_REPO` | GitHub Checks API | Check Run per job                                                                    |
| `NOTIFY_WEBHOOK_URL`                                   | Generic HTTP      | Full event JSON                                                                      |
| `NOTIFY_WEBHOOK_SECRET`                                | (outbound signature) | `X-GAIA-Signature` header                                                            |
| `JIRA_BASE_URL` + `JIRA_EMAIL` + `JIRA_API_TOKEN`      | Jira              | Comments + status transitions on the ticket                                          |
| `JIRA_TRANSITION_MAP`                                  | (Jira config)     | JSON to rename transitions: `{"done":"Resolved","failed":"Blocked"}`           |
| `FIGMA_ACCESS_TOKEN`                                   | SpecAuthorAgent   | Figma design read via REST API (required when `job.figmaUrl` is present) |

**Emitted events:**

| Event              | When                              |
| ------------------ | --------------------------------- |
| `job.created`      | Job created (`pending`)           |
| `job.spec_ready`   | Spec ready, waiting for approval  |
| `job.implementing` | Implementation started            |
| `job.reviewing`    | Review in progress                |
| `job.pr_created`   | PR created, mutation testing      |
| `job.done`         | Job completed with PR             |
| `job.failed`       | Pipeline error                      |

**Example outbound payload (Slack / Generic):**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "event": "job.done",
  "status": "done",
  "title": "Add loyalty points banner",
  "platform": "flutter",
  "timestamp": "2024-01-15T10:35:42.000Z",
  "tddMode": true,
  "prUrl": "https://github.com/org/repo/pull/42",
  "mutationScore": 87.5
}
```

---

## CLI (Mode B)

Serverless alternative. Uses a `DiskBackend` (JSON in `progress/`) instead of Postgres.

```bash
# List jobs
npx ts-node src/cli/run.ts --list

# Create and run a job from a JSON file
npx ts-node src/cli/run.ts --job job.json

# Create and auto-approve spec (no pause)
npx ts-node src/cli/run.ts --job job.json --approve

# Create and reject spec with feedback to regenerate it
npx ts-node src/cli/run.ts --job job.json --reject "Needs to include analytics"

# Enable TDD (Red-Green-Refactor)
npx ts-node src/cli/run.ts --job job.json --tdd --approve

# Create job directly from a Jira ticket
npx ts-node src/cli/run.ts --jira PROJ-123 --approve
npx ts-node src/cli/run.ts --jira PROJ-123 --tdd --approve

# Resume existing job
npx ts-node src/cli/run.ts --id <uuid>

# Reject spec of an existing job (maximum 5 retries)
npx ts-node src/cli/run.ts --id <uuid> --reject "Needs more detail on the error case"
```

`job.json` accepts the same fields as the flat `POST /jobs` body (including `tddMode` and `buildStrategy`).

---

**See also:** [`docs/guides/quick-start.md`](docs/guides/quick-start.md) · [`docs/engineering/architecture.md`](docs/engineering/architecture.md) · [`README.md`](README.md)
