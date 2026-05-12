import type { OpenFlowContract } from './openflow-contract.js'
import type { FileChangedEvent, ContractConsumer, EvidenceSinkEntry } from '../types.js'
import { ContractExtractor } from './contract-extractor.js'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

const CONTRACT_CACHE_FILE = '.sisyphus/openflow/contracts.json'

// --- ContractRegistry ---
class ContractRegistry {
  #contracts = new Map<string, OpenFlowContract>()

  get(feature: string): OpenFlowContract | undefined { return this.#contracts.get(feature) }
  set(feature: string, contract: OpenFlowContract): void { this.#contracts.set(feature, contract) }
  delete(feature: string): boolean { return this.#contracts.delete(feature) }
  get features(): string[] { return [...this.#contracts.keys()] }

  findByFile(filePath: string): Array<{ feature: string; contract: OpenFlowContract }> {
    const normalized = filePath.replace(/\\/g, '/')
    const results: Array<{ feature: string; contract: OpenFlowContract }> = []
    for (const [feature, contract] of this.#contracts) {
      for (const item of contract.alignmentItems) {
        const allFiles = [...item.files, ...item.modules].map(f => f.replace(/\\/g, '/'))
        if (allFiles.some(f => normalized.includes(f) || f.includes(normalized))) {
          results.push({ feature, contract })
          break
        }
      }
    }
    return results
  }
}

// --- EventQueue ---
class EventQueue {
  #events: FileChangedEvent[] = []

  enqueue(event: FileChangedEvent): void { this.#events.push(event) }
  dequeue(): FileChangedEvent | undefined { return this.#events.shift() }
  drain(): FileChangedEvent[] { const e = [...this.#events]; this.#events = []; return e }
  get length(): number { return this.#events.length }
}

// --- ConsumerRegistry ---
class ConsumerRegistry {
  #consumers: ContractConsumer[] = []

  register(consumer: ContractConsumer): void { this.#consumers.push(consumer) }
  getAll(): ContractConsumer[] { return [...this.#consumers] }
}

// --- EvidenceSink ---
class EvidenceSink {
  #entries: EvidenceSinkEntry[] = []

  append(entry: EvidenceSinkEntry): void { this.#entries.push(entry) }
  getAll(): EvidenceSinkEntry[] { return [...this.#entries] }
  clear(): void { this.#entries = [] }
}

// --- ContractRuntime ---
export class ContractRuntime {
  readonly registry = new ContractRegistry()
  readonly events = new EventQueue()
  readonly consumers = new ConsumerRegistry()
  readonly evidence = new EvidenceSink()
  private extractor = new ContractExtractor()
  private projectDir = ''
  private started = false

  // Singleton
  static #instance: ContractRuntime | null = null
  static getInstance(): ContractRuntime {
    if (!ContractRuntime.#instance) {
      ContractRuntime.#instance = new ContractRuntime()
    }
    return ContractRuntime.#instance
  }

  /** Reset the singleton — for testing only */
  static resetInstance(): void {
    ContractRuntime.#instance = null
  }

  async start(projectDir: string): Promise<void> {
    if (this.started) return
    this.projectDir = projectDir
    // Load cached contracts
    const cachePath = path.join(projectDir, CONTRACT_CACHE_FILE)
    try {
      const content = await fs.readFile(cachePath, 'utf-8')
      const cached = JSON.parse(content) as Record<string, OpenFlowContract>
      for (const [feature, contract] of Object.entries(cached)) {
        this.registry.set(feature, contract)
      }
    } catch {
      // No cache yet — start fresh
    }
    this.started = true
  }

  async stop(): Promise<void> {
    if (!this.started) return
    // Write contract cache
    const cachePath = path.join(this.projectDir, CONTRACT_CACHE_FILE)
    const cacheData: Record<string, OpenFlowContract> = {}
    for (const feature of this.registry.features) {
      const contract = this.registry.get(feature)
      if (contract) cacheData[feature] = contract
    }
    try {
      await fs.mkdir(path.dirname(cachePath), { recursive: true })
      await fs.writeFile(cachePath, JSON.stringify(cacheData, null, 2), 'utf-8')
    } catch {
      // Best effort
    }
    this.started = false
  }

  get isStarted(): boolean { return this.started }

  // Extract or load contract for a feature
  async getOrExtractContract(feature: string): Promise<OpenFlowContract | null> {
    // Check cache first
    const cached = this.registry.get(feature)
    if (cached) return cached

    // Extract fresh
    const contract = await this.extractor.extract(feature, this.projectDir)
    if (contract) {
      this.registry.set(feature, contract)
    }
    return contract
  }

  // Process a file change event
  async processFileChange(event: FileChangedEvent): Promise<void> {
    this.events.enqueue(event)
    const hits = this.registry.findByFile(event.filePath)

    // If no contract references this file, stay idle
    if (hits.length === 0) return

    // Dispatch to all registered consumers
    for (const consumer of this.consumers.getAll()) {
      try {
        await consumer.onEvent(event)
      } catch {
        // Continue to next consumer
      }
    }
  }

  // Dispatch session event to consumers
  async dispatchSessionEvent(event: { type: string; sessionId?: string }): Promise<void> {
    for (const consumer of this.consumers.getAll()) {
      try {
        await consumer.onSessionEvent(event)
      } catch {
        // Continue
      }
    }
  }
}

// Convenience function for accessing the singleton
export function getContractRuntime(): ContractRuntime {
  return ContractRuntime.getInstance()
}
