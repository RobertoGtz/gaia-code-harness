#!/usr/bin/env bash
# init.sh — Verificación e inicialización del entorno GAIA Code Harness
#
# Ejecutar al COMENZAR una sesión y antes de declarar cualquier tarea `done`.
# Si falla, la sesión no debe avanzar.
#
# Uso:
#   ./init.sh               — verificación completa
#   ./init.sh --quick       — solo Node + compilación TS (omite plataformas nativas)
#   ./init.sh --http        — verifica además que Postgres esté accesible

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

# ── 1. Entorno base ───────────────────────────────────────────────────────────
echo "── 1. Entorno base ─────────────────────────────────────────"

if ! command -v node >/dev/null 2>&1; then
  fail "node no está instalado"; EXIT_CODE=1
else
  NODE_VER=$(node --version)
  ok "node $NODE_VER"
  # Mínimo Node 18
  MAJOR=$(echo "$NODE_VER" | sed 's/v\([0-9]*\).*/\1/')
  if [ "$MAJOR" -lt 18 ]; then
    fail "Se requiere Node >= 18 (actual: $NODE_VER)"; EXIT_CODE=1
  else
    ok "Versión de Node compatible"
  fi
fi

if ! command -v python3 >/dev/null 2>&1; then
  warn "python3 no disponible — tools/mutate.py no funcionará en modo CLI"
else
  PY_VER=$(python3 --version)
  ok "python3 $PY_VER (necesario para tools/mutate.py)"
fi

# ── 2. Archivos base del harness ──────────────────────────────────────────────
echo ""
echo "── 2. Archivos base del harness ────────────────────────────"

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
    fail "Falta archivo base: $f"; EXIT_CODE=1
  else
    ok "Existe $f"
  fi
done

# ── 3. Compilación TypeScript ─────────────────────────────────────────────────
echo ""
echo "── 3. Compilación TypeScript ───────────────────────────────"

if [ ! -d "node_modules" ]; then
  warn "node_modules no existe — ejecuta 'npm install'"
  EXIT_CODE=1
else
  if npx tsc --noEmit 2>&1; then
    ok "TypeScript compila sin errores"
  else
    fail "Errores de compilación TypeScript"
    EXIT_CODE=1
  fi
fi

# ── 4. Validar feature_list.json ──────────────────────────────────────────────
echo ""
echo "── 4. Validando feature_list.json y escenarios ────────────"

python3 - <<'PY'
import json, os, sys

try:
    raw = json.load(open("feature_list.json"))
    # Soporta array directo o wrapper { "features": [...] }
    features = raw if isinstance(raw, list) else raw.get("features", raw)
    valid_states = {"pending", "spec_ready", "in_progress", "done", "blocked"}
    in_progress = [f for f in features if f.get("status") == "in_progress"]
    if len(in_progress) > 1:
        print(f"[FAIL]  Hay {len(in_progress)} features en in_progress (máximo 1)")
        sys.exit(1)
    requires_spec = {"spec_ready", "in_progress", "done"}
    errors = []
    for f in features:
        st = f.get("status", "")
        if st not in valid_states:
            errors.append(f"Estado inválido en feature {f.get('id')}: {st!r}")
        if f.get("sdd") and st in requires_spec:
            feature_file = os.path.join("features", f["name"] + ".feature")
            if not os.path.isfile(feature_file):
                errors.append(f"feature {f.get('id')} ({f.get('name')}) "
                              f"en {st} sin {feature_file}")
    if errors:
        for e in errors: print(f"[FAIL]  {e}")
        sys.exit(1)
    print(f"[OK]    feature_list.json válido ({len(features)} features)")
except SystemExit:
    raise
except Exception as e:
    print(f"[FAIL]  feature_list.json inválido: {e}")
    sys.exit(1)
PY
[ $? -ne 0 ] && EXIT_CODE=1

# ── 5. Plataformas nativas (skip en --quick) ──────────────────────────────────
if [ $QUICK -eq 0 ]; then
  echo ""
  echo "── 5. Plataformas nativas ──────────────────────────────────"

  if command -v flutter >/dev/null 2>&1; then
    ok "flutter -> $(flutter --version 2>/dev/null | head -1)"
  else
    warn "flutter no encontrado (necesario para jobs Flutter)"
  fi

  if command -v swift >/dev/null 2>&1; then
    ok "swift -> $(swift --version 2>/dev/null | head -1)"
  else
    warn "swift no encontrado (necesario para jobs iOS)"
  fi

  if [ -n "${JAVA_HOME:-}" ] && [ -f "${JAVA_HOME}/bin/java" ]; then
    ok "JAVA_HOME -> $JAVA_HOME"
  elif command -v java >/dev/null 2>&1; then
    ok "java -> $(java -version 2>&1 | head -1)"
  else
    warn "Java no encontrado (necesario para jobs Android)"
  fi
fi

# ── 6. Variables de entorno críticas ──────────────────────────────────────────
echo ""
echo "── 6. Variables de entorno ─────────────────────────────────"

if [ -f ".env" ]; then
  ok ".env existe"
  for VAR in GITHUB_TOKEN; do
    VAL=$(grep -E "^${VAR}=" .env 2>/dev/null | cut -d= -f2-)
    if [ -z "$VAL" ]; then
      warn "$VAR no configurado en .env (necesario para crear PRs)"
    else
      ok "$VAR configurado"
    fi
  done
  # LLM: al menos uno
  OPENAI=$(grep -E "^OPENAI_API_KEY=" .env 2>/dev/null | cut -d= -f2-)
  ANTHROPIC=$(grep -E "^ANTHROPIC_API_KEY=" .env 2>/dev/null | cut -d= -f2-)
  if [ -z "$OPENAI" ] && [ -z "$ANTHROPIC" ]; then
    fail "Ninguna LLM key configurada (OPENAI_API_KEY o ANTHROPIC_API_KEY)"; EXIT_CODE=1
  else
    ok "LLM key configurada"
  fi
else
  warn ".env no existe — copia .env.example y completa los valores"
fi

# ── 7. Postgres (solo con --http) ─────────────────────────────────────────────
if [ $CHECK_HTTP -eq 1 ]; then
  echo ""
  echo "── 7. Postgres (HTTP mode) ─────────────────────────────────"
  if command -v psql >/dev/null 2>&1; then
    DB_URL="${DATABASE_URL:-postgresql://gaia:gaia@localhost:5432/gaia}"
    if psql "$DB_URL" -c "SELECT 1" >/dev/null 2>&1; then
      ok "Postgres accesible en $DB_URL"
    else
      fail "No se puede conectar a Postgres ($DB_URL)"; EXIT_CODE=1
    fi
  else
    warn "psql no disponible — no se verifica Postgres"
  fi
fi

# ── Resumen ───────────────────────────────────────────────────────────────────
echo ""
echo "── Resumen ─────────────────────────────────────────────────"
if [ $EXIT_CODE -eq 0 ]; then
  ok "Entorno listo. Puedes empezar a trabajar."
else
  fail "Entorno NO está listo. Resuelve los errores antes de avanzar."
fi

exit $EXIT_CODE
