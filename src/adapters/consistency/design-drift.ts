import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { spawn } from 'node:child_process'
import type {
  AdapterConfig,
  ConsistencyAdapterConfig,
  DriftItem,
  PhasedChanges,
  VerifyEvidenceCheckResult,
} from '../../types.js'
import { resolveChangeUnitDir } from '../../utils/change-units.js'
import { detectDrift } from '../../utils/drift-detector.js'
import type { AdapterContext, EvidenceAdapter } from '../types.js'
import type { OpenFlowContract } from '../../contracts/openflow-contract.js'
import { extractSymbols } from '../../utils/symbol-resolver.js'

type RuntimeContext = AdapterContext & {
  changedFiles?: string[]
  phasedChanges?: PhasedChanges
  contract?: OpenFlowContract | null
}

interface DesignDocContent {
  modules: string[]
  keywords: string[]
}

export { detectDrift } from '../../utils/drift-detector.js'

export class DesignDriftAdapter implements EvidenceAdapter {
  readonly name = 'design_drift'

  async run(ctx: AdapterContext): Promise<VerifyEvidenceCheckResult[]> {
    const config = ctx.config as AdapterConfig & ConsistencyAdapterConfig
    if (config.drift_check === false) {
      return []
    }

    const runtime = ctx as RuntimeContext
    let results: VerifyEvidenceCheckResult[] = []

    // Contract-driven path: use alignmentItems when available
    if (runtime.contract) {
      const contractDrifts = await detectDriftFromContract(ctx, runtime.contract)
      if (contractDrifts.length > 0) {
        results = contractDrifts.map((drift) => ({
          name: this.name,
          passed: false,
          category: 'consistency' as const,
          detail: `${drift.item}: ${drift.reason} (${drift.actualCode}; design: ${drift.designDoc})`,
        }))
      } else if (config.symbol_level !== false && runtime.contract.alignmentItems.length > 0) {
        const symbolDrifts = await detectSymbolDrift(ctx, runtime.contract)
        if (symbolDrifts.length > 0) {
          results = symbolDrifts.map((drift) => ({
            name: this.name,
            passed: false,
            category: 'consistency' as const,
            detail: `${drift.item}: ${drift.reason} (${drift.actualCode}; design: ${drift.designDoc})`,
          }))
        } else {
          results = [{
            name: this.name,
            passed: true,
            category: 'consistency' as const,
            detail: 'No design drift detected (contract-driven check).',
          }]
        }
      } else {
        results = [{
          name: this.name,
          passed: true,
          category: 'consistency' as const,
          detail: 'No design drift detected (contract-driven check).',
        }]
      }
    } else {
      // Fallback: existing heuristic path
      const designDir = await resolveDesignDir(ctx.projectDir, ctx.feature)
      const phasedChanges = runtime.phasedChanges
      const drifts = phasedChanges?.acceptance.length
        ? await detectDrift(ctx.projectDir, designDir, phasedChanges)
        : await detectKeywordFallback(ctx.projectDir, designDir, runtime.changedFiles ?? await getChangedFiles(ctx))

      if (drifts.length === 0) {
        results = [{
          name: this.name,
          passed: true,
          category: 'consistency' as const,
          detail: 'No design drift detected.',
        }]
      } else {
        results = drifts.map((drift) => ({
          name: this.name,
          passed: false,
          category: 'consistency' as const,
          detail: `${drift.item}: ${drift.reason} (${drift.actualCode}; design: ${drift.designDoc})`,
        }))
      }
    }

    // Guardian evidence supplementary check
    const guardianEvidence = (ctx as AdapterContext & { guardianEvidence?: import('../../types.js').GuardianEvidence }).guardianEvidence
    if (guardianEvidence) {
      const guardianPassed = guardianEvidence.unresolvedViolations === 0 && guardianEvidence.pendingAmbiguities === 0
      results.push({
        name: 'guardian_repairs',
        passed: guardianPassed,
        category: 'consistency' as const,
        detail: `Guardian: ${guardianEvidence.autoRepairs} auto-repairs, ${guardianEvidence.pendingAmbiguities} pending ambiguities, ${guardianEvidence.unresolvedViolations} violations`,
      })
    }

    return results
  }
}

async function resolveDesignDir(projectDir: string, feature: string): Promise<string> {
  const changeDir = await resolveChangeUnitDir(projectDir, feature)
  return path.join(projectDir, 'docs', 'changes', changeDir)
}

async function detectKeywordFallback(projectDir: string, designDir: string, changedFiles: string[]): Promise<DriftItem[]> {
  const normalizedFiles = uniqueNormalized(changedFiles)
  if (normalizedFiles.length === 0) {
    return []
  }

  const designContent = await readDesignDoc(designDir)
  if (!designContent) {
    return [{
      item: 'design.md',
      designDoc: `missing under ${normalizePath(path.relative(projectDir, designDir) || designDir)}`,
      actualCode: `Changed files: ${normalizedFiles.join(', ')}`,
      reason: 'design workspace missing or unreadable; human decision required',
    }]
  }

  const drifts: DriftItem[] = []
  for (const filePath of normalizedFiles) {
    if (designContent.modules.length > 0) {
      const inDesignModule = designContent.modules.some((modulePath) => filePath.includes(normalizePath(modulePath)))
      if (!inDesignModule) {
        drifts.push({
          item: filePath,
          designDoc: designContent.modules.join(', '),
          actualCode: `Implemented in ${filePath}`,
          reason: 'Changed file is outside the design document module scope',
        })
      }
    }

    const fullPath = path.join(projectDir, filePath)
    const fileKeywords = extractCodeKeywords(await readText(fullPath))
    for (const keyword of fileKeywords) {
      const inDesign = designContent.keywords.some((candidate) => candidate.toLowerCase().includes(keyword.toLowerCase()))
      if (!inDesign) {
        drifts.push({
          item: keyword,
          designDoc: 'Not mentioned',
          actualCode: `Implemented in ${filePath}`,
          reason: 'Changed file adds code keywords not mentioned in the design documents',
        })
      }
    }
  }

  return drifts
}

async function readDesignDoc(designDir: string): Promise<DesignDocContent | null> {
  try {
    const entries = await fs.readdir(designDir, { withFileTypes: true })
    const markdownFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    if (markdownFiles.length === 0) {
      return null
    }

    const modules = new Set<string>()
    const keywords = new Set<string>()

    for (const entry of markdownFiles) {
      const content = await fs.readFile(path.join(designDir, entry.name), 'utf-8')
      for (const match of content.match(/(?:src|lib|app)\/[\w./-]+/g) ?? []) {
        modules.add(normalizePath(match))
      }
      for (const match of content.match(/`([^`]+)`/g) ?? []) {
        keywords.add(match.slice(1, -1))
      }
    }

    return { modules: [...modules], keywords: [...keywords] }
  } catch {
    return null
  }
}

function extractCodeKeywords(content: string): string[] {
  const keywords = new Set<string>()
  for (const match of content.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) {
    const keyword = match[1]
    if (keyword) {
      keywords.add(keyword)
    }
  }
  for (const match of content.matchAll(/export\s+class\s+(\w+)/g)) {
    const keyword = match[1]
    if (keyword) {
      keywords.add(keyword)
    }
  }
  for (const match of content.matchAll(/export\s+const\s+(\w+)/g)) {
    const keyword = match[1]
    if (keyword) {
      keywords.add(keyword)
    }
  }
  return [...keywords]
}

async function getChangedFiles(ctx: AdapterContext): Promise<string[]> {
  return ctx.cache.getOrCompute('consistency:changed-files', async () => {
    try {
      const tracked = await runGit(ctx.projectDir, ['diff', '--name-only', 'HEAD'])
      const untracked = await runGit(ctx.projectDir, ['status', '--porcelain'])
      const files = [
        ...tracked.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
        ...untracked.split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.startsWith('?? '))
          .map((line) => line.slice(3).trim()),
      ]
      return uniqueNormalized(files)
    } catch {
      return []
    }
  })
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, shell: false, stdio: ['ignore', 'pipe', 'ignore'] })
    let stdout = ''

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout)
        return
      }
      reject(new Error(`git ${args.join(' ')} failed with exit code ${code ?? 'unknown'}`))
    })
  })
}

async function readText(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch {
    return ''
  }
}

function uniqueNormalized(paths: string[]): string[] {
  return [...new Set(paths.map(normalizePath).filter(Boolean))]
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/')
}

// ---------------------------------------------------------------------------
// Contract-driven drift detection
// ---------------------------------------------------------------------------

async function detectDriftFromContract(
  ctx: AdapterContext,
  contract: OpenFlowContract,
): Promise<DriftItem[]> {
  if (!contract.alignmentItems || contract.alignmentItems.length === 0) return []

  const drifts: DriftItem[] = []
  const changedFiles = await getChangedFiles(ctx)
  const normalizedChanged = changedFiles.map(normalizePath)

  for (const item of contract.alignmentItems) {
    // Check if any changed file falls outside the declared modules
    const declaredModules = item.modules.map(normalizePath)
    if (declaredModules.length > 0) {
      for (const changed of normalizedChanged) {
        const inModule = declaredModules.some(mod => changed.includes(mod))
        if (!inModule) {
          drifts.push({
            item: changed,
            designDoc: declaredModules.join(', '),
            actualCode: `Changed file outside declared modules`,
            reason: `Changed file ${changed} not covered by alignment item for ${item.behaviorId}`,
          })
        }
      }
    }

    // Check if declared files exist in changed set (unimplemented design)
    for (const expectedFile of item.files) {
      const normalized = normalizePath(expectedFile)
      const hasChanged = normalizedChanged.some(c => c.includes(normalized))
      if (!hasChanged) {
        // Only report as drift if the file doesn't exist at all on disk
        const fullPath = path.join(ctx.projectDir, expectedFile)
        const exists = await fileExistsAtPath(fullPath)
        if (!exists) {
          drifts.push({
            item: expectedFile,
            designDoc: `alignment item ${item.behaviorId}`,
            actualCode: 'Not implemented',
            reason: `Design declares ${expectedFile} but file does not exist`,
          })
        }
      }
    }
  }

  return drifts
}

async function detectSymbolDrift(
  ctx: AdapterContext,
  contract: OpenFlowContract,
): Promise<DriftItem[]> {
  // Collect expected symbol names from alignmentItems
  const expectedSymbolNames = new Set<string>()
  for (const item of contract.alignmentItems) {
    for (const sym of item.expectedSymbols) {
      expectedSymbolNames.add(sym)
    }
  }
  if (expectedSymbolNames.size === 0) return []

  const drifts: DriftItem[] = []
  const changedFiles = await getChangedFiles(ctx)
  const fullPaths = changedFiles.map(f => path.join(ctx.projectDir, f))

  const resolvedSymbols = await extractSymbols(fullPaths)
  const symbolNames = new Set(resolvedSymbols.map(s => s.name))

  for (const expected of expectedSymbolNames) {
    if (!symbolNames.has(expected)) {
      drifts.push({
        item: expected,
        designDoc: 'expected symbol from contract',
        actualCode: 'Not found in changed files',
        reason: `Expected symbol ${expected} not found in source`,
      })
    }
  }

  return drifts
}

async function fileExistsAtPath(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}
