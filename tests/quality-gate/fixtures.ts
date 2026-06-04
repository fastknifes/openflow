/**
 * Reusable test fixtures for Quality Gate session, evidence, and behavior scenario tests.
 *
 * These helpers produce data and file content that matches the contracts in:
 * - behavior.md SC-001 through SC-010
 * - design.md section 3 "Behavior Evidence And Integration Test Evidence"
 *
 * They do NOT modify existing test behavior — they are called only when new
 * tests import them.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// ────────────────────────────────────────────────────────────────────────────
// 1. Mock Session Client Helpers
// ────────────────────────────────────────────────────────────────────────────

/** A recorded session.create call. */
export interface SessionCreateRecord {
  sessionID: string
  title: string
  parentSessionID?: string
  timestamp: string
}

/** A recorded session.prompt call. */
export interface SessionPromptRecord {
  sessionID: string
  message: string
  timestamp: string
}

/** In-memory log of all session operations. */
export interface SessionLog {
  creates: SessionCreateRecord[]
  prompts: SessionPromptRecord[]
}

/**
 * Create an empty session log for capturing mock session operations.
 *
 * @example
 * ```ts
 * const log = createSessionLog()
 * const client = createMockSessionClient(log)
 * client.create('Quality Gate: my-feature')
 * client.prompt('qg-1', 'Run harden review')
 * expect(log.creates).toHaveLength(1)
 * expect(log.prompts).toHaveLength(1)
 * ```
 */
export function createSessionLog(): SessionLog {
  return { creates: [], prompts: [] }
}

/** Auto-incrementing ID counter for deterministic session IDs. */
let sessionCounter = 0

/**
 * Reset the session ID counter. Call in test `beforeEach` or at the start of
 * each test to get deterministic IDs.
 */
export function resetSessionCounter(): void {
  sessionCounter = 0
}

function nextSessionID(prefix = 'ses'): string {
  sessionCounter += 1
  return `${prefix}-${String(sessionCounter).padStart(3, '0')}`
}

/**
 * Mock session client that records create/prompt operations into a SessionLog.
 *
 * - `create(title, parentID?)` → pushes to `log.creates`, returns a new session ID.
 * - `prompt(sessionID, message)` → pushes to `log.prompts`.
 *
 * @example
 * ```ts
 * const log = createSessionLog()
 * const client = createMockSessionClient(log)
 *
 * // SC-001: Quality Gate exposes a visible run session
 * const qgID = client.create('Quality Gate: my-feature')
 *
 * // SC-002: Harden Reviewer and Executor are linked under QG session
 * const reviewerID = client.create('Harden Reviewer: my-feature', qgID)
 * const executorID = client.create('Harden Executor: my-feature', qgID)
 *
 * // Verify parent/child relationships
 * expect(log.creates.find(c => c.sessionID === reviewerID)?.parentSessionID).toBe(qgID)
 * expect(log.creates.find(c => c.sessionID === executorID)?.parentSessionID).toBe(qgID)
 * ```
 */
export function createMockSessionClient(log: SessionLog) {
  return {
    create(title: string, parentSessionID?: string): string {
      const sessionID = nextSessionID()
      log.creates.push({
        sessionID,
        title,
        parentSessionID,
        timestamp: new Date().toISOString(),
      })
      return sessionID
    },

    prompt(sessionID: string, message: string): void {
      log.prompts.push({
        sessionID,
        message,
        timestamp: new Date().toISOString(),
      })
    },
  }
}

/**
 * Create the standard Quality Gate session hierarchy (SC-001, SC-002).
 * Returns the root QG session ID plus child session IDs.
 *
 * @example
 * ```ts
 * const log = createSessionLog()
 * const client = createMockSessionClient(log)
 * const sessions = createQualityGateSessionHierarchy(client, 'my-feature')
 *
 * expect(sessions.qgID).toBeTruthy()
 * expect(sessions.reviewerID).toBeTruthy()
 * expect(sessions.executorID).toBeTruthy()
 * // Verify children are linked to QG parent
 * expect(log.creates.find(c => c.sessionID === sessions.reviewerID)?.parentSessionID).toBe(sessions.qgID)
 * ```
 */
export function createQualityGateSessionHierarchy(
  client: ReturnType<typeof createMockSessionClient>,
  feature: string,
  options?: { skipReviewer?: boolean; skipExecutor?: boolean },
) {
  // SC-001: Quality Gate visible session
  const qgID = client.create(`Quality Gate: ${feature}`)

  let reviewerID: string | undefined
  let executorID: string | undefined

  // SC-002: Harden children linked under QG session
  if (!options?.skipReviewer) {
    reviewerID = client.create(`Harden Reviewer: ${feature}`, qgID)
  }
  if (!options?.skipExecutor) {
    executorID = client.create(`Harden Executor: ${feature}`, qgID)
  }

  return { qgID, reviewerID, executorID }
}

/**
 * Assert that a session hierarchy has the expected parent/child relationships.
 * Useful for verifying SC-002 compliance in tests.
 */
export function assertSessionParentChild(
  log: SessionLog,
  childID: string,
  expectedParentID: string,
): boolean {
  const record = log.creates.find(c => c.sessionID === childID)
  return record?.parentSessionID === expectedParentID
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Evidence File Fixture Helpers
// ────────────────────────────────────────────────────────────────────────────

/** Evidence types per design.md section 3. */
export type EvidenceType =
  | 'integration_test'
  | 'api_smoke'
  | 'e2e'
  | 'qa_record'
  | 'manual_repro'

/** Evidence result status. */
export type EvidenceResult = 'pass' | 'fail'

/** Coverage levels per behavior.md verification mapping. */
export type CoverageLevel = 'exact' | 'equivalent' | 'partial' | 'missing' | 'not_applicable'

/** Freshness status. */
export type EvidenceFreshness = 'fresh' | 'stale' | 'unknown'

/** Parameters for creating an evidence file. */
export interface EvidenceFixtureOptions {
  /** Scenario reference, e.g. "SC-001" */
  scenarioID: string
  /** Human-readable slug for the file name */
  slug: string
  /** Evidence type */
  evidenceType: EvidenceType
  /** Path to the test file or verification method */
  testFile: string
  /** Command or execution steps */
  command?: string
  /** Result */
  result: EvidenceResult
  /** ISO timestamp; defaults to now */
  timestamp?: string
  /** Git HEAD commit hash */
  gitHead: string
  /** Coverage level */
  coverageLevel: CoverageLevel
  /** Coverage rationale (required when coverageLevel is "equivalent") */
  coverageRationale?: string
  /** Core code files mapped to this evidence */
  coreCodeFiles: string[]
  /** Additional notes */
  notes?: string
}

/**
 * Generate the markdown content for an evidence file at
 * `.sisyphus/evidence/{scenario-id}-{slug}.md`.
 *
 * Matches the evidence shape described in design.md section 3:
 * scenario reference, evidence type, test file, command, result,
 * timestamp, git HEAD, coverage rationale, core code mapping.
 */
export function generateEvidenceMarkdown(options: EvidenceFixtureOptions): string {
  const timestamp = options.timestamp ?? new Date().toISOString()
  const rationale = options.coverageLevel === 'equivalent'
    ? options.coverageRationale ?? 'Equivalent coverage via integration test'
    : options.coverageRationale ?? 'N/A'

  const lines = [
    `# Evidence: ${options.scenarioID} - ${options.slug}`,
    '',
    `**Scenario:** ${options.scenarioID}`,
    `**Evidence Type:** ${options.evidenceType}`,
    `**Test File:** ${options.testFile}`,
    `**Command:** ${options.command ?? 'n/a'}`,
    `**Result:** ${options.result}`,
    `**Timestamp:** ${timestamp}`,
    `**Git HEAD:** ${options.gitHead}`,
    `**Coverage Level:** ${options.coverageLevel}`,
    `**Coverage Rationale:** ${rationale}`,
    `**Core Code Files:** ${options.coreCodeFiles.join(', ')}`,
  ]

  if (options.notes) {
    lines.push('', `**Notes:** ${options.notes}`)
  }

  lines.push('')
  return lines.join('\n')
}

/**
 * Write an evidence fixture file to `.sisyphus/evidence/{scenario-id}-{slug}.md`.
 *
 * @example
 * ```ts
 * const directory = '.test-my-feature'
 * await writeEvidenceFile(directory, {
 *   scenarioID: 'SC-009',
 *   slug: 'integration-evidence',
 *   evidenceType: 'integration_test',
 *   testFile: 'tests/integration/quality-gate.test.ts',
 *   command: 'bun test tests/integration/quality-gate.test.ts',
 *   result: 'pass',
 *   gitHead: 'abc123def456',
 *   coverageLevel: 'exact',
 *   coreCodeFiles: ['src/commands/quality-gate.ts'],
 * })
 * ```
 */
export async function writeEvidenceFile(
  directory: string,
  options: EvidenceFixtureOptions,
): Promise<string> {
  const evidenceDir = join(directory, '.sisyphus', 'evidence')
  await mkdir(evidenceDir, { recursive: true })

  const filename = `${options.scenarioID}-${options.slug}.md`
  const filePath = join(evidenceDir, filename)
  const content = generateEvidenceMarkdown(options)

  await writeFile(filePath, content, 'utf-8')
  return filePath
}

/**
 * Create multiple evidence files for a set of scenarios.
 * Returns the list of written file paths.
 *
 * @example
 * ```ts
 * const paths = await writeEvidenceFiles(directory, [
 *   { scenarioID: 'SC-009', slug: 'integration', ... },
 *   { scenarioID: 'SC-010', slug: 'mapper', ... },
 * ])
 * ```
 */
export async function writeEvidenceFiles(
  directory: string,
  scenarios: EvidenceFixtureOptions[],
): Promise<string[]> {
  const paths: string[] = []
  for (const scenario of scenarios) {
    const path = await writeEvidenceFile(directory, scenario)
    paths.push(path)
  }
  return paths
}

/**
 * Quick factory for a standard passing evidence fixture.
 * Fills in sensible defaults; only scenarioID, slug, gitHead, and coreCodeFiles are required.
 */
export function createPassingEvidenceFixture(
  overrides: Partial<EvidenceFixtureOptions> & Pick<EvidenceFixtureOptions, 'scenarioID' | 'slug' | 'gitHead' | 'coreCodeFiles'>,
): EvidenceFixtureOptions {
  return {
    evidenceType: 'integration_test',
    testFile: `tests/integration/${overrides.scenarioID.toLowerCase()}.test.ts`,
    command: `bun test tests/integration/${overrides.scenarioID.toLowerCase()}.test.ts`,
    result: 'pass',
    coverageLevel: 'exact',
    ...overrides,
  }
}

/**
 * Quick factory for an equivalent-passing evidence fixture.
 * Includes a rationale string as required by the equivalence check.
 */
export function createEquivalentEvidenceFixture(
  overrides: Partial<EvidenceFixtureOptions> & Pick<EvidenceFixtureOptions, 'scenarioID' | 'slug' | 'gitHead' | 'coreCodeFiles'>,
): EvidenceFixtureOptions {
  return {
    evidenceType: 'integration_test',
    testFile: `tests/integration/${overrides.scenarioID.toLowerCase()}-equiv.test.ts`,
    command: `bun test tests/integration/${overrides.scenarioID.toLowerCase()}-equiv.test.ts`,
    result: 'pass',
    coverageLevel: 'equivalent',
    coverageRationale: 'Same input/output coverage via integration test with equivalent assertions',
    ...overrides,
  }
}

/**
 * Quick factory for a failing evidence fixture.
 */
export function createFailingEvidenceFixture(
  overrides: Partial<EvidenceFixtureOptions> & Pick<EvidenceFixtureOptions, 'scenarioID' | 'slug' | 'gitHead' | 'coreCodeFiles'>,
): EvidenceFixtureOptions {
  return {
    evidenceType: 'integration_test',
    testFile: `tests/integration/${overrides.scenarioID.toLowerCase()}.test.ts`,
    command: `bun test tests/integration/${overrides.scenarioID.toLowerCase()}.test.ts`,
    result: 'fail',
    coverageLevel: 'partial',
    ...overrides,
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Behavior Scenario Document Helpers
// ────────────────────────────────────────────────────────────────────────────

/** Scenario criticality levels per behavior.md. */
export type ScenarioCriticality = 'critical' | 'boundary' | 'optional'

/** A single behavior scenario definition. */
export interface BehaviorScenarioDefinition {
  /** Stable scenario ID, e.g. "SC-001" */
  id: string
  /** Short human-readable title */
  title: string
  /** Criticality */
  criticality: ScenarioCriticality
  /** Given conditions */
  given: string[]
  /** When trigger */
  when: string[]
  /** Then expected outcomes */
  then: string[]
}

/**
 * Generate a single scenario block for a behavior.md file.
 * Produces the `### SC-001: Title` format with criticality, given/when/then.
 */
export function generateScenarioBlock(scenario: BehaviorScenarioDefinition): string {
  const lines = [
    `### ${scenario.id}: ${scenario.title}`,
    '',
    `**Criticality:** ${scenario.criticality}`,
    '',
    '**Given:**',
    ...scenario.given.map(g => `- ${g}`),
    '',
    '**When:**',
    ...scenario.when.map(w => `- ${w}`),
    '',
    '**Then:**',
    ...scenario.then.map(t => `- ${t}`),
    '',
  ]
  return lines.join('\n')
}

/**
 * Generate a full behavior.md document with scenarios and an optional
 * verification mapping table.
 *
 * @example
 * ```ts
 * const content = generateBehaviorDocument({
 *   feature: 'my-feature',
 *   scenarios: [
 *     {
 *       id: 'SC-008',
 *       title: 'Missing behavior evidence blocks critical scenario readiness',
 *       criticality: 'critical',
 *       given: ['behavior.md contains a critical scenario', 'No fresh exact or equivalent evidence exists'],
 *       when: ['Verify evaluates Behavior Evidence'],
 *       then: ['Verify records a behavior evidence gap', 'Readiness is NotReady'],
 *     },
 *   ],
 *   verificationMapping: [
 *     { scenarioID: 'SC-008', evidenceType: 'test', expectedEvidence: 'tests/integration/sc008.test.ts', status: 'pending' },
 *   ],
 * })
 * ```
 */
export function generateBehaviorDocument(options: {
  feature: string
  scenarios: BehaviorScenarioDefinition[]
  verificationMapping?: Array<{
    scenarioID: string
    evidenceType: string
    expectedEvidence: string
    status: string
    criticality?: ScenarioCriticality
    coverageLevel?: CoverageLevel
    equivalenceRationale?: string
    freshness?: EvidenceFreshness
  }>
}): string {
  const parts: string[] = [
    `# Quality Gate Workflow Redesign - Observable Behavior`,
    '',
    `## User-Visible Scenarios`,
    '',
  ]

  for (const scenario of options.scenarios) {
    parts.push(generateScenarioBlock(scenario))
  }

  if (options.verificationMapping && options.verificationMapping.length > 0) {
    parts.push('## Verification Mapping', '')
    parts.push('| Scenario ID | Criticality | Evidence Ref | Evidence Type | Coverage Level | Equivalence Rationale | Freshness | Status |')
    parts.push('|-------------|-------------|--------------|---------------|----------------|-----------------------|-----------|--------|')
    for (const row of options.verificationMapping) {
      parts.push(
        `| ${row.scenarioID} | ${row.criticality ?? 'critical'} | ${row.expectedEvidence} | ${row.evidenceType} | ${row.coverageLevel ?? 'exact'} | ${row.equivalenceRationale ?? 'N/A'} | ${row.freshness ?? 'fresh'} | ${row.status} |`,
      )
    }
    parts.push('')
  }

  return parts.join('\n')
}

/**
 * Write a behavior.md file to `docs/changes/{feature}/behavior.md`.
 * Returns the file path.
 */
export async function writeBehaviorDocument(
  directory: string,
  options: Parameters<typeof generateBehaviorDocument>[0] & { feature: string },
): Promise<string> {
  const featureDir = join(directory, 'docs', 'changes', options.feature)
  await mkdir(featureDir, { recursive: true })

  const filePath = join(featureDir, 'behavior.md')
  const content = generateBehaviorDocument(options)

  await writeFile(filePath, content, 'utf-8')
  return filePath
}

/**
 * Standard set of Quality Gate behavior scenarios from the behavior.md contract
 * (SC-001 through SC-014). Use in tests that need realistic scenario data.
 */
export const QUALITY_GATE_SCENARIOS: BehaviorScenarioDefinition[] = [
  {
    id: 'SC-001',
    title: 'Quality Gate exposes a visible run session',
    criticality: 'critical',
    given: ['Implementation work is complete.', 'The AI invokes Quality Gate.'],
    when: ['Quality Gate starts.'],
    then: [
      'A visible session named or clearly labeled `Quality Gate: {feature}` exists.',
      'The session records context, scope, applicability, risk assessment, Harden progress, Verify summary, and readiness.',
      'The main conversation receives a concise final summary with the Quality Gate session reference.',
    ],
  },
  {
    id: 'SC-002',
    title: 'Harden Reviewer and Executor are linked under the Quality Gate session',
    criticality: 'critical',
    given: ['Quality Gate decides Harden is required.'],
    when: ['Harden starts its review loop.'],
    then: [
      'Reviewer and Executor sessions are created as children or clearly linked descendants of the Quality Gate session.',
      'No empty Harden Coordinator session is presented as the primary visible container.',
      'The Quality Gate session records each round summary and finding disposition.',
    ],
  },
  {
    id: 'SC-003',
    title: 'Explicit behavior or spec violation is fixed by implementation changes',
    criticality: 'critical',
    given: [
      '`behavior.md`, `design.md`, `plan.md`, `docs/current`, or `docs/decisions` explicitly requires behavior X.',
      'The implementation does behavior Y instead.',
    ],
    when: ['Harden Reviewer examines the implementation.'],
    then: [
      'Harden records a `behavior_violation` or `spec_violation` finding.',
      'Executor is allowed to fix implementation code within scope.',
      'Readiness remains blocked until the finding is fixed or otherwise resolved.',
    ],
  },
  {
    id: 'SC-004',
    title: 'Document gap with inferable intent does not automatically block',
    criticality: 'critical',
    given: [
      'Approved documents do not explicitly cover an implementation case.',
      'The surrounding behavior/design/current context supports a high- or medium-confidence inferred intent.',
      'The implementation aligns with that inferred intent.',
    ],
    when: ['Harden classifies the gap.'],
    then: [
      'Harden records an `intent_gap` with evidence, inferred intent, confidence, and alignment.',
      'The workflow does not block solely because the document is incomplete.',
      'The main conversation reports the inferred intent and required doc update.',
      'Readiness may be `ReadyWithDocUpdates` if Verify evidence passes.',
    ],
  },
  {
    id: 'SC-005',
    title: 'Document gap with misaligned implementation is fixed',
    criticality: 'critical',
    given: [
      'Approved documents do not explicitly cover an implementation case.',
      'Harden can infer user intent with high or medium confidence.',
      'The implementation does not align with that inferred intent.',
    ],
    when: ['Harden classifies the gap.'],
    then: [
      'Harden records `intent_gap` with decision `fix_implementation`.',
      'Executor fixes implementation code within scope.',
      'Quality Gate continues after the fix and reruns the necessary checks.',
    ],
  },
  {
    id: 'SC-006',
    title: 'Uninferable intent blocks for decision',
    criticality: 'critical',
    given: [
      'Approved documents do not cover a case.',
      'Multiple reasonable interpretations exist, or confidence is low.',
    ],
    when: ['Harden runs Intent Inference.'],
    then: [
      'Harden records `intent_gap` with decision `needs_decision`.',
      'Readiness becomes `NeedsDecision`.',
      'The main conversation reports the exact decision needed.',
    ],
  },
  {
    id: 'SC-007',
    title: 'Contract divergence requires explicit decision',
    criticality: 'critical',
    given: [
      'Implementation changes or contradicts an approved contract.',
      'The change may be reasonable but changes expected behavior or workflow semantics.',
    ],
    when: ['Harden reviews the change.'],
    then: [
      'Harden records `contract_divergence`.',
      'Executor does not silently change docs or approve the divergence.',
      'Quality Gate reports `NeedsDecision` unless a prior explicit decision authorizes the change.',
    ],
  },
  {
    id: 'SC-008',
    title: 'Missing behavior evidence blocks critical scenario readiness',
    criticality: 'critical',
    given: [
      '`behavior.md` contains a critical scenario.',
      'No fresh exact or equivalent evidence exists for that scenario.',
    ],
    when: ['Verify evaluates Behavior Evidence.'],
    then: [
      'Verify records a behavior evidence gap.',
      'Readiness is `NotReady` or `NeedsDecision` depending on the gap.',
      'The report identifies the scenario that lacks evidence.',
    ],
  },
  {
    id: 'SC-009',
    title: 'Integration evidence verifies critical behavior',
    criticality: 'critical',
    given: [
      'A critical behavior scenario has an evidence file under `.sisyphus/evidence/`.',
      'The evidence references an integration test or equivalent verification.',
      'The evidence is fresh and passing.',
    ],
    when: ['Verify evaluates Behavior Evidence.'],
    then: [
      'The scenario is marked verified when coverage is `exact` or `equivalent` with rationale.',
      'The evidence contributes to `Ready` or `ReadyWithDocUpdates`.',
    ],
  },
  {
    id: 'SC-010',
    title: 'Implementation Mapper records behavior to code traceability',
    criticality: 'critical',
    given: [
      'Quality Gate reaches `Ready` or `ReadyWithDocUpdates`.',
      'Behavior Evidence contains core code mappings.',
    ],
    when: ['Implementation Mapper is generated.'],
    then: [
      '`docs/changes/{feature}/implementation-mapper.md` records scenario ID, behavior, evidence reference, and core code files.',
      'Archive can preserve the behavior -> evidence -> code trace.',
    ],
  },
  {
    id: 'SC-011',
    title: 'Ready for archive is not the same as archived',
    criticality: 'critical',
    given: ['Quality Gate returns `Ready` or `ReadyWithDocUpdates`.'],
    when: ['The workflow updates implementation run status.'],
    then: [
      'The run becomes `ready_for_archive` or equivalent internal state.',
      'The user-facing label indicates "Awaiting Archive Confirmation".',
      'Archive does not run until the user explicitly confirms archive.',
    ],
  },
  {
    id: 'SC-012',
    title: 'Limited context does not grant semantic archive readiness',
    criticality: 'critical',
    given: [
      'Quality Gate can run only limited-context technical verification.',
      'Full behavior/design context is unavailable.',
    ],
    when: ['Quality Gate reports readiness.'],
    then: [
      'The report distinguishes technical verification from semantic archive readiness.',
      'The workflow does not mark the run `ready_for_archive` solely from limited-context technical checks.',
    ],
  },
  {
    id: 'SC-013',
    title: 'Deprecated issue-mode user-facing workflow is not exposed as active Quality Gate path',
    criticality: 'boundary',
    given: ['Existing code or docs contain legacy issue-mode references.'],
    when: ['The redesigned Quality Gate workflow is installed or documented.'],
    then: [
      'Removed issue-mode commands are not presented as active normal workflow entry points.',
      'Compatibility-only fields are documented as such or removed with tests.',
    ],
  },
  {
    id: 'SC-014',
    title: 'Main conversation receives a concise Quality Gate result',
    criticality: 'critical',
    given: ['Quality Gate has completed.'],
    when: ['Control returns to the main conversation.'],
    then: [
      'The user sees readiness, Harden status, Verify status, blocker count, doc update count, and archive confirmation requirement.',
      'Detailed review evidence remains available in the Quality Gate session and child sessions.',
    ],
  },
]

/**
 * Extract scenario IDs from the standard set, optionally filtered by criticality.
 */
export function getScenarioIDs(criticality?: ScenarioCriticality): string[] {
  if (!criticality) return QUALITY_GATE_SCENARIOS.map(s => s.id)
  return QUALITY_GATE_SCENARIOS.filter(s => s.criticality === criticality).map(s => s.id)
}

/**
 * Get the critical scenarios from the standard set (SC-008, SC-009, SC-010
 * are the evidence-related ones).
 */
export function getEvidenceScenarios(): BehaviorScenarioDefinition[] {
  return QUALITY_GATE_SCENARIOS.filter(s =>
    s.id === 'SC-008' || s.id === 'SC-009' || s.id === 'SC-010',
  )
}

/**
 * Create evidence fixtures for all evidence-related scenarios (SC-008, SC-009, SC-010).
 * Returns the file paths of the written evidence files.
 *
 * @example
 * ```ts
 * const directory = '.test-evidence-scenarios'
 * const paths = await writeEvidenceScenariosFixtures(directory, gitHead)
 * // paths = ['.sisyphus/evidence/SC-008-missing-evidence.md', ...]
 * ```
 */
export async function writeEvidenceScenariosFixtures(
  directory: string,
  gitHead: string,
  options?: {
    /** Override the result for specific scenario IDs */
    results?: Partial<Record<string, EvidenceResult>>
    /** Override coverage level for specific scenario IDs */
    coverageLevels?: Partial<Record<string, CoverageLevel>>
  },
): Promise<string[]> {
  const scenarios = getEvidenceScenarios()
  const paths: string[] = []

  for (const scenario of scenarios) {
    const result = options?.results?.[scenario.id] ?? 'pass'
    const coverageLevel = options?.coverageLevels?.[scenario.id] ?? 'exact'

    const path = await writeEvidenceFile(directory, {
      scenarioID: scenario.id,
      slug: scenario.title.toLowerCase().replace(/\s+/g, '-').slice(0, 40),
      evidenceType: 'integration_test',
      testFile: `tests/integration/${scenario.id.toLowerCase()}.test.ts`,
      command: `bun test tests/integration/${scenario.id.toLowerCase()}.test.ts`,
      result,
      gitHead,
      coverageLevel,
      coreCodeFiles: ['src/commands/quality-gate.ts', 'src/commands/verify.ts'],
    })
    paths.push(path)
  }

  return paths
}
