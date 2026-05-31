import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as crypto from 'node:crypto'

import type {
  OpenFlowContract,
  BehaviorScenario,
  AlignmentItem,
  Constraint,
} from './openflow-contract.js'

import { RequirementModelSchema, type RequirementModel } from '../phases/feature/requirement-model.js'

import { resolveChangeUnitDir } from '../utils/change-units.js'
import {
  scanCurrentConstraints,
  scanDecisionConstraints,
} from './constraint-scanner.js'

export class ContractExtractor {
  async extract(feature: string, projectDir: string): Promise<OpenFlowContract | null> {
    const changeDir = await resolveChangeUnitDir(projectDir, feature)
    const workspaceDir = path.join(projectDir, 'docs', 'changes', changeDir)

    const sourceFiles = await this.discoverSourceFiles(workspaceDir)
    const scenarios = await this.parseBehaviorScenarios(workspaceDir)
    const alignmentItems = await this.parseDesignMetadata(workspaceDir)
    const currentConstraints = await this.parseCurrentConstraints(projectDir)
    const decisionConstraints = await this.parseDecisionConstraints(projectDir)

    const hasAny =
      scenarios.length > 0 ||
      alignmentItems.length > 0 ||
      currentConstraints.length > 0 ||
      decisionConstraints.length > 0

    if (!hasAny) return null

    const sourceHashes = await this.computeSourceHashes(sourceFiles, workspaceDir)

    const contract: OpenFlowContract = {
      feature,
      sourceFiles,
      behaviorScenarios: scenarios,
      alignmentItems,
      currentConstraints,
      decisionConstraints,
      extractedAt: new Date().toISOString(),
      sourceHashes,
    }
    return contract
  }

  private async discoverSourceFiles(workspaceDir: string): Promise<string[]> {
    const files: string[] = []
    const candidates = [
      'design.md', 'requirements.md', 'behavior.md',
      'proposal.md', 'prd.md', 'decisions.md',
    ]
    for (const name of candidates) {
      try {
        await fs.access(path.join(workspaceDir, name))
        files.push(name)
      } catch {
        // file doesn't exist, skip
      }
    }
    return files
  }

  private async computeSourceHashes(files: string[], workspaceDir: string): Promise<Record<string, string>> {
    const hashes: Record<string, string> = {}
    for (const file of files) {
      try {
        const content = await fs.readFile(path.join(workspaceDir, file))
        hashes[file] = crypto.createHash('sha256').update(content).digest('hex')
      } catch {
        hashes[file] = crypto.createHash('sha256').update('').digest('hex')
      }
    }
    return hashes
  }

  // --- a. Behavior scenarios from behavior.md ---

  private async parseBehaviorScenarios(workspaceDir: string): Promise<BehaviorScenario[]> {
    const filePath = path.join(workspaceDir, 'behavior.md')
    let content: string
    try {
      content = await fs.readFile(filePath, 'utf-8')
    } catch {
      return []
    }

    // Try YAML frontmatter first
    const frontmatter = this.parseFrontmatterScenarios(content)
    if (frontmatter && frontmatter.length > 0) return frontmatter

    // Fallback: markdown table
    const tableScenarios = this.parseTableScenarios(content)
    if (tableScenarios.length > 0) return tableScenarios

    // Fallback: markdown headings with Given/When/Then blocks
    return this.parseHeadingScenarios(content)
  }

  private parseFrontmatterScenarios(content: string): BehaviorScenario[] | undefined {
    const parts = content.split(/^---\s*$/m)
    if (parts.length < 3) return undefined

    const body = parts[1]!.trim()
    if (!body) return undefined

    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    } catch {
      parsed = this.parseSimpleKeyValue(body)
    }

    if (!parsed || typeof parsed !== 'object') return undefined

    const obj = parsed as Record<string, unknown>
    const scenarios = Array.isArray(obj.scenarios) ? obj.scenarios : undefined
    if (!scenarios) return undefined

    const result: BehaviorScenario[] = []
    for (const item of scenarios) {
      if (!item || typeof item !== 'object') continue
      const s = item as Record<string, unknown>
      const entry: Omit<BehaviorScenario, 'mustNot'> & { mustNot?: string[] } = {
        id: typeof s.id === 'string' ? s.id : `scenario-${result.length}`,
        name: typeof s.name === 'string' ? s.name : '',
        given: this.toStringArray(s.given),
        when: this.toStringArray(s.when),
        then: this.toStringArray(s.then),
        criticality: this.toCriticality(s.criticality),
      }
      if (s.mustNot != null) entry.mustNot = this.toStringArray(s.mustNot)
      result.push(entry as BehaviorScenario)
    }
    return result.length > 0 ? result : undefined
  }

  private toStringArray(val: unknown): string[] {
    if (Array.isArray(val)) return val.map(v => String(v))
    if (typeof val === 'string') return val ? [val] : []
    return []
  }

  private toCriticality(val: unknown): BehaviorScenario['criticality'] {
    const s = typeof val === 'string' ? val.toLowerCase().trim() : ''
    if (s === 'critical') return 'critical'
    if (s === 'optional') return 'optional'
    return 'normal'
  }

  private parseSimpleKeyValue(body: string): Record<string, unknown> | undefined {
    const lines = body.split('\n')
    const result: Record<string, unknown> = {}
    for (const line of lines) {
      const match = line.match(/^(\w+)\s*:\s*(.+)$/)
      if (match) {
        const [, key, value] = match
        try {
          result[key!] = JSON.parse(value!)
        } catch {
          result[key!] = value!.trim()
        }
      }
    }
    return Object.keys(result).length > 0 ? result : undefined
  }

  private parseTableScenarios(content: string): BehaviorScenario[] {
    const lines = content.split('\n')
    const tableLines: string[] = []
    let foundHeader = false

    for (const line of lines) {
      if (line.startsWith('|')) {
        if (
          !foundHeader &&
          (/scenario/i.test(line) || /given/i.test(line) || /when/i.test(line))
        ) {
          // Skip verification mapping tables (they have Status, Freshness, Coverage columns)
          if (/status/i.test(line) || /freshness/i.test(line) || /coverage/i.test(line)) continue
          foundHeader = true
          tableLines.push(line)
        } else if (foundHeader) {
          if (/^\|[\s\-:|]+\|$/.test(line)) continue
          tableLines.push(line)
        }
      } else if (foundHeader && tableLines.length > 0) {
        break
      }
    }

    if (tableLines.length < 2) return []

    const headerCells = this.splitTableRow(tableLines[0]!)
    const colIndex: Record<string, number> = {}
    for (let i = 0; i < headerCells.length; i++) {
      const h = headerCells[i]!.trim().toLowerCase()
      colIndex[h] = i
    }

    const result: BehaviorScenario[] = []
    for (let rowIdx = 1; rowIdx < tableLines.length; rowIdx++) {
      const cells = this.splitTableRow(tableLines[rowIdx]!)
      const getCol = (name: string): string => {
        const idx = colIndex[name]
        return idx !== undefined && idx < cells.length ? cells[idx]!.trim() : ''
      }

      result.push({
        id: getCol('id') || `scenario-${rowIdx - 1}`,
        name: getCol('scenario') || getCol('name') || '',
        given: getCol('given') ? [getCol('given')] : [],
        when: getCol('when') ? [getCol('when')] : [],
        then: getCol('then') ? [getCol('then')] : [],
        criticality: this.toCriticality(getCol('criticality')),
      })
    }

    return result
  }

  private splitTableRow(line: string): string[] {
    return line
      .split('|')
      .slice(1, -1)
      .map(c => c.trim())
  }

  private parseHeadingScenarios(content: string): BehaviorScenario[] {
    const lines = content.split('\n')
    const result: BehaviorScenario[] = []
    let current: BehaviorScenario | null = null
    let currentStep: 'given' | 'when' | 'then' | null = null

    for (const rawLine of lines) {
      const line = rawLine.trim()
      const heading = line.match(/^###\s+(Scenario|Boundary):\s*(.+)$/i)
      if (heading) {
        if (current) result.push(current)
        const kind = heading[1]!.toLowerCase()
        const name = heading[2]!.trim()
        current = {
          id: `${kind}-${result.length}`,
          name,
          given: [],
          when: [],
          then: [],
          criticality: kind === 'boundary' ? 'optional' : 'critical',
        }
        currentStep = null
        continue
      }

      if (!current) continue

      const stepHeading = line.match(/^(Given|When|Then):\s*$/i)
      if (stepHeading) {
        currentStep = stepHeading[1]!.toLowerCase() as 'given' | 'when' | 'then'
        continue
      }

      if (!currentStep || !line.startsWith('-')) continue

      const item = line.replace(/^[-*]\s*/, '').trim()
      if (item) current[currentStep].push(item)
    }

    if (current) result.push(current)
    return result
  }

  // --- b. Design metadata from design.meta.json ---

  private async parseDesignMetadata(workspaceDir: string): Promise<AlignmentItem[]> {
    const filePath = path.join(workspaceDir, 'design.meta.json')
    let content: string
    try {
      content = await fs.readFile(filePath, 'utf-8')
    } catch {
      return []
    }

    let model: RequirementModel
    try {
      model = RequirementModelSchema.parse(JSON.parse(content))
    } catch {
      return []
    }

    const rawSymbols = model.expectedSymbols ?? []

    const alignments: AlignmentItem[] = (model.expectedModules ?? []).map((mod) => ({
      behaviorId: 'design',
      designResponse: mod.purpose,
      files: [mod.path],
      modules: [mod.path],
      expectedSymbols: rawSymbols.filter(s => s.module === mod.path).map(s => s.name),
      risk: 'low' as const,
    }))

    return alignments
  }

  // --- c. Current constraints (delegated to constraint-scanner) ---

  private async parseCurrentConstraints(projectDir: string): Promise<Constraint[]> {
    const scanned = await scanCurrentConstraints(projectDir)
    return scanned.map((sc) => ({
      source: sc.source as 'current',
      file: sc.file,
      rule: sc.rule,
      severity: sc.severity,
    }))
  }

  // --- d. Decision constraints (delegated to constraint-scanner) ---

  private async parseDecisionConstraints(projectDir: string): Promise<Constraint[]> {
    const scanned = await scanDecisionConstraints(projectDir)
    return scanned.map((sc) => ({
      source: sc.source as 'decision',
      file: sc.file,
      rule: sc.rule,
      severity: sc.severity,
    }))
  }
}
