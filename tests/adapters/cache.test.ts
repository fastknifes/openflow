import { describe, expect, it } from 'bun:test'
import { AdapterCache } from '../../src/adapters/cache.js'

describe('AdapterCache', () => {
  it('same key compute executes once', async () => {
    const cache = new AdapterCache()
    let computeCount = 0

    const compute = async (): Promise<string> => {
      computeCount++
      return 'result'
    }

    const [r1, r2, r3] = await Promise.all([
      cache.getOrCompute('key-a', compute),
      cache.getOrCompute('key-a', compute),
      cache.getOrCompute('key-a', compute),
    ])

    expect(r1).toBe('result')
    expect(r2).toBe('result')
    expect(r3).toBe('result')
    expect(computeCount).toBe(1)
  })

  it('different keys execute independently', async () => {
    const cache = new AdapterCache()
    let computeCount = 0

    const compute = async (value: string): Promise<string> => {
      computeCount++
      return value
    }

    const [r1, r2] = await Promise.all([
      cache.getOrCompute('key-x', () => compute('x')),
      cache.getOrCompute('key-y', () => compute('y')),
    ])

    expect(r1).toBe('x')
    expect(r2).toBe('y')
    expect(computeCount).toBe(2)
  })

  it('concurrent gets share one compute', async () => {
    const cache = new AdapterCache()
    let concurrentMax = 0
    let activeCount = 0
    let computeCount = 0

    const compute = async (): Promise<string> => {
      computeCount++
      activeCount++
      if (activeCount > concurrentMax) concurrentMax = activeCount

      await new Promise(resolve => setTimeout(resolve, 50))

      activeCount--
      return 'shared'
    }

    const results = await Promise.all([
      cache.getOrCompute('shared-key', compute),
      cache.getOrCompute('shared-key', compute),
      cache.getOrCompute('shared-key', compute),
      cache.getOrCompute('shared-key', compute),
      cache.getOrCompute('shared-key', compute),
    ])

    for (const r of results) {
      expect(r).toBe('shared')
    }

    expect(computeCount).toBe(1)
    expect(concurrentMax).toBe(1)
  })
})
