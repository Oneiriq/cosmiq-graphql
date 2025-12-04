# Cosmiq GraphQL

[![Deno Version](https://img.shields.io/badge/Deno-v2.5.6-green)](https://deno.land/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Data-first GraphQL for Azure CosmosDB. Automatically infers GraphQL schemas from your documents, analyzes actual data structure, generates type-safe GraphQL SDL, and integrates seamlessly with GraphQL Mesh, Hive, Yoga, and Apollo Server.

## What It Does

1. Connects to Azure CosmosDB containers
2. Samples documents to understand data structure
3. Infers JSON schemas from document patterns
4. Generates GraphQL SDL with queries, pagination, and filtering
5. Creates executable GraphQL schemas for GraphQL Mesh

**Key Feature**: Schema inference is dynamic and data-driven. No hardcoded types or business logic - the library discovers patterns directly from your data.

## Requirements

- Deno `v2.5+` or Node.js `v18+`
- Azure CosmosDB account with read access to target containers or local CosmosDB emulator
- TypeScript `v5.0+` (for development)

## Installation

cosmiq-graphql is available as both a jsr and npm package and can be installed via Deno or Node.js.

```bash
# Deno
deno add jsr:@oneiriq/cosmiq-graphql

# Node.js
npm install @oneiriq/cosmiq-graphql
```

## Usage Examples

### Basic Schema Inference

Infer schema structure from CosmosDB documents:

```typescript
import { inferSchema, sampleDocuments } from '@oneiriq/cosmiq-graphql'
import { CosmosClient } from '@azure/cosmos'

const client = new CosmosClient({
  endpoint: Deno.env.get('COSMOS_ENDPOINT')!,
  key: Deno.env.get('COSMOS_KEY')!
})

const container = client
  .database('myDatabase')
  .container('myContainer')

const documents = await sampleDocuments({
  container,
  sampleSize: 500
})

const schema = inferSchema({
  documents,
  typeName: 'Document',
  config: {
    requiredThreshold: 0.95,
    conflictResolution: 'widen'
  }
})

console.log(`Generated ${schema.stats.typesGenerated} types`)
console.log(`Analyzed ${schema.stats.fieldsAnalyzed} fields`)
console.log(`Resolved ${schema.stats.conflictsResolved} conflicts`)
```

### Generating GraphQL SDL

Convert inferred schema to GraphQL SDL:

```typescript
import { buildGraphQLSDL } from '@oneiriq/cosmiq-graphql'

const sdl = buildGraphQLSDL({
  schema,
  includeQueries: true
})

console.log(sdl)
// Output:
// type Document {
//   id: ID!
//   name: String!
//   created: String!
//   ...
// }
//
// type Query {
//   document(id: ID!, partitionKey: String): Document
//   documents(
//     limit: Int = 100,
//     partitionKey: String,
//     continuationToken: String,
//     orderBy: String,
//     orderDirection: OrderDirection = ASC
//   ): DocumentsConnection!
// }
```

### Progress Reporting

Monitor schema generation progress with optional progress callbacks:

```typescript
import { loadCosmosDBSubgraph } from '@oneiriq/cosmiq-graphql'
import type { ProgressEvent } from '@oneiriq/cosmiq-graphql'

const handler = loadCosmosDBSubgraph('MyData', {
  connectionString: Deno.env.get('COSMOS_CONNECTION_STRING')!,
  database: 'myDatabase',
  container: 'myContainer',
  sampleSize: 500,
}, (event: ProgressEvent) => {
  // Monitor progress through all stages
  console.log(`[${event.stage}] ${event.message}`)

  if (event.progress !== undefined) {
    console.log(`Progress: ${event.progress}%`)
  }

  if (event.metadata) {
    console.log('Metadata:', event.metadata)
  }
})

// Example output:
// [sampling_started] Starting document sampling (size: 500)
// [sampling_progress] Sampled 250/500 documents (12.35 RU)
// Progress: 50%
// [sampling_progress] Sampled 500/500 documents (24.70 RU)
// Progress: 100%
// [sampling_complete] Sampling complete: 500 documents (24.70 RU)
// Progress: 100%
// [inference_started] Starting schema inference for 500 documents
// [inference_complete] Schema inference complete: 5 types generated
// Progress: 100%
// [sdl_generation_started] Starting SDL generation for 5 types
// [sdl_generation_complete] SDL generation complete: 78 lines generated
// Progress: 100%
```

**Progress Events:**

The progress callback receives events with the following stages:

- `sampling_started` - Document sampling begins
- `sampling_progress` - Incremental sampling updates with percentage
- `sampling_complete` - Sampling finished with final count and RU consumed
- `inference_started` - Schema inference begins
- `inference_complete` - Schema inference complete with type count
- `sdl_generation_started` - SDL generation begins
- `sdl_generation_complete` - SDL generation complete with line count

Each event includes:

- `stage`: The current processing stage
- `progress`: Optional percentage (0-100) for quantifiable stages
- `message`: Human-readable description of the current operation
- `metadata`: Optional additional data (document counts, RU consumed, etc.)

**Use Cases:**

- Display progress bars in CLI tools
- Track RU consumption during schema generation
- Monitor long-running operations
- Debug schema generation issues
- Implement custom logging strategies

### Rate Limiting & Retry Configuration

cosmiq-graphql automatically handles rate limiting (HTTP 429) and transient errors with built-in retry logic using exponential backoff.

**Default Behavior:**

- Automatically retries on rate limits (429), service unavailable (503), and timeouts (408)
- Uses exponential backoff with jitter to prevent thundering herd
- Respects CosmosDB's `retry-after` headers
- Maximum 3 retry attempts by default
- Configurable retry budget to prevent runaway RU consumption

**Custom Retry Configuration:**

```typescript
import { loadCosmosDBSubgraph } from '@oneiriq/cosmiq-graphql'

const handler = loadCosmosDBSubgraph('MySubgraph', {
  connectionString: process.env.COSMOS_CONN!,
  database: 'db',
  container: 'items',

  // Optional: Customize retry behavior
  retry: {
    maxRetries: 5,              // Maximum retry attempts (default: 3)
    baseDelayMs: 200,           // Base delay between retries (default: 100ms)
    maxDelayMs: 60000,          // Maximum delay cap (default: 30s)
    strategy: 'exponential',    // 'exponential' | 'linear' | 'fixed' (default: exponential)
    jitterFactor: 0.1,          // Jitter percentage (default: 0.1 = 10%)
    respectRetryAfter: true,    // Use retry-after headers (default: true)
    maxRetryRUBudget: 5000,     // Max RU for retries (default: Infinity)

    // Optional: Custom retry logic
    shouldRetry: (error, attempt) => {
      // Custom predicate for when to retry
      return attempt < 5
    },

    // Optional: Monitor retry attempts
    onRetry: (error, attempt, delayMs) => {
      console.log(`Retry attempt ${attempt + 1}, waiting ${delayMs}ms`)
    }
  }
})
```

**Disable Retries:**

```typescript
const handler = loadCosmosDBSubgraph('MySubgraph', {
  connectionString: process.env.COSMOS_CONN!,
  database: 'db',
  container: 'items',
  retry: { enabled: false }
})
```

**Retry Strategies:**

- `exponential` (default) - Delay doubles each retry: 100ms → 200ms → 400ms → 800ms
- `linear` - Delay increases linearly: 100ms → 200ms → 300ms → 400ms
- `fixed` - Constant delay between retries: 100ms → 100ms → 100ms

---

### Error Handling

cosmiq-graphql provides structured error handling with rich diagnostic metadata to help debug issues while maintaining security.

#### **Error Types:**

All errors extend from `CosmosDBError` and include:

- Specific error codes for different failure scenarios
- Severity levels (low, medium, high, critical)
- Retryable flags for transient errors
- Component context showing where the error occurred
- Rich metadata for debugging (sanitized to exclude secrets)

**Common Error Types:**

```typescript
import {
  ValidationError,           // Input validation failures
  ConfigurationError,        // Configuration issues
  InvalidConnectionStringError,  // Malformed connection strings
  RateLimitError,           // CosmosDB rate limiting (429)
  QueryFailedError,         // Query execution failures
  ServiceUnavailableError   // Service unavailable (503)
} from '@oneiriq/cosmiq-graphql'
```

**Error Context:**

Every error includes diagnostic metadata that helps with debugging:

```typescript
try {
  const handler = loadCosmosDBSubgraph('MyData', {
    // Missing required fields
    database: 'myDb'
  })
} catch (error) {
  if (error instanceof ConfigurationError) {
    console.error('Configuration error:', error.message)
    console.error('Component:', error.context.component)
    console.error('Metadata:', error.context.metadata)
    // Output includes sanitized config info:
    // {
    //   providedConfig: {
    //     hasConnectionString: false,
    //     hasEndpoint: false,
    //     database: 'myDb',
    //     container: undefined
    //   }
    // }
  }
}
```

**Security Considerations:**

Error metadata is sanitized to prevent credential leakage:

- Connection strings are `'[redacted]'`
- Endpoints are `'[redacted]'`
- API keys are never included
- Tokens are never included
- Document IDs are safe to include (useful for debugging)
- Field names are safe to include
- Configuration values include only non-sensitive values

**Error Handling Best Practices:**

```typescript
import {
  CosmosDBError,
  RateLimitError,
  ValidationError
} from '@oneiriq/cosmiq-graphql'

try {
  const result = await generateSDL({
    connectionString: process.env.COSMOS_CONN!,
    database: 'myDb',
    container: 'items',
    sampleSize: 1000
  })
} catch (error) {
  if (error instanceof RateLimitError) {
    // Rate limit errors include retry-after info
    console.error('Rate limited:', error.metadata.retryAfterMs)
    // Consider backing off or reducing sample size
  } else if (error instanceof ValidationError) {
    // Validation errors include field-specific info
    console.error('Validation failed:', error.context.metadata)
    // Fix the invalid input
  } else if (error instanceof CosmosDBError) {
    // All CosmosDB errors have rich context
    console.error('Error in:', error.context.component)
    console.error('Severity:', error.severity)
    console.error('Retryable:', error.retryable)
    console.error('Details:', error.context.metadata)
  } else {
    // Unknown error
    console.error('Unexpected error:', error)
  }
}
```

**Error Serialization:**

Errors can be serialized to JSON for logging or transmission:

```typescript
try {
  // ... operation that may fail
} catch (error) {
  if (error instanceof CosmosDBError) {
    const errorJson = error.toJSON()
    // Log structured error data
    logger.error('Operation failed', errorJson)
    // Includes: name, message, code, severity, retryable, context, stack
  }
}
```

---

### GraphQL Mesh Integration

Use with GraphQL Mesh for a complete GraphQL API:

**mesh.config.ts**:

```typescript
import { defineConfig } from '@graphql-mesh/compose-cli'
import { loadCosmosDBSubgraph } from '@oneiriq/cosmiq-graphql'

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadCosmosDBSubgraph('CosmosData', {
        connectionString: Deno.env.get('COSMOS_CONNECTION_STRING')!,
        database: 'production',
        container: 'documents',
        sampleSize: 1000
      })
    }
  ]
})
```

The generated schema includes:

- Single item queries by ID with optional partition key
- List queries with pagination using continuation tokens
- Filtering by partition key
- Sorting with configurable order direction
- Connection types for paginated results

### Authentication Options

**Connection String** (simpler):

```typescript
const handler = loadCosmosDBSubgraph('Data', {
  connectionString: 'AccountEndpoint=...;AccountKey=...',
  database: 'myDb',
  container: 'myContainer'
})
```

**Managed Identity** (more secure):

```typescript
import { DefaultAzureCredential } from '@azure/identity'

const handler = loadCosmosDBSubgraph('Data', {
  endpoint: 'https://my-cosmos.documents.azure.com:443/',
  credential: new DefaultAzureCredential(),
  database: 'myDb',
  container: 'myContainer'
})
```

## API Overview

### Core Functions

- **`loadCosmosDBSubgraph(name, config)`** - Create GraphQL Mesh subgraph handler
  - Returns executable GraphQL schema from CosmosDB data
  - Main entry point for GraphQL Mesh integration

- **`inferSchema(options)`** - Infer schema from documents
  - Analyzes document structure and generates type definitions
  - Detects conflicts, required fields, and nested types

- **`buildGraphQLSDL(options)`** - Generate GraphQL SDL string
  - Converts inferred schema to GraphQL Schema Definition Language
  - Includes queries, filtering, pagination, and sorting

- **`sampleDocuments(options)`** - Sample documents from container
  - Retrieves representative sample for schema inference
  - Configurable sample size and query strategy

### Configuration Types

- **`CosmosDBSubgraphConfig`** - Subgraph handler configuration
- **`TypeSystemConfig`** - Type inference behavior settings
- **`InferSchemaOptions`** - Schema inference options

See [`src/types/handler.ts`](./src/types/handler.ts) and [`src/types/infer.ts`](./src/types/infer.ts) for complete type definitions.

## Examples

### GraphQL Yoga Server

A complete, runnable example that demonstrates serving a data-first GraphQL API using the Yoga adapter.

**Location:** [`examples/deno/yoga-server.ts`](./examples/deno/yoga-server.ts)

**Features:**

- Connects to local CosmosDB emulator
- Automatically infers schemas from multiple containers
- Serves GraphQL API with interactive GraphiQL interface
- Demonstrates pagination, filtering, and sorting
- Graceful shutdown with resource cleanup
- Cross-platform support (Windows, Mac, Linux)

**Quick Start:**

```bash
# Ensure CosmosDB emulator is running at https://localhost:8081
deno run --allow-net --allow-env --unsafely-ignore-certificate-errors=localhost,127.0.0.1 examples/deno/yoga-server.ts
```

Then open `http://localhost:4000/graphql` in your browser to access GraphiQL.

**Documentation:** See [`examples/deno/README.md`](./examples/deno/README.md) for detailed setup instructions, configuration options, troubleshooting, and example queries.

## Development

```bash
# Run tests
deno task test

# Run tests with coverage
deno task test:coverage

# Format code
deno task fmt

# Lint code
deno task lint

# Type check
deno task check
```

## License

MIT License - see [LICENSE](./LICENSE) file for details.
