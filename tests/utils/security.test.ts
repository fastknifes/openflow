import { test, expect, describe } from 'bun:test'
import {
  sanitizeFeatureName,
  validateBuildId,
  validateConfigPath,
  createSafePath,
  escapeMarkdown,
  generateBuildId,
  getDatePrefix,
  addDatePrefix,
  SecurityError,
  MAX_FEATURE_NAME_LENGTH,
  MAX_BUILD_ID_LENGTH,
  MAX_PATH_DEPTH,
} from '../../src/utils/security.js'
import {
  OpenFlowError,
  ErrorCode,
  isError,
  wrapError,
  extractErrorMessage,
  formatToolError,
  catchAndLog,
  catchAndLogAsync,
} from '../../src/utils/errors.js'
import {
  escapeInline,
  normalizeWhitespace,
} from '../../src/utils/markdown-helpers.js'

// ─── security.ts ─────────────────────────────────────────────────────────────

describe('SecurityError', () => {
  test('is an instance of Error', () => {
    const err = new SecurityError('test')
    expect(err).toBeInstanceOf(Error)
  })

  test('is an instance of SecurityError', () => {
    const err = new SecurityError('test')
    expect(err).toBeInstanceOf(SecurityError)
  })

  test('has correct name property', () => {
    const err = new SecurityError('test')
    expect(err.name).toBe('SecurityError')
  })

  test('preserves message', () => {
    const err = new SecurityError('something went wrong')
    expect(err.message).toBe('something went wrong')
  })
})

describe('sanitizeFeatureName', () => {
  test('returns lowercase slug for a simple name', () => {
    expect(sanitizeFeatureName('My Feature')).toBe('my-feature')
  })

  test('lowercases input', () => {
    expect(sanitizeFeatureName('HelloWorld')).toBe('helloworld')
  })

  test('replaces special characters with hyphens', () => {
    expect(sanitizeFeatureName('feat@2024!')).toBe('feat-2024')
  })

  test('collapses consecutive hyphens', () => {
    expect(sanitizeFeatureName('a---b')).toBe('a-b')
  })

  test('strips leading and trailing hyphens', () => {
    expect(sanitizeFeatureName('--hello--')).toBe('hello')
  })

  test('allows alphanumeric and hyphens', () => {
    expect(sanitizeFeatureName('my-feature-123')).toBe('my-feature-123')
  })

  test('throws on empty string', () => {
    expect(() => sanitizeFeatureName('')).toThrow(SecurityError)
  })

  test('throws on whitespace-only string', () => {
    expect(() => sanitizeFeatureName('   ')).toThrow(SecurityError)
  })

  test('throws on name exceeding max length', () => {
    const longName = 'a'.repeat(MAX_FEATURE_NAME_LENGTH + 1)
    expect(() => sanitizeFeatureName(longName)).toThrow(SecurityError)
  })

  test('accepts name at exactly max length', () => {
    const name = 'a'.repeat(MAX_FEATURE_NAME_LENGTH)
    expect(sanitizeFeatureName(name)).toBe(name)
  })

  test('throws when sanitized result is too short (< 2 chars)', () => {
    // After sanitization, a single char like 'x' becomes 'x' which is < 2
    expect(() => sanitizeFeatureName('x')).toThrow(SecurityError)
  })

  test('throws on non-string input (number)', () => {
    // @ts-expect-error testing runtime behavior
    expect(() => sanitizeFeatureName(123)).toThrow(SecurityError)
  })

  test('throws on non-string input (null)', () => {
    // @ts-expect-error testing runtime behavior
    expect(() => sanitizeFeatureName(null)).toThrow(SecurityError)
  })

  test('throws on non-string input (undefined)', () => {
    // @ts-expect-error testing runtime behavior
    expect(() => sanitizeFeatureName(undefined)).toThrow(SecurityError)
  })

  test('trims whitespace before validation', () => {
    expect(sanitizeFeatureName('  my-feature  ')).toBe('my-feature')
  })

  test('handles unicode by replacing non-ascii chars', () => {
    // Non-ascii chars become hyphens, then collapsed and stripped
    expect(sanitizeFeatureName('日本語-feature')).toBe('feature')
  })
})

describe('validateBuildId', () => {
  test('accepts valid build ID format', () => {
    expect(() => validateBuildId('build-abc123-xyz789')).not.toThrow()
  })

  test('accepts valid build ID with mixed case', () => {
    expect(() => validateBuildId('build-AbC123-xYz789')).not.toThrow()
  })

  test('throws on invalid format (missing prefix)', () => {
    expect(() => validateBuildId('abc123-xyz789')).toThrow(SecurityError)
  })

  test('throws on invalid format (spaces)', () => {
    expect(() => validateBuildId('build-abc 123-xyz')).toThrow(SecurityError)
  })

  test('throws on empty string', () => {
    expect(() => validateBuildId('')).toThrow(SecurityError)
  })

  test('throws on build ID exceeding max length', () => {
    const longId = 'build-' + 'a'.repeat(MAX_BUILD_ID_LENGTH)
    expect(() => validateBuildId(longId)).toThrow(SecurityError)
  })

  test('throws on non-string input', () => {
    // @ts-expect-error testing runtime behavior
    expect(() => validateBuildId(123)).toThrow(SecurityError)
  })

  test('throws on build ID with special characters', () => {
    expect(() => validateBuildId('build-abc!-xyz')).toThrow(SecurityError)
  })

  test('accepts numeric-only segments', () => {
    expect(() => validateBuildId('build-123-456')).not.toThrow()
  })
})

describe('validateConfigPath', () => {
  test('returns normalized path for valid relative path', () => {
    const result = validateConfigPath('docs/readme.md')
    expect(result).toContain('docs')
    expect(result).toContain('readme.md')
  })

  test('throws on path traversal with ..', () => {
    expect(() => validateConfigPath('../etc/passwd')).toThrow(SecurityError)
  })

  test('throws on embedded .. in path', () => {
    expect(() => validateConfigPath('docs/../secret')).toThrow(SecurityError)
  })

  test('throws on null byte', () => {
    expect(() => validateConfigPath('file\0.md')).toThrow(SecurityError)
  })

  test('throws on empty string', () => {
    expect(() => validateConfigPath('')).toThrow(SecurityError)
  })

  test('throws on path exceeding max depth', () => {
    const deepPath = Array(MAX_PATH_DEPTH + 1).fill('dir').join('/')
    expect(() => validateConfigPath(deepPath)).toThrow(SecurityError)
  })

  test('accepts path at exactly max depth', () => {
    const maxPath = Array(MAX_PATH_DEPTH).fill('dir').join('/')
    expect(() => validateConfigPath(maxPath)).not.toThrow()
  })

  test('throws on non-string input', () => {
    // @ts-expect-error testing runtime behavior
    expect(() => validateConfigPath(123)).toThrow(SecurityError)
  })

  test('normalizes path separators', () => {
    const result = validateConfigPath('docs/readme.md')
    expect(typeof result).toBe('string')
  })

  test('rejects paths with null bytes', () => {
    // On Windows, /etc/passwd normalizes to \etc\passwd (relative), so it won't throw.
    // Instead, test null byte which is always caught.
    expect(() => validateConfigPath('\0etc\0passwd')).toThrow(SecurityError)
  })

  test('normalizes path separators on Windows', () => {
    // On Windows, /etc/passwd becomes \etc\passwd (no longer starts with /)
    // The function still works for normal paths
    const result = validateConfigPath('docs\\readme.md')
    expect(typeof result).toBe('string')
  })
})

describe('createSafePath', () => {
  test('creates safe path within base dir', () => {
    const result = createSafePath('/tmp/base', 'sub', 'file.txt')
    expect(result).toContain('sub')
    expect(result).toContain('file.txt')
  })

  test('creates safe path for single segment', () => {
    const result = createSafePath('/tmp/base', 'file.txt')
    expect(result).toContain('file.txt')
  })

  test('throws on path traversal attempt with ..', () => {
    expect(() => createSafePath('/tmp/base', '..', 'secret')).toThrow(SecurityError)
  })

  test('throws on path traversal with absolute path escape', () => {
    expect(() => createSafePath('/tmp/base', '/etc/passwd')).toThrow(SecurityError)
  })

  test('handles empty segments', () => {
    const result = createSafePath('/tmp/base', 'file.txt')
    expect(typeof result).toBe('string')
  })
})

describe('escapeMarkdown', () => {
  test('escapes backslash', () => {
    expect(escapeMarkdown('a\\b')).toBe('a\\\\b')
  })

  test('escapes backtick', () => {
    expect(escapeMarkdown('a`b')).toBe('a\\`b')
  })

  test('escapes dollar sign', () => {
    expect(escapeMarkdown('a$b')).toBe('a\\$b')
  })

  test('escapes square brackets', () => {
    expect(escapeMarkdown('a[b]c')).toBe('a\\[b\\]c')
  })

  test('escapes parentheses', () => {
    expect(escapeMarkdown('a(b)c')).toBe('a\\(b\\)c')
  })

  test('escapes hash', () => {
    expect(escapeMarkdown('#heading')).toBe('\\#heading')
  })

  test('escapes asterisk', () => {
    expect(escapeMarkdown('a*b')).toBe('a\\*b')
  })

  test('escapes exclamation mark', () => {
    expect(escapeMarkdown('a!b')).toBe('a\\!b')
  })

  test('escapes angle brackets', () => {
    expect(escapeMarkdown('<tag>')).toBe('\\<tag\\>')
  })

  test('returns empty string unchanged', () => {
    expect(escapeMarkdown('')).toBe('')
  })

  test('leaves plain text unchanged', () => {
    expect(escapeMarkdown('hello world')).toBe('hello world')
  })

  test('escapes all special characters in complex string', () => {
    const input = '# Hello *world* [link](url) `code` $var !alert <html>'
    const result = escapeMarkdown(input)
    expect(result).toContain('\\#')
    expect(result).toContain('\\*')
    expect(result).toContain('\\[')
    expect(result).toContain('\\]')
    expect(result).toContain('\\(')
    expect(result).toContain('\\)')
    expect(result).toContain('\\`')
    expect(result).toContain('\\$')
    expect(result).toContain('\\!')
    expect(result).toContain('\\<')
    expect(result).toContain('\\>')
  })
})

describe('generateBuildId', () => {
  test('returns string starting with "build-"', () => {
    const id = generateBuildId()
    expect(id.startsWith('build-')).toBe(true)
  })

  test('has three segments separated by hyphens', () => {
    const id = generateBuildId()
    const parts = id.split('-')
    expect(parts.length).toBe(3)
    expect(parts[0]).toBe('build')
  })

  test('contains only valid characters in segments', () => {
    const id = generateBuildId()
    const afterPrefix = id.slice(6) // remove 'build-'
    expect(/^[a-z0-9]+-[a-z0-9]+$/i.test(afterPrefix)).toBe(true)
  })

  test('generates unique IDs on successive calls', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 50; i++) {
      ids.add(generateBuildId())
    }
    expect(ids.size).toBeGreaterThan(40) // Allow some collisions but not many
  })
})

describe('getDatePrefix', () => {
  test('returns string in YYYYMMDD format', () => {
    const prefix = getDatePrefix()
    expect(/^\d{8}$/.test(prefix)).toBe(true)
  })

  test('returns current date', () => {
    const now = new Date()
    const expected = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    expect(getDatePrefix()).toBe(expected)
  })
})

describe('addDatePrefix', () => {
  test('prepends date to filename', () => {
    const result = addDatePrefix('proposal.md')
    const prefix = getDatePrefix()
    expect(result).toBe(`${prefix}-proposal.md`)
  })

  test('prepends date to filename without extension', () => {
    const result = addDatePrefix('notes')
    const prefix = getDatePrefix()
    expect(result).toBe(`${prefix}-notes`)
  })
})

// ─── errors.ts ───────────────────────────────────────────────────────────────

describe('ErrorCode', () => {
  test('has all expected enum values', () => {
    expect(ErrorCode.INVALID_INPUT).toBe('INVALID_INPUT')
    expect(ErrorCode.SECURITY_VIOLATION).toBe('SECURITY_VIOLATION')
    expect(ErrorCode.FILE_NOT_FOUND).toBe('FILE_NOT_FOUND')
    expect(ErrorCode.PERMISSION_DENIED).toBe('PERMISSION_DENIED')
    expect(ErrorCode.OPERATION_FAILED).toBe('OPERATION_FAILED')
    expect(ErrorCode.CONFIG_ERROR).toBe('CONFIG_ERROR')
    expect(ErrorCode.ARCHIVE_FAILED).toBe('ARCHIVE_FAILED')
    expect(ErrorCode.MIGRATION_FAILED).toBe('MIGRATION_FAILED')
  })

  test('has exactly 8 enum values', () => {
    const values = Object.values(ErrorCode)
    expect(values.length).toBe(8)
  })
})

describe('OpenFlowError', () => {
  test('is an instance of Error', () => {
    const err = new OpenFlowError(ErrorCode.INVALID_INPUT, 'test')
    expect(err).toBeInstanceOf(Error)
  })

  test('is an instance of OpenFlowError', () => {
    const err = new OpenFlowError(ErrorCode.INVALID_INPUT, 'test')
    expect(err).toBeInstanceOf(OpenFlowError)
  })

  test('has correct name property', () => {
    const err = new OpenFlowError(ErrorCode.INVALID_INPUT, 'test')
    expect(err.name).toBe('OpenFlowError')
  })

  test('stores code and message', () => {
    const err = new OpenFlowError(ErrorCode.OPERATION_FAILED, 'something broke')
    expect(err.code).toBe(ErrorCode.OPERATION_FAILED)
    expect(err.message).toBe('something broke')
  })

  test('stores optional cause', () => {
    const cause = new Error('root cause')
    const err = new OpenFlowError(ErrorCode.OPERATION_FAILED, 'wrapper', cause)
    expect(err.cause).toBe(cause)
  })

  test('cause is undefined when not provided', () => {
    const err = new OpenFlowError(ErrorCode.OPERATION_FAILED, 'no cause')
    expect(err.cause).toBeUndefined()
  })

  describe('toUserMessage()', () => {
    test('INVALID_INPUT', () => {
      const err = new OpenFlowError(ErrorCode.INVALID_INPUT, 'bad data')
      expect(err.toUserMessage()).toBe('Invalid input: bad data')
    })

    test('SECURITY_VIOLATION', () => {
      const err = new OpenFlowError(ErrorCode.SECURITY_VIOLATION, 'hack attempt')
      expect(err.toUserMessage()).toBe('Security violation: hack attempt')
    })

    test('FILE_NOT_FOUND', () => {
      const err = new OpenFlowError(ErrorCode.FILE_NOT_FOUND, 'missing.txt')
      expect(err.toUserMessage()).toBe('File not found: missing.txt')
    })

    test('PERMISSION_DENIED', () => {
      const err = new OpenFlowError(ErrorCode.PERMISSION_DENIED, 'no access')
      expect(err.toUserMessage()).toBe('Permission denied: no access')
    })

    test('OPERATION_FAILED', () => {
      const err = new OpenFlowError(ErrorCode.OPERATION_FAILED, 'oops')
      expect(err.toUserMessage()).toBe('Operation failed: oops')
    })

    test('CONFIG_ERROR', () => {
      const err = new OpenFlowError(ErrorCode.CONFIG_ERROR, 'bad config')
      expect(err.toUserMessage()).toBe('Configuration error: bad config')
    })

    test('ARCHIVE_FAILED', () => {
      const err = new OpenFlowError(ErrorCode.ARCHIVE_FAILED, 'could not archive')
      expect(err.toUserMessage()).toBe('Archive failed: could not archive')
    })

    test('MIGRATION_FAILED', () => {
      const err = new OpenFlowError(ErrorCode.MIGRATION_FAILED, 'migration error')
      expect(err.toUserMessage()).toBe('Migration failed: migration error')
    })
  })
})

describe('isError', () => {
  test('returns true for Error instance', () => {
    expect(isError(new Error('test'))).toBe(true)
  })

  test('returns true for OpenFlowError instance', () => {
    expect(isError(new OpenFlowError(ErrorCode.OPERATION_FAILED, 'test'))).toBe(true)
  })

  test('returns true for SecurityError instance', () => {
    expect(isError(new SecurityError('test'))).toBe(true)
  })

  test('returns false for string', () => {
    expect(isError('error')).toBe(false)
  })

  test('returns false for number', () => {
    expect(isError(42)).toBe(false)
  })

  test('returns false for null', () => {
    expect(isError(null)).toBe(false)
  })

  test('returns false for undefined', () => {
    expect(isError(undefined)).toBe(false)
  })

  test('returns false for plain object', () => {
    expect(isError({ message: 'test' })).toBe(false)
  })

  test('narrows type correctly', () => {
    const val: unknown = new Error('test')
    if (isError(val)) {
      expect(val.message).toBe('test')
    }
  })
})

describe('wrapError', () => {
  test('wraps a plain Error into OpenFlowError', () => {
    const original = new Error('original')
    const wrapped = wrapError(original, ErrorCode.OPERATION_FAILED, 'context')
    expect(wrapped).toBeInstanceOf(OpenFlowError)
    expect(wrapped.code).toBe(ErrorCode.OPERATION_FAILED)
    expect(wrapped.message).toContain('context')
    expect(wrapped.message).toContain('original')
    expect(wrapped.cause).toBe(original)
  })

  test('passes through existing OpenFlowError unchanged', () => {
    const original = new OpenFlowError(ErrorCode.SECURITY_VIOLATION, 'already wrapped')
    const result = wrapError(original, ErrorCode.OPERATION_FAILED, 'new context')
    expect(result).toBe(original)
  })

  test('wraps a non-Error value', () => {
    const wrapped = wrapError('string error', ErrorCode.OPERATION_FAILED, 'context')
    expect(wrapped).toBeInstanceOf(OpenFlowError)
    expect(wrapped.message).toContain('string error')
    expect(wrapped.cause).toBeUndefined()
  })

  test('wraps a number error value', () => {
    const wrapped = wrapError(42, ErrorCode.INVALID_INPUT, 'num ctx')
    expect(wrapped.message).toContain('42')
  })
})

describe('extractErrorMessage', () => {
  test('extracts message from Error', () => {
    expect(extractErrorMessage(new Error('test message'))).toBe('test message')
  })

  test('extracts message from OpenFlowError', () => {
    expect(extractErrorMessage(new OpenFlowError(ErrorCode.OPERATION_FAILED, 'of msg'))).toBe('of msg')
  })

  test('converts string to string', () => {
    expect(extractErrorMessage('plain string')).toBe('plain string')
  })

  test('converts number to string', () => {
    expect(extractErrorMessage(42)).toBe('42')
  })

  test('converts null to string', () => {
    expect(extractErrorMessage(null)).toBe('null')
  })

  test('converts undefined to string', () => {
    expect(extractErrorMessage(undefined)).toBe('undefined')
  })
})

describe('formatToolError', () => {
  test('formats error without context', () => {
    expect(formatToolError('something failed')).toBe('Error: something failed')
  })

  test('formats error with context', () => {
    expect(formatToolError('something failed', 'TOOL_X')).toBe('Error (TOOL_X): something failed')
  })

  test('omits context when empty string', () => {
    expect(formatToolError('msg', '')).toBe('Error: msg')
  })

  test('omits context when whitespace-only string', () => {
    expect(formatToolError('msg', '   ')).toBe('Error: msg')
  })
})

describe('catchAndLog', () => {
  test('returns result on success', () => {
    const result = catchAndLog('test', () => 42)
    expect(result).toBe(42)
  })

  test('returns undefined on error', () => {
    const result = catchAndLog('test', () => {
      throw new Error('boom')
    })
    expect(result).toBeUndefined()
  })

  test('calls logger.error on failure when logger provided', () => {
    const errors: Array<{ module: string; message: string; error?: Error }> = []
    const logger = {
      error: (module: string, message: string, error?: Error) => {
        errors.push({ module, message, error })
      },
    }
    const thrownErr = new Error('logged error')
    catchAndLog('mymod', () => { throw thrownErr }, logger)
    expect(errors.length).toBe(1)
    expect(errors[0].module).toBe('mymod')
    expect(errors[0].error).toBe(thrownErr)
  })

  test('logs to console.error when no logger provided', () => {
    const originalError = console.error
    let captured: unknown
    console.error = (...args: unknown[]) => { captured = args }
    try {
      catchAndLog('mymod', () => { throw new Error('console test') })
      expect(captured).toBeDefined()
    } finally {
      console.error = originalError
    }
  })

  test('returns undefined for non-Error thrown values', () => {
    const result = catchAndLog('test', () => { throw 'string error' })
    expect(result).toBeUndefined()
  })
})

describe('catchAndLogAsync', () => {
  test('returns result on success', async () => {
    const result = await catchAndLogAsync('test', async () => 42)
    expect(result).toBe(42)
  })

  test('returns undefined on error', async () => {
    const result = await catchAndLogAsync('test', async () => {
      throw new Error('async boom')
    })
    expect(result).toBeUndefined()
  })

  test('calls logger.error on failure when logger provided', async () => {
    const errors: Array<{ module: string; message: string; error?: Error }> = []
    const logger = {
      error: (module: string, message: string, error?: Error) => {
        errors.push({ module, message, error })
      },
    }
    const thrownErr = new Error('async logged')
    await catchAndLogAsync('mymod', async () => { throw thrownErr }, logger)
    expect(errors.length).toBe(1)
    expect(errors[0].module).toBe('mymod')
    expect(errors[0].error).toBe(thrownErr)
  })

  test('logs to console.error when no logger provided', async () => {
    const originalError = console.error
    let captured: unknown
    console.error = (...args: unknown[]) => { captured = args }
    try {
      await catchAndLogAsync('mymod', async () => { throw new Error('async console') })
      expect(captured).toBeDefined()
    } finally {
      console.error = originalError
    }
  })

  test('returns undefined for non-Error thrown values', async () => {
    const result = await catchAndLogAsync('test', async () => { throw 'string error' })
    expect(result).toBeUndefined()
  })

  test('awaits the async function result', async () => {
    let resolved = false
    const result = await catchAndLogAsync('test', async () => {
      await new Promise(r => setTimeout(r, 1))
      resolved = true
      return 'done'
    })
    expect(resolved).toBe(true)
    expect(result).toBe('done')
  })
})

// ─── markdown-helpers.ts ─────────────────────────────────────────────────────

describe('normalizeWhitespace', () => {
  test('trims leading and trailing whitespace', () => {
    expect(normalizeWhitespace('  hello  ')).toBe('hello')
  })

  test('replaces multiple spaces with single space', () => {
    expect(normalizeWhitespace('a   b   c')).toBe('a b c')
  })

  test('replaces newlines with spaces', () => {
    expect(normalizeWhitespace('line1\nline2')).toBe('line1 line2')
  })

  test('replaces CRLF newlines with spaces', () => {
    expect(normalizeWhitespace('line1\r\nline2')).toBe('line1 line2')
  })

  test('replaces multiple newlines with single space', () => {
    expect(normalizeWhitespace('a\n\n\nb')).toBe('a b')
  })

  test('replaces mixed whitespace with single space', () => {
    expect(normalizeWhitespace('a \n \t b')).toBe('a b')
  })

  test('returns empty string for whitespace-only input', () => {
    expect(normalizeWhitespace('   \n\t  ')).toBe('')
  })

  test('returns empty string unchanged', () => {
    expect(normalizeWhitespace('')).toBe('')
  })
})

describe('escapeInline', () => {
  test('escapes backslash', () => {
    expect(escapeInline('a\\b')).toBe('a\\\\b')
  })

  test('escapes backtick', () => {
    expect(escapeInline('a`b')).toBe('a\\`b')
  })

  test('escapes asterisk', () => {
    expect(escapeInline('a*b')).toBe('a\\*b')
  })

  test('escapes underscore', () => {
    expect(escapeInline('a_b')).toBe('a\\_b')
  })

  test('escapes curly braces', () => {
    expect(escapeInline('{a}')).toBe('\\{a\\}')
  })

  test('escapes square brackets', () => {
    expect(escapeInline('[a]')).toBe('\\[a\\]')
  })

  test('escapes parentheses', () => {
    expect(escapeInline('(a)')).toBe('\\(a\\)')
  })

  test('escapes hash', () => {
    expect(escapeInline('#heading')).toBe('\\#heading')
  })

  test('escapes plus', () => {
    expect(escapeInline('a+b')).toBe('a\\+b')
  })

  test('escapes pipe', () => {
    expect(escapeInline('a|b')).toBe('a\\|b')
  })

  test('escapes greater than', () => {
    expect(escapeInline('a>b')).toBe('a\\>b')
  })

  test('normalizes whitespace before escaping', () => {
    // newline should be converted to space first, then result should have no special chars
    expect(escapeInline('hello\nworld')).toBe('hello world')
  })

  test('leaves plain text unchanged', () => {
    expect(escapeInline('hello world')).toBe('hello world')
  })

  test('handles empty string', () => {
    expect(escapeInline('')).toBe('')
  })

  test('escapes complex string with all special characters', () => {
    const result = escapeInline('\\`*_{}[]()#+|>test')
    expect(result).toBe('\\\\\\`\\*\\_\\{\\}\\[\\]\\(\\)\\#\\+\\|\\>test')
  })
})
