/**
 * Generic SDL Adapter
 * Generates standalone GraphQL SDL from CosmosDB without framework dependencies
 * @module
 */

import { CosmosClient } from '@azure/cosmos'
import type { GenericSDLConfig, GenericSDLResult } from './types.ts'
import { parseConnectionString } from '../handler/connection-parser.ts'
import { sampleDocuments } from '../handler/document-sampler.ts'
import { inferSchema } from '../infer/infer-schema.ts'
import { buildGraphQLSDL } from '../infer/sdl-generator.ts'
import { ConfigurationError, createErrorContext } from '../errors/mod.ts'
import { validateRequiredString } from '../utils/validation.ts'

/**
 * Generate GraphQL SDL from CosmosDB container
 *
 * This function samples documents from a CosmosDB container, infers the GraphQL schema,
 * and generates the SDL (Schema Definition Language). Optionally writes the SDL to a file.
 *
 * The generated SDL can be used with any GraphQL framework or for documentation purposes.
 *
 * @param config - Configuration for CosmosDB connection and SDL generation
 * @returns Promise resolving to SDL string and generation statistics
 *
 * @example Basic usage
 * ```ts
 * import { generateSDL } from '@albedosehen/cosmosdb-schemagen/generic'
 *
 * const result = await generateSDL({
 *   connectionString: Deno.env.get('COSMOS_CONN')!,
 *   database: 'myDatabase',
 *   container: 'myContainer',
 * })
 *
 * console.log(result.sdl)
 * console.log(`Analyzed ${result.stats.documentsAnalyzed} documents`)
 * ```
 *
 * @example With file output
 * ```ts
 * const result = await generateSDL({
 *   connectionString: Deno.env.get('COSMOS_CONN')!,
 *   database: 'myDatabase',
 *   container: 'myContainer',
 *   outputPath: './schema.graphql',
 * })
 *
 * console.log(`Schema written to: ${result.filePath}`)
 * ```
 *
 * @example Using endpoint authentication
 * ```ts
 * import { DefaultAzureCredential } from '@azure/identity'
 *
 * const result = await generateSDL({
 *   endpoint: 'https://my-cosmos.documents.azure.com:443/',
 *   credential: new DefaultAzureCredential(),
 *   database: 'myDatabase',
 *   container: 'myContainer',
 * })
 * ```
 */
export async function generateSDL(config: GenericSDLConfig): Promise<GenericSDLResult> {
  // Validate configuration
  const database = validateRequiredString(config.database, 'database', 'generateSDL')
  const container = validateRequiredString(config.container, 'container', 'generateSDL')

  // Create CosmosDB client based on authentication method
  let client: CosmosClient

  if (config.connectionString) {
    // Use connection string authentication
    const connection = parseConnectionString(config.connectionString)
    client = new CosmosClient({
      endpoint: connection.endpoint,
      key: connection.key,
    })
  } else if (config.endpoint && config.credential) {
    // Use managed identity authentication
    client = new CosmosClient({
      endpoint: config.endpoint,
      aadCredentials: config.credential as {
        getToken: (scopes: string | string[]) => Promise<{ token: string; expiresOnTimestamp: number }>
      },
    })
  } else if (config.endpoint) {
    throw new ConfigurationError(
      'When using endpoint authentication, credential must be provided',
      createErrorContext({
        component: 'generateSDL',
        metadata: {
          providedConfig: {
            endpoint: '[redacted]',
            hasCredential: false,
            database,
            container,
            sampleSize: config.sampleSize || 500,
          },
        },
      }),
    )
  } else {
    throw new ConfigurationError(
      'Either connectionString or endpoint+credential must be provided',
      createErrorContext({
        component: 'generateSDL',
        metadata: {
          providedConfig: {
            hasConnectionString: false,
            hasEndpoint: false,
            hasCredential: false,
            database,
            container,
            sampleSize: config.sampleSize || 500,
          },
        },
      }),
    )
  }

  try {
    const containerRef = client.database(database).container(container)

    // Sample documents from container
    const { documents } = await sampleDocuments({
      container: containerRef,
      sampleSize: config.sampleSize || 500,
      retry: config.retry,
    })

    // Infer schema from sampled documents
    const typeName = config.typeName || container
    const schema = inferSchema({
      documents,
      typeName,
      config: config.typeSystem,
    })

    // Generate GraphQL SDL
    const sdl = buildGraphQLSDL({
      schema,
      includeQueries: true,
    })

    // Write to file if outputPath provided
    let filePath: string | undefined
    if (config.outputPath) {
      await Deno.writeTextFile(config.outputPath, sdl)
      filePath = config.outputPath
    }

    return {
      sdl,
      filePath,
      stats: {
        documentsAnalyzed: schema.stats.totalDocuments,
        typesGenerated: schema.stats.typesGenerated,
      },
    }
  } finally {
    // Safe to dispose client - no resolvers need it
    client.dispose()
  }
}
