import { OpenFlowError, ErrorCode } from '../../utils/errors.js'

/**
 * Throw a migration-specific error
 */
export function throwMigrationError(context: string, cause?: Error): never {
  throw new OpenFlowError(
    ErrorCode.MIGRATION_FAILED,
    context,
    cause
  )
}

/**
 * Throw a path traversal security error
 */
export function throwPathTraversalError(path: string): never {
  throw new OpenFlowError(
    ErrorCode.SECURITY_VIOLATION,
    `Path traversal detected: ${path}`
  )
}

/**
 * Throw an error when no documents found in source directory
 */
export function throwEmptySourceError(dir: string): never {
  throw new OpenFlowError(
    ErrorCode.INVALID_INPUT,
    `No documents found in ${dir}`
  )
}

/**
 * Throw an error when migration is already in progress
 */
export function throwConcurrentMigrationError(): never {
  throw new OpenFlowError(
    ErrorCode.OPERATION_FAILED,
    'Migration already in progress'
  )
}

/**
 * Throw an error when delete confirmation is invalid
 */
export function throwDeleteConfirmationError(): never {
  throw new OpenFlowError(
    ErrorCode.INVALID_INPUT,
    'Deletion requires typing DELETE ORIGINAL DOCS exactly'
  )
}
