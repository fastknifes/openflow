import type { VerifyEvidenceCheckResult } from '../../types.js'
import type { EvidenceAdapter, AdapterContext } from '../types.js'
import { runCommand, type CommandResult } from '../command-runner.js'

const DEFAULT_COMMAND = 'gitleaks'
const DEFAULT_ARGS = ['detect', '--source', '.', '--no-git', '--verbose', '--format', 'json']
const FALLBACK_COMMAND = 'detect-secrets'
const FALLBACK_ARGS = ['scan', '--all-files']

interface GitleaksFinding {
  ruleId?: string
  description?: string
  file?: string
  startLine?: number
  endLine?: number
  secret?: string
  match?: string
}

export class SecretScannerAdapter implements EvidenceAdapter {
  readonly name = 'secret'

  async run(ctx: AdapterContext): Promise<VerifyEvidenceCheckResult[]> {
    const command = ctx.config.command ?? DEFAULT_COMMAND
    const args = ctx.config.args ?? DEFAULT_ARGS
    const timeout = ctx.config.timeout ?? 120000
    const onMissing = ctx.config.onMissing ?? 'skip'
    const cwd = ctx.projectDir

    const primaryToolLabel = command === DEFAULT_COMMAND ? 'gitleaks' : command
    let result: CommandResult = await runCommand(command, args, { cwd, timeout })

    // If primary tool is missing, try fallback
    if (result.status === 'tool_missing' && command === DEFAULT_COMMAND) {
      result = await runCommand(FALLBACK_COMMAND, FALLBACK_ARGS, { cwd, timeout })
    }

    // Handle tool missing
    if (result.status === 'tool_missing') {
      if (onMissing === 'fail') {
        return [{
          name: this.name,
          passed: false,
          category: 'security',
          detail: `failed: ${primaryToolLabel} not available`,
        }]
      }
      return [{
        name: this.name,
        passed: true,
        category: 'security',
        detail: `skipped: no secret scanner found; install gitleaks (https://github.com/gitleaks/gitleaks) or detect-secrets`,
      }]
    }

    // Handle timeout
    if (result.status === 'timeout') {
      return [{
        name: this.name,
        passed: false,
        category: 'security',
        detail: 'Secret scan timed out',
      }]
    }

    // Handle error
    if (result.status === 'error') {
      return [{
        name: this.name,
        passed: false,
        category: 'security',
        detail: `Secret scan error: ${result.errorMessage ?? 'unknown error'}`,
      }]
    }

    // Parse JSON output
    let findings: GitleaksFinding[]
    try {
      findings = JSON.parse(result.stdout)
      if (!Array.isArray(findings)) {
        // gitleaks can return an object with a findings array or null
        if (findings && Array.isArray((findings as unknown as Record<string, unknown>).findings)) {
          findings = (findings as unknown as Record<string, unknown[]>).findings as GitleaksFinding[]
        } else {
          findings = []
        }
      }
    } catch {
      return [{
        name: this.name,
        passed: false,
        category: 'security',
        detail: 'Secret scan failed: unable to parse scanner output',
      }]
    }

    // No findings → clean pass
    if (findings.length === 0) {
      return [{
        name: this.name,
        passed: true,
        category: 'security',
        detail: 'No secrets detected',
      }]
    }

    // Map findings to results, redacting secret content
    return findings.map((finding) => {
      const rule = finding.ruleId ?? 'unknown'
      const file = finding.file ?? 'unknown'
      const line = finding.startLine ?? finding.endLine ?? '?'
      return {
        name: `secret:${rule}`,
        passed: false,
        category: 'security' as const,
        detail: `Secret detected by rule ${rule} in ${file}:${line}`,
      }
    })
  }
}
