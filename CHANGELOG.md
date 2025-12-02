# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-12-01

### Added

- **Rate Limiting & Retry Logic**: Automatic retry handling for CosmosDB rate limits and transient errors
  - Exponential backoff with configurable jitter to prevent thundering herd
  - Respects CosmosDB's `retry-after` headers
  - Supports custom retry strategies: exponential (default), linear, or fixed delays
  - RU budget tracking to prevent excessive retry costs
  - Custom retry predicates and callbacks for monitoring
  - New error classes: `RateLimitError`, `ServiceUnavailableError`, `RequestTimeoutError`
  - Comprehensive test coverage (124+ test cases)

- **Framework Adapter Architecture**: New adapter layer for supporting multiple GraphQL frameworks
  - `src/adapters/core.ts` - Shared core schema building logic for all adapters
  - `src/adapters/generic.ts` - Standalone SDL generation (framework-agnostic)
  - `src/adapters/mesh.ts` - GraphQL Mesh adapter (migrated from handler)
  - New `buildCoreSchema()` function for advanced use cases
  - Subpath exports: `/generic` and `/mesh`

- **Generic SDL Adapter**: Generate standalone GraphQL SDL from CosmosDB without framework dependencies
  - New `generateSDL()` function for framework-agnostic schema generation
  - Supports both connection string and managed identity authentication
  - Optional file output with `outputPath` parameter
  - Comprehensive statistics (documents analyzed, types generated)
  - Use cases: documentation, static analysis, custom GraphQL implementations

### Changed

- [`CosmosDBSubgraphConfig`](src/types/handler.ts) now includes optional `retry` configuration
- All CosmosDB operations (sampling, queries, reads) now automatically retry on transient errors
- Error handling enhanced with detailed metadata (status codes, activity IDs, retry-after values)

- **Architecture Refactoring**: Extracted shared schema building logic into core module
  - GraphQL Mesh functionality now uses `buildCoreSchema()` internally
  - Same behavior with cleaner separation of concerns
  - Client lifecycle properly managed (stays alive for resolvers)
- Added `src/adapters/` directory for framework-specific adapters
- Updated `deno.json` exports to include `/generic` and `/mesh` subpaths
- Enhanced `mod.ts` to export adapter functions and types
- Improved authentication handling to support both connection string and endpoint+credential patterns

### Fixed

- CosmosDB operations no longer fail immediately on rate limiting (HTTP 429)
- Improved resilience against temporary service unavailability (HTTP 503)
- Better handling of request timeouts (HTTP 408)

## [0.0.1] - 2025-11-30

### Added

- Initial release of CosmosDB Schemagen
- Automatic GraphQL schema generation from CosmosDB containers
- Basic query and mutation support
