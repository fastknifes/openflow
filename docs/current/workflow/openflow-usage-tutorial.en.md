# OpenFlow Usage Tutorial

[中文版本](./openflow-usage-tutorial.md)

## 1. Who this tutorial is for

This guide is for users who have OpenFlow installed but still need practical answers to questions like:

- When should I use `brainstorm`?
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
/openflow-brainstorm demo-feature
```

3. Implement the feature

- With omo: use `Prometheus + /startwork`
- Without omo: use OpenCode native `plan / build`

4. Harden complex changes

```text
/openflow-harden demo-feature
```

5. Verify

```text
/openflow-verify demo-feature
```

6. Archive after readiness passes

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
- escalate into `/openflow-brainstorm`

3. If code changes happen, still return to the main chain:

`harden -> verify -> archive`

---

## 5. Learn to pick the right command first

### Scenario A: You are building a clear feature or change

Use:

```text
/openflow-brainstorm <feature>
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
  - Use `/openflow-brainstorm <feature>`
- **I see something wrong but I do not yet know whether it is a bug**
  - Use `/openflow-issue <issue>`

### Question 2: Do I already have docs that need migration?

- **Yes, I need to bring external docs into OpenFlow**
  - Use `/openflow-migrate-docs --sourceDir <source-docs-dir>`

### Question 3: Has implementation already happened?

- **Not yet**
  - Continue with planning and execution
- **Yes, and the change is risky or cross-cutting**
  - Run `/openflow-harden <feature>`
- **Yes, and I want to know if I can claim completion**
  - Run `/openflow-verify <feature>`
- **Verify is done and I want to make it canonical**
  - Run `/openflow-archive <feature>`

Short memory rule:

- `brainstorm` = design first
- `issue` = clarify first
- `harden` = stabilize complex implementation
- `verify` = produce evidence and readiness
- `archive` = freeze and promote
- `migrate-docs` = import existing docs

---

## 7. Complete feature workflow

### Step 1: Initialize

```text
/openflow-init
```

### Step 2: Run brainstorm

```text
/openflow-brainstorm user-coupon-filter
```

Expected outcome:

- OpenFlow advances one brainstorm question at a time
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

### Step 4: Run harden for complex changes

```text
/openflow-harden user-coupon-filter
```

Or, for a heavier run:

```text
/openflow-harden user-coupon-filter --full --mode deep
```

### Step 5: Run verify

```text
/openflow-verify user-coupon-filter
```

Read the output carefully:

- `Evidence`
- `Readiness`
- `status`
- `reason_codes`
- `next_step`

### Step 6: Archive

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

If your input is not “build a feature” but “something seems wrong,” do not jump straight to brainstorm.

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
- `behavior_change` -> escalate into `/openflow-brainstorm`
- `doc_ambiguity` -> ask for user clarification or decision
- `cannot_determine` -> gather more evidence

### Step 3: If it becomes an implementation task, return to the main chain

```text
/openflow-harden login-endpoint-stability
/openflow-verify login-endpoint-stability
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
2. Run `/openflow-brainstorm demo-feature`
3. Implement through omo or native OpenCode plan/build
4. Run `/openflow-harden demo-feature` if the change is not trivial
5. Run `/openflow-verify demo-feature`
6. Run `/openflow-archive demo-feature` after readiness passes

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

### 12.2 `/openflow-brainstorm <feature>`

**Purpose**: Create a design clarification workspace for a clear feature or change.

**Usage**:

```text
/openflow-brainstorm user-coupon-filter
```

**Parameters**:

- `<feature>`: a stable, readable feature slug

**Expected behavior**:

- OpenFlow advances the brainstorm one question at a time
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

**Examples**:

```text
/openflow-issue "wrong data displayed in dashboard panel" --readonly
/openflow-issue "config drift detected in staging" --env staging --write-doc
/openflow-issue --name api-timeout --continue
```

**Expected behavior**:

- produces expectation, constraints, evidence, semantics, classification, and next-action guidance

### 12.6 `/openflow-harden <feature>`

**Purpose**: Perform adversarial quality hardening before verify.

**Usage**:

```text
/openflow-harden user-coupon-filter
```

**Parameters**:

- `--full`: force a full loop except for trivial cases
- `--mode quick|standard|deep`: input depth
- `--max-rounds N`: hard limit on rounds
- `--reviewer-model X`: choose reviewer model
- `--executor-model X`: choose executor model

**Examples**:

```text
/openflow-harden user-coupon-filter
/openflow-harden user-coupon-filter --full --mode deep
/openflow-harden user-coupon-filter --max-rounds 3 --mode quick
```

**Expected behavior**:

- trivial changes may be rejected
- simple changes usually get one review round
- complex changes enter a multi-round reviewer/executor loop

### 12.7 `/openflow-verify <feature>`

**Purpose**: Produce verification evidence and readiness status.

**Usage**:

```text
/openflow-verify user-coupon-filter
```

**Visible parameter**:

- `--accept-failures`: explicitly accept current failures

**Examples**:

```text
/openflow-verify user-coupon-filter
/openflow-verify user-coupon-filter --accept-failures
```

**Readiness statuses**:

- `NotReady`
- `NeedsDecision`
- `ReadyWithDocUpdates`
- `Ready`

### 12.8 `/openflow-archive <feature>`

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
- whether brainstorming, tdd, verification, archive, and writing-plan are enabled
- enhanced plans list

### 12.11 `/openflow-config`

**Purpose**: Print the current effective OpenFlow configuration snapshot.

**Usage**:

```text
/openflow-config
```

**Expected output**:

- `brainstorming`
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
/openflow-brainstorm user-coupon-channel-filter
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

### Step 5: Harden

```text
/openflow-harden user-coupon-channel-filter --mode standard
```

Higher-risk version:

```text
/openflow-harden user-coupon-channel-filter --full --mode deep --max-rounds 5
```

### Step 6: Verify

```text
/openflow-verify user-coupon-channel-filter
```

Read carefully:

- `Evidence`
- `Readiness`
- `status`
- `reason_codes`
- `next_step`

Interpretation:

- `Ready` -> archive allowed
- `ReadyWithDocUpdates` -> doc sync needed
- `NotReady` -> fix and rerun verify
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
- `behavior_change` -> escalate to `/openflow-brainstorm`
- `doc_ambiguity` -> user clarification or decision needed
- `cannot_determine` -> gather more evidence

### Step 3: If it becomes implementation work, return to the main chain

```text
/openflow-harden login-endpoint-stability
/openflow-verify login-endpoint-stability
/openflow-archive login-endpoint-stability
```

---

## 15. FAQ

### Q1: Do I always need brainstorm first?

No.

- Use `brainstorm` for new features and clear design changes.
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

---

## 16. Command cheat sheet

| Goal | Command |
|---|---|
| Initialize the OpenFlow docs guide | `/openflow-init` |
| Start feature design clarification | `/openflow-brainstorm <feature>` |
| Triage an uncertain problem | `/openflow-issue <issue>` |
| Apply a requirement change to an active feature | `/openflow-change <feature> "<change description>"` |
| Generate an implementation plan | `/openflow-writing-plan <feature>` |
| Harden a risky implementation | `/openflow-harden <feature>` |
| Produce evidence and readiness | `/openflow-verify <feature>` |
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
