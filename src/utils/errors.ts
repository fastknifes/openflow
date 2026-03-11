export enum ErrorCode {
  INVALID_INPUT = 'INVALID_INPUT',
  SECURITY_VIOLATION = 'SECURITY_VIOLATION',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  OPERATION_FAILED = 'OPERATION_FAILED',
  CONFIG_ERROR = 'CONFIG_ERROR',
  ARCHIVE_FAILED = 'ARCHIVE_FAILED',
}

export class OpenFlowError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly cause?: Error
  ) {
    super(message)
    this.name = 'OpenFlowError'
  }

  toUserMessage(): string {
    switch (this.code) {
      case ErrorCode.INVALID_INPUT:
        return `Invalid input: ${this.message}`
      case ErrorCode.SECURITY_VIOLATION:
        return `Security violation: ${this.message}`
      case ErrorCode.FILE_NOT_FOUND:
        return `File not found: ${this.message}`
      case ErrorCode.PERMISSION_DENIED:
        return `Permission denied: ${this.message}`
      case ErrorCode.OPERATION_FAILED:
        return `Operation failed: ${this.message}`
      case ErrorCode.CONFIG_ERROR:
        return `Configuration error: ${this.message}`
      case ErrorCode.ARCHIVE_FAILED:
        return `Archive failed: ${this.message}`
      default:
        return `Error: ${this.message}`
    }
  }
}

export function isError(error: unknown): error is Error {
  return error instanceof Error
}

export function wrapError(error: unknown, code: ErrorCode, context: string): OpenFlowError {
  if (error instanceof OpenFlowError) {
    return error
  }

  const message = isError(error) ? error.message : String(error)
  return new OpenFlowError(code, `${context}: ${message}`, isError(error) ? error : undefined)
}

export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

export function formatToolError(message: string, context?: string): string {
  if (context && context.trim()) {
    return `Error (${context}): ${message}`
  }
  return `Error: ${message}`
}

export function catchAndLog<T>(
  module: string,
  fn: () => T,
  logger?: { error: (module: string, message: string, error?: Error) => void }
): T | undefined {
  try {
    return fn()
  } catch (e) {
    const err = isError(e) ? e : undefined
    if (logger) {
      logger.error(module, 'Operation failed', err)
    } else {
      console.error(`[${module}] Operation failed:`, err?.message ?? String(e))
    }
    return undefined
  }
}

export async function catchAndLogAsync<T>(
  module: string,
  fn: () => Promise<T>,
  logger?: { error: (module: string, message: string, error?: Error) => void }
): Promise<T | undefined> {
  try {
    return await fn()
  } catch (e) {
    const err = isError(e) ? e : undefined
    if (logger) {
      logger.error(module, 'Operation failed', err)
    } else {
      console.error(`[${module}] Operation failed:`, err?.message ?? String(e))
    }
    return undefined
  }
}
