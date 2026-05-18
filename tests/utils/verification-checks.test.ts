import { describe, expect, test } from 'bun:test'
import { formatSecurityChecks, formatQualityChecks } from '../../src/utils/verification-checks.js'

describe('verification-checks', () => {
  test('formats task security checks', () => {
    const output = formatSecurityChecks(['secret', 'vuln', 'dependency'], 'task')
    expect(output).toContain('- **Secret Scan**: Check for accidentally committed secrets')
    expect(output).toContain('- **Vulnerability Scan**: Run `npm audit` or equivalent')
    expect(output).toContain('- **Dependency Review**: Verify new dependencies are trusted')
  })

  test('formats plan quality checks as procedural guidance', () => {
    const output = formatQualityChecks(['lint', 'typecheck', 'test', 'format'], 'plan')
    expect(output).toContain('- **Lint Check**: Run linter')
    expect(output).toContain('- **Type Check**: Run type checker')
    expect(output).toContain('- **Test Suite**: Run all tests')
    expect(output).toContain('- **Format Check**: Run formatter check')
  })
})
