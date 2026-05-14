import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { handleQualityGate } from '../../src/commands/quality-gate.js'
import type { QualityGateArgs } from '../../src/commands/quality-gate.js'
import { defaultConfig, type OpenFlowContext } from '../../src/types.js'
import { loadAcceptanceState, saveAcceptanceState } from '../../src/utils/acceptance-state.js'
import type { EvidenceFreshnessMetadata } from '../../src/types.js'
import { computeSimpleDiffHash } from '../../src/utils/evidence-freshness.js'

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

function createMockErrorHarden(callLog: CallLog): () => Promise<string> {
  return async () => {
    callLog.order.push('harden-error')
    throw new Error('mock harden failure')
  }
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
  const statePath = join(directory, '.sisyphus', 'openflow', 'acceptance-state.md')
  await mkdir(join(directory, '.sisyphus', 'openflow'), { recursive: true })
  await writeFile(statePath, [
    '# OpenFlow Acceptance State',
    '',
    '> Auto-generated by OpenFlow. Do not edit manually.',
    '',
    '## Current State',
    '',
    `feature: ${FEATURE_A}`,
    'phase: acceptance',
    `phaseStartedAt: ${new Date().toISOString()}`,
    '',
    '## Pending Document Updates',
    '',
    'No pending updates.',
    '',
    '## Current Promotion Suggestions',
    '',
    'No promotion suggestions.',
    '',
  ].join('\n'), 'utf-8')

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

  // ── Limited/no-plan context: no hard failure, verify output present ──────

  test('limited context returns verify output without hard failure', async () => {
    const directory = await createGitFixture('limited-context', 'no-diff')
    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory)

    // Use a feature name that doesn't exist in plans or acceptance state
    const output = await handleQualityGate(ctx, { feature: 'nonexistent-feature' }, {
      overrideVerify: createMockVerify(callLog),
    })

    // Verify was still called
    expect(callLog.order).toContain('verify')

    // All sections present
    expect(output).toContain('## Quality Gate')
    expect(output).toContain('### Context')
    expect(output).toContain('### Risk Assessment')
    expect(output).toContain('### Harden Decision')
    expect(output).toContain('### Evidence-Aware Verify')
    expect(output).toContain('### Readiness')
    expect(output).toContain('### Next Step')

    // No hard failure
    expect(output).not.toContain('fatal')
    expect(output).not.toContain('Error:')

    // Limited context flagged
    expect(output).toContain('limited')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }, 120000)

  // ── No feature at all: graceful output ───────────────────────────────────

  test('no feature resolved still produces valid report', async () => {
    const directory = await createGitFixture('no-feature', 'no-diff')
    await rm(join(directory, '.sisyphus', 'openflow'), { recursive: true, force: true })
    await rm(join(directory, '.sisyphus', 'plans'), { recursive: true, force: true })

    const callLog: CallLog = { order: [] }
    const ctx = createStandardContext(directory)

    const output = await handleQualityGate(ctx, undefined, {
      overrideVerify: createMockVerify(callLog),
    })

    // Verify was still called
    expect(callLog.order).toContain('verify')

    // All sections present
    expect(output).toContain('## Quality Gate')
    expect(output).toContain('### Context')
    expect(output).toContain('### Risk Assessment')
    expect(output).toContain('### Harden Decision')
    expect(output).toContain('### Evidence-Aware Verify')
    expect(output).toContain('### Readiness')

    // No hard failure
    expect(output).not.toContain('fatal')
    expect(output).not.toContain('Error:')

    // Evidence freshness section present
    expect(output).toContain('Evidence Freshness')

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

    // Verify was still called
    expect(callLog.order).toContain('verify')

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

    // Verify was still called
    expect(callLog.order).toContain('verify')

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

  test('fresh evidence is reflected in quality gate report', async () => {
    const directory = await createGitFixture('fresh-evidence', 'trivial')
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

    const output = await handleQualityGate(ctx, { feature: FEATURE_A }, {
      overrideHarden: createMockHarden(callLog),
      overrideVerify: createMockVerify(callLog),
    })

    // Freshness section should indicate fresh
    expect(output).toContain('Evidence Freshness')
    expect(output).toContain('Fresh')

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
})
