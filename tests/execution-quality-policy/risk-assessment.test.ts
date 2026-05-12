import { describe, expect, test } from 'bun:test'
import { assessChangeRisk, isHighRisk } from '../../src/utils/risk-assessment.js'

describe('assessChangeRisk', () => {
  test('3+ files -> high', () => {
    expect(assessChangeRisk(['a.ts', 'b.ts', 'c.ts'], 0, false)).toBe('high')
    expect(assessChangeRisk(['a.ts', 'b.ts', 'c.ts', 'd.ts'], 0, false)).toBe('high')
  })

  test('50+ diff lines -> high', () => {
    expect(assessChangeRisk(['a.ts'], 50, false)).toBe('high')
    expect(assessChangeRisk(['a.ts'], 100, false)).toBe('high')
  })

  test('hasNewExports=true -> high', () => {
    expect(assessChangeRisk(['a.ts'], 10, true)).toBe('high')
  })

  test('sensitive path -> high', () => {
    expect(assessChangeRisk(['src/hooks/useAuth.ts'], 10, false)).toBe('high')
    expect(assessChangeRisk(['src/commands/run.ts'], 10, false)).toBe('high')
    expect(assessChangeRisk(['src/config/settings.ts'], 10, false)).toBe('high')
    expect(assessChangeRisk(['src/verify/check.ts'], 10, false)).toBe('high')
    expect(assessChangeRisk(['src/archive/store.ts'], 10, false)).toBe('high')
    expect(assessChangeRisk(['src/security/policy.ts'], 10, false)).toBe('high')
    expect(assessChangeRisk(['src/auth/login.ts'], 10, false)).toBe('high')
    expect(assessChangeRisk(['src/permission/role.ts'], 10, false)).toBe('high')
    expect(assessChangeRisk(['src/payment/gateway.ts'], 10, false)).toBe('high')
  })

  test('src/types.ts or src/index.ts -> high', () => {
    expect(assessChangeRisk(['src/types.ts'], 10, false)).toBe('high')
    expect(assessChangeRisk(['src/index.ts'], 10, false)).toBe('high')
  })

  test('2 files, no triggers -> medium', () => {
    expect(assessChangeRisk(['a.ts', 'b.ts'], 10, false)).toBe('medium')
  })

  test('1 file, no triggers -> low', () => {
    expect(assessChangeRisk(['a.ts'], 10, false)).toBe('low')
  })

  test('0 files -> low', () => {
    expect(assessChangeRisk([], 0, false)).toBe('low')
  })

  test('null/undefined files handled gracefully -> low', () => {
    expect(assessChangeRisk(undefined as unknown as string[], 0, false)).toBe('low')
    expect(assessChangeRisk(null as unknown as string[], 0, false)).toBe('low')
  })

  test('priority order: files.length beats diffLines', () => {
    expect(assessChangeRisk(['a.ts', 'b.ts', 'c.ts'], 5, false)).toBe('high')
  })

  test('priority order: diffLines beats hasNewExports', () => {
    expect(assessChangeRisk(['a.ts'], 50, false)).toBe('high')
  })

  test('priority order: hasNewExports beats sensitive path', () => {
    expect(assessChangeRisk(['src/auth/login.ts'], 10, true)).toBe('high')
  })

  test('medium when exactly 2 files even with moderate diff', () => {
    expect(assessChangeRisk(['a.ts', 'b.ts'], 30, false)).toBe('medium')
  })
})

describe('isHighRisk', () => {
  test('returns true only for high', () => {
    expect(isHighRisk('high')).toBe(true)
    expect(isHighRisk('medium')).toBe(false)
    expect(isHighRisk('low')).toBe(false)
  })
})
