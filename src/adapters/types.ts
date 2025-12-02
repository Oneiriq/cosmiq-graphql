/**
 * Adapter Type Definitions
 * Type definitions for framework-specific adapters
 * @module
 */

import type { CosmosDBSubgraphConfig } from '../types/handler.ts'

/**
 * Configuration for generic SDL generation
 */
export type GenericSDLConfig = CosmosDBSubgraphConfig & {
  /** Optional output file path for the generated SDL */
  outputPath?: string
  /** Whether to format the SDL output (default: false) */
  format?: boolean
}

/**
 * Result of SDL generation
 */
export type GenericSDLResult = {
  /** Generated GraphQL SDL string */
  sdl: string
  /** File path where SDL was written (if outputPath was provided) */
  filePath?: string
  /** Statistics about the schema generation */
  stats: {
    /** Number of documents analyzed from CosmosDB */
    documentsAnalyzed: number
    /** Number of GraphQL types generated */
    typesGenerated: number
  }
}
