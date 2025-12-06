/**
 * Scenario generators for schema accuracy testing.
 *
 * Each generator produces deterministic test data for validating
 * cosmiq-graphql's schema inference capabilities.
 */

export { generateFlat } from './flat.ts'
export { generateNested } from './nested.ts'
export { generatePolymorphic } from './polymorphic.ts'
export { generateSparse } from './sparse.ts'
export { generatePartitions } from './partitions.ts'
