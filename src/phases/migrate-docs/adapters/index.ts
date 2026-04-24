/**
 * Adapter Registry
 *
 * Manages all document source adapters and provides:
 * - Adapter registration
 * - Multi-adapter detection with confidence sorting
 * - Adapter retrieval by source type
 * - Highest confidence adapter selection
 */

import type { DocAdapter } from './types.js'
import type { AdapterDetectResult, SourceType } from '../types.js'
import { openspecAdapter } from './openspec.js'
import { specKitAdapter } from './spec-kit.js'
import { kiroAdapter } from './kiro.js'
import { cursorAdapter } from './cursor.js'
import { traeAdapter } from './trae.js'
import { genericAdapter } from './generic.js'

/**
 * Registry for managing DocAdapter implementations
 */
export class AdapterRegistry {
  private adapters: Map<SourceType, DocAdapter> = new Map()

  /**
   * Register a new adapter with the registry
   * @param adapter - The adapter to register
   */
  register(adapter: DocAdapter): void {
    this.adapters.set(adapter.name, adapter)
  }

  /**
   * Run detection on all registered adapters
   * @param sourceDir - Absolute path to the source directory
   * @returns Array of detection results sorted by confidence (descending)
   */
  async detect(sourceDir: string): Promise<AdapterDetectResult[]> {
    const results: AdapterDetectResult[] = []

    for (const adapter of this.adapters.values()) {
      try {
        const result = await adapter.detect(sourceDir)
        results.push(result)
      } catch {
        // If an adapter throws during detection, treat as not detected
        results.push({
          adapter: adapter.name,
          detected: false,
          confidence: 0,
        })
      }
    }

    // Sort by confidence descending
    return results.sort((a, b) => b.confidence - a.confidence)
  }

  /**
   * Get an adapter by its source type
   * @param sourceType - The source type to look up
   * @returns The adapter for the given source type
   * @throws Error if no adapter is found for the source type
   */
  getAdapter(sourceType: SourceType): DocAdapter {
    const adapter = this.adapters.get(sourceType)
    if (!adapter) {
      throw new Error(`No adapter registered for source type: ${sourceType}`)
    }
    return adapter
  }

  /**
   * Get the adapter with the highest confidence from detection results
   * @param results - Array of detection results
   * @returns The highest confidence adapter, or null if no adapter detected
   */
  getHighestConfidence(results: AdapterDetectResult[]): DocAdapter | null {
    if (results.length === 0) {
      return null
    }

    const highest = results[0]!
    if (!highest.detected || highest.confidence === 0) {
      return null
    }

    return this.getAdapter(highest.adapter)
  }

  /**
   * Get all registered adapters
   * @returns Array of all registered adapters
   */
  getAllAdapters(): DocAdapter[] {
    return Array.from(this.adapters.values())
  }
}

// ============================================================================
// Singleton Registry Instance
// ============================================================================

/**
 * Singleton adapter registry pre-loaded with all 6 adapters
 */
export const adapterRegistry = new AdapterRegistry()

// Register all adapters
adapterRegistry.register(openspecAdapter)
adapterRegistry.register(specKitAdapter)
adapterRegistry.register(kiroAdapter)
adapterRegistry.register(cursorAdapter)
adapterRegistry.register(traeAdapter)
adapterRegistry.register(genericAdapter)
