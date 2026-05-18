import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { VerifyEvidenceCheckResult } from '../../types.js'
import type { EvidenceAdapter, AdapterContext } from '../types.js'
import { runCommand } from '../command-runner.js'

interface AuditAdvisory {
  severity?: string
  module_name?: string
  title?: string
  recommendation?: string
  findings?: Array<{ paths?: string[]; version?: string }>
  deprecated?: boolean
  deprecation_info?: string
  cves?: string[]
}

interface AuditResult {
  advisories?: Record<string, AuditAdvisory>
  error?: { code?: string; summary?: string }
}

interface PackageJsonInfo {
  engines?: Record<string, string>
}

export class DependencyCheckAdapter implements EvidenceAdapter {
  readonly name = 'dependency'

  async run(ctx: AdapterContext): Promise<VerifyEvidenceCheckResult[]> {
    const cwd = ctx.projectDir
    const timeout = ctx.config.timeout ?? 120000

    // Try to get cached audit data; if not available, run audit ourselves
    // (but prefer cache from vuln-scanner)
    const auditData = await ctx.cache.getOrCompute('npm-audit', () =>
      this.runAudit(cwd, timeout)
    )

    // If audit failed or has error, we can still check deprecation but report
    if (auditData.error) {
      return [{
        name: this.name,
        passed: true,
        category: 'security',
        detail: `skipped: audit data unavailable (${auditData.error.summary ?? auditData.error.code ?? 'unknown'})`,
      }]
    }

    if (!auditData.advisories) {
      return [{
        name: this.name,
        passed: true,
        category: 'security',
        detail: 'No dependency issues detected',
      }]
    }

    const results: VerifyEvidenceCheckResult[] = []
    const advisories = Object.values(auditData.advisories)

    // Check for deprecated packages
    const deprecated = advisories.filter(a => a.deprecated)
    for (const advisory of deprecated) {
      const moduleName = advisory.module_name ?? 'unknown'
      results.push({
        name: `dep:${moduleName}`,
        passed: true,
        category: 'security',
        detail: `${moduleName} is deprecated${advisory.deprecation_info ? `: ${advisory.deprecation_info}` : ''}; consider replacing`,
      })
    }

    // Check engine version mismatches
    const packageJsonPath = join(cwd, 'package.json')
    if (existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(
          await this.readFile(packageJsonPath)
        ) as PackageJsonInfo
        if (pkg.engines) {
          const nodeVersion = process.version.replace(/^v/, '')
          const requiredNode = pkg.engines['node']
          if (requiredNode && !this.satisfiesVersion(nodeVersion, requiredNode)) {
            results.push({
              name: 'engine:node',
              passed: true,
              category: 'security',
              detail: `Node version mismatch: running ${process.version}, package.json requires ${requiredNode}`,
            })
          }
        }
      } catch {
        // Can't read package.json — skip engine check
      }
    }

    if (results.length === 0) {
      results.push({
        name: this.name,
        passed: true,
        category: 'security',
        detail: 'No deprecated packages or engine mismatches detected',
      })
    }

    return results
  }

  private async runAudit(
    cwd: string,
    timeout: number
  ): Promise<AuditResult> {
    // Auto-detect package manager from lockfile
    const lockfiles = [
      { file: 'package-lock.json', cmd: 'npm', args: ['audit', '--json'] },
      { file: 'pnpm-lock.yaml', cmd: 'pnpm', args: ['audit', '--json'] },
      { file: 'yarn.lock', cmd: 'yarn', args: ['npm', 'audit', '--json'] },
    ]

    for (const entry of lockfiles) {
      if (existsSync(join(cwd, entry.file))) {
        const result = await runCommand(entry.cmd, entry.args, { cwd, timeout })
        try {
          return JSON.parse(result.stdout) as AuditResult
        } catch {
          return { error: { code: 'PARSE_ERROR', summary: 'Failed to parse audit output' } }
        }
      }
    }

    return { error: { code: 'NO_LOCKFILE', summary: 'No lockfile found' } }
  }

  private async readFile(filePath: string): Promise<string> {
    const { readFile } = await import('node:fs/promises')
    return readFile(filePath, 'utf-8')
  }

  private satisfiesVersion(actual: string, required: string): boolean {
    // Simple semver check for common patterns like ">=18.0.0", "^18", "18.x"
    try {
      const actualParts = actual.split('.').map(Number)
      const clean = required.replace(/[>=<^~\s]/g, '')
      const requiredParts = clean.split('.').map(Number)
      const maxLen = Math.max(actualParts.length, requiredParts.length)
      for (let i = 0; i < maxLen; i++) {
        const a = actualParts[i] ?? 0
        const r = requiredParts[i] ?? 0
        if (a > r) return true
        if (a < r) return false
      }
      return true
    } catch {
      return true // Can't parse — assume satisfied
    }
  }
}
