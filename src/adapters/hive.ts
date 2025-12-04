/**
 * Hive Schema Registry Adapter
 * Upload and validate CosmosDB schemas in Hive Schema Registry
 * @module
 */

import type { CosmosDBSubgraphConfig } from '../types/handler.ts'
import { buildCoreSchema } from './core.ts'
import { ConfigurationError, createErrorContext, ValidationError } from '../errors/mod.ts'

/**
 * Hive adapter configuration
 */
export type HiveAdapterConfig = CosmosDBSubgraphConfig & {
  /** Hive registry URL (e.g., 'https://app.graphql-hive.com') */
  registryUrl: string

  /** Service/schema name in Hive */
  serviceName: string

  /** Hive access token for authentication */
  token: string

  /** Whether to validate schema before upload (default: true) */
  validate?: boolean

  /** Whether to force schema update even if it hasn't changed (default: false) */
  force?: boolean

  /** Optional commit information */
  commit?: {
    /** Commit SHA */
    sha?: string
    /** Commit author */
    author?: string
    /** Commit message */
    message?: string
  }
}

/**
 * Hive upload result
 */
export type HiveAdapterResult = {
  /** Whether upload succeeded */
  success: boolean

  /** Schema SDL that was uploaded */
  sdl: string

  /** Hive registry response (if successful) */
  registryResponse?: {
    /** Schema ID in registry */
    schemaId: string
    /** Schema version */
    version: string
    /** Direct URL to schema in Hive */
    url?: string
  }

  /** Validation or upload errors */
  errors?: string[]

  /** Statistics about the schema */
  stats: {
    documentsAnalyzed: number
    typesGenerated: number
  }
}

/**
 * Upload CosmosDB schema to Hive Schema Registry
 *
 * This adapter generates a GraphQL schema from CosmosDB and uploads it
 * to Hive Schema Registry for version control, validation, and monitoring.
 *
 * **Note**: This adapter generates SDL and uploads it. The CosmosDB client
 * is disposed after schema generation since Hive only needs the SDL string.
 *
 * @param config - CosmosDB and Hive configuration
 * @returns Upload result with registry details or errors
 *
 * @example Single container
 * ```ts
 * import { uploadToHive } from '@oneiriq/cosmiq-graphql/hive'
 *
 * const result = await uploadToHive({
 *   connectionString: Deno.env.get('COSMOS_CONN')!,
 *   database: 'myDatabase',
 *   containers: [{ name: 'items', typeName: 'Item' }],
 *   registryUrl: 'https://app.graphql-hive.com',
 *   serviceName: 'cosmos-api',
 *   token: Deno.env.get('HIVE_TOKEN')!,
 * })
 *
 * if (result.success) {
 *   console.log(`Schema uploaded: v${result.registryResponse?.version}`)
 * } else {
 *   console.error('Upload failed:', result.errors)
 * }
 * ```
 *
 * @example Multiple containers (unified schema)
 * ```ts
 * const result = await uploadToHive({
 *   connectionString: Deno.env.get('COSMOS_CONN')!,
 *   database: 'db1',
 *   containers: [
 *     { name: 'users', typeName: 'User' },
 *     { name: 'listings', typeName: 'Listing' },
 *     { name: 'files', typeName: 'File' }
 *   ],
 *   registryUrl: 'https://app.graphql-hive.com',
 *   serviceName: 'cosmos-api',
 *   token: Deno.env.get('HIVE_TOKEN')!,
 * })
 * ```
 *
 * @example With validation and commit info
 * ```ts
 * const result = await uploadToHive({
 *   connectionString: Deno.env.get('COSMOS_CONN')!,
 *   database: 'myDatabase',
 *   containers: [{ name: 'items', typeName: 'Item' }],
 *   registryUrl: 'https://app.graphql-hive.com',
 *   serviceName: 'cosmos-api',
 *   token: Deno.env.get('HIVE_TOKEN')!,
 *   validate: true,
 *   commit: {
 *     sha: Deno.env.get('GIT_SHA'),
 *     author: 'CI/CD Pipeline',
 *     message: 'Auto-generated schema from CosmosDB',
 *   },
 * })
 * ```
 */
export async function uploadToHive(
  config: HiveAdapterConfig,
): Promise<HiveAdapterResult> {
  // Validate Hive-specific configuration
  if (!config.registryUrl) {
    throw new ConfigurationError(
      'registryUrl is required for Hive adapter',
      createErrorContext({
        component: 'uploadToHive',
        metadata: {
          providedConfig: {
            hasRegistryUrl: !!config.registryUrl,
            hasServiceName: !!config.serviceName,
            hasToken: !!config.token,
            database: config.database,
          },
        },
      }),
    )
  }

  if (!config.serviceName) {
    throw new ConfigurationError(
      'serviceName is required for Hive adapter',
      createErrorContext({
        component: 'uploadToHive',
        metadata: {
          providedConfig: {
            registryUrl: config.registryUrl ? '[redacted]' : undefined,
            hasServiceName: !!config.serviceName,
            hasToken: !!config.token,
            database: config.database,
          },
        },
      }),
    )
  }

  if (!config.token) {
    throw new ConfigurationError(
      'token is required for Hive adapter',
      createErrorContext({
        component: 'uploadToHive',
        metadata: {
          providedConfig: {
            registryUrl: config.registryUrl ? '[redacted]' : undefined,
            serviceName: config.serviceName,
            hasToken: !!config.token,
            database: config.database,
          },
        },
      }),
    )
  }

  // Generate schema from CosmosDB
  const core = await buildCoreSchema(config)

  // Dispose client immediately - Hive only needs SDL
  try {
    core.client.dispose()
  } catch {
    // Ignore disposal errors
  }

  // Validate schema if requested
  if (config.validate !== false) {
    const validationErrors = validateSchema(core.sdl)
    if (validationErrors.length > 0) {
      return {
        success: false,
        sdl: core.sdl,
        errors: validationErrors,
        stats: {
          documentsAnalyzed: core.stats.documentsAnalyzed,
          typesGenerated: core.stats.typesGenerated,
        },
      }
    }
  }

  // Upload to Hive
  try {
    const response = await uploadSchemaToHive(config, core.sdl)

    return {
      success: true,
      sdl: core.sdl,
      registryResponse: response,
      stats: {
        documentsAnalyzed: core.stats.documentsAnalyzed,
        typesGenerated: core.stats.typesGenerated,
      },
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      sdl: core.sdl,
      errors: [errorMessage],
      stats: {
        documentsAnalyzed: core.stats.documentsAnalyzed,
        typesGenerated: core.stats.typesGenerated,
      },
    }
  }
}

/**
 * Validate GraphQL SDL
 * Basic validation - checks for syntax errors
 */
function validateSchema(sdl: string): string[] {
  const errors: string[] = []

  // Basic validation checks
  if (!sdl || sdl.trim().length === 0) {
    errors.push('SDL is empty')
    return errors
  }

  if (!sdl.includes('type Query')) {
    errors.push('Schema must include a Query type')
  }

  // Check for balanced braces
  const openBraces = (sdl.match(/{/g) || []).length
  const closeBraces = (sdl.match(/}/g) || []).length
  if (openBraces !== closeBraces) {
    errors.push(`Unbalanced braces: ${openBraces} open, ${closeBraces} close`)
  }

  return errors
}

/**
 * Upload schema to Hive registry
 */
async function uploadSchemaToHive(
  config: HiveAdapterConfig,
  sdl: string,
): Promise<HiveAdapterResult['registryResponse']> {
  const url = `${config.registryUrl}/registry`

  const payload: Record<string, unknown> = {
    schema: sdl,
    service: config.serviceName,
    force: config.force || false,
  }

  if (config.commit) {
    payload.commit = config.commit
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new ValidationError(
      `Hive upload failed: ${response.status} ${response.statusText} - ${errorText}`,
      createErrorContext({
        component: 'uploadSchemaToHive',
        metadata: {
          httpStatus: response.status,
          httpStatusText: response.statusText,
          registryUrl: config.registryUrl ? '[redacted]' : undefined,
          serviceName: config.serviceName,
          hasCommitInfo: !!config.commit,
        },
      }),
    )
  }

  const data = await response.json() as {
    id?: string
    version?: string
    url?: string
    schemaId?: string
  }

  return {
    schemaId: data.schemaId || data.id || 'unknown',
    version: data.version || '1',
    url: data.url,
  }
}
