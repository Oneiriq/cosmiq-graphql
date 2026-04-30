/**
 * Unit tests for core adapter helpers.
 *
 * Specifically: regression tests for the local-emulator gate that controls
 * whether the CosmosDB client is created with `rejectUnauthorized: false`
 * (CodeQL js/disabling-certificate-validation).
 *
 * @module
 */

import { assertEquals } from '@std/assert'
import { isLocalEmulatorEndpoint } from '../../src/adapters/core.ts'

Deno.test('isLocalEmulatorEndpoint - accepts localhost host', () => {
  assertEquals(isLocalEmulatorEndpoint('https://localhost:8081/'), true)
  assertEquals(isLocalEmulatorEndpoint('http://localhost:8081'), true)
})

Deno.test('isLocalEmulatorEndpoint - accepts 127.0.0.1 host', () => {
  assertEquals(isLocalEmulatorEndpoint('https://127.0.0.1:8081/'), true)
  assertEquals(isLocalEmulatorEndpoint('http://127.0.0.1'), true)
})

Deno.test('isLocalEmulatorEndpoint - rejects production hosts', () => {
  assertEquals(
    isLocalEmulatorEndpoint('https://my-cosmos.documents.azure.com:443/'),
    false,
  )
})

Deno.test('isLocalEmulatorEndpoint - rejects attacker-controlled spoofs', () => {
  // Regression: previous `endpoint.includes('localhost')` would match these
  // and silently disable TLS verification on a remote host.
  assertEquals(isLocalEmulatorEndpoint('https://evil.com/?spoof=localhost'), false)
  assertEquals(isLocalEmulatorEndpoint('https://localhost.evil.com/'), false)
  assertEquals(isLocalEmulatorEndpoint('https://evil.com/127.0.0.1'), false)
  assertEquals(isLocalEmulatorEndpoint('https://127.0.0.1.evil.com/'), false)
})

Deno.test('isLocalEmulatorEndpoint - rejects malformed URLs', () => {
  assertEquals(isLocalEmulatorEndpoint('not a url'), false)
  assertEquals(isLocalEmulatorEndpoint(''), false)
})
