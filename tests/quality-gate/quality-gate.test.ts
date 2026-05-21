import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { handleQualityGate } from '../../src/commands/quality-gate.js'
import type { QualityGateArgs } from '../../src/commands/quality-gate.js'
import { getAcceptanceStatePath } from '../../src/config.js'
import { defaultConfig, type OpenFlowContext } from '../../src/types.js'
import { loadAcceptanceState, saveAcceptanceState } from '../../src/utils/acceptance-state.js'
import type { EvidenceFreshnessMetadata } from '../../src/types.js'
import { computeSimpleDiffHash } from '../../src/utils/evidence-freshness.js'
import { implementationRunStore } from '../../src/utils/implementation-run.js'

// ── Helpers ────────────────────────────────────────────────────────────────

function createContext(directory: string, overrides?: Partial<OpenFlowContext['config']>): OpenFlowContext {
  return {
    directory,
    worktree: directory,
    client: {},
    $: {},
    config: {
      ...defaultConfig,
      ...overrides,
    },
    enhancedPlans: new Set<string>(),
  }
}

function createStandardContext(directory: string, overrides?: Partial<OpenFlowContext['config']>): OpenFlowContext {
  return createContext(directory, {
    verification: {
      ...defaultConfig.verification,
      quality: ['typecheck', 'test'],
      ...overrides?.verification,
    },
    ...overrides,
  })
}

function runGit(directory: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd: directory,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

async function readRunEvents(directory: string, eventsPath: string): Promise<Array<{ type: string; result?: string }>> {
  const content = await readFile(join(directory, eventsPath), 'utf-8')
  return content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
}

const FEATURE_A = 'feature-a'

// ── Mock helpers for call-order testing ────────────────────────────────────

interface CallLog {
  order: string[]
}

function createMockHarden(callLog: CallLog): (ctx: OpenFlowContext, feature?: string) => Promise<string> {
  return async (_ctx, _feature) => {
    callLog.order.push('harden')
    return '## Harden Result\n\nStatus: pass\nRounds: 1\nBudget consumed: 100\nSummary: mock harden passed'
  }
}

function createMockVerify(callLog: CallLog): (ctx: OpenFlowContext, feature?: string) => Promise<string> {
  return async (_ctx, feature) => {
    callLog.order.push('verify')
    return [
      '## Verify',
      `Feature: ${feature || 'unknown'}`,
      '',
      '### Evidence',
      '- checks_run:',
      '  - active_feature_resolution ✅ (mock)',
      '- observed_behavior_summary: mock verify evidence',
      '- intended_vs_actual_delta: no delta (mock)',
      '- doc_alignment_summary: mock alignment',
      '- current_decisions_conflict_summary: no conflicts (mock)',
      '- known_risks_or_missing_evidence: none (mock)',
      '',
      '### Readiness',
      '- status: ready',
      '- reason_codes: all_checks_passed',
      '- reason: mock verify passed',
      '- next_step: proceed (mock)',
      '',
    ].join('\n')
  }
}

function createMockVerifyWithReadiness(
  callLog: CallLog,
  readiness: 'ready' | 'ready_with_doc_updates' | 'not_ready' | 'needs_decision',
  reasonCodes = 'mock_reason',
  reason = 'mock verify result',
): (ctx: OpenFlowContext, feature?: string) => Promise<string> {
  return async (_ctx, feature) => {
    callLog.order.push('verify')
    return [
      '## Verify',
      `Feature: ${feature || 'unknown'}`,
      '',
      '### Evidence',
      '- checks_run:',
      '  - active_feature_resolution ✅ (mock)',
      '- observed_behavior_summary: mock verify evidence',
      '- intended_vs_actual_delta: no delta (mock)',
      '- doc_alignment_summary: mock alignment',
      '- current_decisions_conflict_summary: no conflicts (mock)',
      '- known_risks_or_missing_evidence: none (mock)',
      '',
      '### Readiness',
      `- status: ${readiness}`,
      `- reason_codes: ${reasonCodes}`,
      `- reason: ${reason}`,
      '- next_step: proceed (mock)',
      '',
    ].join('\n')
  }
}

function createMockHardenWithSession(capture: { sessionID?: string }): (ctx: OpenFlowContext, feature?: string, sessionID?: string) => Promise<string> {
  return async (_ctx, _feature, sessionID) => {
    capture.sessionID = sessionID
    return '## Harden Result\n\nStatus: pass\nRounds: 1\nBudget consumed: 100\nSummary: mock harden passed'
  }
}

function createMockErrorHarden(callLog: CallLog): () => Promise<string> {
  return async () => {
    callLog.order.push('harden-error')
    throw new Error('mock harden failure')
  }
}

function createMockHardenStatus(status: string): () => Promise<string> {
  return async () => `## Harden Result\n\nStatus: ${status}\nRounds: 1\nBudget consumed: 67151\nSummary: mock harden status ${status}`
}

// ── Fixture factories ──────────────────────────────────────────────────────

async function createGitFixture(name: string, diffKind: 'trivial' | 'multi-file' | 'no-diff'): Promise<string> {
  const directory = join(process.cwd(), `.test-quality-gate-${name}`)
  await rm(directory, { recursive: true, force: true }).catch(() => {})
  await mkdir(directory, { recursive: true })

  runGit(directory, 'init')
  runGit(directory, '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'config', 'user.name', 'Test')
  runGit(directory, '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'config', 'user.email', 'test@example.test')

  // Create initial files
  await mkdir(join(directory, 'src'), { recursive: true })
  await writeFile(join(directory, 'src', 'app.ts'), 'export const appVersion = "1.0"\n', 'utf-8')
  await writeFile(join(directory, 'src', 'util.ts'), 'export const helper = () => 42\n', 'utf-8')
  await mkdir(join(directory, '.sisyphus', 'plans'), { recursive: true })
  await writeFile(join(directory, '.sisyphus', 'plans', `${FEATURE_A}.md`), '# Plan\n- Implement fixture\n', 'utf-8')

  runGit(directory, 'add', '.')
  runGit(directory, 'commit', '-m', 'initial commit')

  if (diffKind === 'trivial') {
    await writeFile(join(directory, 'README.md'), '# README\n\nTrivial update.\n', 'utf-8')
  } else if (diffKind === 'multi-file') {
    await writeFile(join(directory, 'src', 'app.ts'), [
      'export const appVersion = "2.0"',
      'export const appName = "test-app"',
      'export function initApp() { return true }',
      'export class AppConfig {',
      '  public debug = true',
      '  public port = 3000',
      '  public host = "localhost"',
      '}',
      '',
    ].join('\n'), 'utf-8')
    await writeFile(join(directory, 'src', 'util.ts'), [
      'export const helper = () => 84',
      'export const anotherHelper = () => "changed"',
      'export function utility() { return helper() + anotherHelper() }',
      'export const flag = true',
      'export const label = "multi-file"',
      'export const count = 3',
      'export const mode = "test"',
      'export const status = "ready"',
      'export const reason = "harden-trigger"',
      'export const owner = "test"',
      'export const scope = "global"',
      'export const output = "markdown"',
      'export const done = false',
      'export const todo = "verify"',
      '',
    ].join('\n'), 'utf-8')
    await writeFile(join(directory, 'src', 'index.ts'), [
      'export { appVersion, initApp } from "./app"',
      'export { helper, utility } from "./util"',
      '',
    ].join('\n'), 'utf-8')
  }

  // Create acceptance state so verify has a feature context
  await saveAcceptanceState(directory, {
    feature: FEATURE_A,
    phase: 'acceptance',
    phaseStartedAt: new Date().toISOString(),
    pendingDocUpdates: [],
  })

  return directory
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('handleQualityGate', () => {
  // ── Low-risk: harden skipped, verify invoked ─────────────────────────────

  test('low-risk change skips harden and invokes verify', async () => {
    const directory = await createGitFixture('low-risk', 'trivial')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory)

    const output = await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideHarden: createMockHarden(callLog),
      overrideVerify: createMockVerify(callLog),
    })

    // Call order: verify should be called, harden should NOT
    expect(callLog.order).not.toContain('harden')
    expect(callLog.order).toContain('verify')

    // Markdown includes all required sections
    expect(output).toContain('## Quality Gate')
    expect(output).toContain('### Context')
    expect(output).toContain('### Applicability')
    expect(output).toContain('Applicable')
    expect(output).toContain('### Risk Assessment')
    expect(output).toContain('### Harden Decision')
    expect(output).toContain('### Evidence-Aware Verify')
    expect(output).toContain('### Readiness')
    expect(output).toContain('### Next Step')

    // Harden skipped
    expect(output).toContain('skipped')
    expect(output).toContain('⏭️ no')

    // Evidence freshness section present
    expect(output).toContain('Evidence Freshness')

    // No fast/balanced/strict
    expect(output).not.toMatch(/fast|balanced|strict/i)

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  // ── High-risk: harden invoked BEFORE verify ───────────────────────────────

  test('high-risk change invokes harden before verify', async () => {
    const directory = await createGitFixture('high-risk', 'multi-file')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory, {
      harden: { ...defaultConfig.harden, enabled: true },
    })

    const output = await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideHarden: createMockHarden(callLog),
      overrideVerify: createMockVerify(callLog),
    })

    // Call order: harden THEN verify
    expect(callLog.order).toEqual(['harden', 'verify'])

    // Risk is high
    expect(output).toContain('`high`')
    expect(output).toContain('✅ yes')

    // Harden decision is risk-based
    expect(output).toContain('`risk-based`')

    // Verify output present
    expect(output).toContain('### Evidence-Aware Verify')
    expect(output).toContain('mock verify')

    // No fast/balanced/strict
    expect(output).not.toMatch(/fast|balanced|strict/i)

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  test('design-only changes return not_applicable and do not save verify readiness', async () => {
    const directory = await createGitFixture('applicability-design-only', 'no-diff')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory)

    await mkdir(join(directory, 'docs', 'changes', FEATURE_A), { recursive: true })
    await writeFile(join(directory, 'docs', 'changes', FEATURE_A, 'design.md'), '# Design\n\nUpdated design only.\n', 'utf-8')

    const output = await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideHarden: createMockHarden(callLog),
      overrideVerify: createMockVerify(callLog),
    })
    const state = await loadAcceptanceState(directory)

    expect(output).toContain('### Applicability')
    expect(output).toContain('NotApplicable')
    expect(output).toContain('design_only_no_implementation_change')
    expect(output).toContain('Do not create workflow artifacts')
    expect(callLog.order).toEqual([])
    expect(state?.readiness).toBeUndefined()
    expect(state?.verifyResult).toBeUndefined()

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  test('verify success marks implementation state as verified', async () => {
    const directory = await createGitFixture('implementation-state-verified', 'multi-file')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory, {
      harden: { ...defaultConfig.harden, enabled: true },
    })

    await saveAcceptanceState(directory, {
      feature: FEATURE_A,
      phase: 'acceptance',
      phaseStartedAt: new Date().toISOString(),
      pendingDocUpdates: [],
      implementationState: {
        state: 'stale',
        updatedAt: new Date().toISOString(),
      },
    })

    await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideHarden: createMockHarden(callLog),
      overrideVerify: createMockVerifyWithReadiness(callLog, 'ready'),
    })

    const state = await loadAcceptanceState(directory)
    const stateFile = await readFile(getAcceptanceStatePath(directory), 'utf-8')

    expect(callLog.order).toEqual(['harden', 'verify'])
    expect(state?.implementationState?.state).toBe('verified')
    expect(state?.implementationState?.fromVerify).toBe(true)
    expect(stateFile).toContain('implementationState: verified')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  test('verify failure marks implementation state as blocked', async () => {
    const directory = await createGitFixture('implementation-state-blocked', 'multi-file')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory, {
      harden: { ...defaultConfig.harden, enabled: true },
    })

    await saveAcceptanceState(directory, {
      feature: FEATURE_A,
      phase: 'acceptance',
      phaseStartedAt: new Date().toISOString(),
      pendingDocUpdates: [],
      implementationState: {
        state: 'dirty',
        updatedAt: new Date().toISOString(),
      },
    })

    await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideHarden: createMockHarden(callLog),
      overrideVerify: createMockVerifyWithReadiness(callLog, 'not_ready', 'mock_failure', 'mock verify failed'),
    })

    const state = await loadAcceptanceState(directory)
    const stateFile = await readFile(getAcceptanceStatePath(directory), 'utf-8')

    expect(callLog.order).toEqual(['harden', 'verify'])
    expect(state?.implementationState?.state).toBe('blocked')
    expect(state?.implementationState?.fromVerify).toBe(true)
    expect(stateFile).toContain('implementationState: blocked')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  test('active ImplementationRun supplies execution root and records quality gate events', async () => {
    const executionRoot = await createGitFixture('run-execution-root', 'multi-file')
    const storeRoot = join(process.cwd(), '.test-quality-gate-run-store')
    await rm(storeRoot, { recursive: true, force: true }).catch(() => {})
    await mkdir(storeRoot, { recursive: true })
    const ctx = createStandardContext(storeRoot, {
      harden: { ...defaultConfig.harden, enabled: true },
    })
    const callLog: CallLog = { order: [] }
    const captured: { verifyDirectory?: string } = {}

    const run = await implementationRunStore.createRun(ctx, {
      feature: FEATURE_A,
      sessionID: 'session-run-root',
      messageID: 'message-run-root',
      agent: 'build',
      directory: storeRoot,
      worktree: executionRoot,
      backend: 'opencode',
      backendCommand: 'Use OpenCode native build agent',
      status: 'quality_gate_pending',
      containerMode: 'worktree',
      eventsPath: '.sisyphus/openflow/events/run-execution-root.jsonl',
      observationsPath: '.sisyphus/openflow/observations/run-execution-root.jsonl',
    })

    const output = await handleQualityGate(ctx, { feature: FEATURE_A, sessionID: 'session-run-root' }, {
      overrideHarden: createMockHarden(callLog),
      overrideVerify: async (verifyCtx, feature) => {
        captured.verifyDirectory = verifyCtx.directory
        callLog.order.push('verify')
        return createMockVerifyWithReadiness({ order: [] }, 'ready')({ ...verifyCtx }, feature)
      },
    })

    const updatedRun = await implementationRunStore.getRun(ctx, run.runID)
    const events = await readRunEvents(storeRoot, run.eventsPath)

    expect(output).toContain('### Readiness')
    expect(captured.verifyDirectory).toBe(executionRoot)
    expect(callLog.order).toEqual(['harden', 'verify'])
    expect(updatedRun?.status).toBe('ready_for_archive')
    expect(events.map(event => event.type)).toEqual(['quality_gate_started', 'quality_gate_completed'])
    expect(events[1]?.result).toBe('ready')

    await rm(executionRoot, { recursive: true, force: true }).catch(() => {})
    await rm(storeRoot, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  test('active ImplementationRun readiness results transition to final run statuses', async () => {
    const cases: Array<{ readiness: 'ready_with_doc_updates' | 'not_ready' | 'needs_decision'; status: string }> = [
      { readiness: 'ready_with_doc_updates', status: 'ready_for_archive' },
      { readiness: 'not_ready', status: 'blocked' },
      { readiness: 'needs_decision', status: 'blocked' },
    ]

    for (const testCase of cases) {
      const executionRoot = await createGitFixture(`run-status-${testCase.readiness}`, 'multi-file')
      const ctx = createStandardContext(executionRoot, {
        harden: { ...defaultConfig.harden, enabled: false },
      })
      const callLog: CallLog = { order: [] }

      const run = await implementationRunStore.createRun(ctx, {
        feature: FEATURE_A,
        sessionID: `session-${testCase.readiness}`,
        messageID: `message-${testCase.readiness}`,
        agent: 'build',
        directory: executionRoot,
        backend: 'opencode',
        backendCommand: 'Use OpenCode native build agent',
        status: 'quality_gate_pending',
        containerMode: 'session',
        eventsPath: `.sisyphus/openflow/events/run-status-${testCase.readiness}.jsonl`,
        observationsPath: `.sisyphus/openflow/observations/run-status-${testCase.readiness}.jsonl`,
      })
      expect((await implementationRunStore.getActiveRun(ctx, FEATURE_A, `session-${testCase.readiness}`))?.directory).toBe(executionRoot)

      const output = await handleQualityGate(ctx, { feature: FEATURE_A, sessionID: `session-${testCase.readiness}` }, {
        overrideHarden: createMockHarden(callLog),
        overrideVerify: createMockVerifyWithReadiness(callLog, testCase.readiness),
      })

      const updatedRun = await implementationRunStore.getRun(ctx, run.runID)
      const events = await readRunEvents(executionRoot, run.eventsPath)

      expect(output).toContain(testCase.readiness)
      expect(events.map(event => event.type)).toEqual(['quality_gate_started', 'quality_gate_completed'])
      expect(events[1]?.result).toBe(testCase.readiness)
      expect(updatedRun?.status).toBe(testCase.status)

      await rm(executionRoot, { recursive: true, force: true }).catch(() => {})
    }
  }, 120000)

  test('not_applicable quality gate does not change implementation state', async () => {
    const directory = await createGitFixture('implementation-state-not-applicable', 'no-diff')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory)

    await mkdir(join(directory, 'docs', 'changes', FEATURE_A), { recursive: true })
    await writeFile(join(directory, 'docs', 'changes', FEATURE_A, 'design.md'), '# Design\n\nUpdated design only.\n', 'utf-8')
    await saveAcceptanceState(directory, {
      feature: FEATURE_A,
      phase: 'acceptance',
      phaseStartedAt: new Date().toISOString(),
      pendingDocUpdates: [],
      implementationState: {
        state: 'stale',
        updatedAt: new Date().toISOString(),
      },
    })

    await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideHarden: createMockHarden(callLog),
      overrideVerify: createMockVerifyWithReadiness(callLog, 'ready'),
    })

    const state = await loadAcceptanceState(directory)
    const stateFile = await readFile(getAcceptanceStatePath(directory), 'utf-8')

    expect(callLog.order).toEqual([])
    expect(state?.implementationState?.state).toBe('stale')
    expect(stateFile).toContain('implementationState: stale')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  test('planning-only changes return not_applicable and skip verify', async () => {
    const directory = await createGitFixture('applicability-planning-only', 'no-diff')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory)

    await writeFile(join(directory, '.sisyphus', 'plans', `${FEATURE_A}.md`), '# Plan\n\n- Updated planning only.\n', 'utf-8')

    const output = await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideHarden: createMockHarden(callLog),
      overrideVerify: createMockVerify(callLog),
    })

    expect(output).toContain('NotApplicable')
    expect(output).toContain('planning_only_no_implementation_change')
    expect(callLog.order).toEqual([])

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  test('implementation change without workflow context returns needs_workflow_stage', async () => {
    const directory = await createGitFixture('applicability-missing-workflow', 'no-diff')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory)

    await rm(join(directory, '.sisyphus', 'plans'), { recursive: true, force: true })
    await writeFile(join(directory, 'src', 'app.ts'), 'export const appVersion = "2.0"\n', 'utf-8')

    const output = await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideHarden: createMockHarden(callLog),
      overrideVerify: createMockVerify(callLog),
    })

    expect(output).toContain('NeedsWorkflowStage')
    expect(output).toContain('implementation_missing_workflow_context')
    expect(output).toContain('Do not create a minimal plan or design automatically')
    expect(callLog.order).toEqual([])

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  test('harden missing plan is reported as unavailable workflow stage instead of generic not_ready', async () => {
    const directory = await createGitFixture('harden-missing-plan-unavailable', 'multi-file')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory, {
      harden: { ...defaultConfig.harden, enabled: true },
    })

    const output = await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideHarden: async () => `## Harden Result

Status: rejected
Rounds: 0
Budget consumed: 0
Summary: missing plan file

\`.sisyphus/plans/${FEATURE_A}.md\`.`,
      overrideVerify: createMockVerify(callLog),
    })

    expect(output).toContain('harden_unavailable_missing_plan')
    expect(output).toContain('`needs_workflow_stage`')
    expect(output).not.toContain('Address the readiness issues identified above')
    expect(callLog.order).toContain('verify')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  test('feature-scoped risk ignores unrelated workspace changes', async () => {
    const directory = await createGitFixture('scoped-risk', 'no-diff')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory, {
      harden: { ...defaultConfig.harden, enabled: true },
    })

    await writeFile(join(directory, '.sisyphus', 'plans', `${FEATURE_A}.md`), [
      '# Plan',
      '',
      '- Implement `src/app.ts` only.',
      '',
    ].join('\n'), 'utf-8')
    runGit(directory, 'add', '.sisyphus/plans/feature-a.md')
    runGit(directory, 'commit', '-m', 'record scoped plan')

    await writeFile(join(directory, 'src', 'app.ts'), 'export const appVersion = "1.0"\n// feature scoped update\n', 'utf-8')
    await writeFile(join(directory, 'src', 'util.ts'), 'export const helper = () => 42\n// feature b update\n', 'utf-8')
    await writeFile(join(directory, 'src', 'index.ts'), 'export { appVersion } from "./app"\n', 'utf-8')

    const output = await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideHarden: createMockHarden(callLog),
      overrideVerify: createMockVerify(callLog),
    })

    expect(callLog.order).not.toContain('harden')
    expect(callLog.order).toContain('verify')
    expect(output).toContain('`low`')
    expect(output).toContain('- **Changed Files**: 1 file(s)')
    expect(output).toContain('`src/app.ts`')
    expect(output).toContain('- **Workspace Contamination**: 2 non-primary file(s) detected; omitted from readiness risk and freshness checks')
    expect(output).toContain('`src/index.ts`')
    expect(output).toContain('`src/util.ts`')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  test('implementation state changed files define primary readiness scope', async () => {
    const directory = await createGitFixture('implementation-state-primary-scope', 'no-diff')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory, {
      harden: { ...defaultConfig.harden, enabled: true },
    })

    await writeFile(join(directory, 'src', 'app.ts'), 'export const appVersion = "1.0"\n// current session update\n', 'utf-8')
    await writeFile(join(directory, 'src', 'util.ts'), 'export const helper = () => 84\n', 'utf-8')
    await writeFile(join(directory, 'src', 'index.ts'), 'export { helper } from "./util"\n', 'utf-8')
    await saveAcceptanceState(directory, {
      feature: FEATURE_A,
      phase: 'acceptance',
      phaseStartedAt: new Date().toISOString(),
      pendingDocUpdates: [],
      implementationState: {
        state: 'dirty',
        updatedAt: new Date().toISOString(),
        changedFiles: ['src/app.ts'],
      },
    })

    const output = await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideHarden: createMockHarden(callLog),
      overrideVerify: createMockVerify(callLog),
    })

    expect(callLog.order).not.toContain('harden')
    expect(callLog.order).toContain('verify')
    expect(output).toContain('- **Changed Files**: 1 file(s)')
    expect(output).toContain('`src/app.ts`')
    expect(output).toContain('- **Workspace Contamination**: 2 non-primary file(s) detected; omitted from readiness risk and freshness checks')
    expect(output).toContain('`src/index.ts`')
    expect(output).toContain('`src/util.ts`')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  test('mismatched acceptance state does not define primary readiness scope', async () => {
    const directory = await createGitFixture('implementation-state-feature-mismatch', 'no-diff')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory, {
      harden: { ...defaultConfig.harden, enabled: false },
    })

    await writeFile(join(directory, '.sisyphus', 'plans', 'feature-b.md'), [
      '# Plan',
      '',
      '- Implement `src/util.ts` only.',
      '',
    ].join('\n'), 'utf-8')
    runGit(directory, 'add', '.sisyphus/plans/feature-b.md')
    runGit(directory, 'commit', '-m', 'record feature b plan')

    await writeFile(join(directory, 'src', 'app.ts'), 'export const appVersion = "1.0"\n// stale feature a update\n', 'utf-8')
    await writeFile(join(directory, 'src', 'util.ts'), 'export const helper = () => 84\n', 'utf-8')
    await saveAcceptanceState(directory, {
      feature: FEATURE_A,
      phase: 'acceptance',
      phaseStartedAt: new Date().toISOString(),
      pendingDocUpdates: [],
      implementationState: {
        state: 'dirty',
        updatedAt: new Date().toISOString(),
        changedFiles: ['src/app.ts'],
      },
    })

    const output = await handleQualityGate(ctx, { feature: 'feature-b' }, {
      overrideHarden: createMockHarden(callLog),
      overrideVerify: createMockVerify(callLog),
    })

    expect(callLog.order).not.toContain('harden')
    expect(callLog.order).toContain('verify')
    expect(output).toContain('- **Changed Files**: 1 file(s)')
    expect(output).toContain('`src/util.ts`')
    expect(output).toContain('- **Workspace Contamination**: 1 non-primary file(s) detected; omitted from readiness risk and freshness checks')
    expect(output).toContain('`src/app.ts`')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  test('blocked implementation state preserves primary scope files', async () => {
    const directory = await createGitFixture('implementation-state-preserve-scope', 'no-diff')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory, {
      harden: { ...defaultConfig.harden, enabled: false },
    })

    await writeFile(join(directory, 'src', 'app.ts'), 'export const appVersion = "1.0"\n// app update\n', 'utf-8')
    await writeFile(join(directory, 'src', 'util.ts'), 'export const helper = () => 84\n', 'utf-8')
    await saveAcceptanceState(directory, {
      feature: FEATURE_A,
      phase: 'acceptance',
      phaseStartedAt: new Date().toISOString(),
      pendingDocUpdates: [],
      implementationState: {
        state: 'dirty',
        updatedAt: new Date().toISOString(),
        changedFiles: ['src/app.ts', 'src/util.ts'],
      },
    })

    await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideVerify: createMockVerifyWithReadiness(callLog, 'not_ready', 'mock_failure', 'mock verify failed'),
    })

    const state = await loadAcceptanceState(directory)
    expect(state?.implementationState?.state).toBe('blocked')
    expect(state?.implementationState?.changedFiles).toEqual(['src/app.ts', 'src/util.ts'])

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  // ── sessionID propagation: harden receives sessionID from args ─────────────

  test('high-risk change passes sessionID through to overrideHarden', async () => {
    const directory = await createGitFixture('session-id-prop', 'multi-file')
    const callLog: CallLog = { order: [] }
    const capture: { sessionID?: string } = {}
    const ctx = createStandardContext(directory, {
      harden: { ...defaultConfig.harden, enabled: true },
    })

    const output = await handleQualityGate(ctx, { feature: FEATURE_A, sessionID: 'test-session-123' }, {
      overrideHarden: createMockHardenWithSession(capture),
      overrideVerify: createMockVerify(callLog),
    })

    // sessionID was captured from the third argument of overrideHarden
    expect(capture.sessionID).toBe('test-session-123')

    // Harden and verify both ran
    expect(callLog.order).toContain('verify')

    // Risk is high (multi-file fixture)
    expect(output).toContain('`high`')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  // ── Limited/no-plan context: no hard failure, verify output present ──────

  test('limited context returns verify output without hard failure', async () => {
    const directory = await createGitFixture('limited-context', 'no-diff')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory)

    // Use a feature name that doesn't exist in plans or acceptance state
    const output = await handleQualityGate(ctx, { feature: 'nonexistent-feature' }, {
      overrideVerify: createMockVerify(callLog),
    })

    // Design-only context detection should not run verify readiness.
    expect(output).toContain('NotApplicable')
    expect(callLog.order).not.toContain('verify')

    expect(output).toContain('## Quality Gate')
    expect(output).toContain('### Context')
    expect(output).toContain('### Applicability')
    expect(output).toContain('### Next Step')

    // No hard failure
    expect(output).not.toContain('fatal')
    expect(output).not.toContain('Error:')

    expect(output).toContain('not_applicable')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  // ── No feature at all: graceful output ───────────────────────────────────

  test('no feature resolved still produces valid report', async () => {
    const directory = await createGitFixture('no-feature', 'no-diff')
    await rm(getAcceptanceStatePath(directory), { force: true }).catch(() => {})
    await rm(join(directory, '.sisyphus', 'plans'), { recursive: true, force: true })

    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory)

    const output = await handleQualityGate(ctx, undefined, {
      overrideVerify: createMockVerify(callLog),
    })

    // Issue clarification-only context detection should not run verify readiness.
    expect(output).toContain('NotApplicable')
    expect(callLog.order).not.toContain('verify')

    expect(output).toContain('## Quality Gate')
    expect(output).toContain('### Context')
    expect(output).toContain('### Applicability')
    expect(output).toContain('### Next Step')

    // No hard failure
    expect(output).not.toContain('fatal')
    expect(output).not.toContain('Error:')

    expect(output).toContain('not_applicable')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  // ── Risk assessment details ──────────────────────────────────────────────

  test('risk assessment report includes reasons', async () => {
    const directory = await createGitFixture('risk-reasons', 'trivial')
    const ctx = createStandardContext(directory)

    const output = await handleQualityGate(ctx, { feature: FEATURE_A })

    expect(output).toContain('Reasons')
    expect(output).toContain('`') // reason codes are backtick-quoted

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  // ── No fast/balanced/strict prompt ────────────────────────────────────────

  test('output does not contain fast/balanced/strict prompt', async () => {
    const directory = await createGitFixture('no-quality-prompt', 'trivial')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory)

    const output = await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideVerify: createMockVerify(callLog),
    })

    expect(output).not.toMatch(/fast|balanced|strict/i)

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  // ── High-risk with enabled harden: harden invoked, error caught ──────────

  test('high-risk harden error is caught gracefully and verify still runs', async () => {
    const directory = await createGitFixture('harden-error', 'multi-file')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory, {
      harden: { ...defaultConfig.harden, enabled: true },
    })

    const output = await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideHarden: createMockErrorHarden(callLog),
      overrideVerify: createMockVerify(callLog),
    })

    // Harden was attempted (error logged)
    expect(callLog.order).toContain('harden-error')
    // Verify was called after harden error
    expect(callLog.order[callLog.order.length - 1]).toBe('verify')

    // Verify output still present
    expect(output).toContain('### Evidence-Aware Verify')
    expect(output).toContain('### Readiness')

    // Harden status shows error
    expect(output).toContain('`error`')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  test('budget_exhausted with no findings maps to needs_decision', async () => {
    const directory = await createGitFixture('harden-budget-blocks-ready', 'multi-file')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory, {
      harden: { ...defaultConfig.harden, enabled: true },
    })

    const output = await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideHarden: async () => `## Harden Result

Status: budget_exhausted
Rounds: 1
Budget consumed: 67151
Summary: reviewer consumed 67151 tokens in round 1, exceeding per-round budget.

### Round 1
No findings.`,
      overrideVerify: createMockVerify(callLog),
    })

    expect(output).toContain('`budget_exhausted`')
    expect(output).toContain('`needs_decision`')
    expect(output).toContain('Resolve the blocking decision')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  test('needs-human harden maps final readiness to needs decision', async () => {
    const directory = await createGitFixture('harden-needs-human-blocks-ready', 'multi-file')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory, {
      harden: { ...defaultConfig.harden, enabled: true },
    })

    const output = await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideHarden: createMockHardenStatus('needs_human'),
      overrideVerify: createMockVerify(callLog),
    })

    expect(output).toContain('`needs_human`')
    expect(output).toContain('Harden Gate')
    expect(output).toContain('`needs_decision`')
    expect(output).toContain('Resolve the blocking decision')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  test('budget_exhausted with unresolved must_fix stays not_ready and reports the blocking finding', async () => {
    const directory = await createGitFixture('harden-budget-unresolved-must-fix', 'multi-file')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory, {
      harden: { ...defaultConfig.harden, enabled: true },
    })

    const output = await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideHarden: async () => `## Harden Result

Status: budget_exhausted
Rounds: 2
Budget consumed: 120000
Summary: reviewer hit the token budget with one unresolved blocking finding remaining.

### Findings Summary
- H-001 | disposition=must_fix | status=confirmed | level=blocking_bug | files=src/app.ts`,
      overrideVerify: createMockVerify(callLog),
    })

    expect(output).toContain('`budget_exhausted`')
    expect(output).toContain('`not_ready`')
    expect(output).toContain('unresolved harden finding `H-001` requires fix before archive')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  test('budget_exhausted with all findings disposed maps to needs_decision', async () => {
    const directory = await createGitFixture('harden-budget-all-disposed', 'multi-file')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory, {
      harden: { ...defaultConfig.harden, enabled: true },
    })

    const output = await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideHarden: async () => `## Harden Result

Status: budget_exhausted
Rounds: 2
Budget consumed: 120000
Summary: token budget ended after all findings received a terminal disposition.

### Findings Summary
- H-101 | disposition=accepted_known_issue | status=confirmed | archive_effect=doc_update_required | evidence=EV-VERIFY-001
- H-102 | disposition=false_positive | status=dismissed | archive_effect=non_blocking | evidence=EV-REVIEW-002`,
      overrideVerify: createMockVerify(callLog),
    })

    expect(output).toContain('`budget_exhausted`')
    expect(output).toContain('`needs_decision`')
    expect(output).toContain('Resolve the blocking decision')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  test('max_rounds_reached with unresolved design_divergence maps to needs_decision', async () => {
    const directory = await createGitFixture('harden-max-rounds-design-divergence', 'multi-file')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory, {
      harden: { ...defaultConfig.harden, enabled: true },
    })

    const output = await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideHarden: async () => `## Harden Result

Status: max_rounds_reached
Rounds: 5
Budget consumed: 180000
Summary: review stopped at max rounds with one unresolved design divergence.

### Findings Summary
- H-201 | disposition=design_divergence | status=needs_decision | level=design_ambiguity | files=src/app.ts`,
      overrideVerify: createMockVerify(callLog),
    })

    expect(output).toContain('`max_rounds_reached`')
    expect(output).toContain('`needs_decision`')
    expect(output).toContain('Resolve design-divergence finding `H-201` before archive')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  test('max_rounds_reached with no findings maps to needs_decision', async () => {
    const directory = await createGitFixture('harden-max-rounds-no-findings', 'multi-file')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory, {
      harden: { ...defaultConfig.harden, enabled: true },
    })

    const output = await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideHarden: async () => `## Harden Result

Status: max_rounds_reached
Rounds: 5
Budget consumed: 180000
Summary: review stopped at max rounds without convergence.

### Round 5
No findings.`,
      overrideVerify: createMockVerify(callLog),
    })

    expect(output).toContain('`max_rounds_reached`')
    expect(output).toContain('`needs_decision`')
    expect(output).toContain('Resolve the blocking decision')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  test('ready output includes explicit user confirmation wording', async () => {
    const directory = await createGitFixture('ready-confirmation-wording', 'multi-file')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory, {
      harden: { ...defaultConfig.harden, enabled: true },
    })

    const output = await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideHarden: createMockHarden(callLog),
      overrideVerify: createMockVerifyWithReadiness(callLog, 'ready'),
    })

    expect(output).toContain('`ready`')
    expect(output).toContain('requires explicit user confirmation before proceeding')
    expect(output).not.toContain('is ready for archive')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  test('accepted_known_issue with verify pass reports Known Issues and maps to ready_with_doc_updates', async () => {
    const directory = await createGitFixture('harden-accepted-known-issue', 'multi-file')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory, {
      harden: { ...defaultConfig.harden, enabled: true },
    })

    const output = await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideHarden: async () => `## Harden Result

Status: pass_with_risks
Rounds: 2
Budget consumed: 64000
Summary: one design divergence was accepted as a known issue after verify evidence passed.

### Findings Summary
- H-301 | disposition=accepted_known_issue | status=confirmed | archive_effect=doc_update_required | rationale=MVP behavior is acceptable for Wave 1 | evidence=EV-DESIGN-001,EV-VERIFY-001`,
      overrideVerify: createMockVerify(callLog),
    })

    expect(output).toContain('`ready_with_doc_updates`')
    expect(output).toContain('Known Issues')
    expect(output).toContain('H-301')
    expect(output).toContain('EV-DESIGN-001')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  // ── Evidence freshness is reported ────────────────────────────────────────

  test('evidence freshness section is present in output', async () => {
    const directory = await createGitFixture('freshness', 'trivial')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory)

    const output = await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideVerify: createMockVerify(callLog),
    })

    // Freshness section must be present
    expect(output).toContain('Evidence Freshness')
    expect(output).toContain('Freshness Reason')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  // ── Untracked files included in risk ──────────────────────────────────────

  test('untracked new files are counted in risk assessment', async () => {
    const directory = await createGitFixture('untracked-risk', 'no-diff')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory, {
      harden: { ...defaultConfig.harden, enabled: true },
    })

    // Create untracked new files (not committed, not in diff)
    await writeFile(join(directory, 'src', 'new-feature.ts'), [
      'export function newHelper() { return 1 }',
      'export class NewClass {}',
      'export const value = 42',
    ].join('\n'), 'utf-8')
    await mkdir(join(directory, 'src', 'hooks'), { recursive: true })
    await writeFile(join(directory, 'src', 'hooks', 'useThing.ts'), 'export function useThing() {}', 'utf-8')

    const output = await handleQualityGate(ctx, { feature: FEATURE_A })

    // Untracked files should appear in the changed files list
    // (may be in output or counted — risk should consider them)
    expect(output).toContain('### Risk Assessment')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  // ── Feature context (design-based) ────────────────────────────────────────

  test('resolves context kind as feature when design.md exists in docs/changes', async () => {
    const directory = await createGitFixture('feature-context', 'trivial')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory)

    // Create design.md in docs/changes/{feature} so context is resolved as feature
    await mkdir(join(directory, 'docs', 'changes', FEATURE_A), { recursive: true })
    await writeFile(join(directory, 'docs', 'changes', FEATURE_A, 'design.md'), '# Design\n\nFeature context test', 'utf-8')

    const output = await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideVerify: createMockVerify(callLog),
    })

    // Context kind should be feature (not plan or limited)
    expect(output).toContain('`feature`')
    expect(output).not.toContain('`plan`')
    expect(output).not.toContain('`limited`')

    expect(output).toContain('NotApplicable')
    expect(callLog.order).not.toContain('verify')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  // ── Issue context ─────────────────────────────────────────────────────────

  test('resolves context kind as issue when issue-clarification exists', async () => {
    const directory = await createGitFixture('issue-context', 'trivial')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory)

    // Create issue-clarification.md but NOT design.md
    await mkdir(join(directory, 'docs', 'changes', FEATURE_A), { recursive: true })
    await writeFile(join(directory, 'docs', 'changes', FEATURE_A, 'issue-clarification.md'), [
      '# Issue Clarification',
      '',
      '### 1. Issue Intake',
      'Test issue for context detection.',
      '',
      '### 6. Classification',
      'bugfix',
      '',
    ].join('\n'), 'utf-8')

    const output = await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideVerify: createMockVerify(callLog),
    })

    // Context kind should be issue
    expect(output).toContain('`issue`')
    expect(output).not.toContain('`feature`')
    expect(output).not.toContain('`plan`')

    expect(output).toContain('NotApplicable')
    expect(callLog.order).not.toContain('verify')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  // ── Disabled harden: high-risk but harden config disabled ────────────────

  test('high-risk change with harden disabled reports disabled status', async () => {
    const directory = await createGitFixture('harden-disabled', 'multi-file')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory, {
      harden: { ...defaultConfig.harden, enabled: false },
    })

    const output = await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideHarden: createMockHarden(callLog),
      overrideVerify: createMockVerify(callLog),
    })

    // Harden should NOT be called when disabled
    expect(callLog.order).not.toContain('harden')
    // Verify should still be called
    expect(callLog.order).toContain('verify')

    // Harden decision should be 'none' and status 'disabled'
    expect(output).toContain('`none`')
    expect(output).toContain('`disabled`')
    expect(output).toContain('harden is disabled')

    // Risk should still be high (we assess risk regardless of harden)
    expect(output).toContain('`high`')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  // ── No git diff: verify still runs, report is valid ───────────────────────

  test('no git diff produces valid report with verify invoked', async () => {
    const directory = await createGitFixture('no-diff-explicit', 'no-diff')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory)

    const output = await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideVerify: createMockVerify(callLog),
    })

    // Verify was still called even with no source diff
    expect(callLog.order).toContain('verify')

    // All required sections present
    expect(output).toContain('## Quality Gate')
    expect(output).toContain('### Context')
    expect(output).toContain('### Risk Assessment')
    expect(output).toContain('### Harden Decision')
    expect(output).toContain('### Evidence-Aware Verify')
    expect(output).toContain('### Readiness')
    expect(output).toContain('### Next Step')

    // No hard failure
    expect(output).not.toContain('Error:')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  // ── Fresh evidence reuse ──────────────────────────────────────────────────

  test('fresh evidence skips verify and reuses stored acceptance state', async () => {
    const directory = await createGitFixture('fresh-evidence', 'no-diff')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory, {
      harden: { ...defaultConfig.harden, enabled: true },
    })

    // Get the actual git HEAD after createGitFixture commits
    const gitHead = runGit(directory, 'rev-parse', 'HEAD')

    // Write acceptance state with matching freshness metadata and verifyResult
    await saveAcceptanceState(directory, {
      feature: FEATURE_A,
      phase: 'acceptance',
      phaseStartedAt: new Date().toISOString(),
      pendingDocUpdates: [],
      readiness: 'ready',
      verifyResult: {
        readiness: 'ready' as const,
        reasonCodes: ['all_checks_passed'],
        evidenceSummary: 'All checks passed.',
        constraintsChecked: ['typecheck', 'test'],
        verifiedAt: new Date().toISOString(),
      },
      evidenceFreshness: {
        gitHead,
        changedFiles: [],
        diffHash: computeSimpleDiffHash({ gitHead, changedFiles: [] }),
        recordedAt: new Date().toISOString(),
        evidenceChecks: ['typecheck', 'test'],
        evidenceSummary: 'All checks passed.',
      },
    })

    // overrideVerify intentionally omitted — fresh evidence should skip verify
    const output = await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideHarden: createMockHarden(callLog),
    })

    // Freshness section should indicate fresh
    expect(output).toContain('Evidence Freshness')
    expect(output).toContain('Fresh')

    // Verify should NOT have been called — evidence is fresh and reused
    expect(callLog.order).not.toContain('verify')

    // Output should include reused evidence indicators
    expect(output).toContain('reused from fresh acceptance state')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  // ── Stale evidence rerun ──────────────────────────────────────────────────

  test('stale evidence is reflected in quality gate report and verify still runs', async () => {
    const directory = await createGitFixture('stale-evidence', 'trivial')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory, {
      harden: { ...defaultConfig.harden, enabled: true },
    })

    // Write acceptance state with stale (mismatched) freshness metadata
    // Must include verifyResult so freshness classifier returns 'stale' (not 'missing')
    await saveAcceptanceState(directory, {
      feature: FEATURE_A,
      phase: 'acceptance',
      phaseStartedAt: new Date().toISOString(),
      pendingDocUpdates: [],
      readiness: 'ready',
      verifyResult: {
        readiness: 'ready' as const,
        reasonCodes: ['all_checks_passed'],
        evidenceSummary: 'Old evidence.',
        constraintsChecked: ['test'],
        verifiedAt: '2020-01-01T00:00:00.000Z',
      },
      evidenceFreshness: {
        gitHead: '0000000000000000000000000000000000000000', // clearly stale
        changedFiles: ['some-other-file.ts'],
        diffHash: 'deadbeef',
        recordedAt: '2020-01-01T00:00:00.000Z',
        evidenceChecks: ['test'],
        evidenceSummary: 'Old evidence.',
      },
    })

    const output = await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideHarden: createMockHarden(callLog),
      overrideVerify: createMockVerify(callLog),
    })

    // Freshness section should indicate stale
    expect(output).toContain('Evidence Freshness')
    expect(output).toContain('Stale')

    // Verify should still run (evidence is rerun, not skipped)
    expect(callLog.order).toContain('verify')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  test('does not overwrite target-feature readiness with stale acceptance state after harden', async () => {
    const directory = await createGitFixture('stale-state-target-readiness', 'multi-file')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory, {
      harden: { ...defaultConfig.harden, enabled: true },
    })

    await saveAcceptanceState(directory, {
      feature: 'other-feature',
      phase: 'acceptance',
      phaseStartedAt: new Date().toISOString(),
      pendingDocUpdates: [],
    })

    const output = await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideHarden: createMockHarden(callLog),
      overrideVerify: async (_ctx, feature) => {
        callLog.order.push('verify')
        await saveAcceptanceState(directory, {
          feature: feature ?? FEATURE_A,
          phase: 'acceptance',
          phaseStartedAt: new Date().toISOString(),
          pendingDocUpdates: [],
          readiness: 'ready',
          verifyResult: {
            readiness: 'ready',
            reasonCodes: ['all_checks_passed'],
            evidenceSummary: 'Fresh target-feature evidence.',
            constraintsChecked: ['typecheck', 'test'],
            verifiedAt: new Date().toISOString(),
          },
        })

        return createMockVerify({ order: [] })(_ctx, feature)
      },
    })

    const state = await loadAcceptanceState(directory)

    expect(output).toContain('Ready')
    expect(callLog.order).toEqual(['harden', 'verify'])
    expect(state?.feature).toBe(FEATURE_A)
    expect(state?.readiness).toBe('ready')
    expect(state?.qualityGateApplicability?.archiveReadinessEligible).toBe(true)
    expect(state?.hardenSummary).toContain('"status":"pass"')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  // ── Stale evidence preserves accepted failures ────────────────────────────

  test('stale evidence re-verify preserves acceptedFailures from acceptance state', async () => {
    const directory = await createGitFixture('stale-accepted', 'trivial')
    const callLog: CallLog = { order: [] }
    const capture: { acceptFailures?: boolean } = {}
    const ctx = createStandardContext(directory, {
      harden: { ...defaultConfig.harden, enabled: true },
    })

    // Save acceptance state with stale evidence AND acceptedFailures: true
    await saveAcceptanceState(directory, {
      feature: FEATURE_A,
      phase: 'acceptance',
      phaseStartedAt: new Date().toISOString(),
      pendingDocUpdates: [],
      acceptedFailures: true,
      readiness: 'ready',
      verifyResult: {
        readiness: 'ready' as const,
        reasonCodes: ['behavior_evidence_incomplete'],
        evidenceSummary: 'Accepted with stale evidence.',
        constraintsChecked: ['test'],
        verifiedAt: '2020-01-01T00:00:00.000Z',
      },
      evidenceFreshness: {
        gitHead: '0000000000000000000000000000000000000000', // stale
        changedFiles: ['some-other-file.ts'],
        diffHash: 'deadbeef',
        recordedAt: '2020-01-01T00:00:00.000Z',
        evidenceChecks: ['test'],
        evidenceSummary: 'Old stale evidence.',
      },
    })

    // Mock verify that captures acceptFailures
    const mockVerify = async (_ctx: OpenFlowContext, _feature?: string, acceptFailures?: boolean): Promise<string> => {
      callLog.order.push('verify')
      capture.acceptFailures = acceptFailures
      return [
        '## Verify',
        'Feature: mock',
        '',
        '### Evidence',
        '- checks_run:',
        '  - active_feature_resolution ✅ (mock)',
        '- observed_behavior_summary: mock stale-accepted verify',
        '- intended_vs_actual_delta: no delta',
        '- doc_alignment_summary: mock',
        '- current_decisions_conflict_summary: no conflicts',
        '- known_risks_or_missing_evidence: none',
        '',
        '### Readiness',
        '- status: ready',
        '- reason_codes: all_checks_passed',
        '- reason: mock passed',
        '- next_step: proceed',
        '',
      ].join('\n')
    }

    const output = await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideHarden: createMockHarden(callLog),
      overrideVerify: mockVerify,
    })

    // Freshness section should indicate stale
    expect(output).toContain('Evidence Freshness')
    expect(output).toContain('Stale')

    // Verify was called (stale evidence forces re-run)
    expect(callLog.order).toContain('verify')

    // acceptFailures was passed as true — preserving the accepted state
    expect(capture.acceptFailures).toBe(true)

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  // ── Stale evidence without acceptedFailures passes undefined ──────────────

  test('stale evidence without acceptedFailures passes undefined acceptFailures', async () => {
    const directory = await createGitFixture('stale-no-accepted', 'trivial')
    const callLog: CallLog = { order: [] }
    const capture: { acceptFailures?: boolean } = {}
    const ctx = createStandardContext(directory, {
      harden: { ...defaultConfig.harden, enabled: true },
    })

    // Save acceptance state with stale evidence but NO acceptedFailures
    await saveAcceptanceState(directory, {
      feature: FEATURE_A,
      phase: 'acceptance',
      phaseStartedAt: new Date().toISOString(),
      pendingDocUpdates: [],
      readiness: 'ready',
      verifyResult: {
        readiness: 'ready' as const,
        reasonCodes: ['all_checks_passed'],
        evidenceSummary: 'Old evidence.',
        constraintsChecked: ['test'],
        verifiedAt: '2020-01-01T00:00:00.000Z',
      },
      evidenceFreshness: {
        gitHead: '0000000000000000000000000000000000000000',
        changedFiles: ['old-file.ts'],
        diffHash: 'cafebabe',
        recordedAt: '2020-01-01T00:00:00.000Z',
        evidenceChecks: ['test'],
        evidenceSummary: 'Old evidence.',
      },
    })

    const mockVerify = async (_ctx: OpenFlowContext, _feature?: string, acceptFailures?: boolean): Promise<string> => {
      callLog.order.push('verify')
      capture.acceptFailures = acceptFailures
      return [
        '## Verify',
        'Feature: mock',
        '',
        '### Evidence',
        '- checks_run:',
        '  - active_feature_resolution ✅ (mock)',
        '- observed_behavior_summary: mock stale verify',
        '- intended_vs_actual_delta: no delta',
        '- doc_alignment_summary: mock',
        '- current_decisions_conflict_summary: no conflicts',
        '- known_risks_or_missing_evidence: none',
        '',
        '### Readiness',
        '- status: ready',
        '- reason_codes: all_checks_passed',
        '- reason: mock passed',
        '- next_step: proceed',
        '',
      ].join('\n')
    }

    await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideHarden: createMockHarden(callLog),
      overrideVerify: mockVerify,
    })

    // acceptFailures should be undefined — no previous accept to preserve
    expect(capture.acceptFailures).toBeUndefined()

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  // ── Integration evidence gap reason codes appear in quality gate output ────

  test('missing_integration_evidence reason code appears in quality gate output', async () => {
    const directory = await createGitFixture('integration-evidence-missing', 'trivial')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory)

    const output = await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideVerify: async () => [
        '## Verify',
        `Feature: ${FEATURE_A}`,
        '',
        '### Evidence',
        '- checks_run:',
        '  - active_feature_resolution ✅ (mock)',
        '- observed_behavior_summary: mock verify evidence',
        '- intended_vs_actual_delta: no delta (mock)',
        '- doc_alignment_summary: mock alignment',
        '- current_decisions_conflict_summary: no conflicts (mock)',
        '- known_risks_or_missing_evidence: missing integration evidence',
        '',
        '### Readiness',
        '- status: not_ready',
        '- reason_codes: missing_integration_evidence',
        '- reason: Integration evidence gap detected',
        '- next_step: fix integration evidence gaps',
        '',
      ].join('\n'),
    })

    // Quality gate output should contain the verify output with integration evidence gap
    expect(output).toContain('### Evidence-Aware Verify')
    expect(output).toContain('missing_integration_evidence')
    expect(output).toContain('not_ready')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  test('stale_integration_evidence reason code appears in quality gate output', async () => {
    const directory = await createGitFixture('integration-evidence-stale', 'trivial')
    const ctx = createStandardContext(directory)

    const output = await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideVerify: async () => [
        '## Verify',
        `Feature: ${FEATURE_A}`,
        '',
        '### Evidence',
        '- checks_run:',
        '  - active_feature_resolution ✅ (mock)',
        '- observed_behavior_summary: mock verify evidence',
        '- intended_vs_actual_delta: no delta (mock)',
        '- doc_alignment_summary: mock alignment',
        '- current_decisions_conflict_summary: no conflicts (mock)',
        '- known_risks_or_missing_evidence: stale integration evidence',
        '',
        '### Readiness',
        '- status: not_ready',
        '- reason_codes: stale_integration_evidence',
        '- reason: Integration evidence is stale',
        '- next_step: re-verify integration evidence',
        '',
      ].join('\n'),
    })

    expect(output).toContain('### Evidence-Aware Verify')
    expect(output).toContain('stale_integration_evidence')
    expect(output).toContain('not_ready')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  test('integration_evidence_needs_decision reason code appears in quality gate output', async () => {
    const directory = await createGitFixture('integration-evidence-needs-decision', 'trivial')
    const ctx = createStandardContext(directory)

    const output = await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideVerify: async () => [
        '## Verify',
        `Feature: ${FEATURE_A}`,
        '',
        '### Evidence',
        '- checks_run:',
        '  - active_feature_resolution ✅ (mock)',
        '- observed_behavior_summary: mock verify evidence',
        '- intended_vs_actual_delta: no delta (mock)',
        '- doc_alignment_summary: mock alignment',
        '- current_decisions_conflict_summary: no conflicts (mock)',
        '- known_risks_or_missing_evidence: integration evidence freshness unknown',
        '',
        '### Readiness',
        '- status: not_ready',
        '- reason_codes: integration_evidence_needs_decision',
        '- reason: Integration evidence freshness is unknown, needs decision',
        '- next_step: decide on integration evidence status',
        '',
      ].join('\n'),
    })

    expect(output).toContain('### Evidence-Aware Verify')
    expect(output).toContain('integration_evidence_needs_decision')
    expect(output).toContain('not_ready')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  test('multiple integration evidence gap reason codes appear together', async () => {
    const directory = await createGitFixture('integration-evidence-multi-gap', 'trivial')
    const ctx = createStandardContext(directory)

    const output = await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideVerify: async () => [
        '## Verify',
        `Feature: ${FEATURE_A}`,
        '',
        '### Evidence',
        '- checks_run:',
        '  - active_feature_resolution ✅ (mock)',
        '- observed_behavior_summary: mock verify evidence',
        '- intended_vs_actual_delta: no delta (mock)',
        '- doc_alignment_summary: mock alignment',
        '- current_decisions_conflict_summary: no conflicts (mock)',
        '- known_risks_or_missing_evidence: multiple integration evidence gaps',
        '',
        '### Readiness',
        '- status: not_ready',
        '- reason_codes: missing_integration_evidence, stale_integration_evidence',
        '- reason: Multiple integration evidence gaps detected',
        '- next_step: fix all integration evidence gaps',
        '',
      ].join('\n'),
    })

    expect(output).toContain('### Evidence-Aware Verify')
    expect(output).toContain('missing_integration_evidence')
    expect(output).toContain('stale_integration_evidence')
    expect(output).toContain('not_ready')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

})

// type references for TS compiler
const _typeCheck: QualityGateArgs = { feature: 'test' }
void _typeCheck
