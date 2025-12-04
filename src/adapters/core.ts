/**
 * Core Schema Builder
 * Shared schema building logic for all framework adapters
 * @module
 */

import { type Container, CosmosClient } from '@azure/cosmos'
import { Agent as HttpsAgent } from 'node:https'
import type { CosmosDBSubgraphConfig, ProgressCallback, Resolvers } from '../types/handler.ts'
import type { InferredSchema } from '../types/infer.ts'
import { parseConnectionString } from '../handler/connection-parser.ts'
import { sampleDocuments } from '../handler/document-sampler.ts'
import { inferSchema } from '../infer/infer-schema.ts'
import { buildGraphQLSDL } from '../infer/sdl-generator.ts'
import { buildResolvers } from '../handler/resolver-builder.ts'
import { createExecutableSchema } from '../handler/schema-executor.ts'
import { ConfigurationError, createErrorContext } from '../errors/mod.ts'
import { validateContainerConfig, validateRequiredString } from '../utils/validation.ts'
import { SchemaCache } from '../cache/schemaCache.ts'

/**
 * Container information
 */
type ContainerInfo = {
  /** CosmosDB container instance */
  container: Container
  /** GraphQL type name for this container */
  typeName: string
  /** Inferred schema for this container */
  schema: InferredSchema
}

/**
 * Result of core schema building
 * Contains all artifacts needed by framework adapters
 */
export type CoreSchemaResult = {
  /** Executable GraphQL schema with resolvers */
  schema: ReturnType<typeof import('@graphql-tools/schema').makeExecutableSchema>

  /** GraphQL SDL string */
  sdl: string

  /** GraphQL resolvers map */
  resolvers: Resolvers

  /** CosmosDB client instance (adapter must dispose when done) */
  client: CosmosClient

  /** Map of container instances by type name */
  containers: Map<string, Container>

  /** Array of all container names */
  containerNames: string[]

  /** Statistics about schema generation */
  stats: {
    /** Number of documents analyzed */
    documentsAnalyzed: number
    /** Number of GraphQL types generated */
    typesGenerated: number
    /** Total sample size across all containers */
    sampleSize: number
  }

  /** Subgraph name (if provided) */
  subgraphName?: string
}

/**
 * Capitalize the first letter of a string
 *
 * @param str - String to capitalize
 * @returns String with first letter capitalized
 *
 * @example
 * ```ts
 * capitalizeFirstLetter('users') // 'Users'
 * capitalizeFirstLetter('listing') // 'Listing'
 * ```
 */
function capitalizeFirstLetter(str: string): string {
  if (!str || str.length === 0) return str
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Convert plural word to singular form
 *
 * Simple singularization for common patterns.
 * For edge cases, users should provide custom typeName.
 *
 * @param word - Plural word to singularize
 * @returns Singular form of the word
 *
 * @example
 * ```ts
 * singularize('users') // 'user'
 * singularize('listings') // 'listing'
 * singularize('files') // 'file'
 * singularize('data') // 'data' (irregular, unchanged)
 * ```
 */
function singularize(word: string): string {
  if (!word || word.length === 0) return word

  // Handle common irregular plurals
  const irregulars: Record<string, string> = {
    'people': 'person',
    'children': 'child',
    'men': 'man',
    'women': 'woman',
    'data': 'data',
    'sheep': 'sheep',
    'fish': 'fish',
  }

  const lowerWord = word.toLowerCase()
  if (irregulars[lowerWord]) {
    return irregulars[lowerWord]
  }

  // Handle common plural patterns
  if (word.endsWith('ies')) {
    return word.slice(0, -3) + 'y'
  }
  if (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('zes')) {
    return word.slice(0, -2)
  }
  if (word.endsWith('s') && !word.endsWith('ss')) {
    return word.slice(0, -1)
  }

  return word
}

/**
 * Resolve GraphQL type name for a container
 *
 * Implements the type naming strategy:
 * - Custom typeName takes precedence
 * - Auto-prefix: {ContainerName}{SingularContainerName}
 *
 * @param params - Type name resolution parameters
 * @returns Resolved GraphQL type name
 *
 * @example
 * ```ts
 * // Custom type name
 * resolveTypeName({ containerName: 'users', customTypeName: 'User' })
 * // Returns: 'User'
 *
 * // Auto-prefix
 * resolveTypeName({ containerName: 'users' })
 * // Returns: 'UsersUser'
 * ```
 */
function resolveTypeName({
  containerName,
  customTypeName,
}: {
  containerName: string
  customTypeName?: string
}): string {
  if (customTypeName) {
    return customTypeName
  }

  // Auto-prefix: capitalize container name + capitalize singular
  const capitalized = capitalizeFirstLetter(containerName)
  const singular = singularize(capitalized)
  return `${capitalized}${capitalizeFirstLetter(singular)}`
}

/**
 * Build unified SDL from multiple container schemas
 *
 * Merges SDL fragments from multiple containers into a single unified schema.
 * Each container's types are included, and all queries are combined into a single Query type.
 *
 * @param params - SDL merging parameters
 * @returns Unified GraphQL SDL string
 */
function buildMultiContainerSDL({
  containerInfos,
}: {
  containerInfos: ContainerInfo[]
}): string {
  const sdlFragments: string[] = []
  const queryFields: string[] = []
  const connectionTypes: string[] = []

  for (const info of containerInfos) {
    // Generate SDL without Query type (we'll merge queries separately)
    const sdl = buildGraphQLSDL({
      schema: info.schema,
      includeQueries: false,
    })
    sdlFragments.push(sdl)

    // Build query fields for this container
    const typeName = info.typeName
    const typeNameLower = typeName.toLowerCase()
    const typeNamePlural = `${typeNameLower}s`
    const connectionName = `${typeName}${capitalizeFirstLetter(typeNamePlural)}Connection`

    queryFields.push(`  """Get a single ${typeName} by ID"""
  ${typeNameLower}(
    """Document ID"""
    id: ID!
    
    """Partition key (optional, defaults to ID if not provided)"""
    partitionKey: String
  ): ${typeName}

  """List ${typeName}s with pagination, filtering, and sorting"""
  ${typeNamePlural}(
    """Maximum number of results (default: 100)"""
    limit: Int = 100
    
    """Filter by partition key"""
    partitionKey: String
    
    """Continuation token from previous query for pagination"""
    continuationToken: String
    
    """Field name to sort by"""
    orderBy: String
    
    """Sort direction (default: ASC)"""
    orderDirection: OrderDirection = ASC
  ): ${connectionName}!`)

    // Build connection type for this container
    connectionTypes.push(`"""Paginated connection for ${typeName} queries"""
type ${connectionName} {
  """Items in the current page"""
  items: [${typeName}!]!
  
  """Continuation token for fetching the next page"""
  continuationToken: String
  
  """Whether more items are available"""
  hasMore: Boolean!
}`)
  }

  // Merge all SDL fragments
  const mergedTypes = sdlFragments.join('\n\n')

  // Create unified Query type
  const queryType = `type Query {
${queryFields.join('\n\n')}
}`

  // OrderDirection enum
  const orderDirectionEnum = `"""Sort direction for query results"""
enum OrderDirection {
  """Ascending order"""
  ASC
  
  """Descending order"""
  DESC
}`

  // Combine all parts
  return `${mergedTypes}\n\n${queryType}\n\n${orderDirectionEnum}\n\n${connectionTypes.join('\n\n')}`
}

/**
 * Build multi-container resolvers
 *
 * Creates resolvers for all containers, routing queries to the appropriate container.
 *
 * @param params - Resolver building parameters
 * @returns GraphQL resolvers object
 */
function buildMultiContainerResolvers({
  containerMap,
  retry,
}: {
  containerMap: Map<string, Container>
  retry?: CosmosDBSubgraphConfig['retry']
}): Resolvers {
  const resolvers: Resolvers = {
    Query: {},
  }

  for (const [typeName, container] of containerMap.entries()) {
    // Build resolvers for this container
    const containerResolvers = buildResolvers({
      container,
      typeName,
      retry,
    })

    // Merge Query resolvers
    resolvers.Query = { ...resolvers.Query, ...containerResolvers.Query }

    // Add type-specific resolvers if any
    if (containerResolvers[typeName]) {
      resolvers[typeName] = containerResolvers[typeName]
    }
  }

  return resolvers
}

/**
 * Create CosmosDB client from configuration
 *
 * For local emulator connections (localhost/127.0.0.1), automatically configures
 * an HTTPS agent that bypasses SSL certificate validation, since the emulator
 * uses self-signed certificates.
 *
 * @param config - CosmosDB configuration
 * @returns CosmosDB client instance
 * @throws {ConfigurationError} If authentication configuration is invalid
 */
function createCosmosClient(config: CosmosDBSubgraphConfig): CosmosClient {
  if (config.connectionString) {
    const connection = parseConnectionString(config.connectionString)
    const isLocalEmulator = connection.endpoint.includes('localhost') ||
      connection.endpoint.includes('127.0.0.1')

    if (isLocalEmulator) {
      const customAgent = new HttpsAgent({ rejectUnauthorized: false })

      // @ts-ignore - connectionPolicy and agent properties not in types but accepted by runtime
      return new CosmosClient({
        endpoint: connection.endpoint,
        key: connection.key!,
        agent: customAgent,
        connectionPolicy: {
          enableEndpointDiscovery: false,
        },
      })
    }

    return new CosmosClient({
      endpoint: connection.endpoint,
      key: connection.key!,
    })
  }

  if (config.endpoint && config.credential) {
    const isLocalEmulator = config.endpoint.includes('localhost') ||
      config.endpoint.includes('127.0.0.1')

    const clientConfig: {
      endpoint: string
      aadCredentials: {
        getToken: (
          scopes: string | string[],
        ) => Promise<{ token: string; expiresOnTimestamp: number }>
      }
      agent?: HttpsAgent
    } = {
      endpoint: config.endpoint,
      aadCredentials: config.credential as {
        getToken: (
          scopes: string | string[],
        ) => Promise<{ token: string; expiresOnTimestamp: number }>
      },
    }

    if (isLocalEmulator) {
      clientConfig.agent = new HttpsAgent({ rejectUnauthorized: false })
      // @ts-ignore - connectionPolicy not in types but accepted by runtime
      clientConfig.connectionPolicy = {
        enableEndpointDiscovery: false,
      }
    }

    return new CosmosClient(clientConfig as never)
  }

  if (config.endpoint) {
    throw new ConfigurationError(
      'When using endpoint authentication, credential must be provided',
      createErrorContext({
        component: 'createCosmosClient',
        metadata: {
          hasEndpoint: true,
          hasCredential: false,
        },
      }),
    )
  }

  throw new ConfigurationError(
    'Either connectionString or endpoint+credential must be provided',
    createErrorContext({
      component: 'createCosmosClient',
      metadata: {
        hasConnectionString: false,
        hasEndpoint: false,
        hasCredential: false,
      },
    }),
  )
}

/**
 * Build core schema from CosmosDB containers
 *
 * Generates a unified GraphQL schema from CosmosDB containers.
 * All containers share a single CosmosClient instance for efficiency.
 *
 * **CRITICAL**: This function does NOT dispose the CosmosDB client. The client
 * must remain alive for resolvers to function. Adapters are responsible for
 * client disposal at the appropriate time (e.g., server shutdown).
 *
 * @param config - CosmosDB configuration with containers array
 * @param onProgress - Optional progress callback for status updates
 * @param cache - Optional schema cache instance for performance optimization
 * @returns Promise resolving to core schema artifacts
 *
 * @example
 * ```ts
 * // Single container
 * const result = await buildCoreSchema({
 *   connectionString: env.COSMOS_CONN,
 *   database: 'db1',
 *   containers: [{ name: 'users', typeName: 'User' }]
 * })
 *
 * // Multiple containers
 * const result = await buildCoreSchema({
 *   connectionString: env.COSMOS_CONN,
 *   database: 'db1',
 *   containers: [
 *     { name: 'users', typeName: 'User' },
 *     { name: 'listings', typeName: 'Listing' }
 *   ]
 * })
 * ```
 */
export async function buildCoreSchema(
  config: CosmosDBSubgraphConfig,
  onProgress?: ProgressCallback,
  _cache?: SchemaCache,
  subgraphName?: string,
): Promise<CoreSchemaResult> {
  // Validate configuration
  validateContainerConfig({ config, component: 'buildCoreSchema' })

  const database = validateRequiredString(config.database, 'database', 'buildCoreSchema')

  // Create single CosmosDB client for all containers
  const client = createCosmosClient(config)

  // Sample documents from all containers in parallel
  onProgress?.({
    stage: 'sampling_started',
    message: `Starting parallel document sampling for ${config.containers.length} containers`,
    metadata: { containerCount: config.containers.length },
  })

  const containerInfos: ContainerInfo[] = await Promise.all(
    config.containers.map(async (containerConfig) => {
      const containerRef = client.database(database).container(containerConfig.name)
      const sampleSize = containerConfig.sampleSize || 500

      // Sample documents
      const sampleResult = await sampleDocuments({
        container: containerRef,
        sampleSize,
        retry: config.retry,
        onProgress: (sampled, total, ruConsumed) => {
          onProgress?.({
            stage: 'sampling_progress',
            progress: total > 0 ? Math.round((sampled / total) * 100) : 0,
            message: `[${containerConfig.name}] Sampled ${sampled}/${total} documents (${ruConsumed.toFixed(2)} RU)`,
            metadata: { container: containerConfig.name, sampled, total, ruConsumed },
          })
        },
      })

      // Resolve type name
      const typeName = resolveTypeName({
        containerName: containerConfig.name,
        customTypeName: containerConfig.typeName,
      })

      // Infer schema
      onProgress?.({
        stage: 'inference_started',
        message: `[${containerConfig.name}] Starting schema inference for type ${typeName}`,
        metadata: { container: containerConfig.name, typeName },
      })

      const inferredSchema = inferSchema({
        documents: sampleResult.documents,
        typeName,
        config: containerConfig.typeSystem || config.typeSystem,
        onProgress: (event) => {
          // Forward progress events with container context
          onProgress?.({
            ...event,
            message: `[${containerConfig.name}] ${event.message || ''}`,
          })
        },
      })

      onProgress?.({
        stage: 'inference_complete',
        message: `[${containerConfig.name}] Schema inference complete for ${typeName}`,
        metadata: {
          container: containerConfig.name,
          typeName,
          documentsAnalyzed: sampleResult.documents.length,
        },
      })

      return {
        container: containerRef,
        typeName,
        schema: inferredSchema,
      }
    }),
  )

  // Report sampling complete
  const totalDocuments = containerInfos.reduce((sum, info) => sum + info.schema.stats.totalDocuments, 0)
  onProgress?.({
    stage: 'sampling_complete',
    progress: 100,
    message: `Sampling complete: ${totalDocuments} total documents across ${containerInfos.length} containers`,
    metadata: {
      containerCount: containerInfos.length,
      totalDocuments,
    },
  })

  // Generate unified SDL
  onProgress?.({
    stage: 'sdl_generation_started',
    message: 'Generating unified SDL from all containers',
  })

  const sdl = buildMultiContainerSDL({ containerInfos })

  onProgress?.({
    stage: 'sdl_generation_complete',
    message: 'Unified SDL generation complete',
  })

  // Build container map for resolver routing
  const containerMap = new Map<string, Container>()
  const containerNames: string[] = []

  for (const info of containerInfos) {
    containerMap.set(info.typeName, info.container)
    containerNames.push(info.typeName)
  }

  // Build unified resolvers
  const resolvers = buildMultiContainerResolvers({
    containerMap,
    retry: config.retry,
  })

  // Create executable schema
  const schema = createExecutableSchema({
    sdl,
    resolvers,
  })

  // Calculate total statistics
  const totalTypes = containerInfos.reduce((sum, info) => sum + info.schema.stats.typesGenerated, 0)

  return {
    schema,
    sdl,
    resolvers,
    client,
    containers: containerMap,
    containerNames,
    stats: {
      documentsAnalyzed: totalDocuments,
      typesGenerated: totalTypes,
      sampleSize: totalDocuments,
    },
    subgraphName,
  }
}
