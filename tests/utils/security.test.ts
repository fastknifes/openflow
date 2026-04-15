import { describe, expect, test } from 'bun:test'
import {
  sanitizeFeatureName,
  createSafePath,
  SecurityError,
  MAX_FEATURE_NAME_LENGTH,
  escapeMarkdown,
} from '../../src/utils/security'

describe('sanitizeFeatureName', () => {
  test('should lowercase and replace special chars with dash', () => {
    expect(sanitizeFeatureName('User Login!')).toBe('user-login')
  })

  test('should throw on empty input', () => {
    expect(() => sanitizeFeatureName('')).toThrow(SecurityError)
    expect(() => sanitizeFeatureName('   ')).toThrow(SecurityError)
  })

  test('should throw on whitespace-only input', () => {
    expect(() => sanitizeFeatureName('   \n\t')).toThrow(SecurityError)
  })

  test('should throw on too long input', () => {
    const longName = 'a'.repeat(65)
    expect(() => sanitizeFeatureName(longName)).toThrow(SecurityError)
  })

  test('should throw on too short after sanitization', () => {
    expect(() => sanitizeFeatureName('a')).toThrow(SecurityError)
  })
})

describe('createSafePath', () => {
  test('should return safe path within base dir', () => {
    const baseDir = '/project/root'
    const result = createSafePath(baseDir, 'docs', 'test.md')
    expect(result.endsWith('docs/test.md') || result.endsWith('docs\\test.md')).toBe(true)
  })

  test('should throw on path traversal attempt', () => {
    const baseDir = '/project/root'
    expect(() => createSafePath(baseDir, '..', 'etc/passwd')).toThrow(SecurityError)
  })

  test('should throw on absolute path attempt', () => {
    const baseDir = '/project/root'
    expect(() => createSafePath(baseDir, '/etc/passwd')).toThrow(SecurityError)
  })
})

describe('escapeMarkdown', () => {
  test('should escape markdown special characters', () => {
    expect(escapeMarkdown('**bold**')).toBe('\\*\\*bold\\*\\*')
    expect(escapeMarkdown('[link](url)')).toBe('\\[link\\]\\(url\\)')
    expect(escapeMarkdown('`code`')).toBe('\\`code\\`')
    expect(escapeMarkdown('# heading')).toBe('\\# heading')
  })
})
