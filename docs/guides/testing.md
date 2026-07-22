# Testing Guide — GAIA Code Harness

> How to verify and test the system locally in the three modes.

---

## Quick environment check

```bash
./init.sh          # checks Node, TS, base files, native toolchains
./init.sh --http   # + checks Postgres is reachable
./init.sh --quick  # only Node + TS compilation
```

---

## Harness unit tests

Internal unit tests that do not require a server, Postgres, or LLM:

```bash
npm test                  # runs the full Jest suite (~313 tests, 27 suites)
npm test -- --watch       # watch mode during development
npm test -- webhook       # filter by suite name
npm test -- ios-skill     # only the iOS skill
npm test -- xcode-runner  # only the Xcode runner
npm test -- figma         # only the Figma reader
```

| Suite                       | What it covers                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `webhook-parsers.test.ts`   | `parseGenericBody` + `parseJiraWebhook` (Mode C)                                   |
| `jira-errors.test.ts`       | Jira error classes (`JiraAuthError`, etc.)                                           |
| `jira-parsers.test.ts`      | `extractTextFromADF` + `parseACFromText`                                             |
| `figma.test.ts`             | `extractFigmaIds`, `formatFigmaNode`, `fetchFigmaDesignContext`, errors              |
| `spec-author.test.ts`       | `SpecAuthorAgent` — spec generation, handoff, Figma context                          |
| `disk-backend.test.ts`      | `DiskBackend` full — CRUD, persistence (Mode B)                                        |
| `state-backend.test.ts`     | Singleton `StateBackend` + convenience wrappers                                        |
| `git-errors.test.ts`        | Git/GitHub error classes (`GitHubAuthError`, etc.)                                   |
| `llm-utils.test.ts`         | `extractJSON` — parsing JSON from LLM responses                                        |
| `repo-setup.test.ts`        | `setupRepository` — local clone, GitHub clone, errors                                |
| `agent-registry.test.ts`    | `getAgentsForPlatform` — supported platforms, singleton, error                       |
| `notifier-factory.test.ts`  | `buildNotifier` — NullNotifier, Slack, Webhook, Jira, composite                      |
| `generic-notifier.test.ts`  | `GenericWebhookNotifier` — POST, HMAC signing, error resilience                      |
| `plugin-loader.test.ts`     | `PluginLoader` — gaia.json, RULES.md, UNIT_TESTS.md, getRulesAsContext               |
| `xcode-runner.test.ts`      | `runSwiftTests`, `runXcodeBuild`, `runSwiftLint`, `verifyIosEnvironment` — mocked      |
| `ios-skill.test.ts`         | `IosSkill` — `verifyEnvironment`, `build`, `test`, `analyze`, `getPromptContext`     |
| `flutter-web-skill.test.ts` | `FlutterWebSkill` — build/test/analyze + prompt context                              |

> These are the fastest tests to run and should always pass. If any fail, there is a bug in the harness itself, not in the job workspace.

---

## Mode A — HTTP API

### Start server

```bash
npm run dev
```

### Health check

```bash
curl http://localhost:3000/health
# → { "status": "ok", "timestamp": "..." }
```

### Create job with full context (flat format)

```bash
curl -s -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Add promotional banner on home",
    "platform": "flutter",
    "repo": "my-org/my-repo",
    "targetBranch": "develop",
    "requireTests": false,
    "maxFilesToTouch": 6,
    "figmaUrl": "https://figma.com/design/ABC123/home-screen?node-id=1-234",
    "acceptanceCriteria": [
      { "id": "ac-1", "text": "WHEN user opens home THEN show promotional banner", "testable": true },
      { "id": "ac-2", "text": "WHEN user taps banner THEN navigate to promotion details", "testable": true }
    ]
  }' | jq '{id: .job.id, status: .job.status}'
```

### Create job with Jira only

```bash
curl -s -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{"jiraTicketId": "PROJ-123"}' | jq '{id: .job.id, status: .job.status}'
```

### Monitor status

```bash
JOB_ID=<job-id>

# Current status
curl -s http://localhost:3000/jobs/$JOB_ID | jq '.job.status'

# Progress logs
curl -s http://localhost:3000/jobs/$JOB_ID | jq '.job.progressLogs'

# Generated spec
curl -s http://localhost:3000/jobs/$JOB_ID | jq '.job.spec'
```

### Approve spec

```bash
curl -s -X POST http://localhost:3000/jobs/$JOB_ID/approve \
  -H "Content-Type: application/json" \
  -d '{"approved": true}'

# Reject with feedback (max 5 retries; exceeding the limit, create a new job)
curl -s -X POST http://localhost:3000/jobs/$JOB_ID/approve \
  -H "Content-Type: application/json" \
  -d '{"approved": false, "feedback": "Needs more detail on the error case"}'
```

### Retry a job in error

```bash
curl -s -X POST http://localhost:3000/jobs/$JOB_ID/retry
```

### Full flow script (Mode A)

```bash
BASE="http://localhost:3000"

# 1. Create
JOB_ID=$(curl -s -X POST $BASE/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test job",
    "platform": "flutter",
    "repo": "my-org/demo-repo",
    "acceptanceCriteria": [
      {"id":"ac-1","text":"WHEN test THEN pass","testable":true}
    ]
  }' | python3 -c "import sys,json; print(json.load(sys.stdin)['job']['id'])")
echo "Job: $JOB_ID"

# 2. Wait for spec_ready
for i in $(seq 1 15); do
  ST=$(curl -s $BASE/jobs/$JOB_ID | python3 -c "import sys,json; print(json.load(sys.stdin)['job']['status'])")
  echo "  → $ST"; [ "$ST" = "spec_ready" ] && break; sleep 3
done

# 3. Approve
curl -s -X POST $BASE/jobs/$JOB_ID/approve \
  -H "Content-Type: application/json" -d '{"approved":true}' > /dev/null

# 4. Wait for done
for i in $(seq 1 20); do
  ST=$(curl -s $BASE/jobs/$JOB_ID | python3 -c "import sys,json; print(json.load(sys.stdin)['job']['status'])")
  echo "  → $ST"; [ "$ST" = "done" ] && break; sleep 4
done

# 5. Result
curl -s $BASE/jobs/$JOB_ID | python3 -c "import sys,json; j=json.load(sys.stdin)['job']; print(j.get('prUrl','No PR'))"
```

---

## Mode B — CLI

No server or Postgres required. Uses disk (`progress/.state/`).

```bash
# Job from JSON file
cat > /tmp/test-job.json <<'EOF'
{
  "title": "Add promotional banner",
  "platform": "flutter",
  "repo": "my-org/my-repo",
  "targetBranch": "develop",
  "requireTests": false,
  "figmaUrl": "https://figma.com/design/ABC123/home-screen?node-id=1-234",
  "acceptanceCriteria": [
    {"id":"ac-1","text":"WHEN user opens home THEN show banner","testable":true}
  ]
}
EOF

# Run with automatic spec approval
npx ts-node src/cli/run.ts --job /tmp/test-job.json --approve

# With TDD (Red-Green-Refactor)
npx ts-node src/cli/run.ts --job /tmp/test-job.json --tdd --approve

# List jobs stored on disk
npx ts-node src/cli/run.ts --list

# Resume existing job
npx ts-node src/cli/run.ts --id <JOB_ID>

# Reject spec with feedback (max 5 retries)
npx ts-node src/cli/run.ts --id <JOB_ID> --reject "Needs more detail on the error case"

# Full demo script
./scripts/demo.sh flutter b   # Flutter
./scripts/demo.sh ios b       # iOS
./scripts/demo.sh android b   # Android
```

---

## Mode C — Webhook

Requires server running (`npm run dev`).

```bash
# Generic trigger
curl -s -X POST http://localhost:3000/webhook/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Add promotional banner",
    "platform": "flutter",
    "repo": "my-org/my-repo",
    "targetBranch": "develop",
    "tddMode": false,
    "acceptanceCriteria": [
      {"id":"ac-1","text":"WHEN user opens home THEN show banner"}
    ]
  }' | jq '{jobId: .jobId, status: .status}'

# Trigger simulating Jira
curl -s -X POST http://localhost:3000/webhook/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "webhookEvent": "jira:issue_created",
    "issue": {
      "key": "PROJ-123",
      "fields": {
        "summary": "[MOBILE] Add promotional banner",
        "description": "Ticket description"
      }
    }
  }' | jq '{jobId: .jobId, status: .status}'

# Demo script
./scripts/demo.sh flutter c
```

---

## Troubleshooting

| Symptom          | Likely cause                         | Fix                                                                             |
| ---------------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| Job stuck `pending` | Leader not processing              | Verify `orchestrateJob` was called; check logs                                  |
| `spec_error`     | LLM failure or missing `FIGMA_ACCESS_TOKEN` | Verify `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` and `FIGMA_ACCESS_TOKEN` in `.env` |
| `env_error`      | Missing toolchain                    | Run `./init.sh` to see what is missing                                          |
| `repo_error`     | Repo access                          | Verify `GITHUB_TOKEN` and repo permissions                                      |
| `build_error`    | Dependencies                         | Check that the repo has the correct lockfile                                    |
| Cannot approve spec | Job not in `spec_ready`             | Wait more; monitor with `/jobs/$JOB_ID`                                         |
| Webhook `401`    | Invalid signature                    | Verify `WEBHOOK_SECRET` in `.env`                                               |

---

## Expected timings

| Phase        | Typical time |
| ------------ | ------------- |
| Health check | < 1 s         |
| Create job   | < 2 s         |
| Generate spec | 15–45 s       |
| Approve spec | < 1 s         |
| Implement    | 30–90 s       |
| Create PR    | < 10 s        |
| **Total**    | **~2–3 min**  |
