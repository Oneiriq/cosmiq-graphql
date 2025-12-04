# Deno GraphQL Integration Examples

This directory contains comprehensive examples demonstrating how to use `cosmiq` with various GraphQL frameworks and utilities in a Deno environment.

## Overview

Four complete, runnable examples showcasing different integration patterns:

1. **[`yoga-server.ts`](./yoga-server.ts)** - GraphQL Yoga server with interactive GraphiQL interface
2. **[`apollo-server.ts`](./apollo-server.ts)** - Apollo Server integration with GraphQL Playground
3. **[`cosmosdb-sdl-spec.ts`](./cosmosdb-sdl-spec.ts)** - SDL (Schema Definition Language) generation from CosmosDB
4. **[`cosmosdb-json-spec.ts`](./cosmosdb-json-spec.ts)** - JSON schema inference and analysis

All examples:

- Connect to a local CosmosDB emulator
- Automatically infer schemas from three sample containers (`files`, `users`, `listings`)
- Demonstrate the core functionality of `cosmiq`
- Include proper error handling and resource cleanup

## Prerequisites

Before running these examples, ensure you have:

1. **Deno** installed (v2.5.6 or later)

   ```bash
   # Check your Deno version
   deno --version
   ```

2. **Azure CosmosDB Emulator** running locally
   - Download: [Azure CosmosDB Emulator](https://docs.microsoft.com/azure/cosmos-db/local-emulator)
   - Default URI: `https://localhost:8081`
   - The emulator must be running before starting any example

3. **Sample Data** (optional but recommended)
   - The examples work with any data shape, but for best results, seed some sample data
   - Use the included seeding script: `deno task seed`
   - Or manually create containers: `files`, `users`, `listings` in database `db1`

## Quick Start Guide

### Running Examples

All examples can be run from the project root using convenience tasks defined in [`deno.json`](../../deno.json):

```bash
# GraphQL Yoga server
deno task example:yoga-server

# Apollo Server
deno task example:apollo-server

# SDL schema generation
deno task example:sdl-spec

# JSON schema inference
deno task example:json-spec
```

Alternatively, run directly with permissions:

```bash
# Any example
deno run --allow-net --allow-env --unsafely-ignore-certificate-errors=localhost,127.0.0.1 examples/deno/<example-name>.ts
```

**Note:** The `--unsafely-ignore-certificate-errors` flag is required because the CosmosDB emulator uses a self-signed certificate.

## Example 1: GraphQL Yoga Server

**File:** [`yoga-server.ts`](./yoga-server.ts)

### Description

A complete GraphQL server using [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server) that:

- Serves a data-first schema dynamically generated from CosmosDB
- Provides an interactive GraphiQL interface for exploring and testing queries
- Supports pagination, filtering, and sorting capabilities
- Handles graceful shutdown with proper resource cleanup

### Running

```bash
deno task example:yoga-server
```

### Expected Output

```text
Initializing GraphQL Yoga server with CosmosDB...
Schema generated successfully
Containers: files, users, listings
GraphQL Yoga server running at http://localhost:4000
GraphiQL available at http://localhost:4000/graphql
```

### Usage

Open your browser and navigate to `http://localhost:4000/graphql` to access the GraphiQL interface.

**Example queries:**

```graphql
# Query all users with pagination
query {
  users(limit: 10) {
    items {
      id
      name
      email
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}

# Query a specific file by ID
query {
  file(id: "file-123") {
    id
    name
    size
    created
  }
}

# Query listings with filtering
query {
  listings(partitionKey: "location-1", limit: 5) {
    items {
      id
      title
      price
    }
    pageInfo {
      hasNextPage
    }
  }
}
```

### Use Cases

- Development and testing of GraphQL APIs
- Prototyping data access patterns
- Interactive schema exploration
- Learning GraphQL query syntax

### Stopping the Server

Press `Ctrl+C` to trigger graceful shutdown:

```text
Received SIGINT, shutting down gracefully...
CosmosDB client disposed
Server shutdown complete
```

## Example 2: Apollo Server

**File:** [`apollo-server.ts`](./apollo-server.ts)

### Description

A GraphQL server using [Apollo Server](https://www.apollographql.com/docs/apollo-server/) that:

- Integrates with the `cosmiq` Apollo adapter
- Provides GraphQL Playground for schema exploration
- Demonstrates production-ready server setup
- Includes graceful shutdown handling

### Running

```bash
deno task example:apollo-server
```

### Expected Output

```text
Initializing Apollo Server with CosmosDB...
Schema generated successfully
Containers: files, users, listings
Apollo Server running at http://localhost:4000/
GraphQL Playground available at http://localhost:4000/
```

### Usage

Navigate to `http://localhost:4000/` to access the Apollo Server GraphQL Playground.

**Example query:**

```graphql
query {
  users {
    items {
      id
      name
      email
    }
  }
}
```

### Use Cases

- Production Apollo Server deployments
- Integration with Apollo Studio
- Teams familiar with Apollo ecosystem
- Advanced Apollo features (caching, federation, etc.)

### Stopping the Server

Press `Ctrl+C` for graceful shutdown:

```text
Received SIGINT, shutting down gracefully...
CosmosDB client disposed
Server shutdown complete
```

## Example 3: CosmosDB SDL Schema Generation

**File:** [`cosmosdb-sdl-spec.ts`](./cosmosdb-sdl-spec.ts)

### Description

A utility script that:

- Generates GraphQL SDL (Schema Definition Language) from CosmosDB containers
- Analyzes document structure and outputs type definitions
- Provides statistics on schema generation
- Outputs human-readable SDL schema to console

This is useful for inspecting the generated schema or exporting it for use in other tools.

### Running

```bash
deno task example:sdl-spec
```

### Expected Output

```text
Generating GraphQL SDL from CosmosDB...

Schema Generation Statistics:
- Documents Analyzed: 300
- Types Generated: 15

================================================================================
Generated SDL Schema:
================================================================================

"""File type representing documents in the files container"""
type File {
  """Unique identifier"""
  id: ID!
  
  """File name"""
  name: String!
  
  """File size in bytes"""
  size: Int!
  
  """Creation timestamp"""
  created: String!
  
  """Partition key"""
  pk: String!
}

type Query {
  """Query files by ID"""
  file(id: ID!): File
  
  """Query all files with pagination"""
  files(
    limit: Int
    continuationToken: String
    partitionKey: String
  ): FileConnection!
}

(continues with User, Listing types and their queries)
```

### Use Cases

- Schema inspection and documentation
- Exporting schemas to files for version control
- Validating inferred types before deployment
- Understanding data structure from samples
- Integration with schema registries

### Output Format

The SDL output follows GraphQL best practices:

- Type descriptions with docstrings
- Clear field naming and types
- Connection types for pagination
- Query root with filtering options

## Example 4: CosmosDB JSON Schema Inference

**File:** [`cosmosdb-json-spec.ts`](./cosmosdb-json-spec.ts)

### Description

A utility script that:

- Infers detailed schema structure from CosmosDB documents
- Outputs comprehensive JSON representation of types and fields
- Provides detailed statistics per container
- Shows nested type structures and field metadata

This is useful for programmatic schema analysis or integration with other tools.

### Running

```bash
deno task example:json-spec
```

### Expected Output

```text
Inferring schema structure from CosmosDB...

Sampling documents from files...
Inferring schema for files...
Sampling documents from users...
Inferring schema for users...
Sampling documents from listings...
Inferring schema for listings...

================================================================================
Inferred Schema Structure (JSON):
================================================================================

{
  "files": {
    "typeName": "File",
    "fields": [
      {
        "name": "id",
        "type": "ID",
        "required": true,
        "isArray": false
      },
      {
        "name": "name",
        "type": "String",
        "required": true,
        "isArray": false
      },
      {
        "name": "size",
        "type": "Int",
        "required": true,
        "isArray": false
      },
      {
        "name": "tags",
        "type": "String",
        "required": false,
        "isArray": true
      }
    ],
    "nestedTypes": [],
    "stats": {
      "totalDocuments": 100,
      "typesGenerated": 1,
      "fieldsAnalyzed": 8,
      "conflictsResolved": 0
    }
  },
  "users": {
    "typeName": "User",
    "fields": [
      {
        "name": "id",
        "type": "ID",
        "required": true,
        "isArray": false
      },
      {
        "name": "name",
        "type": "String",
        "required": true,
        "isArray": false
      }
    ],
    "nestedTypes": [],
    "stats": {
      "totalDocuments": 100,
      "typesGenerated": 1,
      "fieldsAnalyzed": 5,
      "conflictsResolved": 0
    }
  }
}
```

### Use Cases

- Programmatic schema analysis
- Data quality assessment
- Integration with custom tooling
- Exporting schema metadata for documentation
- Analyzing field coverage and types
- Identifying conflicts in data structures

### Output Details

The JSON output includes:

- **typeName**: GraphQL type name for the container
- **fields**: Array of field metadata (name, type, required, isArray)
- **nestedTypes**: Nested object type definitions
- **stats**: Analysis statistics (documents analyzed, types generated, conflicts)

## Configuration

### CosmosDB Connection

All examples use the local emulator configuration:

```typescript
const COSMOS_URI = 'https://localhost:8081'
const COSMOS_PRIMARY_KEY = 'C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=='
const CONNECTION_STRING = `AccountEndpoint=${COSMOS_URI}/;AccountKey=${COSMOS_PRIMARY_KEY}`
const DATABASE = 'db1'
```

**For production use**, replace with environment variables:

```typescript
const COSMOS_URI = Deno.env.get('COSMOS_URI')!
const COSMOS_PRIMARY_KEY = Deno.env.get('COSMOS_PRIMARY_KEY')!
const DATABASE = Deno.env.get('COSMOS_DATABASE') ?? 'db1'
```

### Container Configuration

All server examples use three containers:

```typescript
containers: [
  { name: 'files', typeName: 'File' },
  { name: 'users', typeName: 'User' },
  { name: 'listings', typeName: 'Listing' },
]
```

To add or modify containers, edit this array in the respective example file.

### Server Port Configuration

Server examples (Yoga, Apollo) default to port 4000:

```typescript
const PORT = 4000
```

Customize by modifying the `PORT` constant in the example file.

## Troubleshooting

### TLS Certificate Warning

**Issue:** Browser shows 'Your connection is not private' or similar warning.

**Cause:** The CosmosDB emulator uses a self-signed certificate.

**Solution:** This is expected for local development. Click 'Advanced' and 'Proceed to localhost' in your browser. The `--unsafely-ignore-certificate-errors` flag handles this for server connections.

### CosmosDB Connection Failed

**Issue:** Example fails to start with connection error.

**Solution:**

1. Verify the CosmosDB emulator is running
2. Confirm it's accessible at `https://localhost:8081`
3. Restart the emulator if necessary
4. Ensure no firewall is blocking port 8081

### Empty Schema Generated

**Issue:** Schema has no types or queries.

**Solution:**

1. Verify database `db1` exists in the emulator
2. Confirm containers `files`, `users`, and `listings` exist
3. Check that containers have documents (seed data if needed)
4. Review console output for sampling warnings

### Port Already in Use

**Issue:** Error: 'Address already in use' on port 4000.

**Solution:**

1. Stop any process using port 4000
2. Or modify the `PORT` constant in the example file
3. On Unix: `lsof -ti:4000` then `kill -9 <pid>`
4. On Windows: Use Task Manager or `netstat -ano | findstr :4000`

### Windows SIGTERM Not Supported

**Issue:** Warning about SIGTERM on Windows.

**Context:** Windows doesn't support SIGTERM signal.

**Solution:** No action needed. Use `Ctrl+C` (SIGINT) to stop servers. The examples detect the OS and conditionally register SIGTERM:

```typescript
if (Deno.build.os !== 'windows') {
  Deno.addSignalListener('SIGTERM', () => shutdown('SIGTERM'))
}
```

### Schema Generation Errors

**Issue:** Errors during SDL or JSON schema generation.

**Solution:**

1. Ensure containers have valid JSON documents
2. Check document structure consistency
3. Verify partition key field exists (`pk`)
4. Increase sample size if coverage is low
5. Review error messages for specific field conflicts

## Performance Notes

### Schema Generation

- Schema inference samples documents from each container
- Default sample size: 100 documents per container
- Larger sample sizes produce more accurate schemas but take longer
- First run may be slower as schemas are generated
- Schema generation is one-time per container

### Server Query Performance

- Queries use CosmosDB's native pagination with continuation tokens
- Default page size: 100 items
- Partition key filtering significantly improves performance
- Consider adding indexes in production environments
- Monitor RU (Request Unit) consumption

### SDL and JSON Generation

- Both utilities are single-run scripts (no server overhead)
- Processing time scales with sample size and document complexity
- Nested types increase generation time
- Output to console is immediate (no file I/O overhead)

## Windows Compatibility

All examples are fully compatible with Windows, with one notable difference:

**Signal Handling:**

- **Linux/Mac:** Supports both SIGINT (`Ctrl+C`) and SIGTERM
- **Windows:** Only supports SIGINT (`Ctrl+C`)

The code automatically detects the operating system and only registers SIGTERM on non-Windows platforms:

```typescript
if (Deno.build.os !== 'windows') {
  Deno.addSignalListener('SIGTERM', () => shutdown('SIGTERM'))
}
Deno.addSignalListener('SIGINT', () => shutdown('SIGINT'))
```

## Next Steps

After running these examples, explore:

1. **Modify schemas:** Edit container configurations to include/exclude fields
2. **Add custom resolvers:** Extend generated schemas with custom business logic
3. **Integrate with other services:** Combine CosmosDB data with other data sources
4. **Deploy to production:** Set up environment variables and connection strings
5. **Explore other adapters:** Try the [Hive adapter](../../src/adapters/hive.ts) or [Mesh adapter](../../src/adapters/mesh.ts)
6. **Export schemas:** Use SDL output for schema registries or documentation
7. **Analyze data quality:** Use JSON output to assess field coverage and consistency

## Related Documentation

- [GraphQL Yoga Documentation](https://the-guild.dev/graphql/yoga-server/docs)
- [Apollo Server Documentation](https://www.apollographql.com/docs/apollo-server/)
- [CosmosDB Emulator Setup](https://docs.microsoft.com/azure/cosmos-db/local-emulator)
- [Main Project README](../../README.md)
- [Yoga Adapter Source](../../src/adapters/yoga.ts)
- [Apollo Adapter Source](../../src/adapters/apollo.ts)
- [Generic Adapter Source](../../src/adapters/generic.ts)

## Support

For issues or questions:

- Check the [main README](../../README.md) for general usage
- Review [troubleshooting section](#troubleshooting) above
- Open an issue on GitHub
