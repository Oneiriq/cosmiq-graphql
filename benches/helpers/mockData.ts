/**
 * Mock Data Generator for Benchmarks
 * Generates realistic CosmosDB documents for performance testing
 * @module
 */

import type { CosmosDBDocument } from '../../src/types/cosmosdb.ts'

/**
 * Options for generating mock documents
 */
export type MockDataOptions = {
  /** Number of documents to generate */
  count: number
  /** Complexity level: simple (few fields), medium (nested), complex (deeply nested) */
  complexity?: 'simple' | 'medium' | 'complex'
  /** Number of different schemas/variants to generate */
  variants?: number
  /** Number of unique partition keys */
  partitionKeys?: number
}

/**
 * Generate mock CosmosDB documents for benchmarking
 *
 * Creates realistic documents with varying structures, nested objects,
 * and data types to simulate real-world CosmosDB collections.
 *
 * @param options - Configuration for document generation
 * @returns Array of mock CosmosDB documents
 *
 * @example
 * ```ts
 * const docs = generateMockDocuments({ count: 100, complexity: 'medium' })
 * ```
 */
export function generateMockDocuments(options: MockDataOptions): CosmosDBDocument[] {
  const {
    count,
    complexity = 'medium',
    variants = 1,
    partitionKeys = 5,
  } = options

  const documents: CosmosDBDocument[] = []
  const partitionKeyValues = Array.from({ length: partitionKeys }, (_, i) => `partition-${i}`)

  for (let i = 0; i < count; i++) {
    const variantIndex = i % variants
    const partitionKey = partitionKeyValues[i % partitionKeys]

    documents.push(createDocumentByComplexity(i, complexity, variantIndex, partitionKey))
  }

  return documents
}

/**
 * Create a document based on complexity level
 */
function createDocumentByComplexity(
  index: number,
  complexity: 'simple' | 'medium' | 'complex',
  variant: number,
  partitionKey: string,
): CosmosDBDocument {
  switch (complexity) {
    case 'simple':
      return createSimpleDocument(index, variant, partitionKey)
    case 'medium':
      return createMediumDocument(index, variant, partitionKey)
    case 'complex':
      return createComplexDocument(index, variant, partitionKey)
    default:
      return createMediumDocument(index, variant, partitionKey)
  }
}

/**
 * Create a simple document (5-8 flat fields)
 */
function createSimpleDocument(index: number, variant: number, partitionKey: string): CosmosDBDocument {
  const baseDoc: CosmosDBDocument = {
    id: `doc-${index}`,
    partition: partitionKey,
    _ts: Date.now() - index * 1000,
    name: `Item ${index}`,
    status: index % 2 === 0 ? 'active' : 'inactive',
    count: index,
    score: Math.random() * 100,
  }

  if (variant === 0) {
    return {
      ...baseDoc,
      category: index % 3 === 0 ? 'A' : index % 3 === 1 ? 'B' : 'C',
    }
  }

  return baseDoc
}

/**
 * Create a medium complexity document (nested objects, arrays)
 */
function createMediumDocument(index: number, variant: number, partitionKey: string): CosmosDBDocument {
  const doc: CosmosDBDocument = {
    id: `doc-${index}`,
    partition: partitionKey,
    _ts: Date.now() - index * 1000,
    name: `Item ${index}`,
    metadata: {
      created: new Date(Date.now() - index * 86400000).toISOString(),
      updated: new Date().toISOString(),
      version: `1.${index % 10}.0`,
    },
    tags: Array.from({ length: 3 }, (_, i) => `tag-${i}-${index % 5}`),
    stats: {
      views: Math.floor(Math.random() * 10000),
      likes: Math.floor(Math.random() * 1000),
      shares: Math.floor(Math.random() * 100),
    },
  }

  if (variant === 1) {
    return {
      ...doc,
      category: {
        primary: index % 3 === 0 ? 'A' : 'B',
        secondary: `sub-${index % 5}`,
      },
    }
  }

  return doc
}

/**
 * Create a complex document (deeply nested, arrays of objects)
 */
function createComplexDocument(index: number, variant: number, partitionKey: string): CosmosDBDocument {
  const doc: CosmosDBDocument = {
    id: `doc-${index}`,
    partition: partitionKey,
    _ts: Date.now() - index * 1000,
    name: `Item ${index}`,
    metadata: {
      created: new Date(Date.now() - index * 86400000).toISOString(),
      updated: new Date().toISOString(),
      version: `1.${index % 10}.0`,
      author: {
        id: `user-${index % 100}`,
        name: `User ${index % 100}`,
        email: `user${index % 100}@example.com`,
      },
    },
    content: {
      title: `Title ${index}`,
      body: `Body content for document ${index}`.repeat(10),
      sections: Array.from({ length: 3 }, (_, i) => ({
        id: `section-${i}`,
        title: `Section ${i}`,
        order: i,
        paragraphs: Array.from({ length: 2 }, (_, j) => ({
          id: `para-${i}-${j}`,
          text: `Paragraph ${j} in section ${i}`,
        })),
      })),
    },
    tags: Array.from({ length: 5 }, (_, i) => `tag-${i}-${index % 10}`),
    stats: {
      views: Math.floor(Math.random() * 10000),
      likes: Math.floor(Math.random() * 1000),
      shares: Math.floor(Math.random() * 100),
      engagement: {
        comments: Math.floor(Math.random() * 50),
        rate: Math.random(),
      },
    },
    permissions: {
      public: index % 2 === 0,
      groups: Array.from({ length: 2 }, (_, i) => `group-${i}`),
      users: Array.from({ length: 3 }, (_, i) => `user-${i + index % 10}`),
    },
  }

  if (variant === 1) {
    return {
      ...doc,
      relatedItems: Array.from({ length: 3 }, (_, i) => ({
        id: `related-${i}`,
        type: i % 2 === 0 ? 'reference' : 'citation',
        metadata: {
          score: Math.random(),
          timestamp: Date.now(),
        },
      })),
    }
  }

  if (variant === 2) {
    return {
      ...doc,
      analytics: {
        daily: Array.from({ length: 7 }, (_, i) => ({
          date: new Date(Date.now() - i * 86400000).toISOString().split('T')[0],
          views: Math.floor(Math.random() * 1000),
          engagement: Math.random(),
        })),
        summary: {
          total: Math.floor(Math.random() * 50000),
          average: Math.random() * 100,
        },
      },
    }
  }

  return doc
}

/**
 * Generate documents with memory tracking
 *
 * Creates documents in batches and returns memory usage info
 */
export function generateWithMemoryTracking(count: number): {
  documents: CosmosDBDocument[]
  memoryUsed: number
} {
  const before = (Deno.memoryUsage?.().heapUsed ?? 0) / 1024 / 1024

  const documents = generateMockDocuments({
    count,
    complexity: 'medium',
    variants: 3,
  })

  const after = (Deno.memoryUsage?.().heapUsed ?? 0) / 1024 / 1024
  const memoryUsed = after - before

  return { documents, memoryUsed }
}