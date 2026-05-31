import type { SecurityCheckType, QualityCheckType } from '../types.js'
import { escapeMarkdown } from './security.js'

type VerificationFormatMode = 'task' | 'plan'

function formatPrefix(_mode: VerificationFormatMode): string {
  return '-'
}

function formatSecurityCheck(check: SecurityCheckType, mode: VerificationFormatMode): string {
  const prefix = formatPrefix(mode)

  switch (check) {
    case 'secret':
      return `${prefix} **Secret Scan**: Check for accidentally committed secrets`
    case 'vuln':
      return mode === 'task'
        ? `${prefix} **Vulnerability Scan**: Run \`npm audit\` or equivalent`
        : `${prefix} **Vulnerability Scan**: Run dependency vulnerability check`
    case 'dependency':
      return `${prefix} **Dependency Review**: Verify new dependencies are trusted`
    default:
      return `${prefix} **${escapeMarkdown(check)}**: Run security check`
  }
}

function formatQualityCheck(check: QualityCheckType, mode: VerificationFormatMode): string {
  const prefix = formatPrefix(mode)

  switch (check) {
    case 'lint':
      return mode === 'task'
        ? `${prefix} **Lint**: Run linter`
        : `${prefix} **Lint Check**: Run linter`
    case 'typecheck':
      return mode === 'task'
        ? `${prefix} **Type Check**: Run \`tsc --noEmit\` or equivalent`
        : `${prefix} **Type Check**: Run type checker`
    case 'test':
      return mode === 'task'
        ? `${prefix} **Tests**: Run test suite and ensure all pass`
        : `${prefix} **Test Suite**: Run all tests`
    case 'format':
      return mode === 'task'
        ? `${prefix} **Format Check**: Run formatter check`
        : `${prefix} **Format Check**: Run formatter check`
    default:
      return `${prefix} **${escapeMarkdown(check)}**: Run quality check`
  }
}

export function formatSecurityChecks(
  checks: SecurityCheckType[],
  mode: VerificationFormatMode
): string {
  return checks.map((check) => formatSecurityCheck(check, mode)).join('\n')
}

export function formatQualityChecks(
  checks: QualityCheckType[],
  mode: VerificationFormatMode
): string {
  return checks.map((check) => formatQualityCheck(check, mode)).join('\n')
}
