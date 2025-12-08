# Node.js GraphQL Integration Examples

## Reference vs. Executable Examples

**These Node.js examples are references** - they show the integration patterns but cannot run directly because:

1. The package is designed and optimized for Deno
2. Deno-specific APIs need Node.js equivalents
3. Import paths and module resolution differ
4. npm package installation is required

**For executable examples**, see the [Deno examples](../deno/) which run immediately with `deno task` commands.

## Available Reference Examples

All four examples mirror the Deno implementations:

1. **[`yoga-server.ts`](./yoga-server.ts)** - GraphQL Yoga server integration
2. **[`apollo-server.ts`](./apollo-server.ts)** - Apollo Server integration
3. **[`cosmosdb-sdl-spec.ts`](./cosmosdb-sdl-spec.ts)** - SDL schema generation utility
4. **[`cosmosdb-json-spec.ts`](./cosmosdb-json-spec.ts)** - JSON schema inference utility

## What Each Example Demonstrates

### 1. GraphQL Yoga Server ([`yoga-server.ts`](./yoga-server.ts))

**Purpose:** Shows how to integrate `cosmiq-graphql` with GraphQL Yoga in Node.js

**Key Features:**

- Yoga adapter usage with CosmosDB connection
- Interactive GraphiQL interface setup
- Graceful shutdown handling
- Multi-container schema generation

**Use Cases:**

- Building GraphQL APIs with Yoga in Node.js
- Serving CosmosDB data through GraphQL
- Development and testing environments

### 2. Apollo Server ([`apollo-server.ts`](./apollo-server.ts))

**Purpose:** Demonstrates Apollo Server integration patterns

**Key Features:**

- Apollo adapter configuration
- GraphQL Playground setup
- Production-ready server structure
- Context management

**Use Cases:**

- Production Apollo Server deployments
- Enterprise GraphQL implementations
- Apollo ecosystem integration

### 3. SDL Schema Generation ([`cosmosdb-sdl-spec.ts`](./cosmosdb-sdl-spec.ts))

**Purpose:** Shows how to generate SDL (Schema Definition Language) output

**Key Features:**

- Generic adapter usage for SDL generation
- Document sampling configuration
- Statistics and metrics output
- Console-based schema inspection

**Use Cases:**

- Schema inspection and validation
- Documentation generation
- Schema registry integration
- Version control for schemas

### 4. JSON Schema Inference ([`cosmosdb-json-spec.ts`](./cosmosdb-json-spec.ts))

**Purpose:** Demonstrates programmatic schema analysis

**Key Features:**

- Direct use of inference functions
- Detailed field metadata extraction
- Nested type analysis
- JSON output format for tooling integration

**Use Cases:**

- Programmatic schema analysis
- Data quality assessment
- Integration with custom tooling
- Automated documentation pipelines

### 5. Custom Resolver Customization ([`custom-resolvers.ts`](./custom-resolvers.ts))

**Purpose:** Shows how to extend auto-generated resolvers with custom business logic

**Key Features:**

- Wrapping base resolvers with logging and side effects
- Adding custom query resolvers
- Creating computed fields
- Cross-container data aggregation

**Use Cases:**

- Adding business logic on top of CRUD operations
- Implementing audit logging
- Triggering notifications and webhooks
- Aggregating data from multiple containers
- Creating derived/computed fields

## Adapting for Node.js

To use these examples in your Node.js project, follow these steps:

### Step 1: Install Required Packages

```bash
# For all examples
npm install @azure/cosmos graphql

# For Yoga server example
npm install graphql-yoga

# For Apollo server example
npm install @apollo/server

# TypeScript users (recommended)
npm install --save-dev typescript @types/node
```

### Step 2: Replace Deno-Specific APIs

The reference examples use Deno APIs that need Node.js equivalents:

#### Environment Variables

**Deno:**

```typescript
const COSMOS_URI = Deno.env.get('COSMOS_URI')
```

**Node.js:**

```typescript
const COSMOS_URI = process.env.COSMOS_URI
```

#### Signal Handling

**Deno:**

```typescript
Deno.addSignalListener('SIGINT', () => shutdown('SIGINT'))
```

**Node.js:**

```typescript
process.on('SIGINT', () => shutdown('SIGINT'))
```

#### Process Exit

**Deno:**

```typescript
Deno.exit(0)
```

**Node.js:**

```typescript
process.exit(0)
```

#### Platform Detection

**Deno:**

```typescript
if (Deno.build.os !== 'windows') { }
```

**Node.js:**

```typescript
if (process.platform !== 'win32') { }
```

### Step 3: Adjust Import Paths

The reference examples use Deno-style import paths. Adapt them for your Node.js project structure:

**Deno Reference:**

```typescript
import { createYogaAdapter } from '../../src/adapters/yoga.ts'
```

**Node.js (if using the npm package):**

```typescript
import { createYogaAdapter } from 'cosmiq-graphql/adapters/yoga'
```

**Node.js (if building from source):**

```typescript
import { createYogaAdapter } from './src/adapters/yoga.js'
```

### Step 4: Configure TypeScript (Optional but Recommended)

Create or update `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "./dist"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

### Step 5: Update Package Scripts

Add scripts to your `package.json`:

```json
{
  "scripts": {
    "yoga-server": "node examples/nodejs/yoga-server.js",
    "apollo-server": "node examples/nodejs/apollo-server.js",
    "sdl-spec": "node examples/nodejs/cosmosdb-sdl-spec.js",
    "json-spec": "node examples/nodejs/cosmosdb-json-spec.js"
  }
}
```

For TypeScript:

```json
{
  "scripts": {
    "build": "tsc",
    "yoga-server": "node dist/examples/nodejs/yoga-server.js",
    "apollo-server": "node dist/examples/nodejs/apollo-server.js"
  }
}
```

## Complete Adaptation Example

Here's a complete example of adapting the Yoga server for Node.js:

**Original Deno Reference ([`yoga-server.ts`](./yoga-server.ts)):**

```typescript
import { createYogaAdapter } from '../../src/adapters/yoga.ts'

const COSMOS_URI = Deno.env.get('COSMOS_URI') ?? 'https://localhost:8081'

Deno.addSignalListener('SIGINT', () => shutdown('SIGINT'))
```

**Adapted for Node.js:**

```typescript
import { createYogaAdapter } from 'cosmiq-graphql/adapters/yoga'

const COSMOS_URI = process.env.COSMOS_URI ?? 'https://localhost:8081'

process.on('SIGINT', () => shutdown('SIGINT'))
```

## Configuration

### CosmosDB Connection

All reference examples use the local emulator configuration:

```typescript
const COSMOS_URI = 'https://localhost:8081'
const COSMOS_PRIMARY_KEY = 'C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=='
const CONNECTION_STRING = `AccountEndpoint=${COSMOS_URI}/;AccountKey=${COSMOS_PRIMARY_KEY}`
const DATABASE = 'db1'
```

**For production**, use environment variables:

```typescript
const COSMOS_URI = process.env.COSMOS_URI!
const COSMOS_PRIMARY_KEY = process.env.COSMOS_PRIMARY_KEY!
const DATABASE = process.env.COSMOS_DATABASE ?? 'db1'
```

### Container Setup

All examples expect three containers in the `db1` database:

- `files` - Mapped to `File` type
- `users` - Mapped to `User` type
- `listings` - Mapped to `Listing` type

Create these in your CosmosDB emulator or Azure instance before running.

## Key Differences from Deno

When adapting these examples, be aware of these differences:

### Module System

- **Deno:** Native ES modules with `.ts` extensions in imports
- **Node.js:** Requires build step for TypeScript or use `.js` with CommonJS/ESM

### Top-Level Await

- **Deno:** Fully supported natively
- **Node.js:** Supported in ES modules (Node 14.8+) with `"type": "module"` in package.json

### File Extensions

- **Deno:** Requires explicit `.ts` extensions in imports
- **Node.js:** Extensions are typically omitted or use `.js`

### Standard Library

- **Deno:** Has built-in utilities in `Deno.*` namespace
- **Node.js:** Uses `process`, `fs`, `path`, etc. from Node.js APIs

### Testing

- **Deno:** Built-in test runner (`deno test`)
- **Node.js:** Requires test framework (Jest, Mocha, etc.)

## Running Adapted Examples

After adaptation, run examples like standard Node.js applications:

```bash
# Direct execution (JavaScript)
node examples/nodejs/yoga-server.js

# With TypeScript compilation
npm run build
node dist/examples/nodejs/yoga-server.js

# Using ts-node (development)
npx ts-node examples/nodejs/yoga-server.ts

# Using tsx (development)
npx tsx examples/nodejs/yoga-server.ts
```

## Troubleshooting Node.js Adaptations

### Module Resolution Errors

**Issue:** `Cannot find module` errors

**Solution:**

- Ensure npm packages are installed
- Check `tsconfig.json` moduleResolution setting
- Verify import paths match your project structure
- Use `.js` extensions in imports if using ES modules

### TypeScript Compilation Errors

**Issue:** Type errors during build

**Solution:**

- Install type definitions: `npm install --save-dev @types/node`
- Check TypeScript version compatibility
- Adjust `tsconfig.json` settings
- Use `skipLibCheck: true` as temporary workaround

### Environment Variable Issues

**Issue:** Cannot read environment variables

**Solution:**

- Use `process.env` instead of `Deno.env.get()`
- For `.env` file support, install `dotenv`: `npm install dotenv`
- Load at app start: `import 'dotenv/config'`

### Signal Handling on Windows

**Issue:** SIGTERM not working on Windows

**Solution:**

- Use only SIGINT for Windows: `process.platform !== 'win32'`
- Same pattern as Deno examples but with `process.platform`

### CosmosDB Connection Errors

**Issue:** TLS certificate errors with emulator

**Solution:**

- Set `NODE_TLS_REJECT_UNAUTHORIZED=0` for local emulator (development only)
- Or configure CosmosDB client to disable TLS verification
- **Never disable TLS verification in production**

## npm Package Availability

The `cosmiq-graphql` package may be available on npm. Check for:

```bash
npm search cosmiq-graphql
```

If not yet published, you can:

1. Clone the repository
2. Build from source using the build script
3. Install locally: `npm install /path/to/cosmiq-graphql`

## Recommended Workflow

For Node.js developers, we recommend:

1. **Start with Deno examples** - Run the [executable Deno examples](../deno/) to understand the functionality
2. **Review Node.js references** - Study these reference files to see the patterns
3. **Adapt incrementally** - Convert one example at a time to Node.js
4. **Test thoroughly** - Ensure each adaptation works in your environment
5. **Customize for your needs** - Extend with project-specific requirements

## Production Considerations

When deploying adapted examples to production:

### Security

- Never commit credentials or connection strings
- Use Azure Key Vault or similar for secrets management
- Enable TLS/SSL certificate validation
- Implement proper authentication and authorization

### Performance

- Consider schema caching strategies
- Monitor CosmosDB RU consumption
- Implement proper error handling and retries
- Set appropriate timeouts

### Monitoring

- Add logging with structured formats (JSON)
- Integrate with Application Insights or similar
- Track schema generation performance
- Monitor query execution times

### Deployment

- Use environment variables for all configuration
- Implement health check endpoints
- Set up proper process managers (PM2, etc.)
- Configure graceful shutdown handling

## Related Resources

### Executable Examples

**For working examples**, see the [Deno version](../deno/README.md) which includes:

- Ready-to-run examples with `deno task` commands
- Complete documentation for each example
- Troubleshooting guides
- Performance notes

### Documentation

- [Main Project README](../../README.md) - Overview and core concepts
- [GraphQL Yoga Documentation](https://the-guild.dev/graphql/yoga-server/docs)
- [Apollo Server Documentation](https://www.apollographql.com/docs/apollo-server/)
- [Azure CosmosDB SDK for JavaScript](https://docs.microsoft.com/azure/cosmos-db/sql/sql-api-sdk-node)

### Source Code

- [Yoga Adapter Source](../../src/adapters/yoga.ts)
- [Apollo Adapter Source](../../src/adapters/apollo.ts)
- [Generic Adapter Source](../../src/adapters/generic.ts)
- [Core Handler](../../src/handler/mod.ts)

## Support

For help with Node.js adaptations:

1. Review the [Deno examples](../deno/) for working implementations
2. Check the [main README](../../README.md) for core concepts
3. Review adapter source code for integration details
4. Open an issue on GitHub with:
   - Node.js version
   - Package versions used
   - Error messages or unexpected behavior
   - Code snippets showing your adaptation

## Contributing

If you successfully adapt these examples for Node.js:

1. Consider contributing your working implementation
2. Share patterns that work well in Node.js environments
3. Report issues specific to Node.js integration
4. Help improve these reference examples

---

**Remember:** These are reference implementations to guide your Node.js integration. For immediately executable examples with full documentation, use the [Deno examples](../deno/).
