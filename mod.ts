/**
 * Main CosmosDB Schemagen module.
 */

export * from './src/utils/mod.ts'

export * from './src/types/mod.ts'

export * from './src/errors/mod.ts'

export * from './src/infer/mod.ts'

export * from './src/handler/mod.ts'

export { generateSDL } from './src/adapters/generic.ts'
export { loadCosmosDBSubgraph } from './src/adapters/mesh.ts'
export { buildCoreSchema } from './src/adapters/core.ts'
export type { GenericSDLConfig, GenericSDLResult } from './src/adapters/types.ts'
export type { CoreSchemaResult } from './src/adapters/core.ts'
