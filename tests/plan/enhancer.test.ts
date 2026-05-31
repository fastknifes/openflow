import { test, expect, describe } from 'bun:test'
import { classifyVerificationFailure } from '../../src/plan/enhancer.js'

describe('classifyVerificationFailure', () => {
  describe('security category', () => {
    test.each([
      ['secret', 'secret exposed in logs'],
      ['vuln', 'vuln detected in dependency'],
      ['security', 'security issue found'],
      ['credential', 'credential leaked'],
      ['token', 'token exposed in output'],
      ['Secret', 'Secret key in config'],
      ['SECURITY', 'SECURITY vulnerability'],
    ])('classifies "%s" related reason as security', (_keyword, reason) => {
      expect(classifyVerificationFailure(reason)).toBe('security')
    })
  })

  describe('consistency category', () => {
    test.each([
      ['drift', 'drift detected between code and docs'],
      ['mismatch', 'mismatch in API specification'],
      ['sync', 'sync needed between modules'],
      ['inconsistent', 'inconsistent state detected'],
      ['doc', 'doc out of date with implementation'],
      ['Drift', 'Drift between design and code'],
      ['MISMATCH', 'MISMATCH found'],
    ])('classifies "%s" related reason as consistency', (_keyword, reason) => {
      expect(classifyVerificationFailure(reason)).toBe('consistency')
    })
  })

  describe('quality category (default)', () => {
    test.each([
      'test coverage too low',
      'build failed',
      'linting errors',
      'performance regression',
      'type errors in compilation',
      'general quality issue',
    ])('classifies "%s" as quality', (reason) => {
      expect(classifyVerificationFailure(reason)).toBe('quality')
    })
  })

  test('is case insensitive', () => {
    expect(classifyVerificationFailure('SECRET')).toBe('security')
    expect(classifyVerificationFailure('DRIFT')).toBe('consistency')
    expect(classifyVerificationFailure('SOMETHING')).toBe('quality')
  })

  test('security takes priority over consistency when both present', () => {
    // Both "secret" and "doc" present — security is checked first
    expect(classifyVerificationFailure('secret doc mismatch')).toBe('security')
  })
})
