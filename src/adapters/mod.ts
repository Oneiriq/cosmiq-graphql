/**
 * Adapters Module
 * Framework-specific adapters for CosmosDB schema generation
 * @module
 */

export { generateSDL } from './generic.ts'
export { buildCoreSchema } from './core.ts'
export { disposeAllClients, getActiveClientCount, loadCosmosDBSubgraph } from './mesh.ts'
export { createApolloAdapter } from './apollo.ts'
export { createYogaAdapter } from './yoga.ts'
export { uploadToHive } from './hive.ts'

export type { GenericSDLConfig, GenericSDLResult } from './types.ts'
export type { CoreSchemaResult } from './core.ts'
export type { MeshSubgraphHandler } from './mesh.ts'
export type { MeshSubgraphOptions } from '../types/handler.ts'
export type { ApolloAdapterConfig, ApolloAdapterResult, ApolloContext } from './apollo.ts'
export type { YogaAdapterConfig, YogaAdapterResult, YogaContext } from './yoga.ts'
export type { HiveAdapterConfig, HiveAdapterResult } from './hive.ts'
