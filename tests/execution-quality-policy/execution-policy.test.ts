import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { join } from 'node:path'
import { mkdir, rm, readFile, writeFile } from 'node:fs/promises'
import {
  loadExecutionPolicy,
  saveExecutionPolicy,
  createDefaultPolicy,
} from '../../src/utils/execution-policy.js'
import type { ExecutionQualityPolicy } from '../../src/types.js'

const TMP_DIR = join(import.meta.dir, '__tmp_execution_policy__')

function makePolicy(overrides?: Partial<ExecutionQualityPolicy>): ExecutionQualityPolicy {
  return {
    feature: 'test-feature',
    plan_name: 'test-plan',
    executor: 'opencode',
    quality_mode: 'balanced',
    harden_policy: 'none',
    verify_policy: 'standard',
    selected_at: new Date().toISOString(),
    selected_by: 'user',
    ...overrides,
  }
}

describe('execution-policy', () => {
  beforeEach(async () => {
    await mkdir(TMP_DIR, { recursive: true })
  })

  afterEach(async () => {
    await rm(TMP_DIR, { recursive: true, force: true }).catch(() => {})
  })

  test('save and load round-trip', async () => {
    const policy = makePolicy()
    await saveExecutionPolicy(TMP_DIR, policy)

    const loaded = await loadExecutionPolicy(TMP_DIR, 'test-feature')
    expect(loaded).not.toBeNull()
    expect(loaded!.feature).toBe('test-feature')
    expect(loaded!.plan_name).toBe('test-plan')
    expect(loaded!.quality_mode).toBe('balanced')
    expect(loaded!.selected_by).toBe('user')
  })

  test('returns null when file is missing', async () => {
    const result = await loadExecutionPolicy(TMP_DIR, 'test-feature')
    expect(result).toBeNull()
  })

  test('returns null when feature does not match', async () => {
    const policy = makePolicy({ feature: 'other-feature' })
    await saveExecutionPolicy(TMP_DIR, policy)

    const result = await loadExecutionPolicy(TMP_DIR, 'test-feature')
    expect(result).toBeNull()
  })

  test('returns null for corrupt JSON', async () => {
    const policyDir = join(TMP_DIR, '.sisyphus', 'openflow')
    await mkdir(policyDir, { recursive: true })
    await writeFile(join(policyDir, 'execution-policy.json'), 'not valid json{{{')

    const result = await loadExecutionPolicy(TMP_DIR, 'test-feature')
    expect(result).toBeNull()
  })

  test('returns null for valid JSON missing required fields', async () => {
    const policyDir = join(TMP_DIR, '.sisyphus', 'openflow')
    await mkdir(policyDir, { recursive: true })
    await writeFile(join(policyDir, 'execution-policy.json'), JSON.stringify({ feature: 'test' }))

    const result = await loadExecutionPolicy(TMP_DIR, 'test-feature')
    expect(result).toBeNull()
  })

  test('saveExecutionPolicy creates .sisyphus/openflow directory if missing', async () => {
    const policy = makePolicy()
    await saveExecutionPolicy(TMP_DIR, policy)

    const raw = await readFile(
      join(TMP_DIR, '.sisyphus', 'openflow', 'execution-policy.json'),
      'utf-8'
    )
    const parsed = JSON.parse(raw)
    expect(parsed.feature).toBe('test-feature')
  })

  test('createDefaultPolicy returns valid policy with current timestamp', async () => {
    const before = new Date().toISOString()
    const policy = createDefaultPolicy('my-feature', 'my-plan', 'strict')
    const after = new Date().toISOString()

    expect(policy.feature).toBe('my-feature')
    expect(policy.plan_name).toBe('my-plan')
    expect(policy.quality_mode).toBe('strict')
    expect(policy.selected_by).toBe('user')
    expect(policy.selected_at >= before).toBe(true)
    expect(policy.selected_at <= after).toBe(true)
  })

  test('createDefaultPolicy with fast mode', async () => {
    const policy = createDefaultPolicy('fast-feat', 'fast-plan', 'fast')
    expect(policy.quality_mode).toBe('fast')
    expect(policy.feature).toBe('fast-feat')
  })
})
