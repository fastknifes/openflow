import { describe, expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { checkImplementationGuard } from '../../src/hooks/implementation-guard.js'
import { defaultConfig, type OpenFlowContext } from '../../src/types.js'
import { implementationRunStore } from '../../src/utils/implementation-run.js'

function uniqueTestDir(name: string): string {
  return join(process.cwd(), `.tmp-implementation-guard-${name}-${randomUUID()}`)
}

function createContext(directory: string): OpenFlowContext {
  return {
    directory,
    worktree: directory,
    client: {},
    $: {},
    config: { ...defaultConfig },
    enhancedPlans: new Set<string>(),
  }
}

async function cleanupDir(testDir: string): Promise<void> {
  await rm(testDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
}

async function writePlan(ctx: OpenFlowContext, feature: string): Promise<void> {
  const plansDir = join(ctx.directory, ctx.config.paths.plans)
  await mkdir(plansDir, { recursive: true })
  await writeFile(join(plansDir, `${feature}.md`), '# Implementation Plan\n', 'utf-8')
}

async function createActiveRun(ctx: OpenFlowContext, feature: string, sessionID: string): Promise<void> {
  await implementationRunStore.createRun(ctx, {
    feature,
    sessionID,
    messageID: 'test-message',
    agent: 'test-agent',
    directory: ctx.directory,
    backend: 'opencode',
    backendCommand: 'opencode build',
    status: 'running',
    containerMode: 'session',
    eventsPath: join('.sisyphus', 'openflow', 'events', `${feature}.jsonl`),
    observationsPath: join('.sisyphus', 'openflow', 'observations', `${feature}.jsonl`),
  })
}

describe('checkImplementationGuard', () => {
  test('does not block when no plan file exists', async () => {
    const testDir = uniqueTestDir('no-plan')
    try {
      await mkdir(testDir, { recursive: true })
      const ctx = createContext(testDir)

      const result = await checkImplementationGuard({
        ctx,
        tool: 'write',
        sessionID: 'session-1',
      })

      expect(result.blocked).toBe(false)
    } finally {
      await cleanupDir(testDir)
    }
  })

  test('blocks implementation tool when plan exists without active run', async () => {
    const testDir = uniqueTestDir('blocked')
    const feature = 'demo-feature'
    try {
      await mkdir(testDir, { recursive: true })
      const ctx = createContext(testDir)
      await writePlan(ctx, feature)

      const result = await checkImplementationGuard({
        ctx,
        tool: 'write',
        sessionID: 'session-1',
      })

      expect(result.blocked).toBe(true)
      expect(result.feature).toBe(feature)
      expect(result.message).toContain('## Implementation Blocked')
      expect(result.message).toContain(`/openflow-implement ${feature}`)
    } finally {
      await cleanupDir(testDir)
    }
  })

  test('does not block read-only action when plan exists without active run', async () => {
    const testDir = uniqueTestDir('read-only')
    try {
      await mkdir(testDir, { recursive: true })
      const ctx = createContext(testDir)
      await writePlan(ctx, 'demo-feature')

      const result = await checkImplementationGuard({
        ctx,
        tool: 'read',
        sessionID: 'session-1',
      })

      expect(result.blocked).toBe(false)
    } finally {
      await cleanupDir(testDir)
    }
  })

  test('does not block implementation tool when active run exists', async () => {
    const testDir = uniqueTestDir('active-run')
    const feature = 'demo-feature'
    const sessionID = 'session-1'
    try {
      await mkdir(testDir, { recursive: true })
      const ctx = createContext(testDir)
      await writePlan(ctx, feature)
      await createActiveRun(ctx, feature, sessionID)

      const result = await checkImplementationGuard({
        ctx,
        tool: 'write',
        sessionID,
      })

      expect(result.blocked).toBe(false)
    } finally {
      await cleanupDir(testDir)
    }
  })

  test('returns clear block message for unknown task fields with implementation prompt', async () => {
    const testDir = uniqueTestDir('unknown-fields')
    const feature = 'demo-feature'
    try {
      await mkdir(testDir, { recursive: true })
      const ctx = createContext(testDir)
      await writePlan(ctx, feature)

      const result = await checkImplementationGuard({
        ctx,
        tool: 'task',
        taskArgs: {
          prompt: 'Implement the planned code change',
          unknownFlag: true,
        },
        sessionID: 'session-1',
      })

      expect(result.blocked).toBe(true)
      expect(result.message).toContain('Before implementing, start an implementation run:')
      expect(result.message).toContain(`/openflow-implement ${feature}`)
    } finally {
      await cleanupDir(testDir)
    }
  })
})
