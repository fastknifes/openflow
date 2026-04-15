import { describe, expect, test } from 'bun:test'
import { handleArchive } from '../../src/commands/archive.js'
import { defaultConfig, type OpenFlowContext } from '../../src/types.js'
import { join } from 'node:path'
import { mkdir, rm, writeFile, access, readFile } from 'node:fs/promises'
import { loadAcceptanceState, saveAcceptanceState } from '../../src/utils/acceptance-state.js'

function createContext(configOverride?: Partial<typeof defaultConfig>): OpenFlowContext {
  return {
    directory: process.cwd(),
    worktree: process.cwd(),
    client: {},
    $: {},
    config: {
      ...defaultConfig,
      ...configOverride,
    },
    enhancedPlans: new Set<string>(),
  }
}

describe('archive command', () => {
  test('returns disabled message when archive is disabled', async () => {
    const ctx = createContext({
      archive: {
        ...defaultConfig.archive,
        enabled: false,
      },
    })

    const result = await handleArchive(ctx, 'demo-feature')
    expect(result).toBe('Archive phase is disabled in configuration')
  })

  test('throws when feature is missing', async () => {
    const ctx = createContext()
    await expect(handleArchive(ctx, undefined)).rejects.toThrow('Feature name is required')
  })

  test('archives requirements documents when they exist', async () => {
    const testDir = join(process.cwd(), '.test-archive-requirements')
    await rm(testDir, { recursive: true, force: true })

    // Create requirements documents
    const reqDir = join(testDir, 'docs', 'current', 'requirements', 'req-feature')
    await mkdir(reqDir, { recursive: true })
    await writeFile(join(reqDir, '20260322-prd.md'), '# Requirements\n\nTest requirements document', 'utf-8')

    // Create design documents
    const designDir = join(testDir, 'docs', 'current', 'design', 'req-feature')
    await mkdir(designDir, { recursive: true })
    await writeFile(join(designDir, '20260322-design.md'), '# Design', 'utf-8')

    // Create plan
    const plansRoot = join(testDir, '.sisyphus', 'plans')
    await mkdir(plansRoot, { recursive: true })
    await writeFile(join(plansRoot, 'req-feature.md'), '# Plan', 'utf-8')

    // Create builds for file tracking
    const buildsRoot = join(testDir, '.sisyphus', 'builds')
    await mkdir(buildsRoot, { recursive: true })
    const buildDir = join(buildsRoot, 'build-20260322-000001')
    await mkdir(buildDir, { recursive: true })
    await writeFile(join(buildDir, 'changes.json'), JSON.stringify([{ filePath: 'src/req.ts', tool: 'write', timestamp: Date.now() }]), 'utf-8')

    const ctx: OpenFlowContext = {
      ...createContext(),
      directory: testDir,
      worktree: testDir,
      config: {
        ...defaultConfig,
        archive: { ...defaultConfig.archive, output_dir: 'docs/archive' },
        brainstorming: { 
          ...defaultConfig.brainstorming, 
          output_dir: 'docs/current/design',
          prd_output_dir: 'docs/current/requirements',
        },
      },
    }

    const result = await handleArchive(ctx, 'req-feature')
    expect(result).toContain('Requirements documents: ✅')

    // Verify requirements were archived
    const archivedReqPath = join(testDir, 'docs', 'archive', 'req-feature', 'requirements', '20260322-prd.md')
    const archivedReq = await readFile(archivedReqPath, 'utf-8')
    expect(archivedReq).toContain('Test requirements document')

    await rm(testDir, { recursive: true, force: true })
  })

  test('deduplicates file changes across recent builds', async () => {
    const testDir = join(process.cwd(), '.test-archive-dedupe')
    await rm(testDir, { recursive: true, force: true })

    const buildsRoot = join(testDir, '.sisyphus', 'builds')
    const plansRoot = join(testDir, '.sisyphus', 'plans')
    await mkdir(buildsRoot, { recursive: true })
    await mkdir(plansRoot, { recursive: true })

    const buildA = join(buildsRoot, 'build-20260312-000001')
    const buildB = join(buildsRoot, 'build-20260312-000002')
    await mkdir(buildA, { recursive: true })
    await mkdir(buildB, { recursive: true })

    await writeFile(
      join(buildA, 'changes.json'),
      JSON.stringify([{ filePath: 'src/shared.ts', tool: 'edit', timestamp: Date.now() }]),
      'utf-8'
    )
    await writeFile(
      join(buildB, 'changes.json'),
      JSON.stringify([
        { filePath: 'src/shared.ts', tool: 'write', timestamp: Date.now() },
        { filePath: 'src/extra.ts', tool: 'edit', timestamp: Date.now() },
      ]),
      'utf-8'
    )

    const ctx: OpenFlowContext = {
      ...createContext(),
      directory: testDir,
      worktree: testDir,
      config: {
        ...defaultConfig,
        archive: { ...defaultConfig.archive, output_dir: 'docs/archive' },
        brainstorming: { ...defaultConfig.brainstorming, output_dir: 'docs/current/design' },
      },
    }

    const result = await handleArchive(ctx, 'demo-feature')
    expect(result).toContain('**Files Changed**: 2')

    await rm(testDir, { recursive: true, force: true })
  })

  test('cleans builds older than keep window', async () => {
    const testDir = join(process.cwd(), '.test-archive-cleanup')
    await rm(testDir, { recursive: true, force: true })

    const buildsRoot = join(testDir, '.sisyphus', 'builds')
    await mkdir(buildsRoot, { recursive: true })

    const buildIds = [
      'build-20260312-000001',
      'build-20260312-000002',
      'build-20260312-000003',
      'build-20260312-000004',
      'build-20260312-000005',
      'build-20260312-000006',
      'build-20260312-000007',
    ]

    for (const buildId of buildIds) {
      const buildDir = join(buildsRoot, buildId)
      await mkdir(buildDir, { recursive: true })
      await writeFile(join(buildDir, 'changes.json'), JSON.stringify([{ filePath: `src/${buildId}.ts`, tool: 'edit' }]), 'utf-8')
    }

    const ctx: OpenFlowContext = {
      ...createContext(),
      directory: testDir,
      worktree: testDir,
      config: {
        ...defaultConfig,
        archive: { ...defaultConfig.archive, output_dir: 'docs/archive' },
        brainstorming: { ...defaultConfig.brainstorming, output_dir: 'docs/current/design' },
      },
    }

    await handleArchive(ctx, 'cleanup-feature')

    await expect(access(join(buildsRoot, 'build-20260312-000007'))).resolves.toBeNull()
    await expect(access(join(buildsRoot, 'build-20260312-000006'))).resolves.toBeNull()
    await expect(access(join(buildsRoot, 'build-20260312-000005'))).resolves.toBeNull()
    await expect(access(join(buildsRoot, 'build-20260312-000004'))).resolves.toBeNull()
    await expect(access(join(buildsRoot, 'build-20260312-000003'))).resolves.toBeNull()

    await expect(access(join(buildsRoot, 'build-20260312-000002'))).rejects.toBeDefined()
    await expect(access(join(buildsRoot, 'build-20260312-000001'))).rejects.toBeDefined()

    await rm(testDir, { recursive: true, force: true })
  })

  test('uses session phase split and writes drift section when enabled', async () => {
    const testDir = join(process.cwd(), '.test-archive-session-drift')
    await rm(testDir, { recursive: true, force: true })

    await mkdir(join(testDir, 'docs', 'current', 'design', 'session-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'current', 'design', 'session-feature', '20260312-design.md'), '# Design\n\n`OldApi`', 'utf-8')
    await mkdir(join(testDir, '.sisyphus', 'plans'), { recursive: true })
    await writeFile(join(testDir, '.sisyphus', 'plans', 'session-feature.md'), '# plan', 'utf-8')

    await mkdir(join(testDir, 'src'), { recursive: true })
    await writeFile(join(testDir, 'src', 'session-feature.ts'), 'export function NewApiFeature() {}', 'utf-8')

    await saveAcceptanceState(testDir, {
      feature: 'session-feature',
      phase: 'acceptance',
      phaseStartedAt: '2026-01-02T00:00:00.000Z',
      sessionID: 's-1',
      pendingDocUpdates: [],
    })

    const client = {
      session: {
        messages: async () => ({
          data: [
            {
              info: { role: 'assistant', id: 'm1', createdAt: '2026-01-03T00:00:00.000Z' },
              parts: [
                {
                  type: 'tool',
                  tool: 'write',
                  callID: 'c1',
                  state: { status: 'done', input: { filePath: 'src/session-feature.ts' } },
                },
              ],
            },
          ],
        }),
      },
    }

    const ctx: OpenFlowContext = {
      ...createContext(),
      directory: testDir,
      worktree: testDir,
      client,
      config: {
        ...defaultConfig,
        archive: { ...defaultConfig.archive, output_dir: 'docs/archive', drift_check: false },
        acceptance: { ...defaultConfig.acceptance, drift_detection: true },
        brainstorming: { ...defaultConfig.brainstorming, output_dir: 'docs/current/design' },
      },
    }

    await handleArchive(ctx, 'session-feature')

    const mapperPath = join(testDir, 'docs', 'archive', 'session-feature', 'implementation-mapper.md')
    const mapper = await readFile(mapperPath, 'utf-8')
    expect(mapper).toContain('src/session-feature.ts')

    const stateAfter = await loadAcceptanceState(testDir)
    expect(stateAfter?.phase).toBe('promotion_pending')
    expect(stateAfter?.promotionSuggestions).toBeDefined()

    await rm(testDir, { recursive: true, force: true })
  })

  test('applies current promotion when auto_promote_current is enabled', async () => {
    const testDir = join(process.cwd(), '.test-archive-current-promotion')
    await rm(testDir, { recursive: true, force: true })

    await mkdir(join(testDir, 'docs', 'current', 'design', 'promo-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'current', 'design', 'promo-feature', '20260301-design.md'), '# Old Design', 'utf-8')

    await mkdir(join(testDir, 'docs', 'changes', 'promo-feature', 'design'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'promo-feature', 'design', '20260325-design.md'), '# New Design', 'utf-8')
    await mkdir(join(testDir, 'docs', 'changes', 'promo-feature', 'requirements'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'promo-feature', 'requirements', '20260325-prd.md'), '# New PRD', 'utf-8')

    await mkdir(join(testDir, '.sisyphus', 'plans'), { recursive: true })
    await writeFile(join(testDir, '.sisyphus', 'plans', 'promo-feature.md'), '# plan', 'utf-8')

    const ctx: OpenFlowContext = {
      ...createContext(),
      directory: testDir,
      worktree: testDir,
      config: {
        ...defaultConfig,
        archive: { ...defaultConfig.archive, output_dir: 'docs/archive', auto_promote_current: true },
        brainstorming: { ...defaultConfig.brainstorming, output_dir: 'docs/current/design' },
      },
    }

    const result = await handleArchive(ctx, 'promo-feature')
    expect(result).toContain('Current Promotion')
    expect(result).toContain('applied: 2')

    const promotedDesign = await readFile(join(testDir, 'docs', 'current', 'design', 'promo-feature', '20260325-design.md'), 'utf-8')
    expect(promotedDesign).toContain('New Design')

    await rm(testDir, { recursive: true, force: true })
  })

  test('pauses archive when drift is detected and drift_check is enabled', async () => {
    const testDir = join(process.cwd(), '.test-archive-drift-pause')
    await rm(testDir, { recursive: true, force: true })

    await mkdir(join(testDir, 'docs', 'current', 'design', 'pause-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'current', 'design', 'pause-feature', '20260312-design.md'), '# Design\n\n`OldApi`', 'utf-8')
    await mkdir(join(testDir, '.sisyphus', 'plans'), { recursive: true })
    await writeFile(join(testDir, '.sisyphus', 'plans', 'pause-feature.md'), '# plan', 'utf-8')

    await mkdir(join(testDir, 'src'), { recursive: true })
    await writeFile(join(testDir, 'src', 'pause-feature.ts'), 'export function NewDriftApi() {}', 'utf-8')

    await saveAcceptanceState(testDir, {
      feature: 'pause-feature',
      phase: 'acceptance',
      phaseStartedAt: '2026-01-02T00:00:00.000Z',
      sessionID: 's-2',
      pendingDocUpdates: [],
    })

    const client = {
      session: {
        messages: async () => ({
          data: [
            {
              info: { role: 'assistant', id: 'm1', createdAt: '2026-01-03T00:00:00.000Z' },
              parts: [
                {
                  type: 'tool',
                  tool: 'write',
                  callID: 'c1',
                  state: { status: 'done', input: { filePath: 'src/pause-feature.ts' } },
                },
              ],
            },
          ],
        }),
      },
    }

    const ctx: OpenFlowContext = {
      ...createContext(),
      directory: testDir,
      worktree: testDir,
      client,
      config: {
        ...defaultConfig,
        archive: { ...defaultConfig.archive, output_dir: 'docs/archive', drift_check: true },
        acceptance: { ...defaultConfig.acceptance, drift_detection: true },
        brainstorming: { ...defaultConfig.brainstorming, output_dir: 'docs/current/design' },
      },
    }

    const result = await handleArchive(ctx, 'pause-feature')
    expect(result).toContain('Drift Detected')
    expect(result).toContain('Archive was paused')

    await expect(access(join(testDir, 'docs', 'archive', 'pause-feature', 'implementation-mapper.md'))).rejects.toBeDefined()

    await rm(testDir, { recursive: true, force: true })
  })
})
