import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { join } from 'node:path'
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import { detectOmoExecutionFlow } from '../../src/utils/omo-detection.js'
import {
  loadExecutionPolicy,
  saveExecutionPolicy,
  createDefaultPolicy,
} from '../../src/utils/execution-policy.js'
import { findActiveFeature } from '../../src/utils/feature-resolver.js'
import type { OpenFlowContext, QualityMode, ExecutionQualityPolicy } from '../../src/types.js'
import { defaultConfig } from '../../src/types.js'

const TMP_DIR = join(import.meta.dir, '__tmp_e2e_quality__')
const SISYPHUS_DIR = join(TMP_DIR, '.sisyphus')
const PLANS_DIR = join(SISYPHUS_DIR, 'plans')

// Re-implement the pending selection helpers locally (they are private in chat-message.ts)
const PENDING_SELECTION_FILE = join(SISYPHUS_DIR, 'openflow', 'pending-selection.json')

async function writePendingSelection(feature: string): Promise<void> {
  const dir = join(SISYPHUS_DIR, 'openflow')
  await mkdir(dir, { recursive: true })
  await writeFile(PENDING_SELECTION_FILE, JSON.stringify({ feature, timestamp: new Date().toISOString() }, null, 2), 'utf-8')
}

async function readPendingSelection(): Promise<{ feature: string; timestamp: string } | null> {
  try {
    const raw = await readFile(PENDING_SELECTION_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.feature === 'string' && typeof parsed.timestamp === 'string') {
      return parsed as { feature: string; timestamp: string }
    }
    return null
  } catch {
    return null
  }
}

async function clearPendingSelection(): Promise<void> {
  try {
    const { unlink } = await import('node:fs/promises')
    await unlink(PENDING_SELECTION_FILE)
  } catch {
    // Already gone
  }
}

function makeCtx(overrides?: Partial<OpenFlowContext>): OpenFlowContext {
  return {
    directory: TMP_DIR,
    worktree: TMP_DIR,
    client: {},
    $: {},
    config: defaultConfig,
    enhancedPlans: new Set(),
    ...overrides,
  }
}

// Helper: write boulder.json so OMO detection treats subsequent messages as 'omo'
async function writeBoulderJson(activePlan: string): Promise<void> {
  await mkdir(SISYPHUS_DIR, { recursive: true })
  await writeFile(
    join(SISYPHUS_DIR, 'boulder.json'),
    JSON.stringify({ active_plan: activePlan, version: 1 }),
  )
}

// Simulates the quality policy lifecycle logic from chat-message.ts
// without needing the full hook infrastructure.
// The `omo` flag forces OMO detection to pass (simulates boulder.json context).
async function simulateQualityPolicyFlow(
  ctx: OpenFlowContext,
  message: string,
  omo = false,
): Promise<{ prompted: boolean; policySaved: boolean; mode?: string }> {
  // If not forced OMO, run actual detection
  if (!omo) {
    const omoFlow = await detectOmoExecutionFlow(ctx, message)
    if (omoFlow !== 'omo') {
      return { prompted: false, policySaved: false }
    }
  }

  const feature = await findActiveFeature(ctx)
  if (!feature) {
    return { prompted: false, policySaved: false }
  }

  const existingPolicy = await loadExecutionPolicy(ctx.directory, feature)
  if (existingPolicy) {
    // Policy already exists — no prompt, reuse
    return { prompted: false, policySaved: false, mode: existingPolicy.quality_mode }
  }

  // Check for pending selection from a previous turn
  const pending = await readPendingSelection()

  if (pending && pending.feature === feature) {
    // Parse user reply for quality mode (same regex as chat-message.ts)
    const modeMatch = message.match(/\b(fast|balanced|strict)\b/i)
    const mode: QualityMode = modeMatch?.[1]
      ? (modeMatch[1].toLowerCase() as QualityMode)
      : 'balanced'

    // Determine harden_policy based on mode (same logic as chat-message.ts)
    const hardenPolicy = mode === 'fast' ? 'none' as const
      : mode === 'strict' ? 'final' as const
      : 'risk-based' as const

    const policy = createDefaultPolicy(feature, feature, mode)
    policy.harden_policy = hardenPolicy
    policy.selected_by = 'user'
    await saveExecutionPolicy(ctx.directory, policy)
    await clearPendingSelection()

    return { prompted: false, policySaved: true, mode }
  }

  // No policy, no pending — prompt for selection
  await writePendingSelection(feature)
  return { prompted: true, policySaved: false }
}

// Helper: create a plan file so findActiveFeature resolves
async function createPlanFile(feature: string): Promise<void> {
  await mkdir(PLANS_DIR, { recursive: true })
  await writeFile(join(PLANS_DIR, `${feature}.md`), `# Plan for ${feature}\n`)
}

describe('E2E: Execution Quality Policy Flow', () => {
  beforeEach(async () => {
    await mkdir(SISYPHUS_DIR, { recursive: true })
  })

  afterEach(async () => {
    await rm(TMP_DIR, { recursive: true, force: true }).catch(() => {})
  })

  // --- Scenario 1: Full OMO flow ---
  describe('Full OMO flow: /start-work -> prompt -> reply -> policy saved', () => {
    test('step 1: /start-work triggers prompt (no policy yet)', async () => {
      await createPlanFile('my-feature')
      const ctx = makeCtx()

      const result = await simulateQualityPolicyFlow(ctx, '/start-work')

      expect(result.prompted).toBe(true)
      expect(result.policySaved).toBe(false)

      // Pending selection file should exist
      const pending = await readPendingSelection()
      expect(pending).not.toBeNull()
      expect(pending!.feature).toBe('my-feature')
    })

    test('step 2: reply "balanced" saves policy', async () => {
      await createPlanFile('my-feature')
      const ctx = makeCtx()

      // First call: /start-work sets up pending selection
      await simulateQualityPolicyFlow(ctx, '/start-work')

      // Second call: user replies with mode choice (boulder.json provides OMO context)
      await writeBoulderJson('my-feature')
      const result = await simulateQualityPolicyFlow(ctx, 'balanced', true)

      expect(result.prompted).toBe(false)
      expect(result.policySaved).toBe(true)
      expect(result.mode).toBe('balanced')

      // Verify policy persisted
      const policy = await loadExecutionPolicy(ctx.directory, 'my-feature')
      expect(policy).not.toBeNull()
      expect(policy!.quality_mode).toBe('balanced')
      expect(policy!.harden_policy).toBe('risk-based')
      expect(policy!.selected_by).toBe('user')

      // Pending selection should be cleared
      const pending = await readPendingSelection()
      expect(pending).toBeNull()
    })

    test('step 3: next /start-work message reuses saved policy', async () => {
      await createPlanFile('my-feature')
      const ctx = makeCtx()

      // Full flow: start -> reply (boulder.json provides OMO context for reply)
      await simulateQualityPolicyFlow(ctx, '/start-work')
      await writeBoulderJson('my-feature')
      await simulateQualityPolicyFlow(ctx, 'balanced', true)

      // Third call: policy exists, should reuse
      const result = await simulateQualityPolicyFlow(ctx, '/start-work')
      expect(result.prompted).toBe(false)
      expect(result.policySaved).toBe(false)
      expect(result.mode).toBe('balanced')
    })
  })

  // --- Scenario 2: Reuse flow ---
  describe('Reuse flow: pre-created policy -> /start-work -> no prompt', () => {
    test('existing policy is reused without prompting', async () => {
      await createPlanFile('existing-feature')
      const ctx = makeCtx()

      // Pre-create policy file
      const policy = createDefaultPolicy('existing-feature', 'existing-feature', 'strict')
      policy.harden_policy = 'final'
      await saveExecutionPolicy(ctx.directory, policy)

      // Simulate /start-work
      const result = await simulateQualityPolicyFlow(ctx, '/start-work')

      expect(result.prompted).toBe(false)
      expect(result.policySaved).toBe(false)
      expect(result.mode).toBe('strict')

      // No pending selection should be written
      const pending = await readPendingSelection()
      expect(pending).toBeNull()
    })

    test('policy with different feature is not reused', async () => {
      await createPlanFile('new-feature')
      const ctx = makeCtx()

      // Pre-create policy for a DIFFERENT feature
      const policy = createDefaultPolicy('old-feature', 'old-feature', 'fast')
      await saveExecutionPolicy(ctx.directory, policy)

      // Simulate /start-work for new-feature
      const result = await simulateQualityPolicyFlow(ctx, '/start-work')

      expect(result.prompted).toBe(true)
      expect(result.policySaved).toBe(false)
    })
  })

  // --- Scenario 3: Non-OMO flow ---
  describe('Non-OMO flow: regular message -> no quality policy prompt', () => {
    test('regular message does not trigger quality flow', async () => {
      await createPlanFile('some-feature')
      const ctx = makeCtx()

      const result = await simulateQualityPolicyFlow(ctx, 'Please implement the login feature')

      expect(result.prompted).toBe(false)
      expect(result.policySaved).toBe(false)
    })

    test('non-OMO with boulder.json missing does not trigger', async () => {
      const ctx = makeCtx()

      const result = await simulateQualityPolicyFlow(ctx, 'Fix the bug in auth')

      expect(result.prompted).toBe(false)
      expect(result.policySaved).toBe(false)
    })

    test('non-OMO even when plan file exists', async () => {
      await createPlanFile('planned-feature')
      const ctx = makeCtx()

      const result = await simulateQualityPolicyFlow(ctx, 'Write tests for the API')

      expect(result.prompted).toBe(false)
      expect(result.policySaved).toBe(false)
    })
  })

  // --- Scenario 4: Mode parsing ---
  describe('Mode parsing: fast / BALANCED / strict replies', () => {
    async function runModeReply(reply: string): Promise<{ mode: string; harden: string }> {
      await createPlanFile('parse-feature')
      const ctx = makeCtx()

      // Setup pending selection
      await simulateQualityPolicyFlow(ctx, '/start-work')

      // Reply with mode (boulder.json provides OMO context)
      await writeBoulderJson('parse-feature')
      await simulateQualityPolicyFlow(ctx, reply, true)

      const policy = await loadExecutionPolicy(ctx.directory, 'parse-feature')
      expect(policy).not.toBeNull()
      return { mode: policy!.quality_mode, harden: policy!.harden_policy }
    }

    test('"fast" -> quality_mode=fast, harden_policy=none', async () => {
      const { mode, harden } = await runModeReply('fast')
      expect(mode).toBe('fast')
      expect(harden).toBe('none')
    })

    test('"BALANCED" (case-insensitive) -> quality_mode=balanced, harden_policy=risk-based', async () => {
      const { mode, harden } = await runModeReply('BALANCED')
      expect(mode).toBe('balanced')
      expect(harden).toBe('risk-based')
    })

    test('"strict" -> quality_mode=strict, harden_policy=final', async () => {
      const { mode, harden } = await runModeReply('strict')
      expect(mode).toBe('strict')
      expect(harden).toBe('final')
    })

    test('"I prefer Fast mode" extracts fast from sentence', async () => {
      const { mode, harden } = await runModeReply('I prefer Fast mode')
      expect(mode).toBe('fast')
      expect(harden).toBe('none')
    })
  })

  // --- Scenario 5: Default mode fallback ---
  describe('Default mode: ambiguous reply defaults to balanced', () => {
    test('reply with no valid mode word defaults to balanced', async () => {
      await createPlanFile('default-feature')
      const ctx = makeCtx()

      // Setup pending selection
      await simulateQualityPolicyFlow(ctx, '/start-work')

      // Reply with ambiguous text (boulder.json provides OMO context)
      await writeBoulderJson('default-feature')
      const result = await simulateQualityPolicyFlow(ctx, 'sure, whatever is fine', true)

      expect(result.policySaved).toBe(true)
      expect(result.mode).toBe('balanced')

      const policy = await loadExecutionPolicy(ctx.directory, 'default-feature')
      expect(policy!.quality_mode).toBe('balanced')
      expect(policy!.harden_policy).toBe('risk-based')
    })

    test('empty reply defaults to balanced', async () => {
      await createPlanFile('default-feature')
      const ctx = makeCtx()

      await simulateQualityPolicyFlow(ctx, '/start-work')

      await writeBoulderJson('default-feature')
      const result = await simulateQualityPolicyFlow(ctx, 'ok', true)

      expect(result.policySaved).toBe(true)
      expect(result.mode).toBe('balanced')
    })

    test('reply with only unrelated text defaults to balanced', async () => {
      await createPlanFile('default-feature')
      const ctx = makeCtx()

      await simulateQualityPolicyFlow(ctx, '/start-work')

      await writeBoulderJson('default-feature')
      const result = await simulateQualityPolicyFlow(ctx, 'yes please continue', true)

      expect(result.policySaved).toBe(true)
      expect(result.mode).toBe('balanced')
    })
  })

  // --- Bonus: Detection priority ---
  describe('Detection priority: /start-work > boulder.json > plugins', () => {
    test('/start-work detected as omo regardless of other signals', async () => {
      const ctx = makeCtx()
      const result = await detectOmoExecutionFlow(ctx, '/start-work')
      expect(result).toBe('omo')
    })

    test('boulder.json with active_plan detected as omo', async () => {
      const ctx = makeCtx()
      await writeFile(
        join(SISYPHUS_DIR, 'boulder.json'),
        JSON.stringify({ active_plan: 'some-plan', version: 1 }),
      )
      const result = await detectOmoExecutionFlow(ctx, 'do something')
      expect(result).toBe('omo')
    })

    test('regular message without signals is non-omo', async () => {
      const ctx = makeCtx()
      const result = await detectOmoExecutionFlow(ctx, 'regular work')
      expect(result).toBe('non-omo')
    })
  })

  // --- Bonus: Policy roundtrip ---
  describe('Policy roundtrip: save -> load -> compare', () => {
    test('saved policy loads identically for matching feature', async () => {
      const policy = createDefaultPolicy('roundtrip-feat', 'roundtrip-plan', 'strict')
      policy.harden_policy = 'final'
      await saveExecutionPolicy(TMP_DIR, policy)

      const loaded = await loadExecutionPolicy(TMP_DIR, 'roundtrip-feat')
      expect(loaded).not.toBeNull()
      expect(loaded!.feature).toBe(policy.feature)
      expect(loaded!.plan_name).toBe(policy.plan_name)
      expect(loaded!.quality_mode).toBe(policy.quality_mode)
      expect(loaded!.harden_policy).toBe(policy.harden_policy)
      expect(loaded!.verify_policy).toBe(policy.verify_policy)
      expect(loaded!.selected_at).toBe(policy.selected_at)
      expect(loaded!.selected_by).toBe(policy.selected_by)
    })
  })

  // --- Bonus: Import verification ---
  describe('Import verification: src/index.ts imports resolve', () => {
    test('createChatMessageHook import resolves', async () => {
      // Dynamic import to verify the module loads without errors
      const mod = await import('../../src/hooks/chat-message.js')
      expect(typeof mod.createChatMessageHook).toBe('function')
    })

    test('omo-detection import resolves', async () => {
      const mod = await import('../../src/utils/omo-detection.js')
      expect(typeof mod.detectOmoExecutionFlow).toBe('function')
    })

    test('execution-policy imports resolve', async () => {
      const mod = await import('../../src/utils/execution-policy.js')
      expect(typeof mod.loadExecutionPolicy).toBe('function')
      expect(typeof mod.saveExecutionPolicy).toBe('function')
      expect(typeof mod.createDefaultPolicy).toBe('function')
    })
  })
})
