/**
 * Schema Inference Performance Benchmarks
 * Measures inference performance at various sample sizes and complexities
 * @module
 */

import { inferSchema } from '../src/infer/infer-schema.ts'
import { generateMockDocuments, generateWithMemoryTracking } from './helpers/mockData.ts'

// Benchmark: Inference with 100 documents (simple)
Deno.bench('infer schema - 100 docs (simple)', () => {
  const docs = generateMockDocuments({ count: 100, complexity: 'simple' })
  inferSchema({ documents: docs, typeName: 'TestType' })
})

// Benchmark: Inference with 100 documents (medium)
Deno.bench('infer schema - 100 docs (medium)', () => {
  const docs = generateMockDocuments({ count: 100, complexity: 'medium' })
  inferSchema({ documents: docs, typeName: 'TestType' })
})

// Benchmark: Inference with 100 documents (complex)
Deno.bench('infer schema - 100 docs (complex)', () => {
  const docs = generateMockDocuments({ count: 100, complexity: 'complex' })
  inferSchema({ documents: docs, typeName: 'TestType' })
})

// Benchmark: Inference with 500 documents (simple)
Deno.bench('infer schema - 500 docs (simple)', () => {
  const docs = generateMockDocuments({ count: 500, complexity: 'simple' })
  inferSchema({ documents: docs, typeName: 'TestType' })
})

// Benchmark: Inference with 500 documents (medium)
Deno.bench('infer schema - 500 docs (medium)', () => {
  const docs = generateMockDocuments({ count: 500, complexity: 'medium' })
  inferSchema({ documents: docs, typeName: 'TestType' })
})

// Benchmark: Inference with 500 documents (complex)
Deno.bench('infer schema - 500 docs (complex)', () => {
  const docs = generateMockDocuments({ count: 500, complexity: 'complex' })
  inferSchema({ documents: docs, typeName: 'TestType' })
})

// Benchmark: Inference with 1000 documents (simple)
Deno.bench('infer schema - 1000 docs (simple)', () => {
  const docs = generateMockDocuments({ count: 1000, complexity: 'simple' })
  inferSchema({ documents: docs, typeName: 'TestType' })
})

// Benchmark: Inference with 1000 documents (medium)
Deno.bench('infer schema - 1000 docs (medium)', () => {
  const docs = generateMockDocuments({ count: 1000, complexity: 'medium' })
  inferSchema({ documents: docs, typeName: 'TestType' })
})

// Benchmark: Inference with 1000 documents (complex)
Deno.bench('infer schema - 1000 docs (complex)', () => {
  const docs = generateMockDocuments({ count: 1000, complexity: 'complex' })
  inferSchema({ documents: docs, typeName: 'TestType' })
})

// Benchmark: Inference with 5000 documents (simple)
Deno.bench('infer schema - 5000 docs (simple)', () => {
  const docs = generateMockDocuments({ count: 5000, complexity: 'simple' })
  inferSchema({ documents: docs, typeName: 'TestType' })
})

// Benchmark: Inference with 5000 documents (medium)
Deno.bench('infer schema - 5000 docs (medium)', () => {
  const docs = generateMockDocuments({ count: 5000, complexity: 'medium' })
  inferSchema({ documents: docs, typeName: 'TestType' })
})

// Benchmark: Type conflict resolution - high conflict scenario
Deno.bench('infer schema - type conflicts (widen strategy)', () => {
  const docs = generateMockDocuments({
    count: 500,
    complexity: 'medium',
    variants: 10,
  })
  inferSchema({
    documents: docs,
    typeName: 'TestType',
    config: {
      conflictResolution: 'widen',
    },
  })
})

// Benchmark: Type conflict resolution - union strategy
Deno.bench('infer schema - type conflicts (union strategy)', () => {
  const docs = generateMockDocuments({
    count: 500,
    complexity: 'medium',
    variants: 10,
  })
  inferSchema({
    documents: docs,
    typeName: 'TestType',
    config: {
      conflictResolution: 'union',
    },
  })
})

// Benchmark: Nested type inference overhead
Deno.bench('infer schema - deeply nested types', () => {
  const docs = generateMockDocuments({
    count: 500,
    complexity: 'complex',
    variants: 3,
  })
  inferSchema({ documents: docs, typeName: 'TestType' })
})

// Benchmark: Required threshold impact - strict
Deno.bench('infer schema - strict required threshold (0.95)', () => {
  const docs = generateMockDocuments({ count: 500, complexity: 'medium' })
  inferSchema({
    documents: docs,
    typeName: 'TestType',
    config: {
      requiredThreshold: 0.95,
    },
  })
})

// Benchmark: Required threshold impact - relaxed
Deno.bench('infer schema - relaxed required threshold (0.5)', () => {
  const docs = generateMockDocuments({ count: 500, complexity: 'medium' })
  inferSchema({
    documents: docs,
    typeName: 'TestType',
    config: {
      requiredThreshold: 0.5,
    },
  })
})

// Memory Usage Benchmark
Deno.bench('infer schema - memory usage (1000 docs)', () => {
  const { documents } = generateWithMemoryTracking(1000)
  inferSchema({ documents, typeName: 'TestType' })
})

// Baseline: Empty inference overhead
Deno.bench('infer schema - baseline (minimal doc)', () => {
  const docs = [{ id: '1', partition: 'test' }]
  inferSchema({ documents: docs, typeName: 'TestType' })
})

// Benchmark: Large field count
Deno.bench('infer schema - many fields (100+ fields)', () => {
  const docs = Array.from({ length: 500 }, (_, i) => {
    const doc: Record<string, unknown> = {
      id: `doc-${i}`,
      partition: `p-${i % 10}`,
    }
    for (let j = 0; j < 100; j++) {
      doc[`field_${j}`] = `value_${j}_${i}`
    }
    return doc
  })
  inferSchema({ documents: docs as unknown as import('../src/types/cosmosdb.ts').CosmosDBDocument[], typeName: 'TestType' })
})

// Benchmark: Array field inference
Deno.bench('infer schema - array fields', () => {
  const docs = Array.from({ length: 500 }, (_, i) => ({
    id: `doc-${i}`,
    partition: `p-${i % 10}`,
    tags: Array.from({ length: 10 }, (_, j) => `tag-${j}`),
    scores: Array.from({ length: 20 }, (_, j) => j * Math.random()),
    items: Array.from({ length: 5 }, (_, j) => ({
      id: j,
      name: `item-${j}`,
      value: Math.random() * 100,
    })),
  }))
  inferSchema({ documents: docs, typeName: 'TestType' })
})