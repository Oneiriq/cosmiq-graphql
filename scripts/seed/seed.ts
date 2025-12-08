/**
 * Seeds Cosmos DB with initial data for testing.
 *
 * Generates users, listings, and files with deterministic data.
 * Supports incremental generation and idempotent seeding.
 *
 * Usage:
 *  deno run --allow-read --allow-write --allow-net --unsafely-ignore-certificate-errors=localhost,127.0.0.1 scripts/seed/seed.ts [OPTIONS]
 *
 * Options:
 * --files <count>      Number of files to generate (default: based on listings)
 * --users <count>      Number of users to generate (default: 50)
 * --listings <count>   Number of listings to generate (default: 200)
 * --seed-db            Seed directly to CosmosDB emulator at localhost:8081
 * --help, -h           Show help message
 */

import { CosmosClient } from '@azure/cosmos'
import { generateFile, generateListing, generateUser } from './generators/mod.ts'
import {
  BadRequestError,
  ConflictError,
  createErrorContext,
  InternalServerError,
  NotFoundError,
  RateLimitError,
  ServiceUnavailableError,
  UnauthorizedError,
} from '../../src/errors/mod.ts'

// =============================================================================
// TYPES
// =============================================================================

type UserDocument = {
  id: string
  pk: string
  type: string
  [key: string]: unknown
}

type ListingDocument = {
  id: string
  pk: string
  type: string
  [key: string]: unknown
}

type FileDocument = {
  id: string
  pk: string
  type: string
  [key: string]: unknown
}

type ExistingData = {
  userIds: string[]
  listingIds: string[]
  fileIds: string[]
  maxUserIndex: number
  maxListingIndex: number
  maxFileIndex: number
}

type SeedData = {
  users: UserDocument[]
  listings: ListingDocument[]
  files: FileDocument[]
}

type GenerationOptions = {
  userCount: number
  listingCount: number
  existingUserIds: string[]
  existingListingIds: string[]
  startUserIndex: number
  startListingIndex: number
  baseDate: Date
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DATA_DIR = './scripts/seed/data'
const USERS_FILE = `${DATA_DIR}/db1_users.json`
const LISTINGS_FILE = `${DATA_DIR}/db1_listings.json`
const FILES_FILE = `${DATA_DIR}/db1_files.json`

const DEFAULT_USER_COUNT = 50
const DEFAULT_LISTING_COUNT = 200
const DEFAULT_BASE_DATE = new Date('2024-01-01')

// =============================================================================
// FILE I/O FUNCTIONS
// =============================================================================

/**
 * Load existing data from JSON files for idempotency.
 * Returns empty arrays if files don't exist or are invalid.
 *
 * @returns Object containing existing IDs and max indices
 */
async function loadExistingData(): Promise<ExistingData> {
  const result: ExistingData = {
    userIds: [],
    listingIds: [],
    fileIds: [],
    maxUserIndex: -1,
    maxListingIndex: -1,
    maxFileIndex: -1,
  }

  try {
    const usersText = await Deno.readTextFile(USERS_FILE)
    const users = JSON.parse(usersText) as UserDocument[]
    result.userIds = users.map((u) => u.id)

    // Users are generated sequentially by index, so count determines max index
    // Registered users: usr_1000, usr_1001, etc. (indices 0, 1, 2, ...)
    // Anonymous users: anon_session_* (every 5th index: 0, 5, 10, ...)
    // The max index is simply the count of users - 1
    if (users.length > 0) {
      result.maxUserIndex = users.length - 1
    }
  } catch {
    // File doesn't exist or is invalid, start fresh
  }

  try {
    const listingsText = await Deno.readTextFile(LISTINGS_FILE)
    const listings = JSON.parse(listingsText) as ListingDocument[]
    result.listingIds = listings.map((l) => l.id)

    // Listings are also generated sequentially by index
    if (listings.length > 0) {
      result.maxListingIndex = listings.length - 1
    }
  } catch {
    // File doesn't exist or is invalid, start fresh
  }

  try {
    const filesText = await Deno.readTextFile(FILES_FILE)
    const files = JSON.parse(filesText) as FileDocument[]
    result.fileIds = files.map((f) => f.id)
  } catch {
    // File doesn't exist or is invalid, start fresh
  }

  return result
}

/**
 * Write seed data to JSON files.
 * Preserves existing data and appends new records.
 *
 * @param data - Seed data containing users, listings, and files
 */
async function writeJsonFiles(data: SeedData): Promise<void> {
  // Ensure data directory exists
  await Deno.mkdir(DATA_DIR, { recursive: true })

  // Combine with new data (avoiding duplicates)
  const allUsers: UserDocument[] = []
  const allListings: ListingDocument[] = []
  const allFiles: FileDocument[] = []

  // Load existing users
  try {
    const usersText = await Deno.readTextFile(USERS_FILE)
    const existingUsers = JSON.parse(usersText) as UserDocument[]
    allUsers.push(...existingUsers)
  } catch {
    // File doesn't exist, start with empty
  }

  // Load existing listings
  try {
    const listingsText = await Deno.readTextFile(LISTINGS_FILE)
    const existingListings = JSON.parse(listingsText) as ListingDocument[]
    allListings.push(...existingListings)
  } catch {
    // File doesn't exist, start with empty
  }

  // Load existing files
  try {
    const filesText = await Deno.readTextFile(FILES_FILE)
    const existingFiles = JSON.parse(filesText) as FileDocument[]
    allFiles.push(...existingFiles)
  } catch {
    // File doesn't exist, start with empty
  }

  // Add new data (avoiding duplicates by ID)
  const existingUserIds = new Set(allUsers.map((u) => u.id))
  const existingListingIds = new Set(allListings.map((l) => l.id))
  const existingFileIds = new Set(allFiles.map((f) => f.id))

  for (const user of data.users) {
    if (!existingUserIds.has(user.id)) {
      allUsers.push(user)
    }
  }

  for (const listing of data.listings) {
    if (!existingListingIds.has(listing.id)) {
      allListings.push(listing)
    }
  }

  for (const file of data.files) {
    if (!existingFileIds.has(file.id)) {
      allFiles.push(file)
    }
  }

  // Write to files with pretty printing
  await Deno.writeTextFile(USERS_FILE, JSON.stringify(allUsers, null, 2))
  await Deno.writeTextFile(LISTINGS_FILE, JSON.stringify(allListings, null, 2))
  await Deno.writeTextFile(FILES_FILE, JSON.stringify(allFiles, null, 2))

  console.log(`\n✓ Wrote ${allUsers.length} users to ${USERS_FILE}`)
  console.log(`✓ Wrote ${allListings.length} listings to ${LISTINGS_FILE}`)
  console.log(`✓ Wrote ${allFiles.length} files to ${FILES_FILE}`)
}

// =============================================================================
// DATA GENERATION
// =============================================================================

/**
 * Generate seed data for users, listings, and files.
 *
 * @param options - Generation options including counts and indices
 * @returns Generated seed data
 */
function generateSeedData(options: GenerationOptions): SeedData {
  const {
    userCount,
    listingCount,
    existingUserIds,
    startUserIndex,
    startListingIndex,
    baseDate,
  } = options

  const users: UserDocument[] = []
  const listings: ListingDocument[] = []
  const files: FileDocument[] = []

  // Generate users
  console.log(`\nGenerating ${userCount} users (starting at index ${startUserIndex})...`)
  for (let i = 0; i < userCount; i++) {
    const userIndex = startUserIndex + i
    const user = generateUser({ index: userIndex, baseDate })
    users.push(user as unknown as UserDocument)
  }

  // Collect all user IDs (existing + new)
  const allUserIds = [...existingUserIds, ...users.map((u) => u.id)]

  // Generate listings and files
  if (listingCount > 0) {
    console.log(`Generating ${listingCount} listings (starting at index ${startListingIndex})...`)

    // Global file index counter for sequential file generation
    // The file generator uses index % 10 to determine image vs document (90% images, 10% documents)
    let globalFileIndex = 0

    for (let i = 0; i < listingCount; i++) {
      const listingIndex = startListingIndex + i
      const listing = generateListing({
        index: listingIndex,
        baseDate,
        userIds: allUserIds,
      })
      listings.push(listing as unknown as ListingDocument)

      // Generate files for this listing
      const imageCount = (listingIndex % 4) + 2 // 2-5 images per listing
      const shouldHaveDocument = listingIndex % 10 === 0 // 10% of listings have a document

      // Get uploader info from listing
      const uploaderId = (listing as { sellerId: string }).sellerId
      const uploaderType = (listing as { sellerType: 'registered' | 'anonymous' }).sellerType

      // Generate images
      for (let j = 0; j < imageCount; j++) {
        // Skip indices that would generate documents (every 10th index)
        while (globalFileIndex % 10 === 0) {
          globalFileIndex++
        }

        const file = generateFile({
          index: globalFileIndex,
          baseDate,
          listingId: listing.id,
          uploaderId,
          uploaderType,
          isPrimary: j === 0,
          displayOrder: j + 1,
        })
        files.push(file as unknown as FileDocument)
        globalFileIndex++
      }

      // Generate document if applicable (only for listings at indices 0, 10, 20, etc.)
      if (shouldHaveDocument) {
        // Find next document index (index % 10 === 0)
        while (globalFileIndex % 10 !== 0) {
          globalFileIndex++
        }

        const file = generateFile({
          index: globalFileIndex,
          baseDate,
          listingId: listing.id,
          uploaderId,
          uploaderType,
          isPrimary: false,
          displayOrder: imageCount + 1,
        })
        files.push(file as unknown as FileDocument)
        globalFileIndex++
      }
    }
  }

  console.log(`Generated ${files.length} files for ${listingCount} listings`)

  return { users, listings, files }
}

// =============================================================================
// COSMOSDB CLIENT UTILITIES
// =============================================================================

type CosmosDBConfig = {
  endpoint: string
  primaryKey: string
  database: string
}

/**
 * Insert a single document into CosmosDB container using @azure/cosmos client.
 *
 * @param database - Database instance
 * @param containerName - Container name
 * @param document - Document to insert
 * @returns Inserted document or null if conflict (already exists)
 */
async function insertDocument({
  database,
  containerName,
  document,
}: {
  database: ReturnType<CosmosClient['database']>
  containerName: string
  document: Record<string, unknown>
}): Promise<Record<string, unknown> | null> {
  const container = database.container(containerName)

  try {
    const { resource } = await container.items.upsert(document)
    return resource ?? null
  } catch (error: unknown) {
    const err = error as { code?: number; message?: string; constructor?: { name?: string } }
    if (err.code === 409) {
      return null
    }

    const context = createErrorContext({
      component: 'insertDocument',
      metadata: {
        container: containerName,
        documentId: document.id,
        errorCode: err.code,
        errorType: err.constructor?.name || 'Unknown',
        errorMessage: err.message || String(error),
      },
    })

    switch (err.code) {
      case 400:
        throw new BadRequestError({ message: `Bad request: ${err.message}`, context })
      case 401:
        throw new UnauthorizedError({ message: `Unauthorized: ${err.message}`, context })
      case 429:
        throw new RateLimitError({ message: `Rate limit exceeded: ${err.message}`, context })
      case 500:
        throw new InternalServerError({ message: `Internal server error: ${err.message}`, context })
      case 503:
        throw new ServiceUnavailableError({ message: `Service unavailable: ${err.message}`, context })
      default:
        throw new InternalServerError({
          message: `Failed to insert document: ${err.message || String(error)}`,
          context,
        })
    }
  }
}

/**
 * Bulk insert documents into a CosmosDB container with concurrency control.
 *
 * @param database - Database instance
 * @param containerName - Container name
 * @param documents - Documents to insert
 * @param batchSize - Number of concurrent inserts
 * @returns Statistics about the insert operation
 */
async function bulkInsertDocuments({
  database,
  containerName,
  documents,
  batchSize = 10,
}: {
  database: ReturnType<CosmosClient['database']>
  containerName: string
  documents: Record<string, unknown>[]
  batchSize?: number
}): Promise<{ inserted: number; skipped: number; failed: number }> {
  let inserted = 0
  let skipped = 0
  let failed = 0

  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = documents.slice(i, i + batchSize)
    const results = await Promise.allSettled(
      batch.map((doc) => insertDocument({ database, containerName, document: doc })),
    )

    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value === null) {
          skipped++
        } else {
          inserted++
        }
      } else {
        failed++
        console.error(`  ✗ Failed to insert document: ${result.reason.message}`)
      }
    }

    const progress = Math.min(i + batchSize, documents.length)
    console.log(`  Progress: ${progress}/${documents.length} documents processed`)
  }

  return { inserted, skipped, failed }
}

/**
 * Ensure database and containers exist, creating them if needed.
 * Only auto-creates when targeting emulator (localhost:8081).
 * For production endpoints, throws error if resources don't exist.
 *
 * @param client - CosmosClient instance
 * @param databaseName - Database name
 * @param endpoint - CosmosDB endpoint URL
 * @returns Database instance
 */
async function ensureDatabaseAndContainers({
  client,
  databaseName,
  endpoint,
}: {
  client: CosmosClient
  databaseName: string
  endpoint: string
}): Promise<ReturnType<typeof client.database>> {
  const isEmulator = endpoint.includes('localhost:8081')
  const requiredContainers = ['users', 'listings', 'files']
  const partitionKey = '/pk'
  const throughput = 400 // Minimum for emulator

  console.log('Ensuring database and containers exist...')

  // Check if database exists
  let database
  try {
    database = client.database(databaseName)
    await database.read()
    console.log(`  ✓ Database '${databaseName}' exists`)
  } catch (error: unknown) {
    const err = error as { code?: number; message?: string }
    if (err.code === 404) {
      if (!isEmulator) {
        const context = createErrorContext({
          component: 'ensureDatabaseAndContainers',
          metadata: {
            database: databaseName,
            endpoint,
          },
        })
        throw new NotFoundError({
          message:
            `Database '${databaseName}' does not exist. For production endpoints, please create the database manually.`,
          context,
        })
      }

      // Create database for emulator
      console.log(`  ⊕ Creating database '${databaseName}'...`)
      const { database: newDb } = await client.databases.createIfNotExists({ id: databaseName })
      database = newDb
      console.log(`  ✓ Database '${databaseName}' created`)
    } else {
      const context = createErrorContext({
        component: 'ensureDatabaseAndContainers',
        metadata: {
          database: databaseName,
          error: err.message || String(error),
        },
      })
      throw new InternalServerError({
        message: `Failed to check database existence: ${err.message || String(error)}`,
        context,
      })
    }
  }

  // Ensure containers exist
  for (const containerName of requiredContainers) {
    try {
      const container = database.container(containerName)
      await container.read()
      console.log(`  ✓ Container '${containerName}' exists`)
    } catch (error: unknown) {
      const err = error as { code?: number; message?: string }
      if (err.code === 404) {
        if (!isEmulator) {
          const context = createErrorContext({
            component: 'ensureDatabaseAndContainers',
            metadata: {
              database: databaseName,
              container: containerName,
              endpoint,
            },
          })
          throw new NotFoundError({
            message:
              `Container '${containerName}' does not exist. For production endpoints, please create containers manually.`,
            context,
          })
        }

        // Create container for emulator
        console.log(`  ⊕ Creating container '${containerName}' with partition key '${partitionKey}'...`)
        await database.containers.createIfNotExists({
          id: containerName,
          partitionKey: { paths: [partitionKey] },
          throughput,
        })
        console.log(`  ✓ Container '${containerName}' created`)
      } else {
        const context = createErrorContext({
          component: 'ensureDatabaseAndContainers',
          metadata: {
            database: databaseName,
            container: containerName,
            error: err.message || String(error),
          },
        })
        throw new InternalServerError({
          message: `Failed to check container '${containerName}' existence: ${err.message || String(error)}`,
          context,
        })
      }
    }
  }

  console.log('')
  return database
}

/**
 * Seed data directly to CosmosDB using @azure/cosmos client library.
 *
 * @param data - Seed data to insert into CosmosDB
 */
async function seedToCosmosDB(data: SeedData): Promise<void> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  Seeding CosmosDB')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const config: CosmosDBConfig = {
    endpoint: 'https://localhost:8081',
    primaryKey: 'C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==',
    database: 'db1',
  }

  console.log(`\nEndpoint: ${config.endpoint}`)
  console.log(`Database: ${config.database}\n`)

  const client = new CosmosClient({
    endpoint: config.endpoint,
    key: config.primaryKey,
  })

  // Ensure database and containers exist (auto-create for emulator)
  const database = await ensureDatabaseAndContainers({
    client,
    databaseName: config.database,
    endpoint: config.endpoint,
  })

  try {
    console.log(`Seeding users container (${data.users.length} documents)...`)
    const usersResult = await bulkInsertDocuments({
      database,
      containerName: 'users',
      documents: data.users,
      batchSize: 10,
    })
    console.log(`  ✓ Inserted: ${usersResult.inserted}`)
    console.log(`  ⊙ Skipped (already exist): ${usersResult.skipped}`)
    if (usersResult.failed > 0) {
      console.log(`  ✗ Failed: ${usersResult.failed}`)
    }

    console.log(`\nSeeding listings container (${data.listings.length} documents)...`)
    const listingsResult = await bulkInsertDocuments({
      database,
      containerName: 'listings',
      documents: data.listings,
      batchSize: 10,
    })
    console.log(`  ✓ Inserted: ${listingsResult.inserted}`)
    console.log(`  ⊙ Skipped (already exist): ${listingsResult.skipped}`)
    if (listingsResult.failed > 0) {
      console.log(`  ✗ Failed: ${listingsResult.failed}`)
    }

    console.log(`\nSeeding files container (${data.files.length} documents)...`)
    const filesResult = await bulkInsertDocuments({
      database,
      containerName: 'files',
      documents: data.files,
      batchSize: 10,
    })
    console.log(`  ✓ Inserted: ${filesResult.inserted}`)
    console.log(`  ⊙ Skipped (already exist): ${filesResult.skipped}`)
    if (filesResult.failed > 0) {
      console.log(`  ✗ Failed: ${filesResult.failed}`)
    }

    const totalInserted = usersResult.inserted + listingsResult.inserted + filesResult.inserted
    const totalSkipped = usersResult.skipped + listingsResult.skipped + filesResult.skipped
    const totalFailed = usersResult.failed + listingsResult.failed + filesResult.failed

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`  Summary: ${totalInserted} inserted, ${totalSkipped} skipped, ${totalFailed} failed`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  } catch (error) {
    const context = createErrorContext({
      component: 'seedToCosmosDB',
      metadata: { error: error instanceof Error ? error.message : String(error) },
    })

    if (error instanceof ConflictError) {
      console.log('\n⚠ Some documents already exist (conflict). This is expected for idempotent seeding.')
      return
    }

    throw new InternalServerError({
      message: `Failed to seed CosmosDB: ${error instanceof Error ? error.message : String(error)}`,
      context,
    })
  }
}

// =============================================================================
// CLI ARGUMENT PARSING
// =============================================================================

type CliArgs = {
  users?: number
  listings?: number
  seedDb: boolean
  help: boolean
}

/**
 * Parse command-line arguments.
 *
 * @param args - Array of command-line arguments
 * @returns Parsed CLI arguments
 */
function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {
    seedDb: false,
    help: false,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === '--help' || arg === '-h') {
      result.help = true
    } else if (arg === '--seed-db') {
      result.seedDb = true
    } else if (arg === '--users') {
      const nextArg = args[i + 1]
      if (nextArg && !nextArg.startsWith('--')) {
        result.users = parseInt(nextArg)
        i++ // Skip next arg
      }
    } else if (arg === '--listings') {
      const nextArg = args[i + 1]
      if (nextArg && !nextArg.startsWith('--')) {
        result.listings = parseInt(nextArg)
        i++ // Skip next arg
      }
    }
  }

  return result
}

/**
 * Display help message.
 */
function showHelp(): void {
  console.log(`
CosmosDB Seed Data Generator

USAGE:
  deno run --allow-read --allow-write --allow-net --unsafely-ignore-certificate-errors=localhost,127.0.0.1 scripts/seed/seed.ts [OPTIONS]

OPTIONS:
  --users <count>      Number of users to generate (default: 50)
  --listings <count>   Number of listings to generate (default: 200)
  --seed-db            Seed directly to CosmosDB emulator at localhost:8081
  --help, -h           Show this help message

EXAMPLES:
  # Generate initial seed data (50 users, 200 listings)
  deno run --allow-read --allow-write scripts/seed/seed.ts

  # Generate 100 users incrementally
  deno run --allow-read --allow-write scripts/seed/seed.ts --users 100

  # Generate 300 listings for existing users
  deno run --allow-read --allow-write scripts/seed/seed.ts --listings 300

  # Generate custom counts
  deno run --allow-read --allow-write scripts/seed/seed.ts --users 75 --listings 400

  # Seed to CosmosDB emulator
  deno run --allow-read --allow-write --allow-net --unsafely-ignore-certificate-errors=localhost,127.0.0.1 scripts/seed/seed.ts --seed-db

OUTPUT:
  - ${USERS_FILE}
  - ${LISTINGS_FILE}
  - ${FILES_FILE}

NOTES:
  - Script is idempotent - running multiple times handles conflicts automatically
  - Data generation is deterministic based on index
  - Each listing gets 2-5 images and 10% get a document file
  - CosmosDB seeding uses @azure/cosmos client library
  - Requires --unsafely-ignore-certificate-errors flag for emulator connection
  `)
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

/**
 * Main execution function.
 */
async function main(): Promise<void> {
  const args = parseArgs(Deno.args)

  if (args.help) {
    showHelp()
    return
  }

  console.log('═══════════════════════════════════════════════════════════')
  console.log('  CosmosDB Seed Data Generator')
  console.log('═══════════════════════════════════════════════════════════')

  // Load existing data for idempotency
  console.log('\nLoading existing data...')
  const existing = await loadExistingData()
  console.log(`Found ${existing.userIds.length} existing users`)
  console.log(`Found ${existing.listingIds.length} existing listings`)
  console.log(`Found ${existing.fileIds.length} existing files`)

  // Determine generation parameters
  const userCount = args.users ?? DEFAULT_USER_COUNT
  const listingCount = args.listings ?? DEFAULT_LISTING_COUNT
  const startUserIndex = existing.maxUserIndex + 1
  const startListingIndex = existing.maxListingIndex + 1

  console.log('\nGeneration plan:')
  console.log(`- Users: ${userCount} (indices ${startUserIndex} to ${startUserIndex + userCount - 1})`)
  console.log(`- Listings: ${listingCount} (indices ${startListingIndex} to ${startListingIndex + listingCount - 1})`)
  console.log(`- Base date: ${DEFAULT_BASE_DATE.toISOString().split('T')[0]}`)

  // Generate seed data
  const data = generateSeedData({
    userCount,
    listingCount,
    existingUserIds: existing.userIds,
    existingListingIds: existing.listingIds,
    startUserIndex,
    startListingIndex,
    baseDate: DEFAULT_BASE_DATE,
  })

  // Write to JSON files
  await writeJsonFiles(data)

  // Optionally seed to CosmosDB
  if (args.seedDb) {
    await seedToCosmosDB(data)
  }

  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('  ✓ Seed data generation complete!')
  console.log('═══════════════════════════════════════════════════════════\n')
}

// Run main function
if (import.meta.main) {
  await main()
}
