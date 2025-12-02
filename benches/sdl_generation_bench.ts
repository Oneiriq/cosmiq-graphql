/**
 * SDL Generation Performance Benchmarks
 * Measures GraphQL SDL generation speed for various schema sizes
 * @module
 */

import { inferSchema } from '../src/infer/infer-schema.ts'
import { buildGraphQLSDL } from '../src/infer/sdl-generator.ts'
import { generateMockDocuments } from './helpers/mockData.ts'

// Benchmark: SDL generation - small schema (5 fields)
Deno.bench('sdl generation - small schema (5 fields)', () => {
  const docs = generateMockDocuments({ count: 100, complexity: 'simple' })
  const schema = inferSchema({ documents: docs, typeName: 'TestType' })
  buildGraphQLSDL({ schema })
})

// Benchmark: SDL generation - medium schema (15 fields, nested)
Deno.bench('sdl generation - medium schema (15 fields)', () => {
  const docs = generateMockDocuments({ count: 100, complexity: 'medium' })
  const schema = inferSchema({ documents: docs, typeName: 'TestType' })
  buildGraphQLSDL({ schema })
})

// Benchmark: SDL generation - large schema (50+ fields, deeply nested)
Deno.bench('sdl generation - large schema (50+ fields)', () => {
  const docs = generateMockDocuments({ count: 100, complexity: 'complex' })
  const schema = inferSchema({ documents: docs, typeName: 'TestType' })
  buildGraphQLSDL({ schema })
})

// Benchmark: SDL generation - many nested types
Deno.bench('sdl generation - many nested types', () => {
  const docs = generateMockDocuments({
    count: 200,
    complexity: 'complex',
    variants: 5,
  })
  const schema = inferSchema({ documents: docs, typeName: 'TestType' })
  buildGraphQLSDL({ schema })
})

// Benchmark: SDL generation with queries
Deno.bench('sdl generation - with query type', () => {
  const docs = generateMockDocuments({ count: 100, complexity: 'medium' })
  const schema = inferSchema({ documents: docs, typeName: 'TestType' })
  buildGraphQLSDL({ schema, includeQueries: true })
})

// Benchmark: SDL generation without queries
Deno.bench('sdl generation - without query type', () => {
  const docs = generateMockDocuments({ count: 100, complexity: 'medium' })
  const schema = inferSchema({ documents: docs, typeName: 'TestType' })
  buildGraphQLSDL({ schema, includeQueries: false })
})

// Benchmark: SDL generation - wide schema (many top-level fields)
Deno.bench('sdl generation - wide schema (100+ fields)', () => {
  const docs = Array.from({ length: 100 }, (_, i) => {
    const doc: Record<string, unknown> = {
      id: `doc-${i}`,
      partition: `p-${i % 10}`,
    }
    for (let j = 0; j < 100; j++) {
      doc[`field_${j}`] = `value_${j}_${i}`
    }
    return doc
  })
  const schema = inferSchema({ documents: docs as unknown as import('../src/types/cosmosdb.ts').CosmosDBDocument[], typeName: 'TestType' })
  buildGraphQLSDL({ schema })
})

// Benchmark: SDL generation - deep nesting (5 levels)
Deno.bench('sdl generation - deep nesting', () => {
  const docs = Array.from({ length: 100 }, (_, i) => ({
    id: `doc-${i}`,
    partition: `p-${i % 10}`,
    level1: {
      id: `l1-${i}`,
      level2: {
        id: `l2-${i}`,
        level3: {
          id: `l3-${i}`,
          level4: {
            id: `l4-${i}`,
            level5: {
              id: `l5-${i}`,
              value: Math.random(),
            },
          },
        },
      },
    },
  }))
  const schema = inferSchema({ documents: docs, typeName: 'TestType' })
  buildGraphQLSDL({ schema })
})

// Benchmark: SDL generation - arrays of objects
Deno.bench('sdl generation - arrays of objects', () => {
  const docs = Array.from({ length: 100 }, (_, i) => ({
    id: `doc-${i}`,
    partition: `p-${i % 10}`,
    items: Array.from({ length: 10 }, (_, j) => ({
      id: j,
      name: `item-${j}`,
      metadata: {
        created: new Date().toISOString(),
        score: Math.random() * 100,
      },
    })),
  }))
  const schema = inferSchema({ documents: docs, typeName: 'TestType' })
  buildGraphQLSDL({ schema })
})

// Benchmark: SDL generation - mixed scalar types
Deno.bench('sdl generation - mixed scalar types', () => {
  const docs = Array.from({ length: 100 }, (_, i) => ({
    id: `doc-${i}`,
    partition: `p-${i % 10}`,
    stringField: `value-${i}`,
    intField: i,
    floatField: i * 1.5,
    boolField: i % 2 === 0,
    dateField: new Date().toISOString(),
    nullableField: i % 3 === 0 ? null : `value-${i}`,
  }))
  const schema = inferSchema({ documents: docs, typeName: 'TestType' })
  buildGraphQLSDL({ schema })
})

// Benchmark: SDL generation - schema variants impact
Deno.bench('sdl generation - 3 schema variants', () => {
  const docs = generateMockDocuments({
    count: 300,
    complexity: 'medium',
    variants: 3,
  })
  const schema = inferSchema({ documents: docs, typeName: 'TestType' })
  buildGraphQLSDL({ schema })
})

// Benchmark: SDL generation - 10 schema variants
Deno.bench('sdl generation - 10 schema variants', () => {
  const docs = generateMockDocuments({
    count: 500,
    complexity: 'medium',
    variants: 10,
  })
  const schema = inferSchema({ documents: docs, typeName: 'TestType' })
  buildGraphQLSDL({ schema })
})

// Benchmark: Complete pipeline - inference + SDL (100 docs)
Deno.bench('complete pipeline - 100 docs (simple)', () => {
  const docs = generateMockDocuments({ count: 100, complexity: 'simple' })
  const schema = inferSchema({ documents: docs, typeName: 'TestType' })
  buildGraphQLSDL({ schema, includeQueries: true })
})

// Benchmark: Complete pipeline - inference + SDL (500 docs)
Deno.bench('complete pipeline - 500 docs (medium)', () => {
  const docs = generateMockDocuments({ count: 500, complexity: 'medium' })
  const schema = inferSchema({ documents: docs, typeName: 'TestType' })
  buildGraphQLSDL({ schema, includeQueries: true })
})

// Benchmark: Complete pipeline - inference + SDL (1000 docs)
Deno.bench('complete pipeline - 1000 docs (complex)', () => {
  const docs = generateMockDocuments({ count: 1000, complexity: 'complex' })
  const schema = inferSchema({ documents: docs, typeName: 'TestType' })
  buildGraphQLSDL({ schema, includeQueries: true })
})

// Benchmark: SDL string length impact - measure actual SDL output size
Deno.bench('sdl generation - output size measurement', () => {
  const docs = generateMockDocuments({ count: 500, complexity: 'complex' })
  const schema = inferSchema({ documents: docs, typeName: 'TestType' })
  const sdl = buildGraphQLSDL({ schema, includeQueries: true })
  const lineCount = sdl.split('\n').length
  const charCount = sdl.length
  // Simulate some processing of the SDL string
  void lineCount
  void charCount
})

// Benchmark: Type name generation overhead
Deno.bench('sdl generation - complex type naming', () => {
  const docs = Array.from({ length: 100 }, (_, i) => ({
    id: `doc-${i}`,
    partition: `p-${i % 10}`,
    deeply: {
      nested: {
        structure: {
          with: {
            many: {
              levels: {
                of: {
                  nesting: {
                    value: Math.random(),
                  },
                },
              },
            },
          },
        },
      },
    },
  }))
  const schema = inferSchema({ documents: docs, typeName: 'TestType' })
  buildGraphQLSDL({ schema })
})

// Benchmark: Minimal overhead baseline
Deno.bench('sdl generation - baseline (single field)', () => {
  const docs = [{ id: '1', partition: 'test' }]
  const schema = inferSchema({ documents: docs, typeName: 'TestType' })
  buildGraphQLSDL({ schema })
})