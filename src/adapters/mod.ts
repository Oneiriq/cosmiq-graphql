/**
 * Adapters Module
 * Framework-specific adapters for CosmosDB schema generation
 * @module
 */

export { generateSDL } from './generic.ts'
export { buildCoreSchema } from './core.ts'
export { loadCosmosDBSubgraph } from './mesh.ts'
export type { GenericSDLConfig, GenericSDLResult } from './types.ts'
export type { CoreSchemaResult } from './core.ts'
