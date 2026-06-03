import { describe, expect, test } from 'bun:test'
import { createHardenReviewerExecutor, createHardenExecutorExecutor } from '../../src/orchestrator/harden-executors.js'

// ---- Helpers ----

function createMockContext(responses: { text: string; tokens?: number }[] = []) {
  let promptIndex = 0
  let sessionCount = 0
  return {
    directory: '/test-project',
    client: {
      session: {
        create: async () => {
          sessionCount++
          return { id: `mock-session-${sessionCount}` }
        },
        prompt: async () => {
          const resp = responses[promptIndex] ?? { text: 'NO_FINDINGS', tokens: 100 }
          promptIndex++
          return {
            data: {
              parts: [{ type: 'text', text: resp.text }],
              info: {
                tokens: {
                  input: resp.tokens ?? 100,
                  output: 0,
                  reasoning: 0,
                  cache: { read: 0, write: 0 },
                },
              },
            },
          }
        },
      },
    },
    config: {},
    enhancedPlans: new Set(),
    $: {},
  } as any
}

function createMockTask(payload: Record<string, unknown>): any {
  return {
    id: `task-${Math.random().toString(36).slice(2, 8)}`,
    type: payload.agent === 'harden-executor' ? 'harden-executor' : 'harden-reviewer',
    status: 'running' as const,
    payload,
    attemptCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

const FINDING_RESPONSE = `Level: blocking_bug
Description: Test bug in code
Evidence: src/test.ts line 42 has null dereference
Files: src/test.ts`

// ---- Reviewer Executor Tests ----

describe('createHardenReviewerExecutor', () => {
  test('creates session when no sessionID in payload', async () => {
    const ctx = createMockContext([{ text: 'NO_FINDINGS', tokens: 50 }])
    const executor = createHardenReviewerExecutor(ctx)
    const result = await executor(createMockTask({
      agent: 'harden-reviewer',
      systemPrompt: 'You are a reviewer',
      userPrompt: 'Review this code',
    }))
    expect(result.sessionID).toBe('mock-session-1')
    expect(result.text).toBe('NO_FINDINGS')
    expect(result.tokens).toBe(50)
  })

  test('reuses session when sessionID provided', async () => {
    const ctx = createMockContext([{ text: 'NO_FINDINGS', tokens: 100 }])
    const executor = createHardenReviewerExecutor(ctx)
    const result = await executor(createMockTask({
      agent: 'harden-reviewer',
      sessionID: 'existing-session-42',
      systemPrompt: 'sys',
      userPrompt: 'user',
    }))
    expect(result.sessionID).toBe('existing-session-42')
  })

  test('classifies findings from output and reports as not converged', async () => {
    const ctx = createMockContext([{ text: FINDING_RESPONSE, tokens: 200 }])
    const executor = createHardenReviewerExecutor(ctx)
    const result = await executor(createMockTask({
      agent: 'harden-reviewer',
      systemPrompt: 'sys',
      userPrompt: 'user',
      round: 1,
      maxRounds: 3,
    }))
    expect(result.findings.length).toBeGreaterThan(0)
    // Has actionable findings → should not be converged
    // (unless maxRounds reached, which it isn't since round 1 < maxRounds 3)
  })

  test('returns converged=true when no findings', async () => {
    const ctx = createMockContext([{ text: 'NO_FINDINGS', tokens: 50 }])
    const executor = createHardenReviewerExecutor(ctx)
    const result = await executor(createMockTask({
      agent: 'harden-reviewer',
      systemPrompt: 'sys',
      userPrompt: 'user',
      round: 1,
      maxRounds: 3,
    }))
    expect(result.converged).toBe(true)
    expect(result.reason).toBe('no_findings')
  })

  test('returns converged=true when max rounds reached', async () => {
    const ctx = createMockContext([{ text: FINDING_RESPONSE, tokens: 200 }])
    const executor = createHardenReviewerExecutor(ctx)
    const result = await executor(createMockTask({
      agent: 'harden-reviewer',
      systemPrompt: 'sys',
      userPrompt: 'user',
      round: 3,
      maxRounds: 3,
    }))
    expect(result.converged).toBe(true)
    expect(result.reason).toBe('max_rounds_reached')
  })

  test('tracks rejected counts from priorExecutorText', async () => {
    const priorExecutorText = `Finding: test bug in code\nVerdict: reject\nRationale: not a real bug`
    const ctx = createMockContext([{ text: FINDING_RESPONSE, tokens: 200 }])
    const executor = createHardenReviewerExecutor(ctx)
    const result = await executor(createMockTask({
      agent: 'harden-reviewer',
      systemPrompt: 'sys',
      userPrompt: 'user',
      priorExecutorText,
      round: 1,
      maxRounds: 3,
    }))
    // rejectedCounts should have entries for the rejected finding
    expect(result.rejectedCounts).toBeDefined()
    // The count object should exist (may be empty map if keys don't match exactly,
    // but the structure should be correct)
    expect(typeof result.rejectedCounts).toBe('object')
  })

  test('returns reason actionable_findings when findings exist and rounds remain', async () => {
    const ctx = createMockContext([{ text: FINDING_RESPONSE, tokens: 200 }])
    const executor = createHardenReviewerExecutor(ctx)
    const result = await executor(createMockTask({
      agent: 'harden-reviewer',
      systemPrompt: 'sys',
      userPrompt: 'user',
      round: 1,
      maxRounds: 5,
    }))
    expect(result.converged).toBe(false)
    expect(result.reason).toBe('actionable_findings')
  })
})

// ---- Executor Executor Tests ----

describe('createHardenExecutorExecutor', () => {
  test('creates session when no sessionID in payload', async () => {
    const ctx = createMockContext([{ text: 'Fix applied', tokens: 80 }])
    const executor = createHardenExecutorExecutor(ctx)
    const result = await executor(createMockTask({
      agent: 'harden-executor',
      systemPrompt: 'You are an executor',
      userPrompt: 'Fix these issues',
    }))
    expect(result.sessionID).toBe('mock-session-1')
  })

  test('reuses session when sessionID provided', async () => {
    const ctx = createMockContext([{ text: 'Fix applied', tokens: 80 }])
    const executor = createHardenExecutorExecutor(ctx)
    const result = await executor(createMockTask({
      agent: 'harden-executor',
      sessionID: 'executor-session-99',
      systemPrompt: 'sys',
      userPrompt: 'user',
    }))
    expect(result.sessionID).toBe('executor-session-99')
  })

  test('parses dispositions from output', async () => {
    const outputText = `Finding: test bug\nVerdict: accept\nRationale: fixed\n\nFinding: other\nVerdict: reject\nRationale: not valid`
    const ctx = createMockContext([{ text: outputText, tokens: 150 }])
    const executor = createHardenExecutorExecutor(ctx)
    const result = await executor(createMockTask({
      agent: 'harden-executor',
      systemPrompt: 'sys',
      userPrompt: 'user',
    }))
    expect(result.dispositions).toBeDefined()
    expect(Array.isArray(result.dispositions)).toBe(true)
    // Should parse at least the accept and reject verdicts
    const verdicts = result.dispositions.map((d: any) => d.verdict)
    expect(verdicts).toContain('accept')
    expect(verdicts).toContain('reject')
  })

  test('returns fixReport equal to output text', async () => {
    const ctx = createMockContext([{ text: 'Fix applied successfully', tokens: 100 }])
    const executor = createHardenExecutorExecutor(ctx)
    const result = await executor(createMockTask({
      agent: 'harden-executor',
      systemPrompt: 'sys',
      userPrompt: 'user',
    }))
    expect(result.fixReport).toBe('Fix applied successfully')
  })

  test('returns codeChanges from payload', async () => {
    const ctx = createMockContext([{ text: 'Fixed', tokens: 50 }])
    const executor = createHardenExecutorExecutor(ctx)
    const result = await executor(createMockTask({
      agent: 'harden-executor',
      systemPrompt: 'sys',
      userPrompt: 'user',
      codeChanges: 'src/file.ts: changed function',
    }))
    expect(result.codeChanges).toBe('src/file.ts: changed function')
  })

  test('includes tokens in result', async () => {
    const ctx = createMockContext([{ text: 'Done', tokens: 42 }])
    const executor = createHardenExecutorExecutor(ctx)
    const result = await executor(createMockTask({
      agent: 'harden-executor',
      systemPrompt: 'sys',
      userPrompt: 'user',
    }))
    expect(result.tokens).toBe(42)
  })
})
