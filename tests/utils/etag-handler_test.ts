/**
 * Tests for ETag handler utilities
 * @module
 */

import { assertEquals, assertThrows } from '@std/assert'
import {
  buildAccessCondition,
  checkETagMatch,
  normalizeETag,
} from '../../src/utils/etag-handler.ts'
import { ValidationError } from '../../src/errors/mod.ts'

Deno.test('normalizeETag', async (t) => {
  await t.step('removes surrounding double quotes', () => {
    assertEquals(normalizeETag('"123"'), '123')
  })

  await t.step('removes surrounding single quotes', () => {
    assertEquals(normalizeETag("'456'"), '456')
  })

  await t.step('handles unquoted etags', () => {
    assertEquals(normalizeETag('789'), '789')
  })

  await t.step('handles undefined', () => {
    assertEquals(normalizeETag(undefined), undefined)
  })

  await t.step('handles empty string', () => {
    assertEquals(normalizeETag(''), undefined)
  })

  await t.step('trims whitespace before normalization', () => {
    assertEquals(normalizeETag('  "abc"  '), 'abc')
  })

  await t.step('handles etag with only quotes', () => {
    assertEquals(normalizeETag('""'), '')
  })

  await t.step('handles complex etag value', () => {
    assertEquals(normalizeETag('"00000000-0000-0000-0000-000000000000"'), '00000000-0000-0000-0000-000000000000')
  })

  await t.step('does not remove inner quotes', () => {
    assertEquals(normalizeETag('"abc"def"'), 'abc"def')
  })

  await t.step('handles mismatched quotes', () => {
    assertEquals(normalizeETag('"abc\''), '"abc\'')
  })
})

Deno.test('buildAccessCondition', async (t) => {
  await t.step('creates IfMatch condition', () => {
    const condition = buildAccessCondition({
      etag: 'abc123',
      type: 'IfMatch',
    })
    assertEquals(condition, {
      type: 'IfMatch',
      condition: 'abc123',
    })
  })

  await t.step('creates IfNoneMatch condition', () => {
    const condition = buildAccessCondition({
      etag: 'xyz789',
      type: 'IfNoneMatch',
    })
    assertEquals(condition, {
      type: 'IfNoneMatch',
      condition: 'xyz789',
    })
  })

  await t.step('accepts etag with quotes', () => {
    const condition = buildAccessCondition({
      etag: '"etag-value"',
      type: 'IfMatch',
    })
    assertEquals(condition.condition, '"etag-value"')
  })

  await t.step('throws ValidationError on empty etag', () => {
    assertThrows(
      () => buildAccessCondition({
        etag: '',
        type: 'IfMatch',
      }),
      ValidationError,
      'ETag cannot be empty for access condition',
    )
  })

  await t.step('throws ValidationError on whitespace-only etag', () => {
    assertThrows(
      () => buildAccessCondition({
        etag: '   ',
        type: 'IfMatch',
      }),
      ValidationError,
      'ETag cannot be empty for access condition',
    )
  })
})

Deno.test('checkETagMatch', async (t) => {
  await t.step('returns true for matching etags', () => {
    const result = checkETagMatch({
      providedEtag: 'abc123',
      currentEtag: 'abc123',
    })
    assertEquals(result, true)
  })

  await t.step('returns true after normalization (both quoted)', () => {
    const result = checkETagMatch({
      providedEtag: '"abc123"',
      currentEtag: '"abc123"',
    })
    assertEquals(result, true)
  })

  await t.step('returns true after normalization (one quoted)', () => {
    const result = checkETagMatch({
      providedEtag: '"abc123"',
      currentEtag: 'abc123',
    })
    assertEquals(result, true)
  })

  await t.step('returns true after normalization (different quote types)', () => {
    const result = checkETagMatch({
      providedEtag: '"abc123"',
      currentEtag: "'abc123'",
    })
    assertEquals(result, true)
  })

  await t.step('returns false for different etags', () => {
    const result = checkETagMatch({
      providedEtag: 'abc123',
      currentEtag: 'xyz789',
    })
    assertEquals(result, false)
  })

  await t.step('returns true when both etags are undefined', () => {
    const result = checkETagMatch({
      providedEtag: undefined,
      currentEtag: undefined,
    })
    assertEquals(result, true)
  })

  await t.step('returns false when only providedEtag is undefined', () => {
    const result = checkETagMatch({
      providedEtag: undefined,
      currentEtag: 'abc123',
    })
    assertEquals(result, false)
  })

  await t.step('returns false when only currentEtag is undefined', () => {
    const result = checkETagMatch({
      providedEtag: 'abc123',
      currentEtag: undefined,
    })
    assertEquals(result, false)
  })

  await t.step('returns false when etags differ after normalization', () => {
    const result = checkETagMatch({
      providedEtag: '"abc"',
      currentEtag: '"xyz"',
    })
    assertEquals(result, false)
  })

  await t.step('handles empty strings as undefined', () => {
    const result = checkETagMatch({
      providedEtag: '',
      currentEtag: '',
    })
    assertEquals(result, true)
  })

  await t.step('is case-sensitive', () => {
    const result = checkETagMatch({
      providedEtag: 'ABC',
      currentEtag: 'abc',
    })
    assertEquals(result, false)
  })
})