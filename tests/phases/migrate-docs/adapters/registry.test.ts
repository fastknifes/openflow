/**
 * Adapter Registry Tests
 *
 * Tests for AdapterRegistry class including:
 * - Adapter registration
 * - Multi-adapter detection with confidence sorting
 * - Adapter retrieval by source type
 * - Highest confidence adapter selection
 * - Empty results handling
 */

import { describe, expect, it } from 'bun:test'
import { AdapterRegistry, adapterRegistry } from '../../../../src/phases/migrate-docs/adapters/index.js'
import type { DocAdapter } from '../../../../src/phases/migrate-docs/adapters/types.js'
import type { AdapterDetectResult, ClassificationResult, FileInventory, SourceType } from '../../../../src/phases/migrate-docs/types.js'

describe('AdapterRegistry', () => {
  describe('register', () => {
    it('should register an adapter', () => {
      const registry = new AdapterRegistry()
      const mockAdapter: DocAdapter = {
        name: 'openspec',
        detect: async () => ({ adapter: 'openspec', detected: true, confidence: 0.9 }),
        scan: async () => [],
        classify: async () => [],
      }

      registry.register(mockAdapter)

      expect(registry.getAdapter('openspec')).toBe(mockAdapter)
    })

    it('should allow re-registering an adapter (replacement)', () => {
      const registry = new AdapterRegistry()
      const adapter1: DocAdapter = {
        name: 'openspec',
        detect: async () => ({ adapter: 'openspec', detected: true, confidence: 0.5 }),
        scan: async () => [],
        classify: async () => [],
      }
      const adapter2: DocAdapter = {
        name: 'openspec',
        detect: async () => ({ adapter: 'openspec', detected: true, confidence: 0.9 }),
        scan: async () => [],
        classify: async () => [],
      }

      registry.register(adapter1)
      registry.register(adapter2)

      expect(registry.getAdapter('openspec')).toBe(adapter2)
    })
  })

  describe('detect', () => {
    it('should run detection on all registered adapters', async () => {
      const registry = new AdapterRegistry()
      const adapter1: DocAdapter = {
        name: 'openspec',
        detect: async () => ({ adapter: 'openspec', detected: true, confidence: 0.9 }),
        scan: async () => [],
        classify: async () => [],
      }
      const adapter2: DocAdapter = {
        name: 'kiro',
        detect: async () => ({ adapter: 'kiro', detected: true, confidence: 0.7 }),
        scan: async () => [],
        classify: async () => [],
      }

      registry.register(adapter1)
      registry.register(adapter2)

      const results = await registry.detect('/some/path')

      expect(results).toHaveLength(2)
      expect(results.map(r => r.adapter)).toContain('openspec')
      expect(results.map(r => r.adapter)).toContain('kiro')
    })

    it('should sort adapters by detection confidence (descending)', async () => {
      const registry = new AdapterRegistry()
      const adapter1: DocAdapter = {
        name: 'openspec',
        detect: async () => ({ adapter: 'openspec', detected: true, confidence: 0.5 }),
        scan: async () => [],
        classify: async () => [],
      }
      const adapter2: DocAdapter = {
        name: 'kiro',
        detect: async () => ({ adapter: 'kiro', detected: true, confidence: 0.9 }),
        scan: async () => [],
        classify: async () => [],
      }
      const adapter3: DocAdapter = {
        name: 'cursor',
        detect: async () => ({ adapter: 'cursor', detected: true, confidence: 0.7 }),
        scan: async () => [],
        classify: async () => [],
      }

      registry.register(adapter1)
      registry.register(adapter2)
      registry.register(adapter3)

      const results = await registry.detect('/some/path')

      expect(results[0].adapter).toBe('kiro')
      expect(results[0].confidence).toBe(0.9)
      expect(results[1].adapter).toBe('cursor')
      expect(results[1].confidence).toBe(0.7)
      expect(results[2].adapter).toBe('openspec')
      expect(results[2].confidence).toBe(0.5)
    })

    it('should handle adapters that throw during detection', async () => {
      const registry = new AdapterRegistry()
      const adapter1: DocAdapter = {
        name: 'openspec',
        detect: async () => ({ adapter: 'openspec', detected: true, confidence: 0.9 }),
        scan: async () => [],
        classify: async () => [],
      }
      const adapter2: DocAdapter = {
        name: 'kiro',
        detect: async () => { throw new Error('Detection failed') },
        scan: async () => [],
        classify: async () => [],
      }

      registry.register(adapter1)
      registry.register(adapter2)

      const results = await registry.detect('/some/path')

      expect(results).toHaveLength(2)
      const kiroResult = results.find(r => r.adapter === 'kiro')
      expect(kiroResult?.detected).toBe(false)
      expect(kiroResult?.confidence).toBe(0)
    })

    it('should return empty array when no adapters registered', async () => {
      const registry = new AdapterRegistry()
      const results = await registry.detect('/some/path')
      expect(results).toHaveLength(0)
    })
  })

  describe('getAdapter', () => {
    it('should return correct adapter by source type', () => {
      const registry = new AdapterRegistry()
      const mockAdapter: DocAdapter = {
        name: 'openspec',
        detect: async () => ({ adapter: 'openspec', detected: true, confidence: 0.9 }),
        scan: async () => [],
        classify: async () => [],
      }

      registry.register(mockAdapter)

      const result = registry.getAdapter('openspec')
      expect(result).toBe(mockAdapter)
    })

    it('should throw error when adapter not found', () => {
      const registry = new AdapterRegistry()
      expect(() => registry.getAdapter('openspec')).toThrow('No adapter registered for source type: openspec')
    })

    it('should throw error for all 6 source types when registry is empty', () => {
      const registry = new AdapterRegistry()
      const sourceTypes: SourceType[] = ['openspec', 'spec-kit', 'kiro', 'cursor', 'trae', 'generic']

      for (const sourceType of sourceTypes) {
        expect(() => registry.getAdapter(sourceType)).toThrow(`No adapter registered for source type: ${sourceType}`)
      }
    })
  })

  describe('getHighestConfidence', () => {
    it('should return adapter with highest confidence', () => {
      const registry = new AdapterRegistry()
      const adapter1: DocAdapter = {
        name: 'openspec',
        detect: async () => ({ adapter: 'openspec', detected: true, confidence: 0.5 }),
        scan: async () => [],
        classify: async () => [],
      }
      const adapter2: DocAdapter = {
        name: 'kiro',
        detect: async () => ({ adapter: 'kiro', detected: true, confidence: 0.9 }),
        scan: async () => [],
        classify: async () => [],
      }

      registry.register(adapter1)
      registry.register(adapter2)

      const results: AdapterDetectResult[] = [
        { adapter: 'kiro', detected: true, confidence: 0.9 },
        { adapter: 'openspec', detected: true, confidence: 0.5 },
      ]

      const highest = registry.getHighestConfidence(results)
      expect(highest).toBe(adapter2)
    })

    it('should return null when no adapter detected', () => {
      const registry = new AdapterRegistry()
      const adapter: DocAdapter = {
        name: 'openspec',
        detect: async () => ({ adapter: 'openspec', detected: true, confidence: 0.9 }),
        scan: async () => [],
        classify: async () => [],
      }

      registry.register(adapter)

      const results: AdapterDetectResult[] = [
        { adapter: 'openspec', detected: false, confidence: 0 },
      ]

      const highest = registry.getHighestConfidence(results)
      expect(highest).toBeNull()
    })

    it('should return null when detection results are empty', () => {
      const registry = new AdapterRegistry()
      const adapter: DocAdapter = {
        name: 'openspec',
        detect: async () => ({ adapter: 'openspec', detected: true, confidence: 0.9 }),
        scan: async () => [],
        classify: async () => [],
      }

      registry.register(adapter)

      const highest = registry.getHighestConfidence([])
      expect(highest).toBeNull()
    })

    it('should return null when highest confidence is 0', () => {
      const registry = new AdapterRegistry()
      const adapter: DocAdapter = {
        name: 'openspec',
        detect: async () => ({ adapter: 'openspec', detected: true, confidence: 0.9 }),
        scan: async () => [],
        classify: async () => [],
      }

      registry.register(adapter)

      const results: AdapterDetectResult[] = [
        { adapter: 'openspec', detected: true, confidence: 0 },
      ]

      const highest = registry.getHighestConfidence(results)
      expect(highest).toBeNull()
    })
  })

  describe('getAllAdapters', () => {
    it('should return all registered adapters', () => {
      const registry = new AdapterRegistry()
      const adapter1: DocAdapter = {
        name: 'openspec',
        detect: async () => ({ adapter: 'openspec', detected: true, confidence: 0.9 }),
        scan: async () => [],
        classify: async () => [],
      }
      const adapter2: DocAdapter = {
        name: 'kiro',
        detect: async () => ({ adapter: 'kiro', detected: true, confidence: 0.8 }),
        scan: async () => [],
        classify: async () => [],
      }

      registry.register(adapter1)
      registry.register(adapter2)

      const all = registry.getAllAdapters()
      expect(all).toHaveLength(2)
      expect(all).toContain(adapter1)
      expect(all).toContain(adapter2)
    })

    it('should return empty array when no adapters registered', () => {
      const registry = new AdapterRegistry()
      const all = registry.getAllAdapters()
      expect(all).toHaveLength(0)
    })
  })
})

describe('adapterRegistry singleton', () => {
  it('should be pre-loaded with all 6 adapters', () => {
    const all = adapterRegistry.getAllAdapters()
    expect(all).toHaveLength(6)

    const names = all.map(a => a.name)
    expect(names).toContain('openspec')
    expect(names).toContain('spec-kit')
    expect(names).toContain('kiro')
    expect(names).toContain('cursor')
    expect(names).toContain('trae')
    expect(names).toContain('generic')
  })

  it('should have implementations that return proper results', async () => {
    const all = adapterRegistry.getAllAdapters()

    for (const adapter of all) {
      // Test detect returns proper adapter name
      const detectResult = await adapter.detect('/any/path')
      expect(detectResult.adapter).toBe(adapter.name)

      // Generic adapter always detects with 0.3 confidence
      if (adapter.name === 'generic') {
        expect(detectResult.detected).toBe(true)
        expect(detectResult.confidence).toBe(0.3)
      }

      // Test scan returns array
      const scanResult = await adapter.scan('/any/path')
      expect(Array.isArray(scanResult)).toBe(true)

      // Test classify returns array
      const classifyResult = await adapter.classify([])
      expect(classifyResult).toEqual([])
    }
  })

  it('should allow retrieving any adapter by source type', () => {
    const sourceTypes: SourceType[] = ['openspec', 'spec-kit', 'kiro', 'cursor', 'trae', 'generic']

    for (const sourceType of sourceTypes) {
      const adapter = adapterRegistry.getAdapter(sourceType)
      expect(adapter).toBeDefined()
      expect(adapter.name).toBe(sourceType)
    }
  })

  it('should run detection on all adapters', async () => {
    const results = await adapterRegistry.detect('/any/path')

    expect(results).toHaveLength(6)

    // Generic adapter always detects with 0.3 confidence as fallback
    const genericResult = results.find(r => r.adapter === 'generic')
    expect(genericResult).toBeDefined()
    expect(genericResult!.detected).toBe(true)
    expect(genericResult!.confidence).toBe(0.3)

    // Other adapters should return detected: false on arbitrary paths
    for (const result of results) {
      if (result.adapter !== 'generic') {
        expect(result.detected).toBe(false)
        expect(result.confidence).toBe(0)
      }
    }
  })

  it('should return null for getHighestConfidence when all stubs return 0 confidence', () => {
    const results: AdapterDetectResult[] = [
      { adapter: 'openspec', detected: false, confidence: 0 },
      { adapter: 'spec-kit', detected: false, confidence: 0 },
    ]

    const highest = adapterRegistry.getHighestConfidence(results)
    expect(highest).toBeNull()
  })
})
