type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

class Logger {
  private minLevel: LogLevel = 'info'
  private prefix = '[OpenFlow]'
  private homeDir = process.env.HOME || process.env.USERPROFILE || ''

  setLevel(level: LogLevel): void {
    this.minLevel = level
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel]
  }

  private sanitizePath(pathStr: string): string {
    if (this.homeDir && pathStr.startsWith(this.homeDir)) {
      return pathStr.replace(this.homeDir, '~')
    }
    return pathStr
  }

  private sanitizeData(data: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(data)) {
      const value = data[key]
      if (typeof value === 'string') {
        result[key] = this.sanitizePath(value)
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.sanitizeData(value as Record<string, unknown>)
      } else {
        result[key] = value
      }
    }
    return result
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return
    
    const sanitizedData = data ? this.sanitizeData(data) : undefined
    
    switch (level) {
      case 'debug':
        console.debug(`${this.prefix} ${message}`, sanitizedData ?? '')
        break
      case 'info':
        console.log(`${this.prefix} ${message}`, sanitizedData ?? '')
        break
      case 'warn':
        console.warn(`${this.prefix} WARNING: ${message}`, sanitizedData ?? '')
        break
      case 'error':
        console.error(`${this.prefix} ERROR: ${message}`, sanitizedData ?? '')
        break
    }
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data)
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data)
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data)
  }

  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.log('error', message, { ...data, errorMessage: error?.message })
  }
}

export const logger = new Logger()
