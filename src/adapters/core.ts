/**
 * Core Schema Builder
 * Shared schema building logic for all framework adapters
 * @module
 */

import { type Container, CosmosClient } from '@azure/cosmos'
import { Agent as HttpsAgent } from 'node:https'
import type { CosmosDBSubgraphConfig, ProgressCallback, ResolverFn, Resolvers } from '../types/handler.ts'
import type { InferredSchema } from '../types/infer.ts'
import { parseConnectionString } from '../handler/connection-parser.ts'
import { sampleDocuments } from '../handler/document-sampler.ts'
import { inferSchema } from '../infer/infer-schema.ts'
import { buildGraphQLSDL } from '../infer/sdl-generator.ts'
import { generateCreateSDL } from '../infer/input-sdl-generator.ts'
import { buildResolvers } from '../handler/resolver-builder.ts'
import {
  buildCreateManyResolver,
  buildCreateResolver,
  buildDeleteManyResolver,
  buildDeleteResolver,
  buildReplaceResolver,
  buildRestoreResolver,
  buildSoftDeleteResolver,
  buildUpdateManyResolver,
  buildUpdateResolver,
  buildUpsertResolver,
} from '../handler/mutation-resolver-builder.ts'
import { buildDecrementResolver, buildIncrementResolver } from '../handler/atomic-operations.ts'
import { generateInputTypes } from '../handler/input-type-generator.ts'
import { isOperationEnabled } from '../handler/operation-config-resolver.ts'
import { createExecutableSchema } from '../handler/schema-executor.ts'
import { ConfigurationError, createErrorContext } from '../errors/mod.ts'
import { validateContainerConfig, validateRequiredString } from '../utils/validation.ts'

/**
 * Container information with configuration
 */
type ContainerInfo = {
  /** CosmosDB container instance */
  container: Container
  /** GraphQL type name for this container */
  typeName: string
  /** Inferred schema for this container */
  schema: InferredSchema
  /** Partition key path for this container */
  partitionKeyPath: string
  /** Operation configuration */
  operationConfig?: CosmosDBSubgraphConfig['containers'][number]['operations']
  /** Require partition key on list queries */
  requirePartitionKeyOnQueries?: boolean
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
 * If CREATE operations are enabled, also generates input types and Mutation type.
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
  const mutationFields: string[] = []
  const connectionTypes: string[] = []
  const inputSDLFragments: string[] = []
  const payloadTypes: string[] = []

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

    // Generate CREATE input types and mutation if enabled
    if (isOperationEnabled('create', info.operationConfig)) {
      const createSDL = generateCreateSDL({
        schema: info.schema,
        typeName,
        operationConfig: info.operationConfig,
      })

      if (createSDL) {
        inputSDLFragments.push(createSDL)

        mutationFields.push(`  """Create a new ${typeName}"""
  create${typeName}(
    """Input data for creating ${typeName}"""
    input: Create${typeName}Input!
  ): Create${typeName}Payload!`)
      }
    }

    // Generate UPDATE mutation if enabled
    if (isOperationEnabled('update', info.operationConfig)) {
      mutationFields.push(`  """Update an existing ${typeName}"""
  update${typeName}(
    """Document ID"""
    id: ID!
    
    """Partition key"""
    partitionKey: String!
    
    """Update data (partial)"""
    input: JSON!
    
    """ETag for optimistic concurrency"""
    etag: String
  ): Create${typeName}Payload!`)
    }

    // Generate DELETE mutation if enabled
    if (isOperationEnabled('delete', info.operationConfig)) {
      payloadTypes.push(`"""Payload returned from delete ${typeName} operation"""
type Delete${typeName}Payload {
  """Whether deletion was successful"""
  success: Boolean!
  
  """ID of the deleted document"""
  deletedId: String!
  
  """Request charge in RUs"""
  requestCharge: Float!
}`)

      mutationFields.push(`  """Delete a ${typeName}"""
  delete${typeName}(
    """Document ID"""
    id: ID!
    
    """Partition key"""
    partitionKey: String!
    
    """ETag for optimistic concurrency"""
    etag: String
  ): Delete${typeName}Payload!`)
    }

    // Generate REPLACE mutation if enabled
    if (isOperationEnabled('replace', info.operationConfig)) {
      mutationFields.push(`  """Replace an existing ${typeName} (full replacement)"""
  replace${typeName}(
    """Document ID"""
    id: ID!
    
    """Partition key"""
    partitionKey: String!
    
    """Replacement data (complete document)"""
    input: JSON!
    
    """ETag for optimistic concurrency"""
    etag: String
  ): Create${typeName}Payload!`)
    }

    // Generate UPSERT mutation if enabled
    if (isOperationEnabled('upsert', info.operationConfig)) {
      const createSDL = generateCreateSDL({
        schema: info.schema,
        typeName,
        operationConfig: info.operationConfig,
      })

      if (createSDL && !inputSDLFragments.includes(createSDL)) {
        inputSDLFragments.push(createSDL)
      }

      payloadTypes.push(`"""Payload returned from upsert ${typeName} operation"""
type Upsert${typeName}Payload {
  """The created or updated document"""
  data: ${typeName}!
  
  """ETag for optimistic concurrency control"""
  etag: String!
  
  """Request charge in RUs"""
  requestCharge: Float!
  
  """Whether document was created (true) or updated (false)"""
  wasCreated: Boolean!
}`)

      mutationFields.push(`  """Upsert a ${typeName} (create or update)"""
  upsert${typeName}(
    """Document ID"""
    id: ID!
    
    """Partition key"""
    partitionKey: String!
    
    """Input data for upsert"""
    input: Create${typeName}Input!
  ): Upsert${typeName}Payload!`)
    }

    // Generate SOFT_DELETE mutation if enabled
    if (isOperationEnabled('softDelete', info.operationConfig)) {
      payloadTypes.push(`"""Payload returned from soft delete ${typeName} operation"""
type SoftDelete${typeName}Payload {
  """Whether soft deletion was successful"""
  success: Boolean!
  
  """ID of the soft deleted document"""
  deletedId: String!
  
  """ETag of the updated document"""
  etag: String!
  
  """Request charge in RUs"""
  requestCharge: Float!
}`)

      mutationFields.push(`  """Soft delete a ${typeName} (mark as deleted)"""
  softDelete${typeName}(
    """Document ID"""
    id: ID!
    
    """Partition key"""
    partitionKey: String!
    
    """ETag for optimistic concurrency"""
    etag: String
    
    """Reason for deletion"""
    deleteReason: String
    
    """User who deleted the document"""
    deletedBy: String
  ): SoftDelete${typeName}Payload!`)
    }

    // Generate RESTORE mutation if enabled
    if (isOperationEnabled('restore', info.operationConfig)) {
      mutationFields.push(`  """Restore a soft-deleted ${typeName}"""
  restore${typeName}(
    """Document ID"""
    id: ID!
    
    """Partition key"""
    pk: String!
    
    """ETag for optimistic concurrency"""
    etag: String
  ): Restore${typeName}Payload!`)
    }

    // Generate CREATE_MANY mutation if enabled
    if (isOperationEnabled('createMany', info.operationConfig)) {
      const createSDL = generateCreateSDL({
        schema: info.schema,
        typeName,
        operationConfig: info.operationConfig,
      })

      if (createSDL && !inputSDLFragments.includes(createSDL)) {
        inputSDLFragments.push(createSDL)
      }

      mutationFields.push(`  """Create multiple ${typeName}s"""
  createMany${typeName}s(
    """Array of input data"""
    input: [Create${typeName}Input!]!
  ): CreateMany${typeName}sPayload!`)
    }

    // Generate UPDATE_MANY mutation if enabled
    if (isOperationEnabled('updateMany', info.operationConfig)) {
      mutationFields.push(`  """Update multiple ${typeName}s"""
  updateMany${typeName}s(
    """Array of update operations"""
    input: [UpdateMany${typeName}Input!]!
  ): UpdateMany${typeName}sPayload!`)
    }

    // Generate DELETE_MANY mutation if enabled
    if (isOperationEnabled('deleteMany', info.operationConfig)) {
      mutationFields.push(`  """Delete multiple ${typeName}s"""
  deleteMany${typeName}s(
    """Array of document references"""
    input: [DeleteMany${typeName}Input!]!
  ): DeleteMany${typeName}sPayload!`)
    }

    // Generate INCREMENT mutation if enabled
    if (isOperationEnabled('increment', info.operationConfig)) {
      mutationFields.push(`  """Atomically increment a numeric field in ${typeName}"""
  increment${typeName}(
    """Document ID"""
    id: ID!
    
    """Partition key"""
    pk: String!
    
    """Field name to increment"""
    field: String!
    
    """Amount to increment by (default: 1)"""
    by: Float = 1
    
    """ETag for optimistic concurrency"""
    etag: String
  ): AtomicNumeric${typeName}Result!`)
    }

    // Generate DECREMENT mutation if enabled
    if (isOperationEnabled('decrement', info.operationConfig)) {
      mutationFields.push(`  """Atomically decrement a numeric field in ${typeName}"""
  decrement${typeName}(
    """Document ID"""
    id: ID!
    
    """Partition key"""
    pk: String!
    
    """Field name to decrement"""
    field: String!
    
    """Amount to decrement by (default: 1)"""
    by: Float = 1
    
    """ETag for optimistic concurrency"""
    etag: String
  ): AtomicNumeric${typeName}Result!`)
    }
  }

  // Merge all SDL fragments
  const mergedTypes = sdlFragments.join('\n\n')

  // Create unified Query type
  const queryType = `type Query {
${queryFields.join('\n\n')}
}`

  // Create unified Mutation type if any mutations exist
  const mutationType = mutationFields.length > 0
    ? `\n\ntype Mutation {
${mutationFields.join('\n\n')}
}`
    : ''

  // OrderDirection enum
  const orderDirectionEnum = `"""Sort direction for query results"""
enum OrderDirection {
  """Ascending order"""
  ASC
  
  """Descending order"""
  DESC
}`

  // JSON scalar definition
  const jsonScalar = `"""JSON scalar type for flexible data"""
scalar JSON`

  // Merge input SDL if any
  const inputSDL = inputSDLFragments.length > 0 ? `\n\n${inputSDLFragments.join('\n\n')}` : ''

  // Merge payload types if any
  const payloadSDL = payloadTypes.length > 0 ? `\n\n${payloadTypes.join('\n\n')}` : ''

  // Combine all parts
  return `${jsonScalar}\n\n${mergedTypes}\n\n${queryType}${mutationType}\n\n${orderDirectionEnum}\n\n${
    connectionTypes.join('\n\n')
  }${inputSDL}${payloadSDL}`
}

/**
 * Build multi-container resolvers
 *
 * Creates resolvers for all containers, routing queries to the appropriate container.
 * If CREATE operations are enabled, also builds mutation resolvers.
 *
 * @param params - Resolver building parameters
 * @returns GraphQL resolvers object
 */
async function buildMultiContainerResolvers({
  containerInfos,
  retry,
}: {
  containerInfos: ContainerInfo[]
  retry?: CosmosDBSubgraphConfig['retry']
}): Promise<Resolvers> {
  const resolvers: Resolvers = {
    Query: {},
  }

  for (const info of containerInfos) {
    // Build Query resolvers for this container
    const containerResolvers = buildResolvers({
      container: info.container,
      typeName: info.typeName,
      retry,
      requirePartitionKeyOnQueries: info.requirePartitionKeyOnQueries,
    })

    // Merge Query resolvers
    resolvers.Query = { ...resolvers.Query, ...containerResolvers.Query }

    // Add type-specific resolvers if any
    if (containerResolvers[info.typeName]) {
      resolvers[info.typeName] = containerResolvers[info.typeName]
    }

    // Build CREATE mutation resolver if enabled
    if (isOperationEnabled('create', info.operationConfig)) {
      const inputTypesResult = generateInputTypes({
        schema: info.schema,
        rootInputTypeName: `Create${info.typeName}Input`,
      })

      const createResolver = buildCreateResolver({
        container: info.container,
        typeName: info.typeName,
        partitionKeyPath: info.partitionKeyPath,
        operationConfig: info.operationConfig,
        inputTypeDef: inputTypesResult.rootInputType,
        retry,
      })

      if (createResolver) {
        if (!resolvers.Mutation) {
          resolvers.Mutation = {}
        }
        resolvers.Mutation[`create${info.typeName}`] = createResolver as ResolverFn
      }
    }

    // Build UPDATE mutation resolver if enabled
    if (isOperationEnabled('update', info.operationConfig)) {
      const updateResolver = buildUpdateResolver({
        container: info.container,
        typeName: info.typeName,
        partitionKeyPath: info.partitionKeyPath,
        operationConfig: info.operationConfig,
        retry,
      })

      if (updateResolver) {
        if (!resolvers.Mutation) {
          resolvers.Mutation = {}
        }
        resolvers.Mutation[`update${info.typeName}`] = updateResolver as ResolverFn
      }
    }

    // Build DELETE mutation resolver if enabled
    if (isOperationEnabled('delete', info.operationConfig)) {
      const deleteResolver = buildDeleteResolver({
        container: info.container,
        typeName: info.typeName,
        operationConfig: info.operationConfig,
        retry,
      })

      if (deleteResolver) {
        if (!resolvers.Mutation) {
          resolvers.Mutation = {}
        }
        resolvers.Mutation[`delete${info.typeName}`] = deleteResolver as ResolverFn
      }
    }

    // Build REPLACE mutation resolver if enabled
    if (isOperationEnabled('replace', info.operationConfig)) {
      const replaceResolver = buildReplaceResolver({
        container: info.container,
        typeName: info.typeName,
        partitionKeyPath: info.partitionKeyPath,
        operationConfig: info.operationConfig,
        retry,
      })

      if (replaceResolver) {
        if (!resolvers.Mutation) {
          resolvers.Mutation = {}
        }
        resolvers.Mutation[`replace${info.typeName}`] = replaceResolver as ResolverFn
      }
    }

    // Build UPSERT mutation resolver if enabled
    if (isOperationEnabled('upsert', info.operationConfig)) {
      const inputTypesResult = generateInputTypes({
        schema: info.schema,
        rootInputTypeName: `Create${info.typeName}Input`,
      })

      const upsertResolver = buildUpsertResolver({
        container: info.container,
        typeName: info.typeName,
        partitionKeyPath: info.partitionKeyPath,
        operationConfig: info.operationConfig,
        inputTypeDef: inputTypesResult.rootInputType,
        retry,
      })

      if (upsertResolver) {
        if (!resolvers.Mutation) {
          resolvers.Mutation = {}
        }
        resolvers.Mutation[`upsert${info.typeName}`] = upsertResolver as ResolverFn
      }
    }

    // Build SOFT_DELETE mutation resolver if enabled
    if (isOperationEnabled('softDelete', info.operationConfig)) {
      const softDeleteResolver = buildSoftDeleteResolver({
        container: info.container,
        typeName: info.typeName,
        operationConfig: info.operationConfig,
        retry,
      })

      if (softDeleteResolver) {
        if (!resolvers.Mutation) {
          resolvers.Mutation = {}
        }
        resolvers.Mutation[`softDelete${info.typeName}`] = softDeleteResolver as ResolverFn
      }
    }

    // Build RESTORE mutation resolver if enabled
    if (isOperationEnabled('restore', info.operationConfig)) {
      const restoreResolver = buildRestoreResolver({
        container: info.container,
        typeName: info.typeName,
        operationConfig: info.operationConfig,
        retry,
      })

      if (restoreResolver) {
        if (!resolvers.Mutation) {
          resolvers.Mutation = {}
        }
        resolvers.Mutation[`restore${info.typeName}`] = restoreResolver as ResolverFn
      }
    }

    // Build CREATE_MANY mutation resolver if enabled
    if (isOperationEnabled('createMany', info.operationConfig)) {
      const inputTypesResult = generateInputTypes({
        schema: info.schema,
        rootInputTypeName: `Create${info.typeName}Input`,
      })

      const createManyResolver = buildCreateManyResolver({
        container: info.container,
        typeName: info.typeName,
        partitionKeyPath: info.partitionKeyPath,
        operationConfig: info.operationConfig,
        inputTypeDef: inputTypesResult.rootInputType,
        retry,
      })

      if (createManyResolver) {
        if (!resolvers.Mutation) {
          resolvers.Mutation = {}
        }
        resolvers.Mutation[`createMany${info.typeName}s`] = createManyResolver as ResolverFn
      }
    }

    // Build UPDATE_MANY mutation resolver if enabled
    if (isOperationEnabled('updateMany', info.operationConfig)) {
      const updateManyResolver = buildUpdateManyResolver({
        container: info.container,
        typeName: info.typeName,
        partitionKeyPath: info.partitionKeyPath,
        operationConfig: info.operationConfig,
        retry,
      })

      if (updateManyResolver) {
        if (!resolvers.Mutation) {
          resolvers.Mutation = {}
        }
        resolvers.Mutation[`updateMany${info.typeName}s`] = updateManyResolver as ResolverFn
      }
    }

    // Build DELETE_MANY mutation resolver if enabled
    if (isOperationEnabled('deleteMany', info.operationConfig)) {
      const deleteManyResolver = buildDeleteManyResolver({
        container: info.container,
        typeName: info.typeName,
        operationConfig: info.operationConfig,
        retry,
      })

      if (deleteManyResolver) {
        if (!resolvers.Mutation) {
          resolvers.Mutation = {}
        }
        resolvers.Mutation[`deleteMany${info.typeName}s`] = deleteManyResolver as ResolverFn
      }
    }

    // Build INCREMENT mutation resolver if enabled
    if (isOperationEnabled('increment', info.operationConfig)) {
      const incrementResolver = buildIncrementResolver({
        container: info.container,
        typeName: info.typeName,
        operationConfig: info.operationConfig,
        retry,
      })

      if (incrementResolver) {
        if (!resolvers.Mutation) {
          resolvers.Mutation = {}
        }
        resolvers.Mutation[`increment${info.typeName}`] = incrementResolver as ResolverFn
      }
    }

    // Build DECREMENT mutation resolver if enabled
    if (isOperationEnabled('decrement', info.operationConfig)) {
      const decrementResolver = buildDecrementResolver({
        container: info.container,
        typeName: info.typeName,
        operationConfig: info.operationConfig,
        retry,
      })

      if (decrementResolver) {
        if (!resolvers.Mutation) {
          resolvers.Mutation = {}
        }
        resolvers.Mutation[`decrement${info.typeName}`] = decrementResolver as ResolverFn
      }
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

      // Get partition key path from container metadata
      const metadata = await containerRef.read()
      const partitionKeyPath = metadata.resource?.partitionKey?.paths[0] || '/id'

      return {
        container: containerRef,
        typeName,
        schema: inferredSchema,
        partitionKeyPath,
        operationConfig: containerConfig.operations,
        requirePartitionKeyOnQueries: containerConfig.requirePartitionKeyOnQueries,
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

  // Build unified resolvers (now async for CREATE support)
  const resolvers = await buildMultiContainerResolvers({
    containerInfos,
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
