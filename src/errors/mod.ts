/**
 * Structured error types for CosmosDB Schemagen with proper error boundaries
 * Provides comprehensive error handling for schema validation and processing.
 * @module
 */

/**
 * Error severity levels
 *
 * 'low' - Minor issues, non-critical
 * 'medium' - Moderate issues, may affect functionality
 * 'high' - Serious issues, likely to cause failures
 * 'critical' - Severe issues, requires immediate attention
 */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical'

/**
 * Error codes for CosmosDB operations
 */
export enum ErrorCode {
  /** Invalid connection string format */
  INVALID_CONNECTION_STRING = 'INVALID_CONNECTION_STRING',
  /** Missing credential for managed identity authentication */
  MISSING_CREDENTIAL = 'MISSING_CREDENTIAL',
  /** Both connection string and managed identity provided */
  CONFLICTING_AUTH_METHODS = 'CONFLICTING_AUTH_METHODS',
  /** Neither authentication method provided */
  MISSING_AUTH_METHOD = 'MISSING_AUTH_METHOD',
  /** General configuration error */
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  /** Query execution failed */
  QUERY_FAILED = 'QUERY_FAILED',
  /** Validation error for input data */
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  /** Unknown error */
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Context information for errors
 *
 * Includes component name, timestamp, and optional metadata
 */
export interface CosmosDBErrorContext {
  /** Component where the error occurred */
  component: string
  /** Timestamp when the error occurred (ISO 8601 format) */
  timestamp: string
  /** Additional metadata about the error */
  metadata?: Record<string, unknown>
}

/**
 * Base error class for CosmosDB-related errors
 *
 * @example
 * ```ts
 * throw new CosmosDBError({
 *   message: 'An error occurred',
 *   context: { component: 'connection-parser', timestamp: new Date().toISOString() },
 *   code: ErrorCode.UNKNOWN_ERROR,
 *   severity: 'medium',
 *   retryable: false,
 * });
 * ```
 */
export class CosmosDBError extends Error {
  public readonly context: CosmosDBErrorContext
  public readonly code: ErrorCode
  public readonly severity: ErrorSeverity
  public readonly retryable: boolean

  constructor({
    message,
    context,
    code,
    severity,
    retryable = false,
  }: {
    message: string
    context: CosmosDBErrorContext
    code: ErrorCode
    severity: ErrorSeverity
    retryable?: boolean
  }) {
    super(message)
    this.name = this.constructor.name
    this.context = context
    this.code = code
    this.severity = severity
    this.retryable = retryable

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }

  /**
   * Serialize error to JSON
   *
   * @returns JSON representation of the error
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
      retryable: this.retryable,
      context: this.context,
      stack: this.stack,
    }
  }
}

/**
 * Error thrown when connection string format is invalid
 *
 * @example
 * ```ts
 * throw new InvalidConnectionStringError('Connection string is malformed', context);
 * ```
 */
export class InvalidConnectionStringError extends CosmosDBError {
  constructor(message: string, context: CosmosDBErrorContext) {
    super({
      message,
      context,
      code: ErrorCode.INVALID_CONNECTION_STRING,
      severity: 'high',
      retryable: false,
    })
  }
}

/**
 * Error thrown when managed identity configuration is incomplete
 * (only endpoint or only credential provided)
 *
 * @example
 * ```ts
 * throw new MissingCredentialError('Managed identity configuration incomplete', context);
 * ```
 */
export class MissingCredentialError extends CosmosDBError {
  constructor(message: string, context: CosmosDBErrorContext) {
    super({
      message,
      context,
      code: ErrorCode.MISSING_CREDENTIAL,
      severity: 'high',
      retryable: false,
    })
  }
}

/**
 * Error thrown when both connection string and managed identity are provided
 *
 * @example
 * ```ts
 * throw new ConflictingAuthMethodsError('Both connection string and managed identity provided', context);
 * ```
 */
export class ConflictingAuthMethodsError extends CosmosDBError {
  constructor(message: string, context: CosmosDBErrorContext) {
    super({
      message,
      context,
      code: ErrorCode.CONFLICTING_AUTH_METHODS,
      severity: 'high',
      retryable: false,
    })
  }
}

/**
 * Error thrown when neither authentication method is provided
 *
 * @example
 * ```ts
 * throw new MissingAuthMethodError('No authentication method provided', context);
 * ```
 */
export class MissingAuthMethodError extends CosmosDBError {
  constructor(message: string, context: CosmosDBErrorContext) {
    super({
      message,
      context,
      code: ErrorCode.MISSING_AUTH_METHOD,
      severity: 'high',
      retryable: false,
    })
  }
}

/**
 * General configuration error
 *
 * Thrown for various configuration issues not covered by other specific errors
 *
 * @example
 * ```ts
 * throw new ConfigurationError('Invalid consistency level specified', context);
 * ```
 */
export class ConfigurationError extends CosmosDBError {
  constructor(message: string, context: CosmosDBErrorContext) {
    super({
      message,
      context,
      code: ErrorCode.CONFIGURATION_ERROR,
      severity: 'medium',
      retryable: false,
    })
  }
}

/**
 * Error thrown when a query execution fails
 *
 * Thrown when CosmosDB query operations fail, such as document sampling.
 * Query failures may be transient (e.g., network issues, throttling).
 *
 * @example
 * ```ts
 * throw new QueryFailedError('Failed to sample documents', context);
 * ```
 */
export class QueryFailedError extends CosmosDBError {
  constructor(message: string, context: CosmosDBErrorContext) {
    super({
      message,
      context,
      code: ErrorCode.QUERY_FAILED,
      severity: 'high',
      retryable: true,
    })
  }
}

/**
 * Error thrown when input validation fails
 *
 * Thrown when input data does not meet required validation criteria,
 * such as empty arrays, invalid formats, or out-of-range values.
 *
 * @example
 * ```ts
 * throw new ValidationError('Documents array cannot be empty', context);
 * ```
 */
export class ValidationError extends CosmosDBError {
  constructor(message: string, context: CosmosDBErrorContext) {
    super({
      message,
      context,
      code: ErrorCode.VALIDATION_ERROR,
      severity: 'high',
      retryable: false,
    })
  }
}

/**
 * Error thrown when a field name is invalid (e.g., for SQL injection prevention)
 *
 * @example
 * ```ts
 * throw new InvalidFieldNameError('Invalid field name: "field;DROP TABLE"', context);
 * ```
 */
export class InvalidFieldNameError extends CosmosDBError {
  constructor(message: string, context: CosmosDBErrorContext) {
    super({
      message,
      context,
      code: ErrorCode.VALIDATION_ERROR,
      severity: 'high',
      retryable: false,
    })
  }
}

/**
 * Create error context with timestamp
 *
 * @param component - Component where the error occurred
 * @param metadata - Additional metadata about the error
 * @returns CosmosDBErrorContext object
 *
 * @example
 * ```ts
 * const context = createErrorContext({ component: 'connection-parser', metadata: { detail: 'Invalid format' } });
 * ```
 */
export function createErrorContext({
  component,
  metadata,
}: {
  component: string
  metadata?: Record<string, unknown>
}): CosmosDBErrorContext {
  return {
    component,
    timestamp: new Date().toISOString(),
    metadata,
  }
}

/**
 * Error boundary for handling and transforming errors
 *
 * @param component - Component name for error context
 *
 * @example
 * ```ts
 * const boundary = new ErrorBoundary('schema-generator');
 * await boundary.execute(async () => {
 *   // code that may throw errors
 * });
 * ```
 */
export class ErrorBoundary {
  private readonly component: string

  constructor(component: string) {
    this.component = component
  }

  /**
   * Execute a function within the error boundary
   * Catches and transforms errors to CosmosDBError instances
   *
   * @param fn - Function to execute
   * @returns Result of the function
   * @throws Transformed CosmosDBError if an error occurs
   *
   * @example
   * ```ts
   * const result = await boundary.execute(async () => {
   *   // code that may throw errors
   * });
   * ```
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (error) {
      if (error instanceof CosmosDBError) {
        throw error
      }

      const context = createErrorContext({
        component: this.component,
        metadata: {
          originalError: error instanceof Error ? error.message : String(error),
        },
      })

      throw new CosmosDBError({
        message: error instanceof Error ? error.message : String(error),
        context,
        code: ErrorCode.UNKNOWN_ERROR,
        severity: 'medium',
        retryable: false,
      })
    }
  }

  /**
   * Execute a synchronous function within the error boundary
   *
   * Catches and transforms errors to CosmosDBError instances
   *
   * @param fn - Synchronous function to execute
   * @returns Result of the function
   * @throws CosmosDBError if an error occurs
   *
   * @example
   * ```ts
   * const result = boundary.executeSync(() => {
   *   // code that may throw errors
   * });
   * ```
   */
  executeSync<T>(fn: () => T): T {
    try {
      return fn()
    } catch (error) {
      if (error instanceof CosmosDBError) {
        throw error
      }

      const context = createErrorContext({
        component: this.component,
        metadata: {
          originalError: error instanceof Error ? error.message : String(error),
        },
      })

      throw new CosmosDBError({
        message: error instanceof Error ? error.message : String(error),
        context,
        code: ErrorCode.UNKNOWN_ERROR,
        severity: 'medium',
        retryable: false,
      })
    }
  }
}
