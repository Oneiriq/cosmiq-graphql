/**
 * CosmosDB Types Module
 * Generic type definitions for CosmosDB schema inference and document handling.
 * These types support the inference engine that analyzes sampled documents
 * to generate GraphQL schemas dynamically.
 * @module
 */

/**
 * JSON value types supported in CosmosDB documents
 * Includes undefined to support optional fields
 */
export type JSONValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | JSONValue[]
  | { [key: string]: JSONValue }

/**
 * Primitive type identifiers used during type inference
 */
export type PrimitiveType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'object'
  | 'array'

/**
 * CosmosDB document base structure
 * All documents extend this with their specific fields
 */
export type CosmosDBDocument = {
  /** Unique document identifier (required by CosmosDB) */
  id: string
  /** Partition key for data distribution */
  _partitionKey?: string
  /** System timestamp */
  _ts?: number
  /** Entity tag for optimistic concurrency */
  _etag?: string
  /** Self link */
  _self?: string
  /** Resource ID */
  _rid?: string
  /** Attachments link */
  _attachments?: string
  /** Allow additional fields */
  [key: string]: JSONValue
}

/**
 * Query result wrapper for CosmosDB responses
 */
export type QueryResult<T> = {
  /** Array of documents returned */
  resources: T[]
  /** Continuation token for pagination */
  continuationToken?: string
  /** Request charge in RUs */
  requestCharge?: number
}
