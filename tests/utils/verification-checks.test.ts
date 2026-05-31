import { test, expect, describe } from 'bun:test'
import { formatSecurityChecks, formatQualityChecks } from '../../src/utils/verification-checks.js'

describe('formatSecurityChecks', () => {
  test('formats secret check in task mode', () => {
    const result = formatSecurityChecks(['secret'], 'task')
    expect(result).toBe('- **Secret Scan**: Check for accidentally committed secrets')
  })

  test('formats vuln check in task mode (includes npm audit)', () => {
    const result = formatSecurityChecks(['vuln'], 'task')
    expect(result).toContain('npm audit')
    expect(result).toContain('Vulnerability Scan')
  })

  test('formats vuln check in plan mode (no npm audit)', () => {
    const result = formatSecurityChecks(['vuln'], 'plan')
    expect(result).toContain('dependency vulnerability check')
    expect(result).not.toContain('npm audit')
  })

  test('formats dependency check', () => {
    const result = formatSecurityChecks(['dependency'], 'task')
    expect(result).toContain('Dependency Review')
  })

  test('formats multiple checks joined with newline', () => {
    const result = formatSecurityChecks(['secret', 'vuln', 'dependency'], 'task')
    const lines = result.split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('Secret Scan')
    expect(lines[1]).toContain('Vulnerability Scan')
    expect(lines[2]).toContain('Dependency Review')
  })

  test('returns empty string for empty array', () => {
    const result = formatSecurityChecks([], 'task')
    expect(result).toBe('')
  })

  test('formats dependency check in plan mode', () => {
    const result = formatSecurityChecks(['dependency'], 'plan')
    expect(result).toContain('Dependency Review')
  })
})

describe('formatQualityChecks', () => {
  test('formats lint check in task mode', () => {
    const result = formatQualityChecks(['lint'], 'task')
    expect(result).toBe('- **Lint**: Run linter')
  })

  test('formats lint check in plan mode', () => {
    const result = formatQualityChecks(['lint'], 'plan')
    expect(result).toBe('- **Lint Check**: Run linter')
  })

  test('formats typecheck in task mode (includes tsc --noEmit)', () => {
    const result = formatQualityChecks(['typecheck'], 'task')
    expect(result).toContain('tsc --noEmit')
    expect(result).toContain('Type Check')
  })

  test('formats typecheck in plan mode (no tsc)', () => {
    const result = formatQualityChecks(['typecheck'], 'plan')
    expect(result).toContain('Type Check')
    expect(result).not.toContain('tsc')
  })

  test('formats test check in task mode', () => {
    const result = formatQualityChecks(['test'], 'task')
    expect(result).toContain('Run test suite')
  })

  test('formats test check in plan mode', () => {
    const result = formatQualityChecks(['test'], 'plan')
    expect(result).toContain('Test Suite')
  })

  test('formats format check', () => {
    const result = formatQualityChecks(['format'], 'task')
    expect(result).toContain('Format Check')
  })

  test('formats multiple quality checks joined with newline', () => {
    const result = formatQualityChecks(['lint', 'typecheck', 'test', 'format'], 'task')
    const lines = result.split('\n')
    expect(lines).toHaveLength(4)
    expect(lines[0]).toContain('Lint')
    expect(lines[1]).toContain('Type Check')
    expect(lines[2]).toContain('Tests')
    expect(lines[3]).toContain('Format Check')
  })

  test('returns empty string for empty array', () => {
    const result = formatQualityChecks([], 'task')
    expect(result).toBe('')
  })
})
