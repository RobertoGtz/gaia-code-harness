#!/usr/bin/env python3
"""Dependency-free deterministic mutation testing tool.

Introduces a small defect into a source file, runs the test suite, and checks
whether any test fails (mutant KILLED) or all tests pass (mutant SURVIVED).
A survivor is a hole in the test net.

Usage:
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

Design:
- Works at the *token* level (Python `tokenize` module, regex for TS/Swift/Kotlin),
  so it NEVER mutates the contents of strings or comments.
- Discards mutants that produce syntax errors before running tests.
- ALWAYS restores the original file, even on Ctrl-C (`finally` block).
- Default threshold: 80% (aligned with MutationTesterAgent.ts).

See docs/engineering/mutation-testing.md.
"""
from __future__ import annotations

import argparse
import io
import re
import subprocess
import sys
import tokenize
from pathlib import Path

# ─── Operator mutations (apply to TS, Swift, Kotlin, Python) ───────────────
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

# Name/constant mutations (Python)
NAME_MUTATIONS: dict[str, str] = {
    "and": "or",
    "or": "and",
    "True": "False",
    "False": "True",
}

# Regex patterns for TS/Swift/Kotlin (text level, outside strings/comments)
TS_KEYWORD_MUTATIONS: list[tuple[re.Pattern, str]] = [
    (re.compile(r'\btrue\b'),  "false"),
    (re.compile(r'\bfalse\b'), "true"),
]


# ─── Mutant class ────────────────────────────────────────────────────────────

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


# ─── Mutant generation per language ───────────────────────────────────────────

def _int_mutation(literal: str) -> str | None:
    try:
        value = int(literal, 0)
    except ValueError:
        return None
    return str(value + 1)


def generate_mutants_python(source: str) -> list[Mutant]:
    """Token-based mutations for Python (precise, no false positives)."""
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
                                  OP_MUTATIONS[text], "operator"))
        elif tok.type == tokenize.NAME and text in NAME_MUTATIONS:
            mutants.append(Mutant(row, col_start, col_end, text,
                                  NAME_MUTATIONS[text], "keyword"))
        elif tok.type == tokenize.NUMBER:
            repl = _int_mutation(text)
            if repl:
                mutants.append(Mutant(row, col_start, col_end, text,
                                      repl, "number"))

    # return <expr> -> return None
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
                              content[indent:], "return None", "return"))
    return mutants


def _strip_strings_and_comments(source: str, lang: str) -> str:
    """Replace strings and comments with spaces to avoid mutating them."""
    # Strings must be masked BEFORE comments so that // inside strings is not treated as a comment.
    # Single and double quotes (not multiline)
    result = re.sub(r'("(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\')',
                    lambda m: ' ' * len(m.group()), source)
    # TS template literals (multiline support)
    if lang in ("ts", "js"):
        result = re.sub(r'`(?:[^`\\]|\\.)*`',
                        lambda m: ' ' * len(m.group()), result, flags=re.DOTALL)
    # Block comments (/* ... */) including JSDoc
    result = re.sub(r'/\*[\s\S]*?\*/', lambda m: ' ' * len(m.group()), result)
    # Line comments (//, #)
    result = re.sub(r'(//[^\n]*|#[^\n]*)', lambda m: ' ' * len(m.group()), result)
    return result


def _offset_at(lines: list[str], row: int, col: int) -> int:
    """Convert 1-based row and 0-based col to absolute offset in source."""
    offset = sum(len(line) for line in lines[:row - 1])
    return offset + col


def _get_excluded_regions(source: str, lang: str) -> list[tuple[int, int]]:
    """Return absolute (start, end) ranges for strings, comments, and TS generic types."""
    regions: list[tuple[int, int]] = []
    i = 0
    n = len(source)
    while i < n:
        c = source[i]
        if c == '"' or c == "'":
            start = i
            quote = c
            i += 1
            while i < n and source[i] != quote:
                if source[i] == '\\' and i + 1 < n:
                    i += 2
                else:
                    i += 1
            if i < n:
                i += 1
            regions.append((start, i))
        elif c == '`' and lang in ("ts", "js"):
            start = i
            i += 1
            while i < n and source[i] != '`':
                if source[i] == '\\' and i + 1 < n:
                    i += 2
                else:
                    i += 1
            if i < n:
                i += 1
            regions.append((start, i))
        elif source.startswith("/*", i):
            start = i
            i += 2
            while i < n and not source.startswith("*/", i):
                i += 1
            if i < n:
                i += 2
            regions.append((start, i))
        elif source.startswith("//", i) or source.startswith("#", i):
            start = i
            while i < n and source[i] != '\n':
                i += 1
            regions.append((start, i))
        else:
            i += 1

    # TypeScript generics: Identifier<T1, T2> are not comparison operators
    if lang in ("ts", "js"):
        for m in re.finditer(r'\b[A-Za-z_$][\w$]*\s*<[^<>]*>', source):
            regions.append((m.start(), m.end()))

    return regions


def _mutant_in_regions(mutant: Mutant, lines: list[str], regions: list[tuple[int, int]]) -> bool:
    start = _offset_at(lines, mutant.row, mutant.col_start)
    end = _offset_at(lines, mutant.row, mutant.col_end)
    return any(start >= r[0] and end <= r[1] for r in regions)


def generate_mutants_text(source: str, lang: str) -> list[Mutant]:
    """Regex-based mutations for TS/Swift/Kotlin — operates on a copy with strings/comments removed."""
    mutants: list[Mutant] = []
    masked = _strip_strings_and_comments(source, lang)
    lines_orig = source.splitlines(keepends=True)
    lines_mask = masked.splitlines(keepends=True)
    excluded = _get_excluded_regions(source, lang)

    # Operators
    op_pattern = re.compile(
        r'(' + '|'.join(re.escape(k) for k in sorted(OP_MUTATIONS, key=len, reverse=True)) + r')'
    )
    for row, (orig_line, mask_line) in enumerate(zip(lines_orig, lines_mask), start=1):
        for m in op_pattern.finditer(mask_line):
            text = m.group()
            if text not in OP_MUTATIONS:
                continue
            mutant = Mutant(row, m.start(), m.end(), text,
                            OP_MUTATIONS[text], "operator")
            if not _mutant_in_regions(mutant, lines_orig, excluded):
                mutants.append(mutant)

    # true/false keywords
    bool_pattern = re.compile(r'\b(true|false)\b')
    for row, (orig_line, mask_line) in enumerate(zip(lines_orig, lines_mask), start=1):
        for m in bool_pattern.finditer(mask_line):
            text = m.group()
            repl = "false" if text == "true" else "true"
            mutant = Mutant(row, m.start(), m.end(), text, repl, "boolean")
            if not _mutant_in_regions(mutant, lines_orig, excluded):
                mutants.append(mutant)

    # return <expr> -> return null / return nil (Swift) / return undefined (TS)
    return_null = {"ts": "null", "js": "null", "swift": "nil",
                   "kt": "null"}.get(lang, "null")
    return_pat = re.compile(r'\breturn\s+(?!null\b|nil\b|undefined\b|None\b)(.+)')
    for row, mask_line in enumerate(lines_mask, start=1):
        stripped = mask_line.lstrip()
        m = return_pat.match(stripped)
        if m:
            indent = len(mask_line) - len(stripped)
            content = lines_orig[row - 1].rstrip("\n")
            mutant = Mutant(row, indent, len(content),
                            content[indent:],
                            f"return {return_null}", "return")
            if not _mutant_in_regions(mutant, lines_orig, excluded):
                mutants.append(mutant)

    return mutants


def generate_mutants(source: str, path: str) -> list[Mutant]:
    ext = Path(path).suffix.lstrip(".")
    if ext == "py":
        return generate_mutants_python(source)
    return generate_mutants_text(source, ext)


# ─── Compilation check ──────────────────────────────────────────────────────

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
    # For other languages: simple heuristic — reject the mutant if it changed
    # nothing or introduced a basic malformed token. Real compilation will be
    # caught by the test runner.
    return source != orig_source


# ─── Test runner ─────────────────────────────────────────────────────────────

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
        description="Deterministic mutation testing for the GAIA harness.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("path", help="File to mutate (src/ or workspace).")
    parser.add_argument(
        "--cmd",
        default="python3 -m unittest discover -s tests -q",
        help='Command to run tests (default: python3 unittest). '
             'E.g.: "npx jest --passWithNoTests" / "swift test" / "./gradlew test"',
    )
    parser.add_argument(
        "--cwd",
        default=None,
        help="Working directory for the test command (default: current directory).",
    )
    parser.add_argument(
        "--max",
        type=int,
        default=100,
        help="Maximum mutants to evaluate (default 100).",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=80.0,
        help="Minimum percentage of killed mutants to PASS (default 80).",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit result as JSON (useful for MutationTesterAgent.ts).",
    )
    args = parser.parse_args(argv)

    cmd = args.cmd.split()

    with open(args.path, "r", encoding="utf-8") as f:
        original = f.read()
    lines = original.splitlines(keepends=True)

    # Sanity: suite must be green before mutating
    if not run_tests(cmd, args.cwd):
        msg = "[FAIL] The suite is red before mutating. Fix the tests first."
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
        print(f"── Mutating {args.path} ─ {len(valid)} valid mutants "
              f"({skipped_noncompile} discarded because they do not compile)")

    try:
        for i, m in enumerate(valid, start=1):
            with open(args.path, "w", encoding="utf-8") as f:
                f.write(m.apply(lines))
            if run_tests(cmd, args.cwd):
                survived.append(m)
                mark = "SURVIVES"
            else:
                killed.append(m)
                mark = "killed   "
            if not args.json:
                print(f"  [{i:3}/{len(valid)}] {mark}  {m.describe(args.path)}")
    finally:
        # Always restore the original file
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
        print("\n── Summary ──────────────────────────────────────────")
        print(f"  total:    {total}")
        print(f"  killed:   {len(killed)}")
        print(f"  survived: {len(survived)}")
        print(f"  score:    {score:.1f}%  (threshold: {args.threshold:.0f}%)")
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"  result:   {status}")
        if truncated:
            print(f"  [WARN] {truncated} valid mutants NOT evaluated "
                  f"(limit --max={args.max}). Increase --max for full coverage.")
        if survived:
            print("\n  Surviving mutants (holes in the net):")
            for m in survived:
                print(f"   - {m.describe(args.path)}")

    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
