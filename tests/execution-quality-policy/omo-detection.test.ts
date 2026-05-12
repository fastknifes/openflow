import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { join } from 'path'
import { mkdir, writeFile, rm } from 'fs/promises'
import { detectOmoExecutionFlow } from '../../src/utils/omo-detection.js'
import type { OpenFlowContext } from '../../src/types.js'
import { defaultConfig } from '../../src/types.js'

const TMP_DIR = join(import.meta.dir, '__tmp_omo_detection__')
const BOULDER_DIR = join(TMP_DIR, '.sisyphus')

function makeCtx(overrides?: Partial<OpenFlowContext> & { rawPlugins?: string[] }): OpenFlowContext {
  const { rawPlugins, ...rest } = overrides ?? {}
  const ctx: OpenFlowContext = {
    directory: TMP_DIR,
    worktree: TMP_DIR,
    client: {},
    $: {},
    config: defaultConfig,
    enhancedPlans: new Set(),
    ...rest,
  }
  if (rawPlugins) {
    ;(ctx as Record<string, unknown>).config = {
      ...defaultConfig,
      plugins: rawPlugins,
    } as unknown as OpenFlowContext['config']
  }
  return ctx
}

describe('detectOmoExecutionFlow', () => {
  beforeEach(async () => {
    await mkdir(BOULDER_DIR, { recursive: true })
  })

  afterEach(async () => {
    await rm(TMP_DIR, { recursive: true, force: true }).catch(() => {})
  })

  test('returns omo when message contains /start-work', async () => {
    const ctx = makeCtx()
    const result = await detectOmoExecutionFlow(ctx, '/start-work')
    expect(result).toBe('omo')
  })

  test('returns omo when message contains /start-work embedded in text', async () => {
    const ctx = makeCtx()
    const result = await detectOmoExecutionFlow(ctx, 'Let us run /start-work now')
    expect(result).toBe('omo')
  })

  test('returns omo when boulder.json has active_plan', async () => {
    const ctx = makeCtx()
    await writeFile(
      join(BOULDER_DIR, 'boulder.json'),
      JSON.stringify({ active_plan: 'my-plan', version: 1 }),
    )
    const result = await detectOmoExecutionFlow(ctx, 'regular message')
    expect(result).toBe('omo')
  })

  test('returns non-omo when boulder.json exists but active_plan is falsy', async () => {
    const ctx = makeCtx()
    await writeFile(
      join(BOULDER_DIR, 'boulder.json'),
      JSON.stringify({ active_plan: null, version: 1 }),
    )
    const result = await detectOmoExecutionFlow(ctx, 'regular message')
    expect(result).toBe('non-omo')
  })

  test('returns non-omo when boulder.json is missing', async () => {
    const ctx = makeCtx()
    // No boulder.json written
    const result = await detectOmoExecutionFlow(ctx, 'regular message')
    expect(result).toBe('non-omo')
  })

  test('returns non-omo when boulder.json is corrupt JSON', async () => {
    const ctx = makeCtx()
    await writeFile(join(BOULDER_DIR, 'boulder.json'), '{not valid json!!!')
    const result = await detectOmoExecutionFlow(ctx, 'regular message')
    expect(result).toBe('non-omo')
  })

  test('returns non-omo when boulder.json is empty file', async () => {
    const ctx = makeCtx()
    await writeFile(join(BOULDER_DIR, 'boulder.json'), '')
    const result = await detectOmoExecutionFlow(ctx, 'regular message')
    expect(result).toBe('non-omo')
  })

  test('returns non-omo when oh-my-openagent plugin is installed but no start-work', async () => {
    const ctx = makeCtx({ rawPlugins: ['@fastknife/openflow', 'oh-my-openagent'] })
    const result = await detectOmoExecutionFlow(ctx, 'regular message')
    expect(result).toBe('non-omo')
  })

  test('returns non-omo when oh-my-opencode plugin is installed but no start-work', async () => {
    const ctx = makeCtx({ rawPlugins: ['@fastknife/openflow', 'oh-my-opencode'] })
    const result = await detectOmoExecutionFlow(ctx, 'regular message')
    expect(result).toBe('non-omo')
  })

  test('returns non-omo when no plugins and no boulder.json', async () => {
    const ctx = makeCtx()
    const result = await detectOmoExecutionFlow(ctx, 'regular message')
    expect(result).toBe('non-omo')
  })

  test('/start-work takes priority over everything', async () => {
    const ctx = makeCtx({ rawPlugins: ['oh-my-openagent'] })
    // Even with plugin installed AND boulder.json present, /start-work wins
    await writeFile(
      join(BOULDER_DIR, 'boulder.json'),
      JSON.stringify({ active_plan: 'plan-x' }),
    )
    const result = await detectOmoExecutionFlow(ctx, '/start-work')
    expect(result).toBe('omo')
  })

  test('boulder.json active_plan takes priority over plugin installed', async () => {
    const ctx = makeCtx({ rawPlugins: ['oh-my-openagent'] })
    await writeFile(
      join(BOULDER_DIR, 'boulder.json'),
      JSON.stringify({ active_plan: 'my-plan' }),
    )
    const result = await detectOmoExecutionFlow(ctx, 'regular message')
    expect(result).toBe('omo')
  })
})
