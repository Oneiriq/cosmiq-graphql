# CosmosDB Schemagen

[![Deno Version](https://img.shields.io/badge/Deno-v2.5.6-green)](https://deno.land/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A data-first schema generator for Azure CosmosDB that automatically infers GraphQL schemas from your documents. Analyzes actual data structure, generates type-safe GraphQL SDL, and integrates seamlessly with GraphQL Mesh.

## What It Does

1. Connects to Azure CosmosDB containers
2. Samples documents to understand data structure
3. Infers JSON schemas from document patterns
4. Generates GraphQL SDL with queries, pagination, and filtering
5. Creates executable GraphQL schemas for GraphQL Mesh

**Key Feature**: Schema inference is dynamic and data-driven. No hardcoded types or business logic - the library discovers patterns directly from your data.

## Installation

```bash
deno add jsr:@albedosehen/cosmosdb-schemagen
```

## Quick Start

Create a GraphQL Mesh subgraph from your CosmosDB container:

```typescript
import { loadCosmosDBSubgraph } from '@albedosehen/cosmosdb-schemagen'

// Create a handler for GraphQL Mesh
export const handler = loadCosmosDBSubgraph('MyData', {
  connectionString: Deno.env.get('COSMOS_CONNECTION_STRING')!,
  database: 'myDatabase',
  container: 'myContainer',
  sampleSize: 500,
  typeName: 'Document'
})
```

## Usage Examples

### Basic Schema Inference

Infer schema structure from CosmosDB documents:

```typescript
import { inferSchema, sampleDocuments } from '@albedosehen/cosmosdb-schemagen'
import { CosmosClient } from '@azure/cosmos'

// Connect to CosmosDB
const client = new CosmosClient({
  endpoint: Deno.env.get('COSMOS_ENDPOINT')!,
  key: Deno.env.get('COSMOS_KEY')!
})

const container = client
  .database('myDatabase')
  .container('myContainer')

// Sample documents
const documents = await sampleDocuments({
  container,
  sampleSize: 500
})

// Infer schema from documents
const schema = inferSchema({
  documents,
  typeName: 'Document',
  config: {
    requiredThreshold: 0.95,  // Fields present in 95%+ of documents are required
    conflictResolution: 'widen'  // Handle type conflicts by widening to most general type
  }
})

console.log(`Generated ${schema.stats.typesGenerated} types`)
console.log(`Analyzed ${schema.stats.fieldsAnalyzed} fields`)
console.log(`Resolved ${schema.stats.conflictsResolved} conflicts`)
```

### Generating GraphQL SDL

Convert inferred schema to GraphQL SDL:

```typescript
import { buildGraphQLSDL } from '@albedosehen/cosmosdb-schemagen'

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

### GraphQL Mesh Integration

Use with GraphQL Mesh for a complete GraphQL API:

**mesh.config.ts**:

```typescript
import { defineConfig } from '@graphql-mesh/compose-cli'
import { loadCosmosDBSubgraph } from '@albedosehen/cosmosdb-schemagen'

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

## Contributing

Contributions are welcome! Please ensure:

- All code passes `deno fmt`, `deno lint`, and `deno check`
- Tests are included for new features
- Follow the project's TypeScript conventions
- Update documentation for API changes

## License

MIT License - see [LICENSE](./LICENSE) file for details.
