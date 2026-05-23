/**
 * Reusable test fixtures for Quality Gate sessions and behavior evidence.
 *
 * These helpers create in-memory structures and filesystem artifacts
 * that mirror the real Quality Gate workflow without changing existing
 * test behavior until explicitly called.
 *
 * Three categories:
 * 1. Mock session client — records session.create / session.prompt parent/child relationships
 * 2. Evidence fixture — .sisyphus/evidence/{scenario-id}-{slug}.md files
 * 3. Behavior scenario — SC-NNN style IDs, criticality, and verification mapping tables
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// ─── 1. Mock Session Client ─────────────────────────────────────────────────

/** A single recorded session operation */
export interface SessionOperation {
  type: 'create' | 'prompt'
  sessionID: string
  parentSessionID?: string
  prompt?: string
  timestamp: string
}

/** Capture log for all session operations */
export interface SessionCaptureLog {
  operations: SessionOperation[]
}

/** Create a fresh session capture log */
export function createSessionCaptureLog(): SessionCaptureLog {
  return { operations: [] }
}

/**
 * Create a mock session client that records create/prompt calls.
 *
 * Usage:
 * ```ts
 * const log = createSessionCaptureLog()
 * const client = createMockSessionClient(log)
 * client.create('quality-gate-session')
 * client.prompt('quality-gate-session', 'Run quality gate', { parent: 'main-session' })
 * // log.operations[0].type === 'create'
 * // log.operations[1].parentSessionID === 'main-session'
 * ```
 */
export function createMockSessionClient(log: SessionCaptureLog) {
  return {
    create(sessionID: string): string {
      log.operations.push({
        type: 'create',
        sessionID,
        timestamp: new Date().toISOString(),
      })
      return sessionID
    },

    prompt(
      sessionID: string,
      prompt: string,
      options?: { parent?: string },
    ): string {
      log.operations.push({
        type: 'prompt',
        sessionID,
        parentSessionID: options?.parent,
        prompt,
        timestamp: new Date().toISOString(),
      })
      return `response-${sessionID}-${log.operations.length}`
    },
  }
}

/** Find all child sessions created under a given parent */
export function findChildSessions(
  log: SessionCaptureLog,
  parentSessionID: string,
): SessionOperation[] {
  return log.operations.filter(
    op => op.parentSessionID === parentSessionID,
  )
}

/** Assert that a parent session has exactly the expected child session types */
export function assertSessionHierarchy(
  log: SessionCaptureLog,
  parentSessionID: string,
  expectedChildren: Array<{ sessionID: string; promptContains?: string }>,
): { valid: boolean; missing: string[] } {
  const children = findChildSessions(log, parentSessionID)
  const missing: string[] = []

  for (const expected of expectedChildren) {
    const found = children.find(c => c.sessionID === expected.sessionID)
    if (!found) {
      missing.push(`session ${expected.sessionID} not found under ${parentSessionID}`)
    } else if (expected.promptContains && found.prompt && !found.prompt.includes(expected.promptContains)) {
      missing.push(`session ${expected.sessionID} prompt does not contain "${expected.promptContains}"`)
    }
  }

  return { valid: missing.length === 0, missing }
}

// ─── 2. Evidence Fixture Helpers ────────────────────────────────────────────

/** Metadata for an evidence fixture file */
export interface EvidenceFixtureOptions {
  /** Scenario ID, e.g. "SC-001" */
  scenarioId: string
  /** Human-readable slug, e.g. "mapper" or "harden-session" */
  slug: string
  /** Git HEAD commit hash */
  gitHead: string
  /** Timestamp for the evidence */
  timestamp?: string
  /** Coverage level: exact | equivalent | partial | missing | not_applicable */
  coverageLevel?: 'exact' | 'equivalent' | 'partial' | 'missing' | 'not_applicable'
  /** Freshness: fresh | stale | unknown */
  freshness?: 'fresh' | 'stale' | 'unknown'
  /** Core code files mapped to this scenario */
  coreCodeFiles?: string[]
  /** Additional evidence content lines */
  evidenceContent?: string[]
  /** Readiness status */
  readiness?: string
}

/** Default values for evidence fixture options */
const DEFAULT_EVIDENCE_OPTIONS: Required<Omit<EvidenceFixtureOptions, 'scenarioId' | 'slug' | 'gitHead'>> = {
  timestamp: new Date().toISOString(),
  coverageLevel: 'exact',
  freshness: 'fresh',
  coreCodeFiles: [],
  evidenceContent: [],
  readiness: 'verified',
}

/** Generate the file name for an evidence fixture */
export function evidenceFileName(options: EvidenceFixtureOptions): string {
  return `${options.scenarioId}-${options.slug}.md`
}

/** Generate the markdown content for an evidence fixture file */
export function generateEvidenceMarkdown(options: EvidenceFixtureOptions): string {
  const opts = { ...DEFAULT_EVIDENCE_OPTIONS, ...options }
  const lines: string[] = [
    `# Evidence: ${opts.scenarioId} — ${opts.slug}`,
    '',
    `**Timestamp**: ${opts.timestamp}`,
    `**Git HEAD**: ${opts.gitHead}`,
    `**Coverage Level**: ${opts.coverageLevel}`,
    `**Freshness**: ${opts.freshness}`,
    `**Readiness**: ${opts.readiness}`,
    '',
  ]

  if (opts.coreCodeFiles.length > 0) {
    lines.push('## Core Code Mapping')
    lines.push('')
    for (const file of opts.coreCodeFiles) {
      lines.push(`- \`${file}\``)
    }
    lines.push('')
  }

  if (opts.evidenceContent.length > 0) {
    lines.push('## Evidence Details')
    lines.push('')
    lines.push(...opts.evidenceContent)
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Write an evidence fixture file to `.sisyphus/evidence/`.
 *
 * @param baseDir - The test directory root
 * @param options - Evidence fixture options
 * @returns The absolute path to the written file
 */
export async function writeEvidenceFixture(
  baseDir: string,
  options: EvidenceFixtureOptions,
): Promise<string> {
  const evidenceDir = join(baseDir, '.sisyphus', 'evidence')
  await mkdir(evidenceDir, { recursive: true })
  const filePath = join(evidenceDir, evidenceFileName(options))
  await writeFile(filePath, generateEvidenceMarkdown(options), 'utf-8')
  return filePath
}

/**
 * Write multiple evidence fixtures at once.
 *
 * @returns Array of absolute paths to the written files
 */
export async function writeEvidenceFixtures(
  baseDir: string,
  fixtures: EvidenceFixtureOptions[],
): Promise<string[]> {
  const paths: string[] = []
  for (const fixture of fixtures) {
    const path = await writeEvidenceFixture(baseDir, fixture)
    paths.push(path)
  }
  return paths
}

// ─── 3. Behavior Scenario Document Helpers ──────────────────────────────────

/** A single behavior scenario definition */
export interface BehaviorScenarioDef {
  /** Scenario ID, e.g. "SC-001" */
  id: string
  /** Human-readable name */
  name: string
  /** Criticality: critical | normal | optional */
  criticality: 'critical' | 'normal' | 'optional'
  /** Given conditions */
  given: string[]
  /** When actions */
  when: string[]
  /** Then expected outcomes */
  then: string[]
}

/** Options for generating a full behavior.md document */
export interface BehaviorDocumentOptions {
  /** Feature name (used in the document title) */
  feature: string
  /** List of behavior scenarios */
  scenarios: BehaviorScenarioDef[]
  /** Optional boundary scenarios */
  boundaries?: BehaviorScenarioDef[]
  /** Evidence mapping rows — one per scenario */
  evidenceMapping?: EvidenceMappingRow[]
}

/** A row in the verification/evidence mapping table */
export interface EvidenceMappingRow {
  /** Scenario ID */
  scenarioId: string
  /** Criticality */
  criticality: 'critical' | 'normal' | 'optional'
  /** Evidence reference path */
  evidenceRef: string
  /** Evidence type */
  evidenceType: string
  /** Coverage level */
  coverageLevel: 'exact' | 'equivalent' | 'partial' | 'missing' | 'not_applicable'
  /** Equivalence rationale */
  equivalenceRationale?: string
  /** Freshness */
  freshness: 'fresh' | 'stale' | 'unknown'
  /** Status */
  status: 'verified' | 'missing_evidence' | 'not_applicable' | 'failed'
}

/** Generate a single scenario block in markdown */
export function formatScenarioBlock(scenario: BehaviorScenarioDef, kind: 'Scenario' | 'Boundary' = 'Scenario'): string {
  const lines: string[] = [
    `### ${kind}: ${scenario.name}`,
    '',
    `> **ID**: ${scenario.id} | **Criticality**: ${scenario.criticality}`,
    '',
    '**Given:**',
  ]
  for (const g of scenario.given) {
    lines.push(`- ${g}`)
  }
  lines.push('', '**When:**')
  for (const w of scenario.when) {
    lines.push(`- ${w}`)
  }
  lines.push('', '**Then:**')
  for (const t of scenario.then) {
    lines.push(`- ${t}`)
  }
  lines.push('')
  return lines.join('\n')
}

/** Generate the full behavior.md markdown content */
export function generateBehaviorMarkdown(options: BehaviorDocumentOptions): string {
  const lines: string[] = [
    `# Behavior Contract: ${options.feature}`,
    '',
    '> **Status**: Draft | **Feature**: ' + options.feature,
    '> **Date**: ' + new Date().toISOString().split('T')[0],
    '',
    '---',
    '',
    '## Behavior Scenarios',
    '',
  ]

  for (const scenario of options.scenarios) {
    lines.push(formatScenarioBlock(scenario, 'Scenario'))
  }

  if (options.boundaries && options.boundaries.length > 0) {
    lines.push('## Boundary Scenarios', '')
    for (const boundary of options.boundaries) {
      lines.push(formatScenarioBlock(boundary, 'Boundary'))
    }
  }

  if (options.evidenceMapping && options.evidenceMapping.length > 0) {
    lines.push('## Evidence Mapping', '')
    lines.push('')
    lines.push('| Scenario ID | Criticality | Evidence Ref | Evidence Type | Coverage Level | Equivalence Rationale | Freshness | Status |')
    lines.push('|-------------|-------------|--------------|---------------|----------------|-----------------------|-----------|--------|')
    for (const row of options.evidenceMapping) {
      const rationale = row.equivalenceRationale ?? 'N/A'
      lines.push(`| ${row.scenarioId} | ${row.criticality} | ${row.evidenceRef} | ${row.evidenceType} | ${row.coverageLevel} | ${rationale} | ${row.freshness} | ${row.status} |`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Write a behavior.md fixture file.
 *
 * @param baseDir - The test directory root
 * @param featureName - Feature name (directory under docs/changes/)
 * @param options - Behavior document options
 * @returns The absolute path to the written file
 */
export async function writeBehaviorFixture(
  baseDir: string,
  featureName: string,
  options: BehaviorDocumentOptions,
): Promise<string> {
  const changesDir = join(baseDir, 'docs', 'changes', featureName)
  await mkdir(changesDir, { recursive: true })
  const filePath = join(changesDir, 'behavior.md')
  await writeFile(filePath, generateBehaviorMarkdown(options), 'utf-8')
  return filePath
}

// ─── Pre-built Scenario Catalog ─────────────────────────────────────────────

/** Common behavior scenario definitions for Quality Gate testing */
export const QUALITY_GATE_SCENARIOS = {
  /** SC-001: Quality Gate exposes visible run session and session reference */
  SC_001_VISIBLE_SESSION: {
    id: 'SC-001',
    name: 'Quality Gate exposes visible run session and session reference',
    criticality: 'critical' as const,
    given: [
      'feature has an active ImplementationRun',
      'sessionID is provided in quality gate args',
    ],
    when: [
      'quality gate is invoked',
    ],
    then: [
      'output includes Quality Gate Session section',
      'output includes session reference',
      'output includes Harden progress',
      'output includes Verify summary',
    ],
  },

  /** SC-002: Harden reviewer and executor are linked below quality gate session */
  SC_002_HARDEN_CHILD_SESSIONS: {
    id: 'SC-002',
    name: 'Harden reviewer and executor are linked below quality gate session',
    criticality: 'critical' as const,
    given: [
      'quality gate is invoked with sessionID',
      'risk level is high (hardening is triggered)',
    ],
    when: [
      'harden phase creates reviewer and executor sessions',
    ],
    then: [
      'output includes Reviewer Session section',
      'output includes Executor Session section',
      'both sessions show parent: quality-gate-session',
    ],
  },

  /** SC-010: Implementation Mapper records behavior to code traceability */
  SC_010_MAPPER_TRACEABILITY: {
    id: 'SC-010',
    name: 'Implementation Mapper records behavior to code traceability',
    criticality: 'critical' as const,
    given: [
      'Quality Gate reaches Ready',
    ],
    when: [
      'Implementation Mapper is generated',
    ],
    then: [
      'scenario, evidence, and core code files are preserved',
    ],
  },

  /** SC-011: Ready quality gate labels run as awaiting archive confirmation */
  SC_011_AWAITING_ARCHIVE: {
    id: 'SC-011',
    name: 'Ready quality gate labels run as awaiting archive confirmation',
    criticality: 'critical' as const,
    given: [
      'quality gate returns ready',
      'active ImplementationRun exists',
    ],
    when: [
      'run status transitions to ready_for_archive',
    ],
    then: [
      'output includes Awaiting Archive Confirmation',
      'output states archive will not run until user explicitly confirms',
      'run status is ready_for_archive',
    ],
  },

  /** SC-012: Limited context distinguishes technical checks from semantic archive readiness */
  SC_012_LIMITED_CONTEXT: {
    id: 'SC-012',
    name: 'Limited context distinguishes technical checks from semantic archive readiness',
    criticality: 'normal' as const,
    given: [
      'no plan file exists for the feature',
      'implementation files have changed',
    ],
    when: [
      'quality gate is invoked',
    ],
    then: [
      'output includes Technical verification status',
      'output includes Semantic archive readiness status',
      'archiveReadinessEligible is false',
    ],
  },

  /** SC-014: Main conversation summary is concise and complete */
  SC_014_MAIN_SUMMARY: {
    id: 'SC-014',
    name: 'Main conversation summary is concise and complete',
    criticality: 'critical' as const,
    given: [
      'quality gate is invoked with sessionID',
      'harden passes with risks',
      'verify returns ready_with_doc_updates',
    ],
    when: [
      'quality gate output is generated',
    ],
    then: [
      'output includes Quality Gate Result Summary',
      'summary contains Session, Readiness, Harden, Verify, Blockers, Doc updates',
      'summary states Archive confirmation required',
    ],
  },
} as const

/** Type for accessing scenario keys */
export type QualityGateScenarioKey = keyof typeof QUALITY_GATE_SCENARIOS

/** Get a scenario definition by key */
export function getScenario(key: QualityGateScenarioKey): BehaviorScenarioDef {
  return { ...QUALITY_GATE_SCENARIOS[key] }
}

/** Get all scenario definitions as an array */
export function getAllScenarios(): BehaviorScenarioDef[] {
  return Object.values(QUALITY_GATE_SCENARIOS).map(s => ({ ...s }))
}

/** Get scenarios filtered by criticality */
export function getScenariosByCriticality(
  criticality: 'critical' | 'normal' | 'optional',
): BehaviorScenarioDef[] {
  return getAllScenarios().filter(s => s.criticality === criticality)
}

// ─── Combined Fixture Builder ───────────────────────────────────────────────

/**
 * Build a complete test fixture set for a quality gate scenario.
 *
 * Writes both behavior.md and evidence files to the test directory.
 *
 * @param baseDir - Test directory root
 * @param feature - Feature name
 * @param gitHead - Current git HEAD hash
 * @param scenarioKeys - Which scenarios to include (defaults to all)
 * @returns Object with paths to all created files
 */
export async function buildQualityGateTestFixture(
  baseDir: string,
  feature: string,
  gitHead: string,
  scenarioKeys: QualityGateScenarioKey[] = Object.keys(QUALITY_GATE_SCENARIOS) as QualityGateScenarioKey[],
): Promise<{
  behaviorPath: string
  evidencePaths: string[]
}> {
  const scenarios = scenarioKeys.map(getScenario)
  const evidenceMapping: EvidenceMappingRow[] = scenarios.map(scenario => ({
    scenarioId: scenario.id,
    criticality: scenario.criticality,
    evidenceRef: `.sisyphus/evidence/${scenario.id}-test.md`,
    evidenceType: 'integration_test',
    coverageLevel: scenario.criticality === 'optional' ? 'not_applicable' : 'exact',
    freshness: 'fresh' as const,
    status: 'verified' as const,
  }))

  const behaviorPath = await writeBehaviorFixture(baseDir, feature, {
    feature,
    scenarios,
    evidenceMapping,
  })

  const evidencePaths = await writeEvidenceFixtures(
    baseDir,
    scenarios.map(scenario => ({
      scenarioId: scenario.id,
      slug: 'test',
      gitHead,
      coreCodeFiles: ['src/commands/quality-gate.ts'],
      coverageLevel: scenario.criticality === 'optional' ? 'not_applicable' : 'exact',
      freshness: 'fresh' as const,
      readiness: 'verified',
    })),
  )

  return { behaviorPath, evidencePaths }
}
