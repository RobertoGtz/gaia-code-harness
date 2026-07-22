#!/usr/bin/env bash
# init.sh — Environment verification and initialization for GAIA Code Harness
#
# Run at the START of a session and before declaring any task `done`.
# If it fails, the session must not proceed.
#
# Usage:
#   ./init.sh              — full verification
#   ./init.sh --quick      — Node + TS compilation only (skip native platforms)
#   ./init.sh --http       — also verify Postgres is reachable

set -u
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; NC='\033[0m'
ok()   { printf "${GREEN}[OK]${NC}    %s\n" "$1"; }
warn() { printf "${YELLOW}[WARN]${NC}  %s\n" "$1"; }
fail() { printf "${RED}[FAIL]${NC}  %s\n" "$1"; }

QUICK=0; CHECK_HTTP=0
for arg in "$@"; do
  [[ "$arg" == "--quick" ]] && QUICK=1
  [[ "$arg" == "--http"  ]] && CHECK_HTTP=1
done

EXIT_CODE=0

# ── 1. Base environment ───────────────────────────────────────────────────────
echo "── 1. Base environment ───────────────────────────────────"

if ! command -v node >/dev/null 2>&1; then
  fail "node is not installed"; EXIT_CODE=1
else
  NODE_VER=$(node --version)
  ok "node $NODE_VER"
  # Minimum Node 18
  MAJOR=$(echo "$NODE_VER" | sed 's/v\([0-9]*\).*/\1/')
  if [ "$MAJOR" -lt 18 ]; then
    fail "Node >= 18 required (current: $NODE_VER)"; EXIT_CODE=1
  else
    ok "Node version compatible"
  fi
fi

if ! command -v python3 >/dev/null 2>&1; then
  warn "python3 not available — tools/mutate.py will not work in CLI mode"
else
  PY_VER=$(python3 --version)
  ok "python3 $PY_VER (required for tools/mutate.py)"
fi

# ── 2. Required harness files ─────────────────────────────────────────────────
echo ""
echo "── 2. Required harness files ──────────────────────────────"

REQUIRED_FILES=(
  "AGENTS.md"
  "CHECKPOINTS.md"
  "feature_list.json"
  "progress/current.md"
  "docs/engineering/workflow.md"
  "docs/engineering/tdd.md"
  "docs/engineering/gherkin.md"
  "docs/engineering/mutation-testing.md"
  "tools/mutate.py"
  "src/harness/leader.ts"
  "src/agents/registry.ts"
  "src/state/index.ts"
)

for f in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    fail "Missing required file: $f"; EXIT_CODE=1
  else
    ok "$f exists"
  fi
done

# ── 3. TypeScript compilation ───────────────────────────────────────────────────
echo ""
echo "── 3. TypeScript compilation ──────────────────────────────"

if [ ! -d "node_modules" ]; then
  warn "node_modules does not exist — run 'npm install'"
  EXIT_CODE=1
else
  if npx tsc --noEmit 2>&1; then
    ok "TypeScript compiles without errors"
  else
    fail "TypeScript compilation errors"
    EXIT_CODE=1
  fi
fi

# ── 4. Validate feature_list.json ─────────────────────────────────────────────
echo ""
echo "── 4. Validating feature_list.json and scenarios ──────────"

python3 - <<'PY'
import json, os, sys

try:
    raw = json.load(open("feature_list.json"))
    # Supports direct array or wrapper { "features": [...] }
    features = raw if isinstance(raw, list) else raw.get("features", raw)
    valid_states = {"pending", "spec_ready", "in_progress", "done", "blocked"}
    in_progress = [f for f in features if f.get("status") == "in_progress"]
    if len(in_progress) > 1:
        print(f"[FAIL]  {len(in_progress)} features are in_progress (max 1)")
        sys.exit(1)
    requires_spec = {"spec_ready", "in_progress", "done"}
    errors = []
    for f in features:
        st = f.get("status", "")
        if st not in valid_states:
            errors.append(f"Invalid state for feature {f.get('id')}: {st!r}")
        if f.get("sdd") and st in requires_spec:
            feature_file = os.path.join("features", f["name"] + ".feature")
            if not os.path.isfile(feature_file):
                errors.append(f"feature {f.get('id')} ({f.get('name')}) "
                              f"in {st} without {feature_file}")
    if errors:
        for e in errors: print(f"[FAIL]  {e}")
        sys.exit(1)
    print(f"[OK]    feature_list.json valid ({len(features)} features)")
except SystemExit:
    raise
except Exception as e:
    print(f"[FAIL]  feature_list.json invalid: {e}")
    sys.exit(1)
PY
[ $? -ne 0 ] && EXIT_CODE=1

# ── 5. Native platforms (skipped with --quick) ────────────────────────────────
if [ $QUICK -eq 0 ]; then
  echo ""
  echo "── 5. Native platforms ────────────────────────────────────"

  if command -v flutter >/dev/null 2>&1; then
    ok "flutter -> $(flutter --version 2>/dev/null | head -1)"
  else
    warn "flutter not found (required for Flutter jobs)"
  fi

  if command -v swift >/dev/null 2>&1; then
    ok "swift -> $(swift --version 2>/dev/null | head -1)"
  else
    warn "swift not found (required for iOS jobs)"
  fi

  if [ -n "${JAVA_HOME:-}" ] && [ -f "${JAVA_HOME}/bin/java" ]; then
    ok "JAVA_HOME -> $JAVA_HOME"
  elif command -v java >/dev/null 2>&1; then
    ok "java -> $(java -version 2>&1 | head -1)"
  else
    warn "Java not found (required for Android jobs)"
  fi
fi

# ── 6. Critical environment variables ─────────────────────────────────────────
echo ""
echo "── 6. Environment variables ───────────────────────────────"

if [ -f ".env" ]; then
  ok ".env exists"
  for VAR in GITHUB_TOKEN; do
    VAL=$(grep -E "^${VAR}=" .env 2>/dev/null | cut -d= -f2-)
    if [ -z "$VAL" ]; then
      warn "$VAR not set in .env (required to create PRs)"
    else
      ok "$VAR configured"
    fi
  done
  # LLM: LiteLLM proxy (LLM_BASE_URL + LLM_API_KEY) or direct provider
  LLM_BASE=$(grep -E "^LLM_BASE_URL=" .env 2>/dev/null | cut -d= -f2-)
  LLM_KEY=$(grep -E "^LLM_API_KEY=" .env 2>/dev/null | cut -d= -f2-)
  OPENAI=$(grep -E "^OPENAI_API_KEY=" .env 2>/dev/null | cut -d= -f2-)
  ANTHROPIC=$(grep -E "^ANTHROPIC_API_KEY=" .env 2>/dev/null | cut -d= -f2-)
  if [ -n "$LLM_BASE" ] && [ -n "$LLM_KEY" ]; then
    ok "LLM configured via LiteLLM proxy (LLM_BASE_URL + LLM_API_KEY)"
  elif [ -n "$OPENAI" ]; then
    ok "LLM key configured (OPENAI_API_KEY)"
  elif [ -n "$ANTHROPIC" ]; then
    ok "LLM key configured (ANTHROPIC_API_KEY)"
  else
    fail "No LLM key configured (LLM_BASE_URL+LLM_API_KEY, OPENAI_API_KEY or ANTHROPIC_API_KEY)"; EXIT_CODE=1
  fi
else
  warn ".env does not exist — copy .env.example and fill in the values"
fi

# ── 7. Postgres (only with --http) ────────────────────────────────────────────
if [ $CHECK_HTTP -eq 1 ]; then
  echo ""
  echo "── 7. Postgres (HTTP mode) ─────────────────────────────────"
  if command -v psql >/dev/null 2>&1; then
    DB_URL="${DATABASE_URL:-postgresql://gaia:gaia@localhost:5432/gaia}"
    if psql "$DB_URL" -c "SELECT 1" >/dev/null 2>&1; then
      ok "Postgres reachable at $DB_URL"
    else
      fail "Cannot connect to Postgres ($DB_URL)"; EXIT_CODE=1
    fi
  else
    warn "psql not available — Postgres not verified"
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "── Summary ────────────────────────────────────────────────"
if [ $EXIT_CODE -eq 0 ]; then
  ok "Environment ready. You may start working."
else
  fail "Environment is NOT ready. Resolve the errors before proceeding."
fi

exit $EXIT_CODE
