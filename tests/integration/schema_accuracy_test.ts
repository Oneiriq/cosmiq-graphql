/**
 * Schema Accuracy Integration Tests
 *
 * Comprehensive test suite to measure schema generation accuracy across all scenarios.
 * Tests validate that cosmiq-graphql correctly infers GraphQL schemas from CosmosDB documents.
 *
 * Requirements:
 * - CosmosDB emulator running at https://localhost:8081
 * - Separate test databases created automatically for each scenario
 * - Single container per database for test data
 *
 * Run with:
 * deno test --allow-net --unsafely-ignore-certificate-errors=localhost,127.0.0.1 tests/integration/schema_accuracy_test.ts
 */

import { assert, assertEquals, assertExists } from '@std/assert'
import { CosmosClient } from '@azure/cosmos'
import { inferSchema } from '../../src/infer/infer-schema.ts'
import type { CosmosDBDocument } from '../../src/types/cosmosdb.ts'
import {
  generateFlat,
  generateNested,
  generatePartitions,
  generatePolymorphic,
  generateSparse,
} from '../../scripts/seed/generators/scenarios/mod.ts'
import {
  type AccuracyMetrics,
  validateSchema,
  type ValidationError,
} from '../../scripts/seed/generators/scenarios/validation.ts'

// =============================================================================
// TEST CONFIGURATION
// =============================================================================

const TEST_CONFIG = {
  endpoint: 'https://localhost:8081',
  key: 'C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==',
  // database: 'test_scenarios', // No longer used as we create separate databases per scenario
  partitionKey: '/pk',
  throughput: 400,
  batchSize: 10,
  documentCount: 100,
  baseDate: new Date('2024-01-01'),
}

// =============================================================================
// VISUAL DISPLAY CONFIGURATION
// =============================================================================

/**
 * Color codes for terminal output
 */
const COLORS = {
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  RED: '\x1b[31m',
  RESET: '\x1b[0m',
  BOLD: '\x1b[1m',
  DIM: '\x1b[2m',
}

/**
 * Accuracy thresholds for color coding
 */
const THRESHOLDS = {
  TYPE_DETECTION: 85,
  NULLABILITY: 80,
  COVERAGE: 95,
}

/**
 * Test summary tracker
 */
type ScenarioResult = {
  scenario: string
  passed: boolean
  avgAccuracy: number
}

const testResults: ScenarioResult[] = []

/**
 * Strip ANSI color codes from a string to get its clean length.
 *
 * @param str - String potentially containing ANSI codes
 * @returns String without ANSI codes
 */
function stripAnsiCodes(str: string): string {
  // deno-lint-ignore no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '')
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create CosmosDB client instance
 *
 * @returns CosmosClient instance configured for emulator
 */
function createClient(): CosmosClient {
  return new CosmosClient({
    endpoint: TEST_CONFIG.endpoint,
    key: TEST_CONFIG.key,
  })
}

/**
 * Setup test database and container by creating database with scenario-specific name and container if needed.
 * This function is idempotent and safe to run multiple times.
 *
 * @param options - Setup options
 */
async function setupTestDatabase({
  client,
  databaseName,
  containerName,
}: {
  client: CosmosClient
  databaseName: string
  containerName: string
}): Promise<ReturnType<CosmosClient['database']>> {
  try {
    // Ensure database exists
    const { database } = await client.databases.createIfNotExists({
      id: databaseName,
    })

    // Ensure container exists
    await database.containers.createIfNotExists({
      id: containerName,
      partitionKey: { paths: [TEST_CONFIG.partitionKey] },
      throughput: TEST_CONFIG.throughput,
    })
    
    return database
  } catch (error) {
    const err = error as { code?: number; message?: string }
    throw new Error(
      `Failed to setup database '${databaseName}' and container '${containerName}': ${err.message || String(error)}`,
    )
  }
}

/**
 * Seed documents to a CosmosDB container using bulk insert.
 * Processes documents in batches for better performance.
 *
 * @param options - Seed options
 */
async function seedDocuments({
  container,
  documents,
}: {
  container: ReturnType<ReturnType<CosmosClient['database']>['container']>
  documents: Record<string, unknown>[]
}): Promise<void> {
  const batchSize = TEST_CONFIG.batchSize

  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = documents.slice(i, i + batchSize)
    const results = await Promise.allSettled(
      batch.map((doc) => container.items.upsert(doc)),
    )

    // Check for failures
    const failures = results.filter((r) => r.status === 'rejected')
    if (failures.length > 0) {
      throw new Error(
        `Failed to seed ${failures.length} documents in batch ${i / batchSize + 1}`,
      )
    }
  }
}

/**
 * Query all documents from a container.
 * Uses SELECT * to retrieve complete documents for schema inference.
 *
 * @param options - Query options
 * @returns Array of all documents in container
 */
async function queryAllDocuments({
  container,
}: {
  container: ReturnType<ReturnType<CosmosClient['database']>['container']>
}): Promise<CosmosDBDocument[]> {
  const querySpec = {
    query: 'SELECT * FROM c',
  }

  const { resources } = await container.items.query(querySpec).fetchAll()
  return resources as CosmosDBDocument[]
}

/**
 * Cleanup test database by deleting it.
 * Handles 404 errors gracefully (database already deleted).
 *
 * @param options - Cleanup options
 */
async function cleanupTestDatabase({
  client,
  databaseName,
}: {
  client: CosmosClient
  databaseName: string
}): Promise<void> {
  try {
    const database = client.database(databaseName)
    await database.delete()
  } catch (error) {
    const err = error as { code?: number }
    // Ignore 404 (database doesn't exist)
    if (err.code !== 404) {
      console.warn(`Warning: Failed to cleanup database '${databaseName}':`, err)
    }
  }
}

/**
 * Create a visual progress bar with color coding based on threshold.
 *
 * @param options - Bar creation options
 * @returns Formatted progress bar string
 */
function createBar({
  percentage,
  threshold,
}: {
  percentage: number
  threshold: number
}): string {
  const barLength = 20
  const filled = Math.round((percentage / 100) * barLength)
  const empty = barLength - filled

  // Determine color based on threshold
  let color = COLORS.GREEN
  if (percentage < threshold - 5) {
    color = COLORS.RED
  } else if (percentage < threshold) {
    color = COLORS.YELLOW
  }

  const bar = '█'.repeat(filled) + '░'.repeat(empty)
  const status = percentage >= threshold ? '✓' : '✗'

  return `${color}${bar}${COLORS.RESET} ${percentage.toFixed(1)}% ${status}`
}

/**
 * Display validation metrics with visual progress bars and formatting.
 *
 * @param options - Display options
 */
function displayMetricsVisual({
  scenario,
  metrics,
  passed,
  errors,
}: {
  scenario: string
  metrics: AccuracyMetrics
  passed: boolean
  errors: ValidationError[]
}): void {
  const width = 63

  // Header
  console.log(`\n┌${'─'.repeat(width - 2)}┐`)
  console.log(
    `│ ${COLORS.BOLD}Schema Accuracy Report: ${scenario}${COLORS.RESET}${' '.repeat(width - scenario.length - 30)}│`,
  )
  console.log(`├${'─'.repeat(width - 2)}┤`)

  // Type Detection
  const typeBar = createBar({
    percentage: metrics.typeDetectionAccuracy,
    threshold: THRESHOLDS.TYPE_DETECTION,
  })
  console.log(`│ Type Detection       ${typeBar}        │`)

  // Nullability
  const nullBar = createBar({
    percentage: metrics.nullabilityAccuracy,
    threshold: THRESHOLDS.NULLABILITY,
  })
  console.log(`│ Nullability          ${nullBar}        │`)

  // Field Coverage
  const coverageBar = createBar({
    percentage: metrics.fieldCoverage,
    threshold: THRESHOLDS.COVERAGE,
  })
  console.log(`│ Field Coverage       ${coverageBar}        │`)

  // Nested Types
  const nestedMatched = metrics.nestedTypeCount.matched
  const nestedExpected = metrics.nestedTypeCount.expected
  const nestedStatus = nestedMatched === nestedExpected ||
      (nestedExpected === 0 && nestedMatched === 0)
    ? `${COLORS.GREEN}✓${COLORS.RESET}`
    : `${COLORS.YELLOW}~${COLORS.RESET}`
  const nestedText = `${nestedMatched} / ${nestedExpected} matched`
  console.log(
    `│ Nested Types         ${nestedText}${' '.repeat(width - nestedText.length - 22)}${nestedStatus}          │`,
  )

  // Conflict Resolution
  const conflictCorrect = metrics.conflictResolution.correct
  const conflictTotal = metrics.conflictResolution.total
  const conflictStatus = conflictTotal === 0 || conflictCorrect === conflictTotal
    ? `${COLORS.GREEN}✓${COLORS.RESET}`
    : `${COLORS.YELLOW}~${COLORS.RESET}`
  const conflictText = conflictTotal > 0 ? `${conflictCorrect} / ${conflictTotal} correct` : 'none detected'
  console.log(
    `│ Conflict Resolution  ${conflictText}${' '.repeat(width - conflictText.length - 22)}${conflictStatus}          │`,
  )

  // Array Handling
  const arrayCorrect = metrics.arrayHandling.correct
  const arrayTotal = metrics.arrayHandling.total
  const arrayStatus = arrayCorrect === arrayTotal ? `${COLORS.GREEN}✓${COLORS.RESET}` : `${COLORS.RED}✗${COLORS.RESET}`
  const arrayText = arrayTotal > 0 ? `${arrayCorrect} / ${arrayTotal} correct` : 'none detected'
  console.log(
    `│ Array Handling       ${arrayText}${' '.repeat(width - arrayText.length - 22)}${arrayStatus}          │`,
  )

  console.log(`├${'─'.repeat(width - 2)}┤`)

  // Overall Status
  const overallStatus = passed
    ? `${COLORS.GREEN}${COLORS.BOLD}PASSED ✓${COLORS.RESET}`
    : `${COLORS.RED}${COLORS.BOLD}FAILED ✗${COLORS.RESET}`
  console.log(`│ Overall: ${overallStatus}${' '.repeat(width - 19)}│`)

  // Errors (if any)
  if (errors.length > 0) {
    console.log(`├${'─'.repeat(width - 2)}┤`)
    console.log(
      `│ ${COLORS.RED}Validation Errors:${COLORS.RESET}${' '.repeat(width - 21)}│`,
    )
    const displayErrors = errors.slice(0, 3)
    for (const err of displayErrors) {
      const msg = `  ${COLORS.RED}✗${COLORS.RESET} ${err.message}`
      const cleanMsg = stripAnsiCodes(msg)
      if (cleanMsg.length <= width - 2) {
        console.log(`│ ${msg}${' '.repeat(width - cleanMsg.length - 2)}│`)
      } else {
        const truncated = msg.substring(0, width - 5) + '...'
        const cleanTrunc = stripAnsiCodes(truncated)
        console.log(`│ ${truncated}${' '.repeat(width - cleanTrunc.length - 2)}│`)
      }
    }
    if (errors.length > 3) {
      const moreMsg = `  ... and ${errors.length - 3} more errors`
      console.log(`│ ${COLORS.DIM}${moreMsg}${COLORS.RESET}${' '.repeat(width - moreMsg.length - 2)}│`)
    }
  }

  console.log(`└${'─'.repeat(width - 2)}┘`)
}

/**
 * Display summary of all test results.
 */
function displayTestSummary(): void {
  if (testResults.length === 0) return

  const width = 65

  console.log(`\n╔${'═'.repeat(width - 2)}╗`)
  console.log(
    `║${' '.repeat(13)}${COLORS.BOLD}Schema Accuracy Test Summary${COLORS.RESET}${' '.repeat(width - 43)}║`,
  )
  console.log(`╠${'═'.repeat(width - 2)}╣`)
for (const result of testResults) {
  const status = result.passed
    ? `${COLORS.GREEN}✓ PASSED${COLORS.RESET}`
    : `${COLORS.RED}✗ FAILED${COLORS.RESET}`
  const avg = `(${result.avgAccuracy.toFixed(1)}% avg)`
  const line = `${result.scenario}${' '.repeat(22 - result.scenario.length)}${status}  ${avg}`
  const cleanLine = stripAnsiCodes(line)
  console.log(`║ ${line}${' '.repeat(width - cleanLine.length - 2)}║`)
}
  console.log(`╠${'═'.repeat(width - 2)}╣`)

  const passedCount = testResults.filter((r) => r.passed).length
  const totalCount = testResults.length
  const overallStatus = passedCount === totalCount
    ? `${COLORS.GREEN}${COLORS.BOLD}✓${COLORS.RESET}`
    : `${COLORS.RED}${COLORS.BOLD}✗${COLORS.RESET}`
  const summaryLine = `Overall: ${passedCount}/${totalCount} scenarios passed ${overallStatus}`
  const cleanSummary = stripAnsiCodes(summaryLine)
  console.log(`║ ${summaryLine}${' '.repeat(width - cleanSummary.length - 2)}║`)
  console.log(`╚${'═'.repeat(width - 2)}╝\n`)
}

// =============================================================================
// SCENARIO TESTS
// =============================================================================

Deno.test('Schema Accuracy: Flat Primitives', async () => {
  const client = createClient()
  const databaseName = 'test_scenarios_flat'
  const containerName = 'data'
  
  let database: ReturnType<CosmosClient['database']> | null = null

  try {
    // Setup
    database = await setupTestDatabase({ client, databaseName, containerName })
    const container = database.container(containerName)

    // Generate & seed
    const documents = Array.from(
      { length: TEST_CONFIG.documentCount },
      (_, i) => generateFlat({ index: i, baseDate: TEST_CONFIG.baseDate }),
    )
    await seedDocuments({ container, documents })

    // Query back
    const queriedDocs = await queryAllDocuments({ container })
    assertEquals(
      queriedDocs.length,
      TEST_CONFIG.documentCount,
      'Should retrieve all documents',
    )

    // Infer schema
    const inferred = inferSchema({
      documents: queriedDocs,
      typeName: 'Product',
      config: {
        nestedNamingStrategy: 'flat',
      },
    })
    assertExists(inferred, 'Schema should be inferred')

    // Validate
    const result = validateSchema({
      scenario: 'flat',
      inferredSchema: inferred,
    })

    // Display visual metrics
    displayMetricsVisual({
      scenario: 'Flat Primitives',
      metrics: result.metrics,
      passed: result.passed,
      errors: result.errors,
    })

    // Track result for summary
    const avgAccuracy = (result.metrics.typeDetectionAccuracy +
      result.metrics.nullabilityAccuracy +
      result.metrics.fieldCoverage) / 3
    testResults.push({
      scenario: 'Flat Primitives',
      passed: result.passed,
      avgAccuracy,
    })

    // Assertions
    assertEquals(
      result.passed,
      true,
      `Validation failed: ${JSON.stringify(result.errors.slice(0, 3), null, 2)}`,
    )
    assert(
      result.metrics.typeDetectionAccuracy >= 85,
      `Type detection (${result.metrics.typeDetectionAccuracy.toFixed(2)}%) below 85% threshold`,
    )
    assert(
      result.metrics.nullabilityAccuracy >= 80,
      `Nullability accuracy (${result.metrics.nullabilityAccuracy.toFixed(2)}%) below 80% threshold`,
    )
    assert(
      result.metrics.fieldCoverage >= 95,
      `Field coverage (${result.metrics.fieldCoverage.toFixed(2)}%) below 95% threshold`,
    )
  } finally {
    // Cleanup
    if (database) {
      await cleanupTestDatabase({ client, databaseName })
    }
    // Dispose of the client to prevent resource leaks
    if (client && typeof client.dispose === 'function') {
      client.dispose()
    }
  }
})

Deno.test('Schema Accuracy: Nested Objects', async () => {
  const client = createClient()
  const databaseName = 'test_scenarios_nested'
  const containerName = 'data'
  
  let database: ReturnType<CosmosClient['database']> | null = null

  try {
    // Setup
    database = await setupTestDatabase({ client, databaseName, containerName })
    const container = database.container(containerName)

    // Generate & seed
    const documents = Array.from(
      { length: TEST_CONFIG.documentCount },
      (_, i) => generateNested({ index: i, baseDate: TEST_CONFIG.baseDate }),
    )
    await seedDocuments({ container, documents })

    // Query back
    const queriedDocs = await queryAllDocuments({ container })
    assertEquals(
      queriedDocs.length,
      TEST_CONFIG.documentCount,
      'Should retrieve all documents',
    )

    // Infer schema
    const inferred = inferSchema({
      documents: queriedDocs,
      typeName: 'Order',
      config: {
        nestedNamingStrategy: 'flat',
      },
    })
    assertExists(inferred, 'Schema should be inferred')

    // Validate
    const result = validateSchema({
      scenario: 'nested',
      inferredSchema: inferred,
    })

    // Display visual metrics
    displayMetricsVisual({
      scenario: 'Nested Objects',
      metrics: result.metrics,
      passed: result.passed,
      errors: result.errors,
    })

    // Track result for summary
    const avgAccuracy = (result.metrics.typeDetectionAccuracy +
      result.metrics.nullabilityAccuracy +
      result.metrics.fieldCoverage) / 3
    testResults.push({
      scenario: 'Nested Objects',
      passed: result.passed,
      avgAccuracy,
    })

    // Assertions
    assertEquals(
      result.passed,
      true,
      `Validation failed: ${JSON.stringify(result.errors.slice(0, 3), null, 2)}`,
    )
    assert(
      result.metrics.typeDetectionAccuracy >= 85,
      `Type detection (${result.metrics.typeDetectionAccuracy.toFixed(2)}%) below 85% threshold`,
    )
    assert(
      result.metrics.nullabilityAccuracy >= 80,
      `Nullability accuracy (${result.metrics.nullabilityAccuracy.toFixed(2)}%) below 80% threshold`,
    )
    assert(
      result.metrics.fieldCoverage >= 95,
      `Field coverage (${result.metrics.fieldCoverage.toFixed(2)}%) below 95% threshold`,
    )

    // Verify nested type creation
    assert(
      result.metrics.nestedTypeCount.matched >= result.metrics.nestedTypeCount.expected * 0.9,
      `Only ${result.metrics.nestedTypeCount.matched}/${result.metrics.nestedTypeCount.expected} nested types matched`,
    )
  } finally {
    // Cleanup
    if (database) {
      await cleanupTestDatabase({ client, databaseName })
    }
    // Dispose of the client to prevent resource leaks
    if (client && typeof client.dispose === 'function') {
      client.dispose()
    }
  }
})

Deno.test('Schema Accuracy: Polymorphic Arrays', async () => {
  const client = createClient()
  const databaseName = 'test_scenarios_polymorphic'
  const containerName = 'data'
  
  let database: ReturnType<CosmosClient['database']> | null = null

  try {
    // Setup
    database = await setupTestDatabase({ client, databaseName, containerName })
    const container = database.container(containerName)

    // Generate & seed
    const documents = Array.from(
      { length: TEST_CONFIG.documentCount },
      (_, i) => generatePolymorphic({ index: i, baseDate: TEST_CONFIG.baseDate }),
    )
    await seedDocuments({ container, documents })

    // Query back
    const queriedDocs = await queryAllDocuments({ container })
    assertEquals(
      queriedDocs.length,
      TEST_CONFIG.documentCount,
      'Should retrieve all documents',
    )

    // Infer schema
    const inferred = inferSchema({
      documents: queriedDocs,
      typeName: 'Collection',
      config: {
        nestedNamingStrategy: 'flat',
      },
    })
    assertExists(inferred, 'Schema should be inferred')

    // Validate
    const result = validateSchema({
      scenario: 'polymorphic',
      inferredSchema: inferred,
    })

    // Display visual metrics
    displayMetricsVisual({
      scenario: 'Polymorphic Arrays',
      metrics: result.metrics,
      passed: result.passed,
      errors: result.errors,
    })

    // Track result for summary
    const avgAccuracy = (result.metrics.typeDetectionAccuracy +
      result.metrics.nullabilityAccuracy +
      result.metrics.fieldCoverage) / 3
    testResults.push({
      scenario: 'Polymorphic Arrays',
      passed: result.passed,
      avgAccuracy,
    })

    // Assertions
    assertEquals(
      result.passed,
      true,
      `Validation failed: ${JSON.stringify(result.errors.slice(0, 3), null, 2)}`,
    )
    assert(
      result.metrics.typeDetectionAccuracy >= 85,
      `Type detection (${result.metrics.typeDetectionAccuracy.toFixed(2)}%) below 85% threshold`,
    )
    assert(
      result.metrics.nullabilityAccuracy >= 80,
      `Nullability accuracy (${result.metrics.nullabilityAccuracy.toFixed(2)}%) below 80% threshold`,
    )
    assert(
      result.metrics.fieldCoverage >= 95,
      `Field coverage (${result.metrics.fieldCoverage.toFixed(2)}%) below 95% threshold`,
    )
  } finally {
    // Cleanup
    if (database) {
      await cleanupTestDatabase({ client, databaseName })
    }
    // Dispose of the client to prevent resource leaks
    if (client && typeof client.dispose === 'function') {
      client.dispose()
    }
  }
})

Deno.test('Schema Accuracy: Sparse Fields', async () => {
  const client = createClient()
  const databaseName = 'test_scenarios_sparse'
  const containerName = 'data'
  
  let database: ReturnType<CosmosClient['database']> | null = null

  try {
    // Setup
    database = await setupTestDatabase({ client, databaseName, containerName })
    const container = database.container(containerName)

    // Generate & seed
    const documents = Array.from(
      { length: TEST_CONFIG.documentCount },
      (_, i) => generateSparse({ index: i, baseDate: TEST_CONFIG.baseDate }),
    )
    await seedDocuments({ container, documents })

    // Query back
    const queriedDocs = await queryAllDocuments({ container })
    assertEquals(
      queriedDocs.length,
      TEST_CONFIG.documentCount,
      'Should retrieve all documents',
    )

    // Infer schema
    const inferred = inferSchema({
      documents: queriedDocs,
      typeName: 'Profile',
      config: {
        nestedNamingStrategy: 'flat',
      },
    })
    assertExists(inferred, 'Schema should be inferred')

    // Validate
    const result = validateSchema({
      scenario: 'sparse',
      inferredSchema: inferred,
    })

    // Display visual metrics
    displayMetricsVisual({
      scenario: 'Sparse Fields',
      metrics: result.metrics,
      passed: result.passed,
      errors: result.errors,
    })

    // Track result for summary
    const avgAccuracy = (result.metrics.typeDetectionAccuracy +
      result.metrics.nullabilityAccuracy +
      result.metrics.fieldCoverage) / 3
    testResults.push({
      scenario: 'Sparse Fields',
      passed: result.passed,
      avgAccuracy,
    })

    // Assertions
    assertEquals(
      result.passed,
      true,
      `Validation failed: ${JSON.stringify(result.errors.slice(0, 3), null, 2)}`,
    )
    assert(
      result.metrics.typeDetectionAccuracy >= 85,
      `Type detection (${result.metrics.typeDetectionAccuracy.toFixed(2)}%) below 85% threshold`,
    )
    assert(
      result.metrics.nullabilityAccuracy >= 80,
      `Nullability accuracy (${result.metrics.nullabilityAccuracy.toFixed(2)}%) below 80% threshold`,
    )
    assert(
      result.metrics.fieldCoverage >= 95,
      `Field coverage (${result.metrics.fieldCoverage.toFixed(2)}%) below 95% threshold`,
    )
  } finally {
    // Cleanup
    if (database) {
      await cleanupTestDatabase({ client, databaseName })
    }
    // Dispose of the client to prevent resource leaks
    if (client && typeof client.dispose === 'function') {
      client.dispose()
    }
  }
})

Deno.test('Schema Accuracy: Partition Patterns', async () => {
  const client = createClient()
  const databaseName = 'test_scenarios_partitions'
  const containerName = 'data'
  
  let database: ReturnType<CosmosClient['database']> | null = null

  try {
    // Setup
    database = await setupTestDatabase({ client, databaseName, containerName })
    const container = database.container(containerName)

    // Generate & seed
    const documents = Array.from(
      { length: TEST_CONFIG.documentCount },
      (_, i) => generatePartitions({ index: i, baseDate: TEST_CONFIG.baseDate }),
    )
    await seedDocuments({ container, documents })

    // Query back
    const queriedDocs = await queryAllDocuments({ container })
    assertEquals(
      queriedDocs.length,
      TEST_CONFIG.documentCount,
      'Should retrieve all documents',
    )

    // Infer schema
    const inferred = inferSchema({
      documents: queriedDocs,
      typeName: 'PartitionDocument',
      config: {
        nestedNamingStrategy: 'flat',
      },
    })
    assertExists(inferred, 'Schema should be inferred')

    // Validate
    const result = validateSchema({
      scenario: 'partitions',
      inferredSchema: inferred,
    })

    // Display visual metrics
    displayMetricsVisual({
      scenario: 'Partition Patterns',
      metrics: result.metrics,
      passed: result.passed,
      errors: result.errors,
    })

    // Track result for summary
    const avgAccuracy = (result.metrics.typeDetectionAccuracy +
      result.metrics.nullabilityAccuracy +
      result.metrics.fieldCoverage) / 3
    testResults.push({
      scenario: 'Partition Patterns',
      passed: result.passed,
      avgAccuracy,
    })

    // Display summary after last test
    displayTestSummary()

    // Assertions
    assertEquals(
      result.passed,
      true,
      `Validation failed: ${JSON.stringify(result.errors.slice(0, 3), null, 2)}`,
    )
    assert(
      result.metrics.typeDetectionAccuracy >= 85,
      `Type detection (${result.metrics.typeDetectionAccuracy.toFixed(2)}%) below 85% threshold`,
    )
    assert(
      result.metrics.nullabilityAccuracy >= 80,
      `Nullability accuracy (${result.metrics.nullabilityAccuracy.toFixed(2)}%) below 80% threshold`,
    )
    assert(
      result.metrics.fieldCoverage >= 95,
      `Field coverage (${result.metrics.fieldCoverage.toFixed(2)}%) below 95% threshold`,
    )
  } finally {
    // Cleanup
    if (database) {
      await cleanupTestDatabase({ client, databaseName })
    }
    // Dispose of the client to prevent resource leaks
    if (client && typeof client.dispose === 'function') {
      client.dispose()
    }
  }
})
