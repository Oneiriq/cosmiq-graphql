/**
 * Generic SDL Adapter
 * Generates standalone GraphQL SDL from CosmosDB without framework dependencies
 * @module
 */

import type { GenericSDLConfig, GenericSDLResult } from './types.ts'
import { validateRequiredString } from '../utils/validation.ts'

/**
 * Generate GraphQL SDL from CosmosDB containers
 *
 * This function samples documents from CosmosDB containers, infers the GraphQL schema,
 * and generates the SDL (Schema Definition Language). Optionally writes the SDL to a file.
 *
 * The generated SDL can be used with any GraphQL framework or for documentation purposes.
 *
 * @param config - Configuration for CosmosDB connection and SDL generation
 * @returns Promise resolving to SDL string and generation statistics
 *
 * @example Single container
 * ```ts
 * import { generateSDL } from '@albedosehen/cosmosdb-schemagen/generic'
 *
 * const result = await generateSDL({
 *   connectionString: Deno.env.get('COSMOS_CONN')!,
 *   database: 'myDatabase',
 *   containers: [{ name: 'myContainer', typeName: 'MyItem' }]
 * })
 *
 * console.log(result.sdl)
 * console.log(`Analyzed ${result.stats.documentsAnalyzed} documents`)
 * ```
 *
 * @example Multiple containers (unified schema)
 * ```ts
 * import { generateSDL } from '@albedosehen/cosmosdb-schemagen/generic'
 *
 * const result = await generateSDL({
 *   connectionString: Deno.env.get('COSMOS_CONN')!,
 *   database: 'db1',
 *   containers: [
 *     { name: 'users', typeName: 'User' },
 *     { name: 'listings', typeName: 'Listing' },
 *     { name: 'files', typeName: 'File' }
 *   ],
 *   outputPath: './unified-schema.graphql',
 * })
 *
 * console.log(`Unified schema written to: ${result.filePath}`)
 * console.log(`Analyzed ${result.stats.documentsAnalyzed} documents across containers`)
 * ```
 *
 * @example With file output
 * ```ts
 * const result = await generateSDL({
 *   connectionString: Deno.env.get('COSMOS_CONN')!,
 *   database: 'myDatabase',
 *   containers: [{ name: 'myContainer', typeName: 'MyItem' }],
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
 *   containers: [{ name: 'myContainer', typeName: 'MyItem' }]
 * })
 * ```
 */
export async function generateSDL(config: GenericSDLConfig): Promise<GenericSDLResult> {
  // Validate configuration
  validateRequiredString(config.database, 'database', 'generateSDL')

  // Import needed for inline usage
  const { buildCoreSchema } = await import('./core.ts')
  const core = await buildCoreSchema(config)

  try {
    // Write to file if outputPath provided
    let filePath: string | undefined
    if (config.outputPath) {
      await Deno.writeTextFile(config.outputPath, core.sdl)
      filePath = config.outputPath
    }

    return {
      sdl: core.sdl,
      filePath,
      stats: {
        documentsAnalyzed: core.stats.documentsAnalyzed,
        typesGenerated: core.stats.typesGenerated,
      },
    }
  } finally {
    // Safe to dispose client - no resolvers need it
    core.client.dispose()
  }
}
