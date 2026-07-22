---
name: gaia_code_generator
description: Run a GAIA job in CLI mode from Claude Code. Uses the same agents as src/cli/run.ts.
tools: Read, Bash, Agent
---

# `/gaia_code_generator` — Run GAIA in CLI mode from Claude Code

This command makes `.claude` behave like **CLI Mode**: it takes a job ticket, runs the full pipeline, and delivers a PR. It uses the **same agents** (the TypeScript agents in `src/agents/`, equivalent to those in `.claude/agents/` as described in `docs/engineering/workflow.md`).

## Steps

1. Read `AGENTS.md` and `docs/engineering/workflow.md` to orient yourself.
2. Run `./init.sh`. If it fails, **stop** and report it.
3. Determine the task:
   - If the user gave you a path to a `job.json`, use it.
   - If not, read `feature_list.json`, choose the first feature with `"sdd": true` and a `status` other than `done`/`blocked`, and generate a temporary `job.json` with the required fields.
4. Ask the human whether to run with `--approve` (auto-approve) or pause after the spec, as the normal CLI does.
5. To generate the spec and stop at the human gate:
   - First show the command with the real path in its own executable block, to offer **Run in terminal**:
     ```bash
     npm run gaia -- <REAL_JOB_JSON_PATH>
     ```
   - Immediately after, run that exact command yourself via `Bash` in blocking mode and wait for its output. **Do not wait for the human to click the button**: Claude cannot observe when a command started from that button finishes and the flow would stall. The button is a visible manual alternative; the `Bash` call is the authoritative execution of the flow.
   - If you detect the human already ran it and the job is in `spec_ready`, do not run it again: recover the existing job with `--list` and continue reading its artifacts.
6. When SpecAuthor finishes, get from the CLI's real output:
   - The `JOB_ID`.
   - The absolute path indicated by `Spec saved to ...` or `Gherkin saved to ...`.
   Then show in Claude, **complete, without truncating or summarizing**, all its artifacts in this order:
   - `requirements.json`: derived requirements and acceptance criteria.
   - `design.json`: technical design and affected files.
   - `tasks.json`: complete implementation plan.
   - `scenarios.feature`: all Gherkin scenarios, including `Feature`, `Background`, tags, `Scenario`/`Scenario Outline`, `Examples`, and every `Given/When/Then` step.
   - `handoff.md`: SpecAuthor handoff, if it exists.
7. Use `Read` with the **real absolute paths reported by the CLI**; do not assume the workspace is in `/tmp/gaia-workspace`, because it may be under `/private/tmp/claude/...` or another configured root. `requirements.json`, `design.json`, `tasks.json`, and `scenarios.feature` live in the directory reported by `Spec saved to`. To locate `handoff.md`, start from the parent workspace shown in the same output. If a file does not exist, say so explicitly; do not silently omit it. Do not use `head`, `tail`, line limits, or an explanation that replaces the original content.
8. Present the artifacts with separate headings and appropriate code blocks (`json`, `gherkin`, or `markdown`). The full Gherkin scenarios must remain visible in the Claude chat **always**, even when `--approve` was requested from the start.
9. If the job stopped at `spec_ready`, only after showing all of the above ask the human to explicitly approve or reject the spec.
10. At the approval gate, **always** show both options as independent `bash` blocks, single-line, with the real `JOB_ID`. This format is mandatory for Claude Code to show the **Run in terminal** button. Before the blocks ask: "Do you approve this spec to continue with implementation, or reject it with feedback to regenerate? (max 5 retries)".

    **Approve and continue**

    ```bash
    npm run gaia -- --id <REAL_JOB_ID> --approve
    ```

    **Reject with feedback**

    ```bash
    npm run gaia -- --id <REAL_JOB_ID> --reject "<REAL_HUMAN_FEEDBACK>"
    ```

    Do not use a `text` block, a list, inline code, unreplaced placeholders, or multiple commands inside the same block.
11. Wait for the human's textual response:
    - If approved, run the `--approve` command yourself via `Bash` in blocking mode and automatically continue with the full CLI output through Implementer, Reviewer, MutationTester, and PR creation.
    - If rejected, ask for the feedback, run the `--reject` command yourself with that feedback via `Bash` in blocking mode. The CLI will regenerate the spec and stop again at `spec_ready`. Read the new spec artifacts (steps 6–8) and present the approval gate again. If 5 retries are reached, inform the human and do not attempt more automatic rejections.
    - Do not wait to detect a click on **Run in terminal**, because that terminal is external to the agent flow. If the human reports they already used the button, verify status with `npm run gaia -- --list` and continue without duplicating execution.
12. Every actionable command you deliver during this flow must also appear in its own fenced `bash` block, single executable line, to get the **Run in terminal** button. Do not group different commands into a single block. Showing the button never replaces authoritative execution via `Bash` when the agent needs to read the output and continue.
13. If the human asked for auto-approval from the start, still first run `npm run gaia -- <job.json>` **without** `--approve` so the CLI stops at `spec_ready`. Show the full artifacts per steps 6–8 and then show the executable block with `npm run gaia -- --id <REAL_JOB_ID> --approve`. Never run the full pipeline in a single call because it would hide the SpecAuthor artifacts until the end.
14. Report the final result, the PR URL, and the next step.
15. Update `progress/current.md` if applicable.
16. At the end, deliver each handoff action separately with its own **Run in terminal** button:

    **List recent jobs**

    ```bash
    npm run gaia -- --list
    ```

    **Resume or retry the same job**

    ```bash
    npm run gaia -- --id <REAL_JOB_ID> --retry
    ```

    **Inspect the generated repo**

    ```bash
    git -C /tmp/gaia-workspace/<REAL_JOB_ID>/repo log --oneline -3
    ```

    **Push the branch manually if needed**

    ```bash
    git -C /tmp/gaia-workspace/<REAL_JOB_ID>/repo push -u origin <REAL_BRANCH>
    ```

## Important rules

- One feature at a time.
- Do not edit the harness `src/` or `tests/`; the CLI handles that.
- If `--approve` is used, the human gate on `.feature` files is skipped; without `--approve`, respect it.
- `feature_list.json` must be updated if the feature finishes (`status: done`).
