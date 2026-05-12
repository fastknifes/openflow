import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { spawn } from 'node:child_process'
import type { AdapterConfig, ConsistencyAdapterConfig, PhasedChanges, VerifyEvidenceCheckResult } from '../../types.js'
import type { AdapterContext, EvidenceAdapter } from '../types.js'
import type { Constraint } from '../../contracts/openflow-contract.js'

type RuntimeContext = AdapterContext & {
  changedFiles?: string[]
  phasedChanges?: PhasedChanges
  contract?: { currentConstraints?: Constraint[]; decisionConstraints?: Constraint[]; [k: string]: unknown } | null
}

interface LoadedFile {
  content: string
  path: string
}

export class DecisionsConstraintsAdapter implements EvidenceAdapter {
  readonly name = 'decisions_constraints'

  async run(ctx: AdapterContext): Promise<VerifyEvidenceCheckResult[]> {
    const config = ctx.config as AdapterConfig & ConsistencyAdapterConfig
    if (config.decisions_constraints === false) {
      return []
    }

    const runtime = ctx as RuntimeContext
    const changedFiles = uniqueNormalized(runtime.changedFiles ?? await getChangedFiles(ctx))

    // Contract-driven path: evaluate structured decision constraints directly
    if (runtime.contract?.decisionConstraints && runtime.contract.decisionConstraints.length > 0) {
      return this.evaluateContractConstraints(ctx, changedFiles, runtime.contract.decisionConstraints)
    }

    // Fallback: existing ADR parsing path
    const changedCode = await loadChangedFiles(ctx.projectDir, changedFiles)
    const adrDir = path.join(ctx.projectDir, 'docs', 'decisions')
    const adrs = await loadAdrFiles(adrDir)
    const results: VerifyEvidenceCheckResult[] = []

    for (const adr of adrs) {
      if (adr.path.includes('ADR-002')) {
        results.push(...checkAdr002(this.name, adr, changedCode))
      }
      if (adr.path.includes('ADR-003')) {
        results.push(...checkAdr003(this.name, adr, changedCode))
      }
    }

    if (results.length === 0) {
      return [{
        name: this.name,
        passed: true,
        category: 'consistency',
        detail: 'No ADR constraint violations detected.',
      }]
    }

    return dedupe(results)
  }

  private async evaluateContractConstraints(
    ctx: AdapterContext,
    changedFiles: string[],
    constraints: Constraint[],
  ): Promise<VerifyEvidenceCheckResult[]> {
    const changedCode = await loadChangedFiles(ctx.projectDir, changedFiles)
    const results: VerifyEvidenceCheckResult[] = []

    for (const constraint of constraints) {
      // Extract code patterns from the rule to find prohibited patterns
      const codePatterns = extractCodePatterns(constraint.rule)
      const prohibitedPattern = codePatterns.length > 1 ? codePatterns[1] : undefined
      for (const file of changedCode) {
        if (prohibitedPattern && file.content.includes(prohibitedPattern)) {
          results.push({
            name: this.name,
            passed: false,
            category: 'consistency',
            detail: `${file.path} contains prohibited pattern "${prohibitedPattern}" (${constraint.file}: ${constraint.rule})`,
          })
        }
      }
    }

    if (results.length === 0) {
      return [{
        name: this.name,
        passed: true,
        category: 'consistency',
        detail: 'No ADR constraint violations detected (contract-driven check).',
      }]
    }
    return dedupe(results)
  }
}

function checkAdr002(adapterName: string, adr: LoadedFile, changedCode: LoadedFile[]): VerifyEvidenceCheckResult[] {
  const prohibited = [...adr.content.matchAll(/-\s+(`?\/openflow\/[\w-]+`?)\s*\(应为\s*(`?\/openflow-[\w-]+`?)\)/g)]
    .flatMap((match) => {
      const wrong = match[1]
      const correct = match[2]
      return wrong && correct ? [{ wrong: stripTicks(wrong), correct: stripTicks(correct) }] : []
    })
  const results: VerifyEvidenceCheckResult[] = []

  for (const { wrong, correct } of prohibited) {
    for (const file of changedCode) {
      if (file.content.includes(wrong)) {
        results.push({
          name: adapterName,
          passed: false,
          category: 'consistency',
          detail: `${file.path} uses prohibited command form ${wrong}; ADR-002 requires ${correct}`,
        })
      }
    }
  }

  return results
}

function checkAdr003(adapterName: string, adr: LoadedFile, changedCode: LoadedFile[]): VerifyEvidenceCheckResult[] {
  const results: VerifyEvidenceCheckResult[] = []
  const exceptionMatch = adr.content.match(/openflow-writing-plan[^\n]*保留 Skill 注册|openflow-writing-plan[^\n]*Skill/i)
  const allowedSkill = exceptionMatch ? 'openflow-writing-plan' : null

  if (!allowedSkill) {
    return [{
      name: 'decisions_constraints',
      passed: false,
      category: 'consistency',
      detail: `${adr.path} -> ambiguous constraint; human decision required`,
    }]
  }

  for (const file of changedCode) {
    const normalizedPath = normalizePath(file.path)
    const skillPathViolation = /(^|\/)(?:src\/skills|\.config\/opencode\/skills|skills)\//.test(normalizedPath)
      && /openflow-(?!writing-plan)[a-z-]+/i.test(`${normalizedPath}\n${file.content}`)
    if (skillPathViolation) {
      results.push({
        name: adapterName,
        passed: false,
        category: 'consistency',
        detail: `${file.path} registers OpenFlow command behavior through skills; ADR-003 requires command-file registration except ${allowedSkill}`,
      })
    }

    const skillRegistrations = [...file.content.matchAll(/openflow-[a-z-]+/g)]
      .map((match) => match[0])
      .filter((name) => name !== allowedSkill)
    if (/registerSkills|SKILL\.md|source:\s*["']skill["']/i.test(file.content) && skillRegistrations.length > 0) {
      results.push({
        name: adapterName,
        passed: false,
        category: 'consistency',
        detail: `${file.path} references ${skillRegistrations.join(', ')} through skill registration; ADR-003 requires commands/ registration except ${allowedSkill}`,
      })
    }
  }

  return results
}

async function loadAdrFiles(rootDir: string): Promise<LoadedFile[]> {
  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true })
    const files = entries.filter((entry) => entry.isFile() && /^ADR-\d+.*\.md$/i.test(entry.name))
    return Promise.all(files.map(async (entry) => ({
      path: entry.name,
      content: await fs.readFile(path.join(rootDir, entry.name), 'utf-8'),
    })))
  } catch {
    return []
  }
}

async function loadChangedFiles(projectDir: string, changedFiles: string[]): Promise<LoadedFile[]> {
  const loaded = await Promise.all(changedFiles.map(async (filePath) => ({
    path: filePath,
    content: await readText(path.join(projectDir, filePath)),
  })))
  return loaded.filter((file) => file.content.length > 0)
}

function stripTicks(value: string): string {
  return value.replace(/`/g, '')
}

function extractCodePatterns(line: string): string[] {
  const patterns: string[] = []
  const regex = /`([^`]+)`/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(line)) !== null) {
    patterns.push(m[1]!)
  }
  return patterns
}

function dedupe(results: VerifyEvidenceCheckResult[]): VerifyEvidenceCheckResult[] {
  const seen = new Set<string>()
  return results.filter((result) => {
    const key = `${result.name}:${result.detail}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
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
