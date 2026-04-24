import { describe, expect, test } from 'bun:test'
import { ErrorCode, OpenFlowError } from '../../../src/utils/errors'
import {
  throwMigrationError,
  throwPathTraversalError,
  throwEmptySourceError,
  throwConcurrentMigrationError,
  throwDeleteConfirmationError,
} from '../../../src/phases/migrate-docs/errors'

describe('ErrorCode.MIGRATION_FAILED', () => {
  test('should exist and have correct value', () => {
    expect(ErrorCode.MIGRATION_FAILED).toBe('MIGRATION_FAILED')
  })

  test('should return correct user message', () => {
    const error = new OpenFlowError(ErrorCode.MIGRATION_FAILED, 'test context')
    expect(error.toUserMessage()).toBe('Migration failed: test context')
  })
})

describe('throwMigrationError', () => {
  test('should throw OpenFlowError with MIGRATION_FAILED code', () => {
    expect(() => throwMigrationError('migration context')).toThrow(OpenFlowError)
    
    try {
      throwMigrationError('migration context')
    } catch (error) {
      expect(error).toBeInstanceOf(OpenFlowError)
      expect((error as OpenFlowError).code).toBe(ErrorCode.MIGRATION_FAILED)
      expect((error as OpenFlowError).message).toBe('migration context')
    }
  })

  test('should include cause when provided', () => {
    const cause = new Error('original error')
    
    try {
      throwMigrationError('migration context', cause)
    } catch (error) {
      expect(error).toBeInstanceOf(OpenFlowError)
      expect((error as OpenFlowError).cause).toBe(cause)
    }
  })
})

describe('throwPathTraversalError', () => {
  test('should throw OpenFlowError with SECURITY_VIOLATION code', () => {
    expect(() => throwPathTraversalError('../etc/passwd')).toThrow(OpenFlowError)
    
    try {
      throwPathTraversalError('../etc/passwd')
    } catch (error) {
      expect(error).toBeInstanceOf(OpenFlowError)
      expect((error as OpenFlowError).code).toBe(ErrorCode.SECURITY_VIOLATION)
      expect((error as OpenFlowError).message).toBe('Path traversal detected: ../etc/passwd')
    }
  })
})

describe('throwEmptySourceError', () => {
  test('should throw OpenFlowError with INVALID_INPUT code', () => {
    expect(() => throwEmptySourceError('/some/dir')).toThrow(OpenFlowError)
    
    try {
      throwEmptySourceError('/some/dir')
    } catch (error) {
      expect(error).toBeInstanceOf(OpenFlowError)
      expect((error as OpenFlowError).code).toBe(ErrorCode.INVALID_INPUT)
      expect((error as OpenFlowError).message).toBe('No documents found in /some/dir')
    }
  })
})

describe('throwConcurrentMigrationError', () => {
  test('should throw OpenFlowError with OPERATION_FAILED code', () => {
    expect(() => throwConcurrentMigrationError()).toThrow(OpenFlowError)
    
    try {
      throwConcurrentMigrationError()
    } catch (error) {
      expect(error).toBeInstanceOf(OpenFlowError)
      expect((error as OpenFlowError).code).toBe(ErrorCode.OPERATION_FAILED)
      expect((error as OpenFlowError).message).toBe('Migration already in progress')
    }
  })
})

describe('throwDeleteConfirmationError', () => {
  test('should throw OpenFlowError with INVALID_INPUT code', () => {
    expect(() => throwDeleteConfirmationError()).toThrow(OpenFlowError)
    
    try {
      throwDeleteConfirmationError()
    } catch (error) {
      expect(error).toBeInstanceOf(OpenFlowError)
      expect((error as OpenFlowError).code).toBe(ErrorCode.INVALID_INPUT)
      expect((error as OpenFlowError).message).toBe('Deletion requires typing DELETE ORIGINAL DOCS exactly')
    }
  })
})

describe('existing error codes', () => {
  test('should remain unaffected', () => {
    // Verify all existing error codes still exist
    expect(ErrorCode.INVALID_INPUT).toBe('INVALID_INPUT')
    expect(ErrorCode.SECURITY_VIOLATION).toBe('SECURITY_VIOLATION')
    expect(ErrorCode.FILE_NOT_FOUND).toBe('FILE_NOT_FOUND')
    expect(ErrorCode.PERMISSION_DENIED).toBe('PERMISSION_DENIED')
    expect(ErrorCode.OPERATION_FAILED).toBe('OPERATION_FAILED')
    expect(ErrorCode.CONFIG_ERROR).toBe('CONFIG_ERROR')
    expect(ErrorCode.ARCHIVE_FAILED).toBe('ARCHIVE_FAILED')
  })

  test('should have correct toUserMessage for existing codes', () => {
    expect(new OpenFlowError(ErrorCode.INVALID_INPUT, 'test').toUserMessage()).toBe('Invalid input: test')
    expect(new OpenFlowError(ErrorCode.SECURITY_VIOLATION, 'test').toUserMessage()).toBe('Security violation: test')
    expect(new OpenFlowError(ErrorCode.FILE_NOT_FOUND, 'test').toUserMessage()).toBe('File not found: test')
    expect(new OpenFlowError(ErrorCode.PERMISSION_DENIED, 'test').toUserMessage()).toBe('Permission denied: test')
    expect(new OpenFlowError(ErrorCode.OPERATION_FAILED, 'test').toUserMessage()).toBe('Operation failed: test')
    expect(new OpenFlowError(ErrorCode.CONFIG_ERROR, 'test').toUserMessage()).toBe('Configuration error: test')
    expect(new OpenFlowError(ErrorCode.ARCHIVE_FAILED, 'test').toUserMessage()).toBe('Archive failed: test')
  })
})
