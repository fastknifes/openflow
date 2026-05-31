import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { OpenFlowContext, WritingPlanMode } from '../types.js'
import { getChangePlansPath, getDesignCandidatePaths } from '../config.js'
import { findLatestDocument } from '../utils/index.js'
import { escapeMarkdown, sanitizeFeatureName } from '../utils/security.js'
import { detectOmoEnvironment } from '../utils/omo-detection.js'

function buildStrategyContent(mode: WritingPlanMode, tddEnabled: boolean): { strategyTemplate: string; strategyRules: string; strategyChecklist: string } {
  const tddSuffix = tddEnabled ? ' + TDD' : ''

  if (mode === false) {
    return {
      strategyTemplate: `## Planning Strategy

No specific methodology is enforced. Decompose requirements directly into executable tasks.

### Requirements Breakdown
List the key requirements and map them to implementation tasks.

### Task Grouping
Group related tasks by functional area or module.`,
      strategyRules: '- **Direct decomposition**: Break requirements into concrete, executable tasks without enforcing a specific planning methodology.',
      strategyChecklist: 'Planning fit: Tasks are concrete, have clear acceptance criteria, and map directly to requirements',
    }
  }

  if (mode === 'pyramid') {
    return {
      strategyTemplate: `## Pyramid${tddSuffix} Strategy

For non-simple requirements, this section is mandatory. For simple requirements, keep the heading and explain why detailed Pyramid${tddSuffix} planning is not needed.

### Highest-Level Goal
One sentence describing the business or workflow outcome this plan delivers.

### Task Pyramid
1. Top-level work group
   1.1 Same-level subtask
   1.2 Same-level subtask

### Core Abstractions and Boundaries
- Abstraction: responsibility, boundary, and what must stay outside it.

### BAD vs GOOD Examples

**BAD** — Missing highest-level goal:

    ## Tasks
    - [ ] 1. Add login button
    - [ ] 2. Write auth API
    - [ ] 3. Add password hashing

Problem: No goal stated. The executor cannot tell if "login with OAuth" or "login with SAML" is intended.

**GOOD** — Goal first, then pyramid:

    ### Highest-Level Goal
    Users can authenticate with email and password via a secure JWT flow.

    ### Task Pyramid
    1. Auth service
       1.1 Token generation
       1.2 Token refresh

    ## Tasks
    - [ ] 1. Implement JWT token service (Agent: quick)
    - [ ] 2. Build login UI and wire to API (Agent: quick | Blocked By: 1)
${tddEnabled
    ? `
### TDD Driving Order
1. RED: failing test for the highest-level observable behavior
2. GREEN: minimal implementation for that behavior
3. REFACTOR: check abstraction level, naming, and grouping while tests stay green
`
    : ''}`,
      strategyRules: tddEnabled
        ? `- **Pyramid + TDD planning**: Non-simple requirements must use Pyramid Principle to identify the highest-level goal, task pyramid, core abstractions, and boundaries before task decomposition. Then map each core abstraction or business rule to TDD behavior checks.
- **TDD relationship**: Pyramid Principle owns structure; TDD owns behavior. Pyramid planning must not become complete upfront design, and TDD must not become unstructured test accumulation.
- **Red-Green-Refactor checkpoints**: For core business logic, tasks must specify RED, GREEN, and REFACTOR steps. REFACTOR must include an abstraction-level check: high-level tasks should not mix low-level persistence, HTTP, JSON, or tooling details.
- **Anti-pattern**: Do not list tasks without first stating the highest-level goal. A task pyramid floating without a goal is just a todo list.`
        : '- **Pyramid planning**: Non-simple requirements must use Pyramid Principle to identify the highest-level goal, task pyramid, core abstractions, and boundaries before task decomposition.\n- **Anti-pattern**: Do not list tasks without first stating the highest-level goal. A task pyramid floating without a goal is just a todo list.',
      strategyChecklist: tddEnabled
        ? 'Pyramid + TDD fit: Non-simple requirements include a highest-level goal, task pyramid, abstraction boundaries, TDD driving order, and Red-Green-Refactor checkpoints'
        : 'Pyramid planning fit: Non-simple requirements include a highest-level goal, task pyramid, and abstraction boundaries',
    }
  }

  if (mode === 'pattern') {
    return {
      strategyTemplate: `## Pattern${tddSuffix} Strategy

For non-simple requirements, follow this 6-step pattern-oriented workflow. For simple requirements, keep the heading and explain why detailed Pattern${tddSuffix} planning is not needed.

### Step 1: Problem Analysis
Read the design documents and identify structural problems that patterns can solve:
- **Object creation**: Do different contexts need different object configurations? (Factory, Builder, Prototype)
- **Behavioral variation**: Do algorithms or behaviors need to vary at runtime? (Strategy, Command, State)
- **Communication decoupling**: Do components need to communicate without direct references? (Observer, Mediator, Event Bus)
- **Interface adaptation**: Do incompatible interfaces need to work together? (Adapter, Facade, Proxy)
- **Structural composition**: Do objects need to form tree/part-whole hierarchies? (Composite, Decorator)

For each problem, write one sentence describing it. DO NOT force a pattern where simple code suffices.

### Step 2: Pattern Selection
Map each identified problem to a specific pattern:
| Problem | Selected Pattern | Rationale |
|---------|-----------------|-----------|
| ... | ... | Why this pattern fits better than alternatives |

Rules:
- Prefer GoF patterns or well-known architectural patterns (MVC, MVVM, Layered, Microkernel, Pipeline)
- Document why the chosen pattern is better than a simpler alternative
- If no pattern is needed, state "No pattern applied — simple implementation sufficient"

### Step 3: Define Contracts (Interfaces / Abstract Classes)
For each selected pattern, define the contracts:
- **Interface name**: What it does
- **Methods**: Signature, parameters, return types, invariants
- **Preconditions / Postconditions**: What must be true before and after
- **Error contract**: How failures are signaled (exceptions, error codes, null)

### Step 4: Implement Components
For each concrete implementation:
- **Component name**: File path, class name
- **Implements**: Which contract from Step 3
- **Responsibility**: Single sentence
- **Boundary**: What it does NOT do (prevent scope creep)
- **Dependencies**: Other components it needs

### Step 5: Wire Collaborations
Describe how components connect:
- **Instantiation**: Who creates whom (factory method, DI container, direct new)
- **Data flow**: What data passes between components, in what direction
- **Control flow**: Who calls whom, event-driven or direct invocation
- **Lifecycle**: Startup order, shutdown cleanup
- **Error propagation**: How errors in one component affect others

### Step 6: Verification Checklist
Before moving to task decomposition, verify:
- [ ] Each pattern solves a real problem (not over-engineering)
- [ ] Each component has a single, clear responsibility
- [ ] Component dependencies form a DAG (no circular deps)
- [ ] The simplest possible pattern was chosen (KISS)
- [ ] Contracts are explicit and testable

### BAD vs GOOD Examples

**BAD** — Pattern forced without problem analysis:
> Problem: User objects are created in one place with fixed fields.
> Selected Pattern: Abstract Factory.
> Rationale: "In case we need to support multiple databases later."
> Reality: YAGNI. A simple \`new User()\` suffices today.

**GOOD** — Problem justifies pattern:
> Problem: Payment methods vary by region (credit card, Alipay, Stripe).
> Selected Pattern: Strategy.
> Rationale: Encapsulates algorithm variation; adding a new region requires only a new strategy implementation, no changes to checkout flow.
${tddEnabled
    ? `
### TDD Driving Order
Apply TDD at the component level:
1. RED: Write a failing test for a contract method (interface-level behavior)
2. GREEN: Implement the concrete component to pass the test
3. REFACTOR: Check naming, simplify, ensure the component does not leak implementation details
4. Repeat for each component before wiring collaborations
`
    : ''}`,
      strategyRules: tddEnabled
        ? `- **Pattern + TDD planning**: Follow the 6-step workflow (Problem Analysis → Pattern Selection → Contracts → Components → Collaborations → Verification) before task decomposition. TDD is applied per-component: test the contract, implement the concrete class, refactor, then wire.
- **TDD relationship**: Pattern analysis owns the structural decomposition; TDD owns verifying each component behaves according to its contract. Do NOT write integration tests before unit tests.
- **Red-Green-Refactor checkpoints**: Each component task must specify RED (contract test), GREEN (implementation), REFACTOR (naming + boundary check).
- **Anti-pattern**: Do not select a pattern before analyzing the problem. Pattern-first analysis leads to over-engineering.`
        : '- **Pattern planning**: Follow the 6-step workflow (Problem Analysis → Pattern Selection → Contracts → Components → Collaborations → Verification) before task decomposition.\n- **Anti-pattern**: Do not select a pattern before analyzing the problem. Pattern-first analysis leads to over-engineering.',
      strategyChecklist: tddEnabled
        ? 'Pattern + TDD fit: Non-simple requirements include Step 1-6 (problem analysis, pattern selection with rationale, contracts, components with boundaries, collaboration wiring, verification checklist), TDD driving order per-component, and Red-Green-Refactor checkpoints'
        : 'Pattern planning fit: Non-simple requirements include Step 1-6 (problem analysis, pattern selection with rationale, contracts, components with boundaries, collaboration wiring, verification checklist)',
    }
  }

  // mode === 'mixed'
  return {
    strategyTemplate: `## Mixed${tddSuffix} Strategy

Follow this decision workflow to choose and apply the right planning method.

### Phase 1: Classify the Feature
Analyze the design documents and classify:

| Dimension | Question | If YES → |
|-----------|----------|----------|
| **Process complexity** | Does the feature involve multi-step business process, state transitions, approvals, or sequential workflows? | Pyramid Principle needed |
| **Architectural complexity** | Does the feature involve plugin systems, extensibility points, framework design, or complex object relationships? | Pattern analysis needed |
| **Structural reuse** | Will other features need to reuse or extend this feature's components? | Pattern analysis needed |
| **Data flow complexity** | Does data flow through many transformations or cross module boundaries? | Pyramid Principle needed |

Based on classification, choose:
- **Pyramid only**: Process YES, Architecture NO → Use Pyramid Strategy (Highest-Level Goal → Task Pyramid → Core Abstractions)
- **Pattern only**: Process NO, Architecture YES → Use Pattern Strategy (6-step workflow: Problem → Selection → Contracts → Components → Collaborations → Verification)
- **Both**: Process YES, Architecture YES → Use both: Pyramid for process structure, Pattern for architectural structure
- **Neither**: Both NO → Use direct decomposition (Planning Strategy)

### Phase 2: Apply Pyramid (if selected)
If Pyramid Principle was chosen in Phase 1:

#### Highest-Level Goal
One sentence describing the business or workflow outcome.

#### Task Pyramid
1. Top-level work group
   1.1 Same-level subtask
   1.2 Same-level subtask

#### Process Boundaries
- Boundary: what this process step owns vs. what it delegates

### Phase 3: Apply Pattern (if selected)
If Pattern analysis was chosen in Phase 1, follow the 6-step pattern workflow:

#### Step 1: Problem Analysis
Identify structural problems (creation, behavioral variation, decoupling, adaptation, composition).

#### Step 2: Pattern Selection
Map problems to patterns with rationale.

#### Step 3: Define Contracts
Interfaces, methods, preconditions, error contracts.

#### Step 4: Implement Components
Component name, file path, responsibility, boundary, dependencies.

#### Step 5: Wire Collaborations
Instantiation, data flow, control flow, lifecycle, error propagation.

#### Step 6: Verification Checklist
- [ ] No over-engineering
- [ ] Single responsibility per component
- [ ] Dependency DAG (no cycles)
- [ ] KISS respected

### Phase 4: Cross-Consistency Check
If BOTH Pyramid and Pattern were selected:
- **Pyramid tasks must respect Pattern boundaries**: A task that implements a process step should not violate component boundaries
- **Pattern components must fit into Pyramid waves**: Component implementation tasks should be scheduled in the correct dependency wave
- **Shared abstractions**: Identify abstractions used by both process steps and pattern components; ensure they are defined before either uses them

### BAD vs GOOD Examples

**BAD** — Both Pyramid and Pattern applied "just to be safe":
> Phase 1 classification: Process complexity = NO, Architectural complexity = NO.
> Yet the plan includes both Pyramid goal decomposition AND Pattern component analysis.
> Result: 15 tasks for a 3-file feature. Over-engineering.

**GOOD** — Classification drives methodology:
> Phase 1 classification: Process complexity = YES (multi-step checkout), Architectural complexity = NO.
> Decision: Pyramid only.
> Result: Clear process waves (Wave 1: cart validation, Wave 2: payment, Wave 3: confirmation). No unnecessary pattern boilerplate.
${tddEnabled
    ? `
### TDD Driving Order
1. RED: For Pyramid — failing test for highest-level observable behavior; for Pattern — failing test for component contract
2. GREEN: Minimal implementation for that behavior/contract
3. REFACTOR: Check abstraction level, naming, and grouping while tests stay green
4. Integration: After unit tests pass, write integration tests for Pyramid process flow or Pattern collaboration wiring
`
    : ''}`,
    strategyRules: tddEnabled
      ? `- **Mixed + TDD planning**: First classify the feature (Phase 1), then apply the selected approach(es). TDD follows the selected approach: Pyramid uses behavior-driven TDD; Pattern uses contract-driven TDD per-component.
- **TDD relationship**: Your chosen structure owns decomposition; TDD owns verification. Do NOT mix structure: if you chose Pyramid, test behaviors; if you chose Pattern, test contracts.
- **Red-Green-Refactor checkpoints**: Tasks must specify RED/GREEN/REFACTOR based on the selected approach. Mixed mode requires explicit per-task TDD strategy (behavior-driven vs contract-driven).
- **Anti-pattern**: Do not apply both Pyramid and Pattern "just to be safe". Phase 1 classification must justify the choice; unjustified dual methodology is waste.`
      : '- **Mixed planning**: Follow Phase 1 classification first, then apply Pyramid (if process-heavy), Pattern (if architecture-heavy), or both. Cross-consistency checks ensure the two approaches do not conflict.\n- **Anti-pattern**: Do not apply both Pyramid and Pattern "just to be safe". Phase 1 classification must justify the choice; unjustified dual methodology is waste.',
    strategyChecklist: tddEnabled
      ? 'Mixed + TDD fit: Non-simple requirements include Phase 1 classification with clear rationale, selected approach(es) fully executed (Pyramid sections OR Pattern 6-step OR both), Phase 4 cross-consistency checks, and TDD driving order matched to the selected approach'
      : 'Mixed planning fit: Non-simple requirements include Phase 1 classification with clear rationale, selected approach(es) fully executed (Pyramid sections OR Pattern 6-step OR both), and Phase 4 cross-consistency checks',
  }
}

function buildBlockedResponse(reason: string): string {
  return `## Writing Plan Blocked\n\n${reason}\n\nResolve the blocking issue(s) before generating a plan.`
}

async function ensureOmoWorkspace(
  ctx: OpenFlowContext,
  primaryPlanPath: string,
  feature: string,
): Promise<void> {
  const sisyphusPlansDir = path.join(ctx.directory, '.sisyphus', 'plans')
  const sisyphusPlanPath = path.join(sisyphusPlansDir, `${feature}.md`)
  try {
    await fs.mkdir(path.dirname(primaryPlanPath), { recursive: true })
    await fs.mkdir(sisyphusPlansDir, { recursive: true })
    try {
      await fs.access(primaryPlanPath)
    } catch {
      await fs.writeFile(primaryPlanPath, '', 'utf-8')
    }
    try {
      await fs.access(sisyphusPlanPath)
    } catch {
      await fs.link(primaryPlanPath, sisyphusPlanPath)
    }
  } catch {
    // Non-blocking: if hard link fails, fall back to the old copy behavior in tool-after hook
  }
}

function buildPacketMarkdown(
  ctx: OpenFlowContext,
  sanitizedFeature: string,
  designContext: string | null,
  isOmo: boolean,
  primaryPlanPath: string,
  effectiveMode: WritingPlanMode,
  tddEnabled: boolean,
): string {
  const overwriteWarningLines = `> If a plan file already exists at the output path, review it carefully before overwriting. Existing task progress may be lost.`

  const planPathLines = isOmo
    ? `### Plan Output Paths\n\n- **Canonical** (change workspace): \`${escapeMarkdown(primaryPlanPath)}\`\n- **Agent workspace** (hard link): \`${escapeMarkdown(path.join(ctx.directory, '.sisyphus', 'plans', `${sanitizedFeature}.md`))}\`\n- Prometheus writes to the agent workspace path, which is a hard link to the canonical path. Both paths point to the same file; no manual copying is needed.\n- Paths come from OpenFlow configuration; defaults are shown above.`
    : `### Plan Output Path\n\n- **Canonical** (change workspace): \`${escapeMarkdown(primaryPlanPath)}\`\n- The build agent writes the plan directly to the canonical path above.\n- **CRITICAL**: The build agent MUST write the plan file to this exact path. Do NOT leave it in a temporary location or in conversation history only.\n- Paths come from OpenFlow configuration; defaults are shown above.`

  const { strategyTemplate, strategyRules, strategyChecklist } = buildStrategyContent(effectiveMode, tddEnabled)

  return `## OpenFlow Writing Plan Packet\n\n**Feature**: \`${escapeMarkdown(sanitizedFeature)}\`\n\n### Design Context\n${designContext || `> No design documents found for feature \`${escapeMarkdown(sanitizedFeature)}\`. Consider running \`/openflow-feature ${escapeMarkdown(sanitizedFeature)}\` first.`}\n\n### Agent Target\n\nThe execution environment determines which planning agent handles this plan:\n- **OMO detected** -> Prometheus (interview, clearance, and execution)\n- **Non-OMO** -> OpenCode native \`build\` agent\n\n**Why build agent, not plan agent?** The plan agent is read-only and cannot write files. The build agent has file write access. STOP guardrails in this packet prevent it from proceeding to implementation — its ONLY job is to write the plan file to disk, then halt.\n\nOpenFlow prepares the design context and constraints; the target agent owns the planning conversation.\n\n${planPathLines}\n\n### Plan Format Rules\n\nThe plan file MUST follow this exact structure:\n\n\`\`\`markdown\n# Plan: ${escapeMarkdown(sanitizedFeature)}\n\n## Overview\nBrief description of what this feature accomplishes.\n\n## Design Context\nReference to the design workspace and relevant constraints.\n\n${strategyTemplate}\n\n## Execution Strategy\n\n### Parallel Execution Waves\nTasks grouped by dependency level. Wave 1 has no dependencies; later waves depend on earlier results.\nSame-wave tasks are candidates for parallel execution. Keep same-wave concurrency reasonable (default max 3–4).\n\n### Dependency Matrix\n| Task | Blocked By | Blocks |\n\n## Tasks\n\n- [ ] 1. Task with concrete file paths, verification commands, and subagent profile\n- [ ] 2. Another task\n\`\`\`\n\n- Use \`- [ ]\` for checkbox tasks or \`1.\` for numbered tasks.\n${strategyRules}\n- **Task decomposition**: Group independent tasks into waves. Each task should be a cohesive work package (may span a few closely related files in the same module).\n- **Subagent guidance**: Assign each task a recommended agent category such as \`quick\`, \`writing\`, or \`unspecified-high\`, plus required skills.\n- Each task must include: Agent Profile, Parallelization status, QA Scenarios, and Acceptance Criteria.\n- After drafting, estimate execution units. If > 20 units or same-wave > 4 tasks, merge smaller tasks or increase wave count.\n\n### Self-Check Checklist\n\nBefore writing the plan file, verify:\n\n- [ ] **No placeholders**: No TBD, TODO, or "implement later" in any task.\n- [ ] **Concrete file paths**: Every task specifies exact file paths to create or modify.\n- [ ] **Verification commands**: Every task includes a runnable command and expected output.\n- [ ] **${strategyChecklist}**.\n- [ ] **Bounded complexity**: No single task describes an unreasonable scope. Tasks may cover a few closely related files.\n- [ ] **Task count proportional to feature**: small 3–5, medium 6–9, large 10–15.\n\n### Overwrite Warning\n\n${overwriteWarningLines}\n\n### Execution Handoff Note\n\n**This packet is for plan writing only. Do NOT execute any tasks.** Write the final plan file to the output paths above using your normal file write tool, not inside this handler. This ensures existing tool-after hooks can enhance the plan. Execution is handled separately after the plan is reviewed and approved.\n\n> 🚫 **STOP AFTER WRITING THE FILE.**\n> - Do NOT begin coding, editing source files, running builds, or executing any task in the plan.\n> - Do NOT invoke \`/openflow-implement\`, OMO, Prometheus, or any execution command.\n> - Your role is **WRITE the plan.md file, then HALT.**\n> - The user will decide when to proceed with implementation.\n\n### OMO / Prometheus Compatibility\n\nThis skill does NOT replace or disable any OMO/Prometheus built-in capabilities. Prometheus exploration, brainstorming, and task planning remain fully available. Use this skill to produce the plan artifact, then let Prometheus continue its normal workflow.\n\n### Blocking Clarification\n\n> If the design context above is insufficient or requirements are unclear, **stop and ask clarifying questions** before generating the plan. Do NOT proceed with placeholders or assumptions.\n\n### Next Step — USER ACTION ONLY\n\n1. Review the plan structure above and write the plan to the output paths.\n2. **STOP HERE.** Do not proceed to implementation on your own.\n3. After the plan is written, inform the user: "Plan written to \`${escapeMarkdown(primaryPlanPath)}\`. Run \`/openflow-implement ${escapeMarkdown(sanitizedFeature)}\` when ready to start implementation."\n4. **The user** will invoke \`/openflow-implement ${escapeMarkdown(sanitizedFeature)}\` when they are ready — the assistant MUST NOT invoke it automatically.\n5. Once formal implementation is complete and Full Quality Gate admission criteria are met, the quality gate may be invoked.\n\nDo not claim completion until the quality gate reports readiness.\nFor casual coding or low-risk edits outside formal implementation, use lightweight verification instead of automatically invoking Full Quality Gate.\n`
}

export async function handleWritingPlan(ctx: OpenFlowContext, feature: string, mode?: WritingPlanMode, message?: string): Promise<string> {
  if (!feature) throw new Error('Feature name is required')

  const sanitizedFeature = sanitizeFeatureName(feature)

  const gateResult = await verifyDesignReadiness(ctx.directory, sanitizedFeature, ctx.config)
  if (!gateResult.ready) {
    return buildBlockedResponse(gateResult.reason)
  }

  const designContext = await readDesignContextPacket(ctx.directory, sanitizedFeature, ctx.config)
  const primaryPlanPath = await getChangePlansPath(ctx.directory, sanitizedFeature, ctx.config)
  const tddEnabled = ctx.config?.tdd?.enabled !== false
  const omoEnv = await detectOmoEnvironment(ctx, message)
  const isOmo = omoEnv === 'omo'
  const effectiveMode = mode ?? false

  if (isOmo) {
    await ensureOmoWorkspace(ctx, primaryPlanPath, sanitizedFeature)
  }

  return buildPacketMarkdown(ctx, sanitizedFeature, designContext, isOmo, primaryPlanPath, effectiveMode, tddEnabled)
}

export async function readDesignContextPacket(baseDir: string, feature: string, config?: import('../types.js').OpenFlowConfig): Promise<string | null> {
  const candidatePaths = [
    ...await getDesignCandidatePaths(baseDir, feature, config),
    ...await findDatedChangeCandidatePaths(baseDir, feature, config),
  ]

  for (const candidatePath of candidatePaths) {
    const candidate = await resolveDesignCandidate(candidatePath)
    if (!candidate) continue

    const designPath = candidate.isFile
      ? candidatePath
      : await findLatestDocument(candidate.workspacePath, /^(?:design|\d{8}-design)\.md$/)
    if (!designPath) continue

    const behaviorPath = await findLatestDocument(candidate.workspacePath, /^(?:behavior|\d{8}-behavior)\.md$/)
    if (!behaviorPath) {
      return formatIncompleteDesignContext(candidate.workspacePath, ['behavior.md'])
    }

    const markdownContext = await extractKeySections(designPath)
    const behaviorContext = await extractKeySections(behaviorPath)
    if (!markdownContext || !behaviorContext) {
      return formatIncompleteDesignContext(candidate.workspacePath, ['design.md (content too thin)', 'behavior.md (content too thin)'])
    }
    if (markdownContext && behaviorContext) {
      return `### ${path.basename(designPath)}\n\n${markdownContext}\n\n### ${path.basename(behaviorPath)}\n\n${behaviorContext}`
    }
  }

  return formatIncompleteDesignContext(feature, ['design.md', 'behavior.md'])
}

function formatIncompleteDesignContext(workspacePath: string, missingFiles: string[]): string {
  return `> Design context incomplete for \`${escapeMarkdown(workspacePath)}\`.
>
> Missing mandatory document(s): ${missingFiles.map((fileName) => `\`${fileName}\``).join(', ')}.
> Do NOT generate a plan until the design workspace contains both \`design.md\` and \`behavior.md\`.`
}

async function findDatedChangeCandidatePaths(baseDir: string, feature: string, config?: import('../types.js').OpenFlowConfig): Promise<string[]> {
  const changesDir = path.join(baseDir, config?.paths.changes ?? 'docs/changes')
  const suffix = `-${feature}`

  try {
    const entries = await fs.readdir(changesDir, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}-/.test(entry.name) && entry.name.endsWith(suffix))
      .map((entry) => path.join(changesDir, entry.name))
  } catch {
    return []
  }
}

async function verifyDesignReadiness(
  baseDir: string,
  feature: string,
  config?: import('../types.js').OpenFlowConfig
): Promise<{ ready: boolean; reason: string }> {
  const candidatePaths = [
    ...await getDesignCandidatePaths(baseDir, feature, config),
    ...await findDatedChangeCandidatePaths(baseDir, feature, config),
  ]

  const workspacePaths: string[] = []
  for (const candidatePath of candidatePaths) {
    const candidate = await resolveDesignCandidate(candidatePath)
    if (!candidate) continue

    if (!workspacePaths.includes(candidate.workspacePath)) {
      workspacePaths.push(candidate.workspacePath)
    }
  }

  if (workspacePaths.length === 0) {
    return { ready: false, reason: `No design workspace found for feature "${feature}". Run /openflow-feature first.` }
  }

  if (workspacePaths.length > 1) {
    return { ready: false, reason: `Ambiguous feature match: ${workspacePaths.length} dated directories match "${feature}". Use the full dated directory name to disambiguate.` }
  }

  const workspacePath = workspacePaths[0]!
  const designPath = path.join(workspacePath, 'design.md')
  const behaviorPath = path.join(workspacePath, 'behavior.md')

  try {
    await fs.access(designPath)
  } catch {
    return { ready: false, reason: 'design.md not found in workspace. Design generation may not be complete.' }
  }

  try {
    await fs.access(behaviorPath)
  } catch {
    return { ready: false, reason: 'behavior.md not found in workspace. Design generation may not be complete.' }
  }

  // Check Cross-Validation status by recomputing from document bodies
  try {
    const docOrder = ['requirements.md', 'prd.md', 'design.md', 'behavior.md', 'decisions.md']
    const documents: Array<{ name: string; content: string }> = []
    for (const docName of docOrder) {
      const docPath = path.join(workspacePath, docName)
      try {
        const body = await fs.readFile(docPath, 'utf-8')
        if (body.trim()) {
          documents.push({ name: docName, content: body })
        }
      } catch {
        // Optional document — skip
      }
    }

    if (documents.length === 0) {
      return { ready: false, reason: 'No formal documents found in workspace for body-based Cross-Validation.' }
    }

    // Check for blocking/critical gaps in existing Cross-Validation Summary
    const designDoc = documents.find((d) => d.name === 'design.md')
    if (designDoc) {
      const cvMatch = designDoc.content.match(/Cross-Validation Summary[\s\S]*?- Status: (Passed|Blocking|Critical Blocking)/)
      if (!cvMatch) {
        return { ready: false, reason: 'Cross-Validation Summary not found in design.md. Design may not be finalized.' }
      }
      if (cvMatch[1] !== 'Passed') {
        return { ready: false, reason: `Cross-Validation status is "${cvMatch[1]}", not "Passed". Resolve blocking gaps first.` }
      }
    }

    // Verify feature session state is complete
    const stateMdPath = path.join(workspacePath, 'state.md')
    try {
      const stateContent = await fs.readFile(stateMdPath, 'utf-8')
      const hasCompleteStatus = /`complete`|status:\s*complete|^\s*complete\s*$/im.test(stateContent)
      if (!hasCompleteStatus) {
        return { ready: false, reason: 'Feature state in state.md is not "complete". Design must be finalized before planning.' }
      }
    } catch {
      return { ready: false, reason: 'state.md not found. Feature design may not be finalized.' }
    }
  } catch {
    return { ready: false, reason: 'Could not verify Cross-Validation status.' }
  }

  return { ready: true, reason: '' }
}

async function resolveDesignCandidate(candidatePath: string): Promise<{ workspacePath: string; isFile: boolean } | null> {
  try {
    const stats = await fs.stat(candidatePath)
    if (stats.isFile()) {
      return { workspacePath: path.dirname(candidatePath), isFile: true }
    }
    if (stats.isDirectory()) {
      return { workspacePath: candidatePath, isFile: false }
    }
  } catch {
    return null
  }

  return null
}

async function extractKeySections(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const lines = content.split('\n')
    const keySections: string[] = []
    let currentSection: string[] = []
    let inKeySection = false
    let sectionTitle = ''

    for (const line of lines) {
      const isHeader = /^#{1,3}\s+/.test(line)

      if (isHeader) {
        if (inKeySection && currentSection.length > 0) {
          keySections.push(`### ${sectionTitle}\n${currentSection.join('\n').trim()}`)
        }
        currentSection = []
        sectionTitle = line.replace(/^#{1,3}\s+/, '').trim()

        const lowerTitle = sectionTitle.toLowerCase()
        inKeySection = /overview|概述|summary|problem|问题|solution|方案|approach|方法|architecture|架构|decision|决策|constraint|约束|requirement|需求|goal|目标|behavior|行为|expected/.test(lowerTitle)
      } else if (inKeySection) {
        currentSection.push(line)
      }
    }

    if (inKeySection && currentSection.length > 0) {
      keySections.push(`### ${sectionTitle}\n${currentSection.join('\n').trim()}`)
    }

    if (keySections.length === 0) {
      const firstParagraphs = content.split('\n\n').slice(0, 3).join('\n\n')
      return firstParagraphs.length > 500 ? firstParagraphs.substring(0, 500) + '...' : firstParagraphs
    }

    return keySections.slice(0, 5).join('\n\n')
  } catch {
    return ''
  }
}
