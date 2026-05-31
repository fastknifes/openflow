import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { VerifyEvidenceCheckResult } from '../../types.js'
import type { EvidenceAdapter, AdapterContext } from '../types.js'
import { runCommand } from '../command-runner.js'

interface AuditAdvisory {
  severity?: string
  title?: string
  module_name?: string
  findings?: Array<{ paths?: string[] }>
  cves?: string[]
  url?: string
}

interface AuditResult {
  advisories?: Record<string, AuditAdvisory>
  error?: { code?: string; summary?: string }
}

const LOCKFILES: Array<{ file: string; manager: string; auditArgs: string[] }> = [
  { file: 'package-lock.json', manager: 'npm', auditArgs: ['audit', '--json'] },
  { file: 'pnpm-lock.yaml', manager: 'pnpm', auditArgs: ['audit', '--json'] },
  { file: 'yarn.lock', manager: 'yarn', auditArgs: ['npm', 'audit', '--json'] },
]

export class VulnerabilityScannerAdapter implements EvidenceAdapter {
  readonly name = 'vuln'

  async run(ctx: AdapterContext): Promise<VerifyEvidenceCheckResult[]> {
    const cwd = ctx.projectDir
    const timeout = ctx.config.timeout ?? 180000
    const onMissing = ctx.config.onMissing ?? 'skip'

    // If custom command/args provided, use those directly
    if (ctx.config.command) {
      return this.runWithCommand(ctx, ctx.config.command, ctx.config.args ?? [], cwd, timeout, onMissing)
    }

    // Auto-detect lockfile
    for (const entry of LOCKFILES) {
      if (existsSync(join(cwd, entry.file))) {
        return this.runWithCommand(ctx, entry.manager, entry.auditArgs, cwd, timeout, onMissing)
      }
    }

    // No lockfile found
    if (onMissing === 'fail') {
      return [{
        name: this.name,
        passed: false,
        category: 'security',
        detail: 'failed: no lockfile found (package-lock.json, pnpm-lock.yaml, or yarn.lock)',
      }]
    }
    return [{
      name: this.name,
      passed: true,
      category: 'security',
      detail: 'skipped: no lockfile found',
    }]
  }

  private async runWithCommand(
    ctx: AdapterContext,
    command: string,
    args: string[],
    cwd: string,
    timeout: number,
    onMissing: 'skip' | 'fail',
  ): Promise<VerifyEvidenceCheckResult[]> {
    const result = await runCommand(command, args, { cwd, timeout })

    if (result.status === 'tool_missing') {
      if (onMissing === 'fail') {
        return [{
          name: this.name,
          passed: false,
          category: 'security',
          detail: `failed: ${result.errorMessage ?? `${command} not available`}`,
        }]
      }
      return [{
        name: this.name,
        passed: true,
        category: 'security',
        detail: `skipped: ${result.errorMessage ?? `${command} not available`}`,
      }]
    }

    if (result.status === 'timeout') {
      return [{
        name: this.name,
        passed: false,
        category: 'security',
        detail: 'Vulnerability scan timed out',
      }]
    }

    if (result.status === 'error') {
      return [{
        name: this.name,
        passed: false,
        category: 'security',
        detail: `Vulnerability scan error: ${result.errorMessage ?? 'unknown error'}`,
      }]
    }

    // Parse audit JSON
    let auditData: AuditResult
    try {
      auditData = JSON.parse(result.stdout)
    } catch {
      return [{
        name: this.name,
        passed: false,
        category: 'security',
        detail: 'Vulnerability scan failed: unable to parse audit output',
      }]
    }

    // Handle audit error (e.g., no lockfile or audit not supported)
    if (auditData.error) {
      return [{
        name: this.name,
        passed: false,
        category: 'security',
        detail: `Audit error: ${auditData.error.summary ?? auditData.error.code ?? 'unknown'}`,
      }]
    }

    const advisories = auditData.advisories ?? {}
    const advisoryEntries = Object.values(advisories)

    // Store in cache so dependency-check can reuse
    ctx.cache.getOrCompute('npm-audit', async () => auditData)

    if (advisoryEntries.length === 0) {
      return [{
        name: this.name,
        passed: true,
        category: 'security',
        detail: 'No vulnerabilities found',
      }]
    }

    return advisoryEntries.map((advisory) => {
      const severity = (advisory.severity ?? 'unknown').toLowerCase()
      const isCritical = severity === 'critical' || severity === 'high'
      const title = advisory.title ?? 'Unknown advisory'
      const moduleName = advisory.module_name ?? 'unknown'
      const cveInfo = advisory.cves?.length ? ` (${advisory.cves.join(', ')})` : ''

      return {
        name: `vuln:${moduleName}`,
        passed: !isCritical,
        category: 'security' as const,
        detail: isCritical
          ? `${severity}: ${title} in ${moduleName}${cveInfo}`
          : `${severity}: ${title} in ${moduleName}${cveInfo} (non-blocking)`,
      }
    })
  }
}
