# OpenFlow Usage Tutorial

[中文版本](./openflow-usage-tutorial.md)

## 1. Who this tutorial is for

This guide is for users who have OpenFlow installed but still need practical answers to questions like:

- When should I use `/openflow-feature`?
- When should I use `issue`?
- Do planning and execution require omo?
- When should I run `harden`, `verify`, and `archive`?
- How do I migrate existing docs into OpenFlow?

One sentence to remember first:

> OpenFlow is not the agent that writes your code. It is the governance layer that keeps design, constraints, verification, and archive continuously attached to implementation.

---

## 2. Understand the model before you use the commands

OpenFlow is built on a simple idea:

> **Document programming is constraint programming.**

That means:

- `docs/changes/` is not a scratchpad; it is the active change workspace.
- `docs/current/` is not a brochure; it is the current source of truth.
- `docs/decisions/` is not a notes folder; it is the global decision boundary.
- `verify` is not “just run tests”; it produces reviewable evidence.
- `archive` is not “move a few docs”; it formally freezes and promotes a change.

So the real skill is not memorizing commands. The real skill is knowing:

**When to clarify first, when to implement, when to verify, and when a change is allowed to become canonical.**

---

## 3. Installation and basic setup

Install the OpenFlow plugin:

```bash
npm install @fastknife/openflow
```

Then enable it in your `opencode.json`:

```json
{
  "plugins": ["@fastknife/openflow"]
}
```

If the repository has not been initialized yet, start with:

```text
/openflow-init
```

This creates or refreshes the OpenFlow guide block inside the root `AGENTS.md`, so future agents know how to read `docs/current/`, `docs/changes/`, `docs/archive/`, and `docs/decisions/`.

---

## 4. 10-minute quick start

If you do not want to read the entire guide first, follow one of these two paths.

### Path A: Build a feature

1. Initialize the repo

```text
/openflow-init
```

2. Create the design workspace

```text
/openflow-feature demo-feature
```

3. Implement the feature

- With omo: use `Prometheus + /startwork`
- Without omo: use OpenCode native `plan / build`

4. Run the quality gate after implementation

```text
openflow-quality-gate
```

5. Archive after readiness passes

```text
/openflow-archive demo-feature
```

### Path B: Investigate an uncertain problem

1. Start with issue clarification

```text
/openflow-issue demo-issue --readonly
```

2. Use the result to decide whether to:

- continue investigation
- implement a fix
- escalate into `/openflow-feature`

3. If code changes happen, still return to the main chain:

`openflow-quality-gate -> archive`

---

## 5. Learn to pick the right command first

### Scenario A: You are building a clear feature or change

Use:

```text
/openflow-feature <feature>
```

Use it for:

- new features
- clearly scoped changes
- rule changes
- work that needs design comparison and upfront constraints

### Scenario B: You see a problem but you cannot yet say whether it is a bug

Use:

```text
/openflow-issue <issue-name-or-description>
```

Use it for:

- wrong API output
- strange page behavior
- inconsistent data state
- cases where you do not yet know whether the fix belongs in code, config, data, or business clarification

### Scenario C: You already have a docs tree and want to migrate it into OpenFlow

Use:

```text
/openflow-migrate-docs --sourceDir <source-docs-dir>
```

Examples:

```text
/openflow-migrate-docs --sourceDir ./legacy-docs --dryRun
/openflow-migrate-docs --sourceDir ./.specify --targetDir .
```

Default behavior is report-first and clarify-first before writes happen.

---

## 6. Command selection decision tree

Ask these questions in order.

### Question 1: Is this a feature or a problem?

- **I need to add or change a defined feature**
  - Use `/openflow-feature <feature>`
- **I see something wrong but I do not yet know whether it is a bug**
  - Use `/openflow-issue <issue>`

### Question 2: Do I already have docs that need migration?

- **Yes, I need to bring external docs into OpenFlow**
  - Use `/openflow-migrate-docs --sourceDir <source-docs-dir>`

### Question 3: Has implementation already happened?

- **Not yet**
  - Continue with planning and execution
- **Yes, and I want to know if I can claim completion**
  - Ask the AI to invoke `openflow-quality-gate`
- **Quality gate is done and I want to make it canonical**
  - Run `/openflow-archive <feature>`

Short memory rule:

- `feature` = design first
- `issue` = clarify first
- `quality-gate` = automatically decide harden and produce evidence/readiness
- `archive` = freeze and promote
- `migrate-docs` = import existing docs

---

## 7. Complete feature workflow

### Step 1: Initialize

```text
/openflow-init
```

### Step 2: Run feature design

```text
/openflow-feature user-coupon-filter
```

Expected outcome:

- OpenFlow advances one feature design question at a time
- A dated workspace appears under `docs/changes/YYYY-MM-DD-user-coupon-filter/`
- Typical outputs: `design.md`, `proposal.md`, `decisions.md`, `prd.md`

### Step 3: Plan and execute

You have two valid paths.

#### Path 1: With omo

- Generate the plan with `Prometheus`
- Execute with `/startwork`

#### Path 2: With native OpenCode plan/build

- Use OpenCode native planning
- Execute through native build/execution flow

OpenFlow does not require omo. Its main job is still documentation governance, constraint enforcement, verification, and archive.

### Step 4: Run the quality gate

```text
openflow-quality-gate
```

Read the output carefully:

- whether harden was required
- `Evidence`
- `Readiness`
- `status`
- `reason_codes`
- `next_step`

### Step 5: Archive

Only after readiness allows it:

```text
/openflow-archive user-coupon-filter
```

Expected archive outputs:

```text
docs/archive/YYYY-MM-DD-user-coupon-filter/
  implementation-mapper.md
  design.md            (if present)
  proposal.md          (conditional)
  decisions.md         (conditional)
  prd.md               (conditional)
  plan.md              (conditional)
```

---

## 8. Investigating an uncertain issue

If your input is not “build a feature” but “something seems wrong,” do not jump straight to feature design.

### Step 1: Start with issue clarification

```text
/openflow-issue "login endpoint returns 500 intermittently" --env staging --readonly --write-doc
```

This means:

- `--env staging`: the issue belongs to staging
- `--readonly`: no code/data/config writes during investigation
- `--write-doc`: persist clarification into an issue workspace

### Step 2: Read the result as a decision tool

Focus on:

- expectation
- constraints
- evidence
- semantics
- classification
- next action gate

Typical outcomes:

- `bugfix` -> implement the fix
- `behavior_change` -> escalate into `/openflow-feature`
- `doc_ambiguity` -> ask for user clarification or decision
- `cannot_determine` -> gather more evidence

### Step 3: Use `--resolve` to enter fix flow directly

If classification confirms a bugfix and you want to skip back to the implementation chain, you can add `--resolve`:

```text
/openflow-issue "login endpoint returns 500 intermittently" --env staging --resolve
```

This will:

- automatically generate `issue-resolution.md` and `promotion-candidate.md`
- route the fix through `openflow-quality-gate`
- apply risk-based harden and evidence-aware verify without prompting

If the issue turns out to need design work instead, drop `--resolve` and escalate into `/openflow-feature`.

### Step 4: If it becomes an implementation task, return to the main chain

```text
openflow-quality-gate
/openflow-archive login-endpoint-stability
```

---

## 9. Migrating old documentation

If you already have docs and do not want to reorganize them manually:

### Step 1: Start with a dry run

```text
/openflow-migrate-docs --sourceDir ./legacy-docs --dryRun
```

This previews detection, scanning, classification, clarification, and planning without writing files.

### Step 2: Confirm target categories

Common destinations include:

- `docs/current/requirements/`
- `docs/current/design/`
- `docs/current/spec/`
- `docs/current/workflow/`
- `docs/changes/`
- `docs/archive/`
- `docs/decisions/`
- `docs/references/`

### Step 3: Execute the migration

```text
/openflow-migrate-docs --sourceDir ./legacy-docs --targetDir .
```

Deletion of originals is never automatic.

---

## 10. Common mistakes

### Mistake 1: Treating `issue` like “fix bug now”

Wrong. `issue` is for clarification, investigation, and triage first.
`--resolve` now exists to enter fix mode after classification, but the core point remains: issue's FIRST job is clarify and triage. `--resolve` is for AFTER classification.

### Mistake 2: Treating `verify` like “run a few tests”

Wrong. `verify` also checks drift, evidence quality, and readiness.

### Mistake 3: Skipping `harden` for risky implementation

Not every change needs harden, but complex logic often benefits from it before readiness is claimed.

### Mistake 4: Treating `archive` like a documentation cleanup step

Wrong. `archive` is formal canonicalization.

### Mistake 5: Assuming OpenFlow strongly depends on omo

Wrong. OpenFlow cooperates well with omo but also works as a standalone governance layer on OpenCode.

---

## 11. Recommended minimum path for first-time users

If today is your first day using OpenFlow, this is the simplest path:

1. Run `/openflow-init`
2. Run `/openflow-feature demo-feature`
3. Implement through omo or native OpenCode plan/build
4. Have the AI invoke `openflow-quality-gate`
5. Run `/openflow-archive demo-feature` after readiness passes

If you are investigating a problem instead of building a feature, replace step 2 with:

```text
/openflow-issue demo-issue --readonly
```

---

## 12. Core command reference

This section explains each command in a practical reference style: syntax, parameters, expected behavior, and when to use it.

### 12.1 `/openflow-init`

**Purpose**: Initialize or refresh the OpenFlow guide block in the root `AGENTS.md`.

**Usage**:

```text
/openflow-init
```

**Parameters**: none.

**Expected behavior**:

- creates `AGENTS.md` if missing
- refreshes the OpenFlow managed guide block if present
- preserves user-authored content outside that managed block

**Use it when**:

- the project is adopting OpenFlow for the first time
- the guide block should be refreshed

### 12.2 `/openflow-feature <feature>`

**Purpose**: Create a design clarification workspace for a clear feature or change.

**Usage**:

```text
/openflow-feature user-coupon-filter
```

**Parameters**:

- `<feature>`: a stable, readable feature slug

**Expected behavior**:

- OpenFlow advances the feature design one question at a time
- generates a dated workspace under `docs/changes/`
- typically produces `design.md`, and sometimes `proposal.md`, `decisions.md`, or `prd.md`

### 12.3 `/openflow-change <feature> "<change description>"`

**Purpose**: Handle requirement changes for an active feature before verify/archive are complete.

**Usage**:

```text
/openflow-change user-coupon-filter "add channel filter and preserve old API behavior"
```

**Parameters**:

- `<feature>`: the active feature name
- `"<change description>"`: the change request; keep it quoted

**Expected behavior**:

- updates active docs before code changes
- then applies associated implementation changes
- requires verify again afterward

### 12.4 `/openflow-writing-plan <feature>`

**Purpose**: Generate an implementation plan and save it to `.sisyphus/plans/{feature}.md`.

**Usage**:

```text
/openflow-writing-plan user-coupon-filter
```

**Parameters**:

- `<feature>`: must match the designed feature

**Expected behavior**:

- reads design context
- writes a parser-compatible execution plan
- stops after saving; it does not start implementation automatically

### 12.5 `/openflow-issue <issue-name-or-description>`

**Purpose**: Investigate an uncertain problem before deciding whether it is a bug, data issue, config issue, or behavior change.

**Usage**:

```text
/openflow-issue "api returning 500 on login endpoint"
```

**Parameters**:

- `--name <slug>`: manually specify the issue slug
- `--env <local|staging|production>`: environment selector
- `--readonly`: read-only investigation mode
- `--write-doc`: write `issue-clarification.md`
- `--no-doc`: suppress file output
- `--continue`: continue a prior clarification
- `--resolve`: after investigation, automatically generates `issue-resolution.md` and `promotion-candidate.md`. Harden is risk-based and automatic (no user prompt).

**Examples**:

```text
/openflow-issue "wrong data displayed in dashboard panel" --readonly
/openflow-issue "config drift detected in staging" --env staging --write-doc
/openflow-issue --name api-timeout --continue
/openflow-issue "payment button invisible on mobile" --resolve
```

**Expected behavior**:

- produces expectation, constraints, evidence, semantics, classification, and next-action guidance
- automatically searches historical similar issues (from `docs/archive/` and `docs/changes/`) and shows hints
- provides a recommended next step based on classification (e.g., use `--resolve` to enter fix flow, or escalate to `/openflow-feature`)

### 12.6 `openflow-quality-gate` Skill

**Purpose**: AI-callable quality gate after implementation or bug fix completion.

The skill owns two steps:

1. Decide whether risk-based harden is required.
2. Perform evidence-aware verify.

**Usage**:

Usually the implementation agent calls this Skill after code changes:

```text
openflow-quality-gate
```

**Expected behavior**:

- trivial/simple low-risk changes skip harden but still verify
- complex/high-risk changes run harden automatically, then verify
- fresh test/typecheck/lint evidence may be reused
- missing, stale, or insufficient evidence is rerun
- missing design or issue docs do not skip verify; semantic alignment is downgraded to limited context
- readiness and evidence summary are reported before completion is claimed

`/openflow-harden` and `/openflow-verify` are no longer normal manual workflow entrypoints. Their underlying capabilities are coordinated by `openflow-quality-gate`.

### 12.7 `/openflow-archive <feature>`

**Purpose**: Freeze a completed change into long-term project knowledge.

**Usage**:

```text
/openflow-archive user-coupon-filter
```

**Expected behavior**:

- creates a dated archive directory
- copies available source docs
- always generates `implementation-mapper.md`
- may promote stable facts to `docs/current/`

### 12.9 `/openflow-migrate-docs`

**Purpose**: Migrate an external or legacy docs tree into the OpenFlow structure.

**Usage**:

```text
/openflow-migrate-docs --sourceDir ./legacy-docs
```

**Parameters**:

- `--sourceDir <path>`: required to start
- `--targetDir <path>`: target project root
- `--dryRun`: detect/scan/classify/clarify/plan only; no writes
- `--answer <text>`: answer the current migration clarification

**Examples**:

```text
/openflow-migrate-docs --sourceDir ./legacy-docs --dryRun
/openflow-migrate-docs --sourceDir ./.specify --targetDir .
/openflow-migrate-docs --answer "keep originals and generate a report"
```

**Expected behavior**:

- follows detect -> scan -> classify -> clarify -> plan -> apply -> cleanup
- supports resumable state
- never deletes originals automatically

### 12.10 `/openflow-status`

**Purpose**: Show current OpenFlow enablement and enhanced plan state.

**Usage**:

```text
/openflow-status
```

**Expected output**:

- current directory
- whether feature, tdd, verification, archive, and writing-plan are enabled
- enhanced plans list

### 12.11 `/openflow-config`

**Purpose**: Print the current effective OpenFlow configuration snapshot.

**Usage**:

```text
/openflow-config
```

**Expected output**:

- `feature`
- `tdd`
- `verification`
- `archive`

---

## 13. Detailed example: complete a feature from zero

### Scenario

You need to add a new capability:

> Add channel-based filtering to the user coupon list without breaking existing API behavior.

### Step 1: Initialize

```text
/openflow-init
```

### Step 2: Create the design workspace

```text
/openflow-feature user-coupon-channel-filter
```

Expected workspace:

```text
docs/changes/YYYY-MM-DD-user-coupon-channel-filter/
  design.md
  proposal.md           (conditional)
  decisions.md          (conditional)
  prd.md                (conditional)
```

### Step 3: Generate the implementation plan

```text
/openflow-writing-plan user-coupon-channel-filter
```

Expected result:

- `.sisyphus/plans/user-coupon-channel-filter.md` is created

### Step 4: Implement

Two valid execution paths:

#### Option A: With omo

- plan with `Prometheus`
- execute with `/startwork`

#### Option B: With native OpenCode plan/build

- execute directly from the generated plan using native OpenCode flow

### Step 5: Quality gate

```text
openflow-quality-gate
```

Read carefully:

- whether harden was required
- `Evidence`
- `Readiness`
- `status`
- `reason_codes`
- `next_step`

Interpretation:

- `Ready` -> archive allowed
- `ReadyWithDocUpdates` -> doc sync needed
- `NotReady` -> fix and rerun the quality gate
- `NeedsDecision` -> resolve the decision first

### Step 7: Archive

```text
/openflow-archive user-coupon-channel-filter
```

Expected outputs:

```text
docs/archive/YYYY-MM-DD-user-coupon-channel-filter/
  implementation-mapper.md
  design.md            (if present)
  proposal.md          (conditional)
  decisions.md         (conditional)
  prd.md               (conditional)
  plan.md              (conditional)
```

---

## 14. Detailed example: investigate an uncertain problem

### Scenario

Users report:

> The staging login endpoint sometimes returns 500, but it is not yet clear whether this is a code issue, configuration issue, data issue, or environment issue.

### Step 1: Start with issue clarification

```text
/openflow-issue "login endpoint returns 500 intermittently" --env staging --readonly --write-doc
```

Meaning:

- `--env staging`: mark the environment
- `--readonly`: investigation only; no writes
- `--write-doc`: persist the clarification output

### Step 2: Read the output as a triage tool

Focus on:

- expectation
- constraints
- evidence
- semantics
- classification
- next action gate

Typical outcomes:

- `bugfix` -> implement a fix
- `behavior_change` -> escalate to `/openflow-feature`
- `doc_ambiguity` -> user clarification or decision needed
- `cannot_determine` -> gather more evidence

### Step 3: If it becomes implementation work, return to the main chain

```text
openflow-quality-gate
/openflow-archive login-endpoint-stability
```

---

## 15. FAQ

### Q1: Do I always need feature design first?

No.

- Use `/openflow-feature` for new features and clear design changes.
- Use `issue` when the problem itself is still unclear.

### Q2: Can I use OpenFlow without omo?

Yes.

OpenFlow's core value is documentation governance, constraint programming, verification, and archive. Planning and execution can go through omo or native OpenCode plan/build.

### Q3: Is `harden` mandatory every time?

No.

It is most useful for multi-file logic, risky business flows, and changes with hidden regression risk.

### Q4: If verify passes, am I done?

Not fully.

`verify` establishes evidence and readiness. `archive` makes the result canonical.

### Q5: Does `archive` make business decisions automatically?

No.

OpenFlow can propose candidates, but decisions that require user approval still require user approval.

### Q6: Should I hand-edit old docs or migrate them first?

If the docs set is small and simple, hand-editing may be fine.

If the source is large or comes from OpenSpec, Spec Kit, Kiro, Cursor, Trae, or another structured workflow, start with:

```text
/openflow-migrate-docs --sourceDir <source-docs-dir> --dryRun
```

### Q7: When should I use `--resolve`?

Use it after issue clarification confirms a bugfix and you want to enter the fix, verify, and document flow directly.
`--resolve` automatically generates `issue-resolution.md` and `promotion-candidate.md`, then applies risk-based harden without a user prompt.
It will not run if you also pass `--readonly`, `--env production`, or `--no-doc`.

---

## 16. Command cheat sheet

| Goal | Command |
|---|---|
| Initialize the OpenFlow docs guide | `/openflow-init` |
| Start feature design clarification | `/openflow-feature <feature>` |
| Triage an uncertain problem | `/openflow-issue <issue>` |
| Apply a requirement change to an active feature | `/openflow-change <feature> "<change description>"` |
| Generate an implementation plan | `/openflow-writing-plan <feature>` |
| Run post-implementation quality gate | `openflow-quality-gate` Skill |
| Freeze a verified change | `/openflow-archive <feature>` |
| Migrate a docs tree into OpenFlow | `/openflow-migrate-docs --sourceDir <source-docs-dir>` |
| View current status | `/openflow-status` |
| View active configuration | `/openflow-config` |

---

## 17. Final advice

Do not treat OpenFlow as a bag of commands. Treat it as a development discipline:

- clarify before implementing
- constrain before coding
- verify before claiming completion
- archive before treating the change as canon

That is where OpenFlow becomes valuable.
