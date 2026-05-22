import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { LogCategory, LoggingConfig, LogLevel } from '../types.js'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const DEFAULT_CONFIG: LoggingConfig = {
  level: 'info',
  output: 'console',
  path: '.sisyphus/openflow/logs',
  maxFiles: 7,
  categories: 'all',
  format: 'text',
}

const LOG_FILE_PATTERN = /^openflow-\d{4}-\d{2}-\d{2}\.log$/

export class Logger {
  private config: LoggingConfig = DEFAULT_CONFIG
  private projectDir = process.cwd()
  private logFilePath: string | undefined
  private directoryReady: Promise<void> = Promise.resolve()
  private currentFileName = ''
  private prefix = '[OpenFlow]'
  private homeDir = process.env.HOME || process.env.USERPROFILE || ''

  init(config: LoggingConfig, projectDir: string): void {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.projectDir = projectDir
    this.logFilePath = undefined
    this.directoryReady = Promise.resolve()

    if (this.shouldWriteFile()) {
      const logDir = this.resolveLogDir()
      this.currentFileName = this.getLogFileName(new Date())
      this.logFilePath = path.join(logDir, this.currentFileName)
      this.directoryReady = this.prepareLogDirectory(logDir)
    }
  }

  setLevel(level: LogLevel): void {
    this.config = { ...this.config, level }
  }

  debug(category: LogCategory, message: string, data?: Record<string, unknown>): void
  debug(message: string, data?: Record<string, unknown>): void
  debug(categoryOrMessage: LogCategory | string, messageOrData?: string | Record<string, unknown>, data?: Record<string, unknown>): void {
    const entry = this.normalizeLogArgs(categoryOrMessage, messageOrData, data)
    this.log('debug', entry.category, entry.message, entry.data)
  }

  info(category: LogCategory, message: string, data?: Record<string, unknown>): void
  info(message: string, data?: Record<string, unknown>): void
  info(categoryOrMessage: LogCategory | string, messageOrData?: string | Record<string, unknown>, data?: Record<string, unknown>): void {
    const entry = this.normalizeLogArgs(categoryOrMessage, messageOrData, data)
    this.log('info', entry.category, entry.message, entry.data)
  }

  warn(category: LogCategory, message: string, data?: Record<string, unknown>): void
  warn(message: string, data?: Record<string, unknown>): void
  warn(categoryOrMessage: LogCategory | string, messageOrData?: string | Record<string, unknown>, data?: Record<string, unknown>): void {
    const entry = this.normalizeLogArgs(categoryOrMessage, messageOrData, data)
    this.log('warn', entry.category, entry.message, entry.data)
  }

  error(category: LogCategory, message: string, error?: Error, data?: Record<string, unknown>): void
  error(message: string, error?: Error, data?: Record<string, unknown>): void
  error(categoryOrMessage: LogCategory | string, messageOrError?: string | Error, errorOrData?: Error | Record<string, unknown>, data?: Record<string, unknown>): void {
    const entry = this.normalizeErrorArgs(categoryOrMessage, messageOrError, errorOrData, data)
    this.log('error', entry.category, entry.message, entry.data)
  }

  private shouldLog(level: LogLevel, category: LogCategory): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level] && this.shouldLogCategory(category)
  }

  private shouldLogCategory(category: LogCategory): boolean {
    const { categories } = this.config
    if (categories === 'all') return true
    return categories.includes(category)
  }

  private shouldWriteConsole(): boolean {
    return this.config.output === 'console' || this.config.output === 'both'
  }

  private shouldWriteFile(): boolean {
    return this.config.output === 'file' || this.config.output === 'both'
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
      } else if (Array.isArray(value)) {
        result[key] = value.map((item) => typeof item === 'string' ? this.sanitizePath(item) : item)
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.sanitizeData(value as Record<string, unknown>)
      } else {
        result[key] = value
      }
    }
    return result
  }

  private normalizeLogArgs(
    categoryOrMessage: LogCategory | string,
    messageOrData?: string | Record<string, unknown>,
    data?: Record<string, unknown>
  ): { category: LogCategory; message: string; data?: Record<string, unknown> } {
    if (typeof messageOrData === 'string') {
      return {
        category: categoryOrMessage as LogCategory,
        message: messageOrData,
        ...(data ? { data } : {}),
      }
    }

    return {
      category: 'default',
      message: categoryOrMessage,
      ...(messageOrData ? { data: messageOrData } : {}),
    }
  }

  private normalizeErrorArgs(
    categoryOrMessage: LogCategory | string,
    messageOrError?: string | Error,
    errorOrData?: Error | Record<string, unknown>,
    data?: Record<string, unknown>
  ): { category: LogCategory; message: string; data?: Record<string, unknown> } {
    if (typeof messageOrError === 'string') {
      const error = errorOrData instanceof Error ? errorOrData : undefined
      const details = errorOrData instanceof Error ? data : errorOrData
      const errorData = this.withErrorData(error, details)
      return {
        category: categoryOrMessage as LogCategory,
        message: messageOrError,
        ...(errorData ? { data: errorData } : {}),
      }
    }

    const defaultData = this.withErrorData(messageOrError, errorOrData as Record<string, unknown> | undefined)

    return {
      category: 'default',
      message: categoryOrMessage,
      ...(defaultData ? { data: defaultData } : {}),
    }
  }

  private withErrorData(error?: Error, data?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!error) return data
    return {
      ...data,
      errorMessage: error.message,
      errorName: error.name,
      errorStack: error.stack,
    }
  }

  private log(level: LogLevel, category: LogCategory, message: string, data?: Record<string, unknown>): void {
    if (!this.shouldLog(level, category)) return

    const sanitizedData = data ? this.sanitizeData(data) : undefined
    const formattedEntry = this.formatEntry(level, category, message, sanitizedData)

    if (this.shouldWriteConsole()) {
      this.writeConsole(level, category, message, formattedEntry, sanitizedData)
    }

    if (this.shouldWriteFile()) {
      void this.writeFile(formattedEntry)
    }
  }

  private writeConsole(level: LogLevel, category: LogCategory, message: string, formattedEntry: string, data?: Record<string, unknown>): void {
    if (this.config.format === 'json') {
      this.writeConsoleLine(level, formattedEntry)
      return
    }

    const categoryLabel = category === 'default' ? '' : ` [${category}]`
    switch (level) {
      case 'debug':
        console.debug(`${this.prefix}${categoryLabel} ${message}`, data ?? '')
        break
      case 'info':
        console.log(`${this.prefix}${categoryLabel} ${message}`, data ?? '')
        break
      case 'warn':
        console.warn(`${this.prefix}${categoryLabel} WARNING: ${message}`, data ?? '')
        break
      case 'error':
        console.error(`${this.prefix}${categoryLabel} ERROR: ${message}`, data ?? '')
        break
    }
  }

  private writeConsoleLine(level: LogLevel, line: string): void {
    switch (level) {
      case 'debug':
        console.debug(line)
        break
      case 'info':
        console.log(line)
        break
      case 'warn':
        console.warn(line)
        break
      case 'error':
        console.error(line)
        break
    }
  }

  private async writeFile(formattedEntry: string): Promise<void> {
    this.refreshLogFilePath(new Date())
    if (!this.logFilePath) return

    try {
      await this.directoryReady
      await fs.appendFile(this.logFilePath, `${formattedEntry}\n`, 'utf8')
    } catch (error) {
      console.warn(`${this.prefix} WARNING: Failed to write log file`, {
        path: this.sanitizePath(this.logFilePath),
        errorMessage: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private formatEntry(level: LogLevel, category: LogCategory, message: string, data?: Record<string, unknown>): string {
    const timestamp = new Date()

    if (this.config.format === 'json') {
      return JSON.stringify({
        timestamp: timestamp.toISOString(),
        level,
        category,
        message,
        data,
      })
    }

    const details = data && Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : ''
    return `[${this.formatTimestamp(timestamp)}] [${level.toUpperCase()}] [${category.toUpperCase()}] ${message}${details}`
  }

  private formatTimestamp(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  }

  private getDateStamp(date: Date): string {
    return this.formatTimestamp(date).slice(0, 10)
  }

  private getLogFileName(date: Date): string {
    return `openflow-${this.getDateStamp(date)}.log`
  }

  private resolveLogDir(): string {
    return path.isAbsolute(this.config.path)
      ? this.config.path
      : path.resolve(this.projectDir, this.config.path)
  }

  private refreshLogFilePath(date: Date): void {
    const fileName = this.getLogFileName(date)
    if (fileName === this.currentFileName && this.logFilePath) return

    this.currentFileName = fileName
    const logDir = this.resolveLogDir()
    this.logFilePath = path.join(logDir, fileName)
    this.directoryReady = this.prepareLogDirectory(logDir)
  }

  private async prepareLogDirectory(logDir: string): Promise<void> {
    try {
      await fs.mkdir(logDir, { recursive: true })
      await this.rotateLogs(logDir)
    } catch (error) {
      console.error(`${this.prefix} ERROR: Failed to initialize log directory`, {
        path: this.sanitizePath(logDir),
        errorMessage: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private async rotateLogs(logDir: string): Promise<void> {
    const entries = await fs.readdir(logDir, { withFileTypes: true })
    const logFiles = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && LOG_FILE_PATTERN.test(entry.name))
        .map(async (entry) => {
          const filePath = path.join(logDir, entry.name)
          const stats = await fs.stat(filePath)
          return { filePath, mtimeMs: stats.mtimeMs }
        })
    )

    const excessCount = logFiles.length - this.config.maxFiles
    if (excessCount <= 0) return

    const filesToDelete = logFiles
      .sort((left, right) => left.mtimeMs - right.mtimeMs)
      .slice(0, excessCount)

    await Promise.all(filesToDelete.map((file) => fs.unlink(file.filePath)))
  }
}

export const logger = new Logger()

export function initLogger(config: LoggingConfig, projectDir: string): void {
  logger.init(config, projectDir)
}

export function reconfigureLogger(config: LoggingConfig, projectDir: string): void {
  logger.init(config, projectDir)
}
