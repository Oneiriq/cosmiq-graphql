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
  /** Configuration validation error */
  CONFIG_VALIDATION = 'CONFIG_VALIDATION',
  /** Query execution failed */
  QUERY_FAILED = 'QUERY_FAILED',
  /** Validation error for input data */
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  /** Bad request (HTTP 400) */
  BAD_REQUEST = 'BAD_REQUEST',
  /** Unauthorized (HTTP 401) */
  UNAUTHORIZED = 'UNAUTHORIZED',
  /** Forbidden (HTTP 403) */
  FORBIDDEN = 'FORBIDDEN',
  /** Not found (HTTP 404) */
  NOT_FOUND = 'NOT_FOUND',
  /** Conflict (HTTP 409) */
  CONFLICT = 'CONFLICT',
  /** Rate limit exceeded (HTTP 429) */
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  /** Internal server error (HTTP 500) */
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  /** Bad gateway (HTTP 502) */
  BAD_GATEWAY = 'BAD_GATEWAY',
  /** Service unavailable (HTTP 503) */
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  /** Gateway timeout (HTTP 504) */
  GATEWAY_TIMEOUT = 'GATEWAY_TIMEOUT',
  /** Request timeout */
  REQUEST_TIMEOUT = 'REQUEST_TIMEOUT',
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
 * Metadata extracted from CosmosDB errors
 */
export type CosmosDBErrorMetadata = {
  /** HTTP status code from CosmosDB response */
  statusCode?: number
  /** Activity ID for tracing */
  activityId?: string
  /** Retry-After header value in milliseconds */
  retryAfterMs?: number
  /** Request charge (RU consumption) */
  requestCharge?: number
  /** Sub-status code for additional error details */
  substatus?: number
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
 * Configuration validation error
 *
 * Thrown when CRUD operation configuration is invalid,
 * such as conflicting include/exclude lists or invalid operation names.
 *
 * @example
 * ```ts
 * throw new ConfigValidationError({
 *   message: 'Invalid operation: "invalid"',
 *   context,
 *   field: 'operation',
 *   operation: 'invalid'
 * });
 * ```
 */
export class ConfigValidationError extends CosmosDBError {
  public readonly field?: string
  public readonly operation?: string

  constructor({
    message,
    context,
    field,
    operation,
  }: {
    message: string
    context: CosmosDBErrorContext
    field?: string
    operation?: string
  }) {
    super({
      message,
      context,
      code: ErrorCode.CONFIG_VALIDATION,
      severity: 'high',
      retryable: false,
    })
    this.field = field
    this.operation = operation
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      field: this.field,
      operation: this.operation,
    }
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
 * Error thrown when CosmosDB rate limit is exceeded (HTTP 429)
 *
 * This error is retryable and should respect the retry-after header
 * from the server response.
 *
 * @example
 * ```ts
 * throw new RateLimitError({
 *   message: 'Request rate is large',
 *   context,
 *   metadata: { retryAfterMs: 1000, requestCharge: 50.5 }
 * });
 * ```
 */
export class RateLimitError extends CosmosDBError {
  public readonly metadata: CosmosDBErrorMetadata

  constructor({
    message,
    context,
    metadata = {},
  }: {
    message: string
    context: CosmosDBErrorContext
    metadata?: CosmosDBErrorMetadata
  }) {
    super({
      message,
      context,
      code: ErrorCode.RATE_LIMIT_EXCEEDED,
      severity: 'medium',
      retryable: true,
    })
    this.metadata = metadata
  }

  /**
   * Serialize error to JSON with metadata
   */
  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      metadata: this.metadata,
    }
  }
}

/**
 * Error thrown when CosmosDB service is unavailable (HTTP 503)
 *
 * This error is retryable as the service may recover.
 *
 * @example
 * ```ts
 * throw new ServiceUnavailableError({
 *   message: 'Service temporarily unavailable',
 *   context,
 *   metadata: { retryAfterMs: 5000 }
 * });
 * ```
 */
export class ServiceUnavailableError extends CosmosDBError {
  public readonly metadata: CosmosDBErrorMetadata

  constructor({
    message,
    context,
    metadata = {},
  }: {
    message: string
    context: CosmosDBErrorContext
    metadata?: CosmosDBErrorMetadata
  }) {
    super({
      message,
      context,
      code: ErrorCode.SERVICE_UNAVAILABLE,
      severity: 'high',
      retryable: true,
    })
    this.metadata = metadata
  }

  /**
   * Serialize error to JSON with metadata
   */
  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      metadata: this.metadata,
    }
  }
}

/**
 * Error thrown when a request times out
 *
 * This error is retryable as temporary network issues may resolve.
 *
 * @example
 * ```ts
 * throw new RequestTimeoutError({
 *   message: 'Request timed out after 60s',
 *   context,
 *   metadata: { requestCharge: 10.5 }
 * });
 * ```
 */
export class RequestTimeoutError extends CosmosDBError {
  public readonly metadata: CosmosDBErrorMetadata

  constructor({
    message,
    context,
    metadata = {},
  }: {
    message: string
    context: CosmosDBErrorContext
    metadata?: CosmosDBErrorMetadata
  }) {
    super({
      message,
      context,
      code: ErrorCode.REQUEST_TIMEOUT,
      severity: 'medium',
      retryable: true,
    })
    this.metadata = metadata
  }

  /**
   * Serialize error to JSON with metadata
   */
  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      metadata: this.metadata,
    }
  }
}

/**
 * Error thrown for bad request (HTTP 400)
 *
 * Indicates client sent invalid data or malformed request.
 *
 * @example
 * ```ts
 * throw new BadRequestError({
 *   message: 'Invalid query syntax',
 *   context,
 *   metadata: { statusCode: 400 }
 * });
 * ```
 */
export class BadRequestError extends CosmosDBError {
  public readonly metadata: CosmosDBErrorMetadata

  constructor({
    message,
    context,
    metadata = {},
  }: {
    message: string
    context: CosmosDBErrorContext
    metadata?: CosmosDBErrorMetadata
  }) {
    super({
      message,
      context,
      code: ErrorCode.BAD_REQUEST,
      severity: 'high',
      retryable: false,
    })
    this.metadata = metadata
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      metadata: this.metadata,
    }
  }
}

/**
 * Error thrown for unauthorized access (HTTP 401)
 *
 * Indicates authentication is required or has failed.
 *
 * @example
 * ```ts
 * throw new UnauthorizedError({
 *   message: 'Invalid credentials',
 *   context,
 *   metadata: { statusCode: 401 }
 * });
 * ```
 */
export class UnauthorizedError extends CosmosDBError {
  public readonly metadata: CosmosDBErrorMetadata

  constructor({
    message,
    context,
    metadata = {},
  }: {
    message: string
    context: CosmosDBErrorContext
    metadata?: CosmosDBErrorMetadata
  }) {
    super({
      message,
      context,
      code: ErrorCode.UNAUTHORIZED,
      severity: 'high',
      retryable: false,
    })
    this.metadata = metadata
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      metadata: this.metadata,
    }
  }
}

/**
 * Error thrown for forbidden access (HTTP 403)
 *
 * Indicates client lacks permission to access resource.
 *
 * @example
 * ```ts
 * throw new ForbiddenError({
 *   message: 'Insufficient permissions',
 *   context,
 *   metadata: { statusCode: 403 }
 * });
 * ```
 */
export class ForbiddenError extends CosmosDBError {
  public readonly metadata: CosmosDBErrorMetadata

  constructor({
    message,
    context,
    metadata = {},
  }: {
    message: string
    context: CosmosDBErrorContext
    metadata?: CosmosDBErrorMetadata
  }) {
    super({
      message,
      context,
      code: ErrorCode.FORBIDDEN,
      severity: 'high',
      retryable: false,
    })
    this.metadata = metadata
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      metadata: this.metadata,
    }
  }
}

/**
 * Error thrown for not found (HTTP 404)
 *
 * Indicates requested resource does not exist.
 *
 * @example
 * ```ts
 * throw new NotFoundError({
 *   message: 'Database not found',
 *   context,
 *   metadata: { statusCode: 404 }
 * });
 * ```
 */
export class NotFoundError extends CosmosDBError {
  public readonly metadata: CosmosDBErrorMetadata

  constructor({
    message,
    context,
    metadata = {},
  }: {
    message: string
    context: CosmosDBErrorContext
    metadata?: CosmosDBErrorMetadata
  }) {
    super({
      message,
      context,
      code: ErrorCode.NOT_FOUND,
      severity: 'medium',
      retryable: false,
    })
    this.metadata = metadata
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      metadata: this.metadata,
    }
  }
}

/**
 * Error thrown for conflict (HTTP 409)
 *
 * Indicates request conflicts with current state.
 *
 * @example
 * ```ts
 * throw new ConflictError({
 *   message: 'Resource already exists',
 *   context,
 *   metadata: { statusCode: 409 }
 * });
 * ```
 */
export class ConflictError extends CosmosDBError {
  public readonly metadata: CosmosDBErrorMetadata

  constructor({
    message,
    context,
    metadata = {},
  }: {
    message: string
    context: CosmosDBErrorContext
    metadata?: CosmosDBErrorMetadata
  }) {
    super({
      message,
      context,
      code: ErrorCode.CONFLICT,
      severity: 'medium',
      retryable: false,
    })
    this.metadata = metadata
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      metadata: this.metadata,
    }
  }
}

/**
 * Error thrown for internal server error (HTTP 500)
 *
 * Indicates server encountered an unexpected condition.
 * This error is retryable as it may be transient.
 *
 * @example
 * ```ts
 * throw new InternalServerError({
 *   message: 'Server error occurred',
 *   context,
 *   metadata: { statusCode: 500 }
 * });
 * ```
 */
export class InternalServerError extends CosmosDBError {
  public readonly metadata: CosmosDBErrorMetadata

  constructor({
    message,
    context,
    metadata = {},
  }: {
    message: string
    context: CosmosDBErrorContext
    metadata?: CosmosDBErrorMetadata
  }) {
    super({
      message,
      context,
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      severity: 'high',
      retryable: true,
    })
    this.metadata = metadata
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      metadata: this.metadata,
    }
  }
}

/**
 * Error thrown for bad gateway (HTTP 502)
 *
 * Indicates invalid response from upstream server.
 * This error is retryable as it may be transient.
 *
 * @example
 * ```ts
 * throw new BadGatewayError({
 *   message: 'Invalid gateway response',
 *   context,
 *   metadata: { statusCode: 502 }
 * });
 * ```
 */
export class BadGatewayError extends CosmosDBError {
  public readonly metadata: CosmosDBErrorMetadata

  constructor({
    message,
    context,
    metadata = {},
  }: {
    message: string
    context: CosmosDBErrorContext
    metadata?: CosmosDBErrorMetadata
  }) {
    super({
      message,
      context,
      code: ErrorCode.BAD_GATEWAY,
      severity: 'high',
      retryable: true,
    })
    this.metadata = metadata
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      metadata: this.metadata,
    }
  }
}

/**
 * Error thrown for gateway timeout (HTTP 504)
 *
 * Indicates gateway did not receive timely response from upstream server.
 * This error is retryable as it may be transient.
 *
 * @example
 * ```ts
 * throw new GatewayTimeoutError({
 *   message: 'Gateway timeout',
 *   context,
 *   metadata: { statusCode: 504 }
 * });
 * ```
 */
export class GatewayTimeoutError extends CosmosDBError {
  public readonly metadata: CosmosDBErrorMetadata

  constructor({
    message,
    context,
    metadata = {},
  }: {
    message: string
    context: CosmosDBErrorContext
    metadata?: CosmosDBErrorMetadata
  }) {
    super({
      message,
      context,
      code: ErrorCode.GATEWAY_TIMEOUT,
      severity: 'medium',
      retryable: true,
    })
    this.metadata = metadata
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      metadata: this.metadata,
    }
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
