/**
 * Log level type definition
 * Hierarchy: debug < info < warn < error
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * Logger configuration options
 */
export type LoggerConfig = {
  /** Enable/disable logging globally */
  enabled: boolean
  /** Minimum log level to output (default: 'info') */
  minLevel?: LogLevel
  /** Optional prefix for all log messages */
  prefix?: string
  /** Custom output function (for testing or custom handling) */
  output?: (level: LogLevel, message: string, ...args: unknown[]) => void
}

/**
 * Simple logger utility with configurable log levels and output
 *
 * Features:
 * - Hierarchical log levels (debug < info < warn < error)
 * - Can be disabled entirely (no-op when disabled)
 * - Min level filtering
 * - Custom output function support
 * - Timestamp and level formatting
 *
 * @example
 * ```ts
 * import { logger } from './logger.ts'
 *
 * logger.info('Server started', { port: 3000 })
 * logger.warn('Deprecated API usage')
 * logger.error('Connection failed', error)
 * ```
 */
export class Logger {
  private config: Required<LoggerConfig>

  private readonly levelPriority: Record<LogLevel, number> = {
    'debug': 0,
    'info': 1,
    'warn': 2,
    'error': 3,
  }

  constructor(config: LoggerConfig) {
    this.config = {
      enabled: config.enabled,
      minLevel: config.minLevel ?? 'info',
      prefix: config.prefix ?? '',
      output: config.output ?? this.defaultOutput.bind(this),
    }
  }

  /**
   * Default output implementation using console methods
   */
  private defaultOutput(level: LogLevel, message: string, ...args: unknown[]): void {
    const timestamp = new Date().toISOString()
    const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`

    switch (level) {
      case 'debug':
        console.debug(formattedMessage, ...args)
        break
      case 'info':
        console.log(formattedMessage, ...args)
        break
      case 'warn':
        console.warn(formattedMessage, ...args)
        break
      case 'error':
        console.error(formattedMessage, ...args)
        break
    }
  }

  /**
   * Check if message should be logged based on config
   */
  private shouldLog(level: LogLevel): boolean {
    if (!this.config.enabled) {
      return false
    }
    return this.levelPriority[level] >= this.levelPriority[this.config.minLevel]
  }

  /**
   * Internal logging method with level filtering
   */
  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (!this.shouldLog(level)) {
      return
    }

    const prefixedMessage = this.config.prefix ? `[${this.config.prefix}] ${message}` : message

    this.config.output(level, prefixedMessage, ...args)
  }

  /**
   * Log debug message (lowest priority)
   */
  debug(message: string, ...args: unknown[]): void {
    this.log('debug', message, ...args)
  }

  /**
   * Log info message
   */
  info(message: string, ...args: unknown[]): void {
    this.log('info', message, ...args)
  }

  /**
   * Log warning message
   */
  warn(message: string, ...args: unknown[]): void {
    this.log('warn', message, ...args)
  }

  /**
   * Log error message (highest priority)
   */
  error(message: string, ...args: unknown[]): void {
    this.log('error', message, ...args)
  }

  /**
   * Update logger configuration at runtime
   */
  configure(config: Partial<LoggerConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      output: config.output ?? this.config.output,
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<Required<LoggerConfig>> {
    return { ...this.config }
  }
}

/**
 * Default logger instance - enabled by default with 'info' level
 * Can be reconfigured using logger.configure()
 */
export const logger: Logger = new Logger({ enabled: true, minLevel: 'info' })
