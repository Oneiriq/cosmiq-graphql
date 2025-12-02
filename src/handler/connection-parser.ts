/**
 * Connection Parser Module
 * Parses CosmosDB connection strings into structured configuration
 * @module
 */

import type { CosmosDBConnection, CosmosDBSubgraphConfig } from '../types/handler.ts'
import {
  ConfigurationError,
  ConflictingAuthMethodsError,
  createErrorContext,
  InvalidConnectionStringError,
  MissingAuthMethodError,
  MissingCredentialError,
} from '../errors/mod.ts'

/**
 * Parse CosmosDB connection string
 *
 * Parses the provided connection string into endpoint and key.
 *
 * @param connectionString - CosmosDB connection string
 * @returns Parsed connection details
 * @throws Error if the connection string is invalid
 *
 * @example
 * ```ts
 * const conn = parseConnectionString('AccountEndpoint=https://myaccount.documents.azure.com:443/;AccountKey=xyz;')
 * console.log(conn.endpoint) // 'https://myaccount.documents.azure.com:443/'
 * console.log(conn.key)      // 'xyz'
 * ```
 */
export function parseConnectionString(connectionString: string): CosmosDBConnection {
  const parts = connectionString.split(';').filter((p) => p.trim())
  const config: Partial<CosmosDBConnection> = {}

  for (const part of parts) {
    const equalIndex = part.indexOf('=')
    if (equalIndex === -1) continue

    const key = part.slice(0, equalIndex).trim()
    const value = part.slice(equalIndex + 1)

    if (key === 'AccountEndpoint') {
      config.endpoint = value
    } else if (key === 'AccountKey') {
      config.key = value
    }
  }

  if (!config.endpoint || !config.key) {
    throw new InvalidConnectionStringError(
      'Invalid connection string. Expected format: AccountEndpoint=...;AccountKey=...;',
      createErrorContext({
        component: 'connection-parser',
        metadata: {
          parsedParts: {
            hasEndpoint: !!config.endpoint,
            hasKey: !!config.key,
            endpointValue: config.endpoint ? '[redacted]' : undefined,
          },
        },
      }),
    )
  }

  return config as CosmosDBConnection
}

/**
 * Parse CosmosDB connection configuration
 * Supports both connection string and managed identity authentication
 *
 * @param config - CosmosDB subgraph configuration
 * @returns Parsed connection details
 * @throws Error if authentication configuration is invalid
 *
 * @example
 * ```ts
 * // Using connection string
 * const conn1 = parseConnectionConfig({ connectionString: 'AccountEndpoint=...;AccountKey=...;' })
 *
 * // Using managed identity
 * const conn2 = parseConnectionConfig({ endpoint: 'https://myaccount.documents.azure.com:443/', credential: myCredential })
 * ```
 */
export function parseConnectionConfig(
  config: Pick<CosmosDBSubgraphConfig, 'connectionString' | 'endpoint' | 'credential'>,
): CosmosDBConnection {
  const { connectionString, endpoint, credential } = config

  const hasConnectionString = !!connectionString
  const hasManagedIdentity = !!(endpoint && credential)

  if ((endpoint && !credential) || (!endpoint && credential)) {
    throw new MissingCredentialError(
      'Invalid configuration: managed identity authentication requires both endpoint and credential.',
      createErrorContext({
        component: 'connection-parser',
        metadata: {
          providedConfig: {
            hasEndpoint: !!endpoint,
            hasCredential: !!credential,
            endpointValue: endpoint ? '[redacted]' : undefined,
          },
        },
      }),
    )
  }

  if (hasConnectionString && hasManagedIdentity) {
    throw new ConflictingAuthMethodsError(
      'Invalid configuration: cannot use both connectionString and managed identity (endpoint + credential). Please use only one authentication method.',
      createErrorContext({
        component: 'connection-parser',
        metadata: {
          providedConfig: {
            hasConnectionString,
            hasManagedIdentity,
            hasEndpoint: !!endpoint,
            hasCredential: !!credential,
          },
        },
      }),
    )
  }

  if (!hasConnectionString && !hasManagedIdentity) {
    throw new MissingAuthMethodError(
      'Invalid configuration: must provide either connectionString OR (endpoint + credential) for authentication.',
      createErrorContext({
        component: 'connection-parser',
        metadata: {
          providedConfig: {
            hasConnectionString,
            hasEndpoint: !!endpoint,
            hasCredential: !!credential,
          },
        },
      }),
    )
  }

  if (connectionString) {
    return parseConnectionString(connectionString)
  }

  if (endpoint && credential) {
    return {
      endpoint,
      credential,
    }
  }

  throw new ConfigurationError(
    'Unexpected configuration state.',
    createErrorContext({
      component: 'connection-parser',
      metadata: {
        providedConfig: {
          hasConnectionString: !!connectionString,
          hasEndpoint: !!endpoint,
          hasCredential: !!credential,
        },
      },
    }),
  )
}
