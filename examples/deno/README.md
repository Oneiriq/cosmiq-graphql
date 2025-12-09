# Deno GraphQL Integration Examples

This directory contains comprehensive examples demonstrating how to use `cosmiq-graphql` with various GraphQL frameworks and utilities in a Deno environment.

## Overview

Several examples are provided, each showcasing different integrations and features.

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

All examples can be run from example deno project using convenience tasks defined in [`deno.json`](./deno.json):

```bash
# Any example
deno run --allow-net --allow-env --unsafely-ignore-certificate-errors=localhost,127.0.0.1 examples/deno/<example-name>.ts
```

**Note:** The `--unsafely-ignore-certificate-errors` flag is required because the CosmosDB emulator uses a self-signed certificate.
