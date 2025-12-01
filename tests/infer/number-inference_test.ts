/**
 * Tests for number type inference module
 * @module
 */

import { assertEquals } from 'jsr:@std/assert'
import { inferNumberType, isInteger } from '../../src/infer/number-inference.ts'

Deno.test('inferNumberType - returns Float for empty array', () => {
  const result = inferNumberType({ values: [] })
  assertEquals(result, 'Float')
})

Deno.test('inferNumberType - returns Int for all integers', () => {
  const values = [1, 2, 3, 42, 100]
  const result = inferNumberType({ values })
  assertEquals(result, 'Int')
})

Deno.test('inferNumberType - returns Float when any decimal present', () => {
  const values = [1, 2, 3.5, 4, 5]
  const result = inferNumberType({ values })
  assertEquals(result, 'Float')
})

Deno.test('inferNumberType - returns Float for all decimals', () => {
  const values = [1.1, 2.2, 3.3]
  const result = inferNumberType({ values })
  assertEquals(result, 'Float')
})

Deno.test('inferNumberType - handles negative integers', () => {
  const values = [-1, -2, -3, 0, 1, 2]
  const result = inferNumberType({ values })
  assertEquals(result, 'Int')
})

Deno.test('inferNumberType - handles negative decimals', () => {
  const values = [-1.5, -2.3, 0.5]
  const result = inferNumberType({ values })
  assertEquals(result, 'Float')
})

Deno.test('inferNumberType - handles zero', () => {
  const values = [0]
  const result = inferNumberType({ values })
  assertEquals(result, 'Int')
})

Deno.test('inferNumberType - handles large integers', () => {
  const values = [1000000, 2000000, 3000000]
  const result = inferNumberType({ values })
  assertEquals(result, 'Int')
})

Deno.test('inferNumberType - respects float config', () => {
  const values = [1, 2, 3]
  const result = inferNumberType({
    values,
    config: { numberInference: 'float' },
  })
  assertEquals(result, 'Float')
})

Deno.test('inferNumberType - strict mode detects integers', () => {
  const values = [1, 2, 3, 4, 5]
  const result = inferNumberType({
    values,
    config: { numberInference: 'strict' },
  })
  assertEquals(result, 'Int')
})

Deno.test('inferNumberType - strict mode detects floats', () => {
  const values = [1, 2, 3.14, 4, 5]
  const result = inferNumberType({
    values,
    config: { numberInference: 'strict' },
  })
  assertEquals(result, 'Float')
})

Deno.test('inferNumberType - handles single integer', () => {
  const values = [42]
  const result = inferNumberType({ values })
  assertEquals(result, 'Int')
})

Deno.test('inferNumberType - handles single decimal', () => {
  const values = [3.14]
  const result = inferNumberType({ values })
  assertEquals(result, 'Float')
})

Deno.test('inferNumberType - handles very small decimals', () => {
  const values = [0.001, 0.002, 0.003]
  const result = inferNumberType({ values })
  assertEquals(result, 'Float')
})

Deno.test('inferNumberType - uses Float as default for undefined config', () => {
  const values: number[] = []
  const result = inferNumberType({ values, config: undefined })
  assertEquals(result, 'Float')
})

Deno.test('isInteger - returns true for integers', () => {
  assertEquals(isInteger(0), true)
  assertEquals(isInteger(1), true)
  assertEquals(isInteger(-1), true)
  assertEquals(isInteger(100), true)
  assertEquals(isInteger(-100), true)
})

Deno.test('isInteger - returns false for decimals', () => {
  assertEquals(isInteger(0.5), false)
  assertEquals(isInteger(1.1), false)
  assertEquals(isInteger(-1.5), false)
  assertEquals(isInteger(3.14), false)
})

Deno.test('isInteger - handles edge cases', () => {
  assertEquals(isInteger(Number.MAX_SAFE_INTEGER), true)
  assertEquals(isInteger(Number.MIN_SAFE_INTEGER), true)
  assertEquals(isInteger(0.0), true) // 0.0 is still an integer
})

Deno.test('isInteger - handles floating point representation', () => {
  assertEquals(isInteger(1.0), true) // 1.0 is an integer
  assertEquals(isInteger(2.0), true)
  assertEquals(isInteger(1.000000001), false)
})