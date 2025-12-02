/**
 * Document Sampling Performance Benchmarks
 * Measures sampling algorithm performance without actual CosmosDB queries
 * @module
 */

import { generateMockDocuments } from './helpers/mockData.ts'

/**
 * Mock implementation of shuffle algorithm for benchmarking
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * Mock implementation of schema signature creation
 */
function createSchemaSignature(doc: Record<string, unknown>): string {
  const keys = Object.keys(doc).filter((key) => !key.startsWith('_')).sort()
  return keys.join('|')
}

/**
 * Mock partition-aware sampling algorithm
 */
function mockPartitionSampling({
  documents,
  sampleSize,
  partitionKeyField,
}: {
  documents: Record<string, unknown>[]
  sampleSize: number
  partitionKeyField: string
}): Record<string, unknown>[] {
  const partitionMap = new Map<string, Record<string, unknown>[]>()

  for (const doc of documents) {
    const key = String(doc[partitionKeyField] ?? 'default')
    if (!partitionMap.has(key)) {
      partitionMap.set(key, [])
    }
    partitionMap.get(key)!.push(doc)
  }

  const partitionKeys = Array.from(partitionMap.keys())
  const samplesPerPartition = Math.max(1, Math.floor(sampleSize / partitionKeys.length))

  const sampled: Record<string, unknown>[] = []
  for (const key of partitionKeys) {
    const partitionDocs = partitionMap.get(key)!
    sampled.push(...partitionDocs.slice(0, samplesPerPartition))
    if (sampled.length >= sampleSize) break
  }

  return sampled.slice(0, sampleSize)
}

/**
 * Mock schema-aware sampling algorithm
 */
function mockSchemaSampling({
  documents,
  sampleSize,
  minVariants,
}: {
  documents: Record<string, unknown>[]
  sampleSize: number
  minVariants: number
}): Record<string, unknown>[] {
  const schemaMap = new Map<string, Record<string, unknown>[]>()
  const sampled: Record<string, unknown>[] = []

  for (const doc of documents) {
    const signature = createSchemaSignature(doc)

    if (!schemaMap.has(signature)) {
      schemaMap.set(signature, [])
    }

    const variantDocs = schemaMap.get(signature)!
    if (variantDocs.length < minVariants) {
      variantDocs.push(doc)
      sampled.push(doc)
    }

    if (sampled.length >= sampleSize) break
  }

  return sampled
}

// Benchmark: Random sampling (shuffle algorithm) - 100 docs
Deno.bench('sampling - shuffle 100 documents', () => {
  const docs = generateMockDocuments({ count: 100, complexity: 'simple' })
  shuffleArray(docs)
})

// Benchmark: Random sampling (shuffle algorithm) - 500 docs
Deno.bench('sampling - shuffle 500 documents', () => {
  const docs = generateMockDocuments({ count: 500, complexity: 'simple' })
  shuffleArray(docs)
})

// Benchmark: Random sampling (shuffle algorithm) - 1000 docs
Deno.bench('sampling - shuffle 1000 documents', () => {
  const docs = generateMockDocuments({ count: 1000, complexity: 'simple' })
  shuffleArray(docs)
})

// Benchmark: Random sampling (shuffle algorithm) - 5000 docs
Deno.bench('sampling - shuffle 5000 documents', () => {
  const docs = generateMockDocuments({ count: 5000, complexity: 'simple' })
  shuffleArray(docs)
})

// Benchmark: Schema signature creation - simple docs
Deno.bench('sampling - schema signature (simple, 500 docs)', () => {
  const docs = generateMockDocuments({ count: 500, complexity: 'simple' })
  for (const doc of docs) {
    createSchemaSignature(doc)
  }
})

// Benchmark: Schema signature creation - complex docs
Deno.bench('sampling - schema signature (complex, 500 docs)', () => {
  const docs = generateMockDocuments({ count: 500, complexity: 'complex' })
  for (const doc of docs) {
    createSchemaSignature(doc)
  }
})

// Benchmark: Partition-aware sampling - 100 docs, 5 partitions
Deno.bench('sampling - partition-aware (100 docs, 5 partitions)', () => {
  const docs = generateMockDocuments({
    count: 100,
    complexity: 'simple',
    partitionKeys: 5,
  })
  mockPartitionSampling({
    documents: docs,
    sampleSize: 50,
    partitionKeyField: 'partition',
  })
})

// Benchmark: Partition-aware sampling - 500 docs, 10 partitions
Deno.bench('sampling - partition-aware (500 docs, 10 partitions)', () => {
  const docs = generateMockDocuments({
    count: 500,
    complexity: 'simple',
    partitionKeys: 10,
  })
  mockPartitionSampling({
    documents: docs,
    sampleSize: 100,
    partitionKeyField: 'partition',
  })
})

// Benchmark: Partition-aware sampling - 1000 docs, 20 partitions
Deno.bench('sampling - partition-aware (1000 docs, 20 partitions)', () => {
  const docs = generateMockDocuments({
    count: 1000,
    complexity: 'simple',
    partitionKeys: 20,
  })
  mockPartitionSampling({
    documents: docs,
    sampleSize: 200,
    partitionKeyField: 'partition',
  })
})

// Benchmark: Partition-aware sampling - many partitions
Deno.bench('sampling - partition-aware (5000 docs, 100 partitions)', () => {
  const docs = generateMockDocuments({
    count: 5000,
    complexity: 'simple',
    partitionKeys: 100,
  })
  mockPartitionSampling({
    documents: docs,
    sampleSize: 500,
    partitionKeyField: 'partition',
  })
})

// Benchmark: Schema-aware sampling - 500 docs, 3 variants
Deno.bench('sampling - schema-aware (500 docs, 3 variants)', () => {
  const docs = generateMockDocuments({
    count: 500,
    complexity: 'medium',
    variants: 3,
  })
  mockSchemaSampling({
    documents: docs,
    sampleSize: 100,
    minVariants: 5,
  })
})

// Benchmark: Schema-aware sampling - 1000 docs, 5 variants
Deno.bench('sampling - schema-aware (1000 docs, 5 variants)', () => {
  const docs = generateMockDocuments({
    count: 1000,
    complexity: 'medium',
    variants: 5,
  })
  mockSchemaSampling({
    documents: docs,
    sampleSize: 200,
    minVariants: 5,
  })
})

// Benchmark: Schema-aware sampling - 1000 docs, 10 variants
Deno.bench('sampling - schema-aware (1000 docs, 10 variants)', () => {
  const docs = generateMockDocuments({
    count: 1000,
    complexity: 'medium',
    variants: 10,
  })
  mockSchemaSampling({
    documents: docs,
    sampleSize: 200,
    minVariants: 5,
  })
})

// Benchmark: Sample size impact - small sample (50)
Deno.bench('sampling - sample size impact (50 from 1000)', () => {
  const docs = generateMockDocuments({ count: 1000, complexity: 'simple' })
  const shuffled = shuffleArray(docs)
  shuffled.slice(0, 50)
})

// Benchmark: Sample size impact - medium sample (200)
Deno.bench('sampling - sample size impact (200 from 1000)', () => {
  const docs = generateMockDocuments({ count: 1000, complexity: 'simple' })
  const shuffled = shuffleArray(docs)
  shuffled.slice(0, 200)
})

// Benchmark: Sample size impact - large sample (500)
Deno.bench('sampling - sample size impact (500 from 1000)', () => {
  const docs = generateMockDocuments({ count: 1000, complexity: 'simple' })
  const shuffled = shuffleArray(docs)
  shuffled.slice(0, 500)
})

// Benchmark: Document complexity impact on partition sampling
Deno.bench('sampling - partition-aware with simple docs', () => {
  const docs = generateMockDocuments({
    count: 500,
    complexity: 'simple',
    partitionKeys: 10,
  })
  mockPartitionSampling({
    documents: docs,
    sampleSize: 100,
    partitionKeyField: 'partition',
  })
})

// Benchmark: Document complexity impact on partition sampling
Deno.bench('sampling - partition-aware with complex docs', () => {
  const docs = generateMockDocuments({
    count: 500,
    complexity: 'complex',
    partitionKeys: 10,
  })
  mockPartitionSampling({
    documents: docs,
    sampleSize: 100,
    partitionKeyField: 'partition',
  })
})