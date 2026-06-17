#!/usr/bin/env python3
"""Mutador determinístico sin dependencias para prueba de mutación.

Introduce un defecto pequeño en un archivo de código fuente, corre la suite
de tests y comprueba si algún test falla (mutante MUERTO) o si todos pasan
(mutante SOBREVIVIENTE). Un sobreviviente es un agujero en la red de tests.

Uso:
    # TypeScript / JavaScript
    python3 tools/mutate.py src/agents/implementer.ts
    python3 tools/mutate.py src/agents/implementer.ts --max 60 --cmd "npx jest --passWithNoTests"

    # Swift
    python3 tools/mutate.py /tmp/gaia-workspace/<jobId>/Sources/App.swift \\
        --cmd "swift test" --cwd /tmp/gaia-workspace/<jobId>

    # Kotlin / Gradle
    python3 tools/mutate.py app/src/main/kotlin/Foo.kt \\
        --cmd "./gradlew testDebugUnitTest" --cwd /path/to/android/project

    # Python (fallback / harness internals)
    python3 tools/mutate.py src/cli.py --max 80

Diseño:
- Trabaja a nivel de *token* (módulo `tokenize` para Python, regex para TS/Swift/Kotlin),
  por lo que NUNCA muta el contenido de strings ni comentarios.
- Descarta los mutantes que producen errores de sintaxis antes de correr tests.
- Restaura SIEMPRE el archivo original, incluso ante Ctrl-C (bloque `finally`).
- Threshold por defecto: 80% (alineado con MutationTesterAgent.ts).

Ver docs/mutation-testing.md.
"""
from __future__ import annotations

import argparse
import io
import re
import subprocess
import sys
import tokenize
from pathlib import Path

# ─── Mutaciones de operador (aplican a TS, Swift, Kotlin, Python) ────────────
OP_MUTATIONS: dict[str, str] = {
    "<=": "<",
    ">=": ">",
    "<": "<=",
    ">": ">=",
    "==": "!=",
    "!=": "==",
    "===": "!==",   # TS/JS identity
    "!==": "===",
    "+": "-",
    "-": "+",
    "&&": "||",
    "||": "&&",
}

# Mutaciones de nombre/constante (Python)
NAME_MUTATIONS: dict[str, str] = {
    "and": "or",
    "or": "and",
    "True": "False",
    "False": "True",
}

# Regex patterns para TS/Swift/Kotlin (nivel texto, fuera de strings/comments)
TS_KEYWORD_MUTATIONS: list[tuple[re.Pattern, str]] = [
    (re.compile(r'\btrue\b'),  "false"),
    (re.compile(r'\bfalse\b'), "true"),
]


# ─── Clase Mutant ─────────────────────────────────────────────────────────────

class Mutant:
    def __init__(self, row: int, col_start: int, col_end: int,
                 original: str, replacement: str, label: str):
        self.row = row              # 1-based
        self.col_start = col_start  # 0-based
        self.col_end = col_end
        self.original = original
        self.replacement = replacement
        self.label = label

    def apply(self, lines: list[str]) -> str:
        out = list(lines)
        line = out[self.row - 1]
        out[self.row - 1] = (line[: self.col_start]
                             + self.replacement
                             + line[self.col_end:])
        return "".join(out)

    def describe(self, path: str) -> str:
        return (f"{path}:{self.row}  [{self.label}]  "
                f"({self.original!r} -> {self.replacement!r})")


# ─── Generación de mutantes por lenguaje ──────────────────────────────────────

def _int_mutation(literal: str) -> str | None:
    try:
        value = int(literal, 0)
    except ValueError:
        return None
    return str(value + 1)


def generate_mutants_python(source: str) -> list[Mutant]:
    """Mutaciones basadas en el tokenizer de Python (preciso, sin falsos positivos)."""
    mutants: list[Mutant] = []
    try:
        tokens = list(tokenize.generate_tokens(io.StringIO(source).readline))
    except tokenize.TokenError:
        return mutants

    for tok in tokens:
        if tok.start[0] != tok.end[0]:
            continue
        row = tok.start[0]
        col_start, col_end = tok.start[1], tok.end[1]
        text = tok.string

        if tok.type == tokenize.OP and text in OP_MUTATIONS:
            mutants.append(Mutant(row, col_start, col_end, text,
                                  OP_MUTATIONS[text], "operador"))
        elif tok.type == tokenize.NAME and text in NAME_MUTATIONS:
            mutants.append(Mutant(row, col_start, col_end, text,
                                  NAME_MUTATIONS[text], "keyword"))
        elif tok.type == tokenize.NUMBER:
            repl = _int_mutation(text)
            if repl:
                mutants.append(Mutant(row, col_start, col_end, text,
                                      repl, "número"))

    # return <expr> → return None
    lines = source.splitlines(keepends=True)
    for idx, raw in enumerate(lines, start=1):
        stripped = raw.lstrip()
        if not stripped.startswith("return "):
            continue
        rest = stripped[len("return "):].strip()
        if rest in ("", "None"):
            continue
        indent = len(raw) - len(stripped)
        content = raw.rstrip("\n")
        mutants.append(Mutant(idx, indent, len(content),
                              content[indent:], "return None", "retorno"))
    return mutants


def _strip_strings_and_comments(source: str, lang: str) -> str:
    """Reemplaza strings y comentarios con espacios para evitar mutaciones en ellos."""
    # Comentarios de línea (//, #)
    result = re.sub(r'(//[^\n]*|#[^\n]*)', lambda m: ' ' * len(m.group()), source)
    # Strings simples y dobles (no multiline)
    result = re.sub(r'("(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\')',
                    lambda m: ' ' * len(m.group()), result)
    # Template literals TS
    if lang in ("ts", "js"):
        result = re.sub(r'`(?:[^`\\]|\\.)*`',
                        lambda m: ' ' * len(m.group()), result)
    return result


def generate_mutants_text(source: str, lang: str) -> list[Mutant]:
    """Mutaciones via regex para TS/Swift/Kotlin — opera sobre copia sin strings/comments."""
    mutants: list[Mutant] = []
    masked = _strip_strings_and_comments(source, lang)
    lines_orig = source.splitlines(keepends=True)
    lines_mask = masked.splitlines(keepends=True)

    # Operadores
    op_pattern = re.compile(
        r'(' + '|'.join(re.escape(k) for k in sorted(OP_MUTATIONS, key=len, reverse=True)) + r')'
    )
    for row, (orig_line, mask_line) in enumerate(zip(lines_orig, lines_mask), start=1):
        for m in op_pattern.finditer(mask_line):
            text = m.group()
            if text not in OP_MUTATIONS:
                continue
            mutants.append(Mutant(row, m.start(), m.end(), text,
                                  OP_MUTATIONS[text], "operador"))

    # true/false keywords
    bool_pattern = re.compile(r'\b(true|false)\b')
    for row, (orig_line, mask_line) in enumerate(zip(lines_orig, lines_mask), start=1):
        for m in bool_pattern.finditer(mask_line):
            text = m.group()
            repl = "false" if text == "true" else "true"
            mutants.append(Mutant(row, m.start(), m.end(), text, repl, "booleano"))

    # return <expr> → return null / return nil (Swift) / return undefined (TS)
    return_null = {"ts": "null", "js": "null", "swift": "nil",
                   "kt": "null"}.get(lang, "null")
    return_pat = re.compile(r'\breturn\s+(?!null\b|nil\b|undefined\b|None\b)(.+)')
    for row, mask_line in enumerate(lines_mask, start=1):
        stripped = mask_line.lstrip()
        m = return_pat.match(stripped)
        if m:
            indent = len(mask_line) - len(stripped)
            content = lines_orig[row - 1].rstrip("\n")
            mutants.append(Mutant(row, indent, len(content),
                                  content[indent:],
                                  f"return {return_null}", "retorno"))

    return mutants


def generate_mutants(source: str, path: str) -> list[Mutant]:
    ext = Path(path).suffix.lstrip(".")
    if ext == "py":
        return generate_mutants_python(source)
    return generate_mutants_text(source, ext)


# ─── Verificación de compilación ──────────────────────────────────────────────

def compiles_python(source: str, path: str) -> bool:
    try:
        compile(source, path, "exec")
        return True
    except SyntaxError:
        return False


def compiles(source: str, path: str, orig_source: str) -> bool:
    ext = Path(path).suffix.lstrip(".")
    if ext == "py":
        return compiles_python(source, path)
    # Para otros lenguajes: heurística simple — si el mutante no cambió nada
    # o introdujo un token malformado básico, lo rechazamos. La compilación
    # real la detectará el runner de tests.
    return source != orig_source


# ─── Runner de tests ──────────────────────────────────────────────────────────

def run_tests(cmd: list[str], cwd: str | None) -> bool:
    result = subprocess.run(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        cwd=cwd,
    )
    return result.returncode == 0


# ─── Main ─────────────────────────────────────────────────────────────────────

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Prueba de mutación determinística para GAIA harness.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("path", help="Archivo a mutar (src/ o workspace).")
    parser.add_argument(
        "--cmd",
        default="python3 -m unittest discover -s tests -q",
        help='Comando para correr tests (default: python3 unittest). '
             'Ej: "npx jest --passWithNoTests" / "swift test" / "./gradlew test"',
    )
    parser.add_argument(
        "--cwd",
        default=None,
        help="Directorio de trabajo para el comando de tests (default: directorio actual).",
    )
    parser.add_argument(
        "--max",
        type=int,
        default=100,
        help="Máximo de mutantes a evaluar (default 100).",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=80.0,
        help="Porcentaje mínimo de mutantes muertos para PASS (default 80).",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emitir resultado en JSON (útil para MutationTesterAgent.ts).",
    )
    args = parser.parse_args(argv)

    cmd = args.cmd.split()

    with open(args.path, "r", encoding="utf-8") as f:
        original = f.read()
    lines = original.splitlines(keepends=True)

    # Cordura: suite debe estar verde antes de mutar
    if not run_tests(cmd, args.cwd):
        msg = "[FAIL] La suite está roja sin mutar. Arregla los tests primero."
        if args.json:
            import json
            print(json.dumps({"error": msg, "score": 0.0, "killed": 0,
                              "survived": 0, "total": 0}))
        else:
            print(msg, file=sys.stderr)
        return 2

    mutants = generate_mutants(original, args.path)
    valid = [m for m in mutants if compiles(m.apply(lines), args.path, original)]
    skipped_noncompile = len(mutants) - len(valid)

    truncated = 0
    if len(valid) > args.max:
        truncated = len(valid) - args.max
        valid = valid[: args.max]

    killed: list[Mutant] = []
    survived: list[Mutant] = []

    if not args.json:
        print(f"── Mutando {args.path} ─ {len(valid)} mutantes válidos "
              f"({skipped_noncompile} descartados por no compilar)")

    try:
        for i, m in enumerate(valid, start=1):
            with open(args.path, "w", encoding="utf-8") as f:
                f.write(m.apply(lines))
            if run_tests(cmd, args.cwd):
                survived.append(m)
                mark = "SOBREVIVE"
            else:
                killed.append(m)
                mark = "muerto   "
            if not args.json:
                print(f"  [{i:3}/{len(valid)}] {mark}  {m.describe(args.path)}")
    finally:
        # Siempre restauramos el archivo original
        with open(args.path, "w", encoding="utf-8") as f:
            f.write(original)

    total = len(valid)
    score = (len(killed) / total * 100) if total else 100.0
    passed = score >= args.threshold

    if args.json:
        import json
        print(json.dumps({
            "score": round(score, 1),
            "killed": len(killed),
            "survived": len(survived),
            "total": total,
            "threshold": args.threshold,
            "passed": passed,
            "truncated": truncated,
            "survived_details": [
                {"file": args.path, "row": m.row,
                 "label": m.label, "original": m.original,
                 "replacement": m.replacement}
                for m in survived
            ],
        }))
    else:
        print("\n── Resumen ──────────────────────────────────────────")
        print(f"  total:    {total}")
        print(f"  killed:   {len(killed)}")
        print(f"  survived: {len(survived)}")
        print(f"  score:    {score:.1f}%  (threshold: {args.threshold:.0f}%)")
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"  result:   {status}")
        if truncated:
            print(f"  [WARN] {truncated} mutantes válidos NO evaluados "
                  f"(límite --max={args.max}). Sube --max para cobertura total.")
        if survived:
            print("\n  Mutantes sobrevivientes (agujeros en la red):")
            for m in survived:
                print(f"   - {m.describe(args.path)}")

    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
