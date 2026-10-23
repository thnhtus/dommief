# ProjectRules — project-dependent rules (ADAPTER — this project writes its own)

> **Document:** `docs/agents/ProjectRules.md` — normative home for the 4 sections the kernel does **not** know: §1 sources of truth, §2 architecture guardrails, §3 branch rules, §7 check commands.
> **Precedence:** [`../Instructions.md`](../Instructions.md) > [`SharedRules.md`](./SharedRules.md) (kernel) > this file > role file.
> **Section numbers stay 1/2/3/7** — the kernel cross-references by number (`SharedRules §2` = section 2 here). Do not renumber, do not insert a new section in between.
> **These four sections only.** Anything the kernel already defines (handoff, status, line caps, AC traceability) does not get copied down here.

---

## 1. Sources of truth via MCP — do not guess

| MCP server | Role | Used for |
| --- | --- | --- |
| `tracker` (ClickUp, `https://mcp.clickup.com/mcp`) | Requirement source | taskId, description, the BA's AC, comments |
| `github` (global MCP) | Branch / MR source | thnhtus/dommief — branches, PRs, protected branches |
| `design` (Figma, `https://mcp.figma.com/mcp`) | Design source | node/screen, UI states |

- **Do not invent MCP data.** A field you cannot fetch → write the literal `unavailable`; if that field blocks a gate → `status = needs_clarification`.
- **Quote, do not paraphrase:** stating a requirement must come with its source (task URL, design node, requirement ID).
- **No implicit caching:** the BA edits the task mid-flight → re-read before the next gate.
- **MCP auth expired:** a call fails on auth → `status = blocked`, tell the user to run `/mcp` and log in again, **stop** — no retry loop, no invented data in its place.

**API contract source** (the ladder is in [`TechnicalPlanner.md` §3.2](./TechnicalPlanner.md) — `unavailable` is the last rung):

| Rung | Present in this project? | Declared here |
| --- | --- | --- |
| 2. BE repo declared in `harness.config.json → repos` | no (single repo, frontend layer only) | read order: `unavailable` |
| 3. Swagger/OpenAPI | no | `api-docs-sync` skill: `.claude/skills/api-docs-sync/services.json` (placeholder) |

---

## 2. Architecture guardrails

Stack: TypeScript, pnpm (11.1.2), React 19, Vite 8, React Router 8, unified/remark/rehype (markdown pipeline), shiki, minisearch, zod, cac (CLI).

Project conventions and guardrails live in [`CLAUDE.md`](../../CLAUDE.md) — link, do not copy, so the two cannot drift. Summary: use the centralized Knowledge Base (`/Users/thanhtu1/my_obsidian_vault101`) for architectural/behavior changes; run `knowledge.py preflight` first; prefer existing patterns.

| Directory | Rule for the agent |
| --- | --- |
| `packages/core/src/` | Core library + CLI + Vite plugin + markdown pipeline; do not add ad-hoc helpers outside this tree |
| `packages/theme-default/src/` | Default theme; consume via `theme-api`, do not reach into internals |
| `examples/docs/` | Demo site; treat as integration smoke, not a place for library logic |

Cross-cutting constraints:

- No new library unless the plan approved it.
- Markdown pipeline changes must keep the existing remark/rehype chain order (see core src).

> This section is **the most expensive one to write in a hurry**. Most of its value only shows up after the project has hit a real incident — write down what you already know, then build it up after each time an agent gets it wrong.

---

## 3. Branch rules

- **Protected branches (never commit/push/rebase/delete directly):** `master`
- **Branch name:** `{user}/t/{taskId}-{slug}` — `slug` matches the `docsPath` folder.
- **Base branch (cut new branches from here):** `master`

  ```bash
  git fetch origin
  git switch master
  git pull --ff-only origin master
  git switch -c <branch-name-formula>
  ```

  Always `--ff-only` — a bare `git pull` can open the interactive merge editor and hang the session.
- **Exception — a branch the user manages:** the user is already standing on a non-protected branch → **leave it alone**, do not check out anything. Record `branch` = the conventional name, `branchActual` = the real branch.
- Creating/choosing the branch belongs to the **implementer**, not the orchestrator.
- **Never run a git command that changes working tree state:** `git stash` (including `push -u`), `git checkout -- …`, `git restore`, `git reset --hard`, `git clean`. Another task may be writing files at the same time. Need a clean tree → ask the user.
- **Requires an explicit user request in the session:** `git commit`, `git push`, creating/updating an MR, deleting a branch. Gate passes → `status = reviewing` and **stop, wait for the user**.

---

## 7. Check commands (use only these)

**One-shot commands — what the agent uses (they terminate on their own, return an exit code):**

| Command | Purpose |
| --- | --- |
| `pnpm test` | **default Gate 4 evidence** — runs unit tests (vitest) |
| `pnpm test:watch` | (watch mode — user only; see below) |
| `pnpm typecheck` | 0 errors (tsc on core, theme-default, examples/docs) |
| `pnpm lint` | 0 errors (eslint) |
| `pnpm build` | success (tsup + examples/docs) |

> Write them with the package manager this repo actually uses — the lockfile decides (`package-lock.json` → `npm run`, `yarn.lock` → `yarn`, `pnpm-lock.yaml` → `pnpm`, `bun.lock*` → `bun run`), or `packageManager` in `package.json` if it is set. Non-JS stacks write their own (`go test`, `pytest`, `cargo`, `mvn`). Do not default to npm.

> The commands above must match `evidenceCommandPattern` in `harness.config.json` — get that wrong and Gate 4 will not accept the evidence. Check with `node scripts/validate-tasks.mjs --self-check`.

**Run them through the wrapper, do not paste output by hand:**

```bash
node scripts/run-evidence.mjs --append <task-folder>/08-Test-Evidence.md -- <command>
```

The wrapper runs the real command, then stamps `exitCode`, `durationMs`, `gitRev`, `startedAt`, `outputHash` at the end of the block. `outputHash` binds the attestation to **exactly the output sitting next to it**: copying the block from another task, or running it for real and then prettying up the output, both make the hash disagree and the validator blocks it. That is the difference between *"this text looks like test output"* and *"this process ran and exited 0"* — an agent that ran nothing can still write the first sentence, not the second.

The case it catches that every check-by-prose loses: a command that **prints `Tests: 12 passed` but exits 1**. Read the text and it is green; read the exit code and it is red.

A fresh install ships `"evidenceMode": "attested"` — **keep it**. Drop it to `"legacy"` and hand-pasted evidence gets through again, which means Gate 4/5 only check the shape of the prose; it exists for repos already mid-flight, not for new projects. This field **must be declared explicitly**: `--self-check` goes red if it is missing, because inheriting it from an implicit value is how the harness's whole argument collapses in silence.

**Watch/server commands — ONLY the user runs these by hand, the agent NEVER does** (they do not terminate → they hang the session): `pnpm test:watch`, `pnpm -C examples/docs dev`, `pnpm -C packages/core dev`, `pnpm -C packages/theme-default dev`

**The real layer to exercise when verifying** (skill `pre-qc-gate` §4): `cli` (no UI in core; the docs site is a demo). Integration tests the harness already has: `none` — do not stand one up at verify time.

Honesty rule: never claim "pass" without having run the real command in this session; paste the real output (command, pass/fail counts, exit code) into `08-Test-Evidence.md`; a failing test → `status = blocked`, do not disable/skip a test to "make it green".
