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

export class CurrentConstraintsAdapter implements EvidenceAdapter {
  readonly name = 'current_constraints'

  async run(ctx: AdapterContext): Promise<VerifyEvidenceCheckResult[]> {
    const config = ctx.config as AdapterConfig & ConsistencyAdapterConfig
    if (config.current_constraints === false) {
      return []
    }

    const runtime = ctx as RuntimeContext
    const changedFiles = uniqueNormalized(runtime.changedFiles ?? await getChangedFiles(ctx))
    const results: VerifyEvidenceCheckResult[] = []
    const seen = new Set<string>()

    // Contract-driven path: evaluate structured constraints directly
    if (runtime.contract?.currentConstraints && runtime.contract.currentConstraints.length > 0) {
      for (const constraint of runtime.contract.currentConstraints) {
        const isForbiddenDependency = constraint.rule.toLowerCase().includes('forbidden') || constraint.rule.toLowerCase().includes('dependency')
        if (isForbiddenDependency) {
          // Check if changed files import the forbidden dependency
          const codeFiles = await loadChangedFiles(ctx.projectDir, changedFiles)
          const depTargets = extractDependencyTargets(constraint.rule)
          for (const codeFile of codeFiles) {
            for (const dep of depTargets) {
              if (importsDependency(codeFile.content, dep)) {
                pushResult(results, seen, {
                  name: this.name,
                  passed: false,
                  category: 'consistency',
                  detail: `${codeFile.path} imports forbidden dependency ${dep} (${constraint.file}: ${constraint.rule})`,
                })
              }
            }
          }
        } else {
          // stable / public / locked — check if the target file was changed
          const targets = extractCodeTargets(constraint.rule)
          for (const target of targets) {
            if (changedFiles.includes(normalizePath(target))) {
              pushResult(results, seen, {
                name: this.name,
                passed: false,
                category: 'consistency',
                detail: `${target} changed but ${constraint.file} marks it with constraint (severity: ${constraint.severity})`,
              })
            }
          }
        }
      }

      if (results.length === 0) {
        return [{
          name: this.name,
          passed: true,
          category: 'consistency',
          detail: 'No docs/current constraint violations detected (contract-driven check).',
        }]
      }
      return results
    }

    // Fallback: existing markdown heuristic path
    const docs = await loadCurrentDocs(path.join(ctx.projectDir, 'docs', 'current'))
    const codeFiles = await loadChangedFiles(ctx.projectDir, changedFiles)

    for (const doc of docs) {
      const lines = doc.content.split(/\r?\n/)
      let inConstraintsSection = false

      for (const line of lines) {
        const trimmed = line.trim()
        if (/^##\s+constraints/i.test(trimmed)) {
          inConstraintsSection = true
          continue
        }
        if (/^##\s+/.test(trimmed)) {
          inConstraintsSection = false
        }

        if (/@stable|@public/i.test(trimmed)) {
          const targets = extractCodeTargets(trimmed)
          if (targets.length === 0) {
            pushResult(results, seen, ambiguous(`${doc.path}: ${trimmed}`))
            continue
          }

          for (const target of targets) {
            if (changedFiles.includes(target)) {
              pushResult(results, seen, {
                name: this.name,
                passed: false,
                category: 'consistency',
                detail: `${doc.path} marks ${target} as @stable/@public, but the file changed; ambiguous constraint; human decision required`,
              })
            }
          }
        }

        const mentionsLockedChange = /(locked|must not change|must not modify|禁止修改|不可变|不得修改)/i.test(trimmed)
        if (mentionsLockedChange) {
          const targets = extractCodeTargets(trimmed)
          if (targets.length === 0 && inConstraintsSection) {
            pushResult(results, seen, ambiguous(`${doc.path}: ${trimmed}`))
            continue
          }

          for (const target of targets) {
            if (changedFiles.includes(target)) {
              pushResult(results, seen, {
                name: this.name,
                passed: false,
                category: 'consistency',
                detail: `${target} changed but ${doc.path} marks it as locked or must-not-change`,
              })
            }
          }
        }

        const mentionsForbiddenDependency = /(forbidden|must not|禁止|不得).*(dependency|import|依赖)|forbidden dependency/i.test(trimmed)
        if (mentionsForbiddenDependency) {
          const dependencies = extractDependencyTargets(trimmed)
          if (dependencies.length === 0 && inConstraintsSection) {
            pushResult(results, seen, ambiguous(`${doc.path}: ${trimmed}`))
            continue
          }

          for (const dependency of dependencies) {
            for (const codeFile of codeFiles) {
              if (importsDependency(codeFile.content, dependency)) {
                pushResult(results, seen, {
                  name: this.name,
                  passed: false,
                  category: 'consistency',
                  detail: `${codeFile.path} imports forbidden dependency ${dependency} referenced by ${doc.path}`,
                })
              }
            }
          }
        }
      }
    }

    if (results.length === 0) {
      return [{
        name: this.name,
        passed: true,
        category: 'consistency',
        detail: 'No docs/current constraint violations detected.',
      }]
    }

    return results
  }
}

async function loadCurrentDocs(rootDir: string): Promise<LoadedFile[]> {
  return walkMarkdownFiles(rootDir, rootDir)
}

async function loadChangedFiles(projectDir: string, changedFiles: string[]): Promise<LoadedFile[]> {
  const loaded = await Promise.all(changedFiles.map(async (filePath) => ({
    path: filePath,
    content: await readText(path.join(projectDir, filePath)),
  })))
  return loaded.filter((file) => file.content.length > 0)
}

function extractCodeTargets(line: string): string[] {
  const targets = new Set<string>()
  for (const match of line.matchAll(/`((?:src|tests|docs)\/[\w./-]+)`/g)) {
    const target = match[1]
    if (target) {
      targets.add(normalizePath(target))
    }
  }
  for (const match of line.matchAll(/((?:src|tests|docs)\/[\w./-]+)/g)) {
    const target = match[1]
    if (target) {
      targets.add(normalizePath(target))
    }
  }
  return [...targets]
}

function extractDependencyTargets(line: string): string[] {
  const values = new Set<string>()
  for (const match of line.matchAll(/`([^`]+)`/g)) {
    const candidate = match[1]
    if (!candidate) {
      continue
    }

    const trimmed = candidate.trim()
    if (!trimmed.includes('/') && !trimmed.endsWith('.ts') && !trimmed.endsWith('.js')) {
      values.add(trimmed)
    }
  }
  return [...values]
}

function importsDependency(content: string, dependency: string): boolean {
  const escaped = dependency.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const importPattern = new RegExp(`from\\s+['\"]${escaped}['\"]|require\\(\\s*['\"]${escaped}['\"]\\s*\\)`, 'm')
  return importPattern.test(content)
}

function ambiguous(source: string): VerifyEvidenceCheckResult {
  return {
    name: 'current_constraints',
    passed: false,
    category: 'consistency',
    detail: `${source} -> ambiguous constraint; human decision required`,
  }
}

function pushResult(results: VerifyEvidenceCheckResult[], seen: Set<string>, result: VerifyEvidenceCheckResult): void {
  const key = `${result.name}:${result.detail}`
  if (seen.has(key)) {
    return
  }
  seen.add(key)
  results.push(result)
}

async function walkMarkdownFiles(rootDir: string, currentDir: string): Promise<LoadedFile[]> {
  try {
    const entries = await fs.readdir(currentDir, { withFileTypes: true })
    const results: LoadedFile[] = []
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        results.push(...await walkMarkdownFiles(rootDir, fullPath))
        continue
      }
      if (!entry.name.endsWith('.md')) {
        continue
      }
      results.push({
        path: normalizePath(path.relative(rootDir, fullPath)),
        content: await fs.readFile(fullPath, 'utf-8'),
      })
    }
    return results
  } catch {
    return []
  }
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
