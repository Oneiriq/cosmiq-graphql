/**
 * Tests for array operations module
 * @module
 */

import { assertEquals, assertThrows } from '@std/assert'
import { applyArrayOperation } from '../../src/handler/array-operations.ts'
import { ValidationError } from '../../src/errors/mod.ts'

Deno.test('Array Operations - SET', async (t) => {
  await t.step('replaces entire array with new array', () => {
    const result = applyArrayOperation({
      currentArray: [1, 2, 3],
      operation: { type: 'set', value: [4, 5, 6] },
    })
    assertEquals(result, [4, 5, 6])
  })

  await t.step('replaces array with single element array', () => {
    const result = applyArrayOperation({
      currentArray: [1, 2, 3],
      operation: { type: 'set', value: [10] },
    })
    assertEquals(result, [10])
  })

  await t.step('wraps non-array value in array', () => {
    const result = applyArrayOperation({
      currentArray: [1, 2, 3],
      operation: { type: 'set', value: 'single' },
    })
    assertEquals(result, ['single'])
  })

  await t.step('replaces with empty array', () => {
    const result = applyArrayOperation({
      currentArray: [1, 2, 3],
      operation: { type: 'set', value: [] },
    })
    assertEquals(result, [])
  })

  await t.step('throws ValidationError on missing value', () => {
    assertThrows(
      () => applyArrayOperation({
        currentArray: [1, 2, 3],
        operation: { type: 'set' },
      }),
      ValidationError,
      'SET operation requires a value',
    )
  })
})

Deno.test('Array Operations - APPEND', async (t) => {
  await t.step('adds single element to end', () => {
    const result = applyArrayOperation({
      currentArray: [1, 2, 3],
      operation: { type: 'append', value: 4 },
    })
    assertEquals(result, [1, 2, 3, 4])
  })

  await t.step('adds multiple elements to end', () => {
    const result = applyArrayOperation({
      currentArray: [1, 2, 3],
      operation: { type: 'append', value: [4, 5] },
    })
    assertEquals(result, [1, 2, 3, 4, 5])
  })

  await t.step('works on empty array', () => {
    const result = applyArrayOperation({
      currentArray: [],
      operation: { type: 'append', value: [1, 2] },
    })
    assertEquals(result, [1, 2])
  })

  await t.step('appends string to array', () => {
    const result = applyArrayOperation({
      currentArray: ['a', 'b'],
      operation: { type: 'append', value: 'c' },
    })
    assertEquals(result, ['a', 'b', 'c'])
  })

  await t.step('throws ValidationError on missing value', () => {
    assertThrows(
      () => applyArrayOperation({
        currentArray: [1, 2, 3],
        operation: { type: 'append' },
      }),
      ValidationError,
      'APPEND operation requires a value',
    )
  })
})

Deno.test('Array Operations - PREPEND', async (t) => {
  await t.step('adds single element to start', () => {
    const result = applyArrayOperation({
      currentArray: [2, 3, 4],
      operation: { type: 'prepend', value: 1 },
    })
    assertEquals(result, [1, 2, 3, 4])
  })

  await t.step('adds multiple elements to start', () => {
    const result = applyArrayOperation({
      currentArray: [3, 4, 5],
      operation: { type: 'prepend', value: [1, 2] },
    })
    assertEquals(result, [1, 2, 3, 4, 5])
  })

  await t.step('works on empty array', () => {
    const result = applyArrayOperation({
      currentArray: [],
      operation: { type: 'prepend', value: [1, 2] },
    })
    assertEquals(result, [1, 2])
  })

  await t.step('prepends object to array', () => {
    const result = applyArrayOperation({
      currentArray: [{ id: 2 }],
      operation: { type: 'prepend', value: { id: 1 } },
    })
    assertEquals(result, [{ id: 1 }, { id: 2 }])
  })

  await t.step('throws ValidationError on missing value', () => {
    assertThrows(
      () => applyArrayOperation({
        currentArray: [1, 2, 3],
        operation: { type: 'prepend' },
      }),
      ValidationError,
      'PREPEND operation requires a value',
    )
  })
})

Deno.test('Array Operations - REMOVE', async (t) => {
  await t.step('removes matching single element', () => {
    const result = applyArrayOperation({
      currentArray: [1, 2, 3, 2, 4],
      operation: { type: 'remove', value: 2 },
    })
    assertEquals(result, [1, 3, 4])
  })

  await t.step('removes multiple matching elements', () => {
    const result = applyArrayOperation({
      currentArray: ['a', 'b', 'c', 'b', 'd'],
      operation: { type: 'remove', value: ['b', 'd'] },
    })
    assertEquals(result, ['a', 'c'])
  })

  await t.step('returns unchanged array if no match', () => {
    const result = applyArrayOperation({
      currentArray: [1, 2, 3],
      operation: { type: 'remove', value: 5 },
    })
    assertEquals(result, [1, 2, 3])
  })

  await t.step('returns empty array when all match', () => {
    const result = applyArrayOperation({
      currentArray: [1, 1, 1],
      operation: { type: 'remove', value: 1 },
    })
    assertEquals(result, [])
  })

  await t.step('throws ValidationError on missing value', () => {
    assertThrows(
      () => applyArrayOperation({
        currentArray: [1, 2, 3],
        operation: { type: 'remove' },
      }),
      ValidationError,
      'REMOVE operation requires a value',
    )
  })
})

Deno.test('Array Operations - INSERT', async (t) => {
  await t.step('inserts at valid index', () => {
    const result = applyArrayOperation({
      currentArray: ['a', 'b', 'd'],
      operation: { type: 'insert', value: 'c', index: 2 },
    })
    assertEquals(result, ['a', 'b', 'c', 'd'])
  })

  await t.step('inserts at beginning (index 0)', () => {
    const result = applyArrayOperation({
      currentArray: [2, 3, 4],
      operation: { type: 'insert', value: 1, index: 0 },
    })
    assertEquals(result, [1, 2, 3, 4])
  })

  await t.step('inserts at end (index equals length)', () => {
    const result = applyArrayOperation({
      currentArray: [1, 2, 3],
      operation: { type: 'insert', value: 4, index: 3 },
    })
    assertEquals(result, [1, 2, 3, 4])
  })

  await t.step('inserts into empty array at index 0', () => {
    const result = applyArrayOperation({
      currentArray: [],
      operation: { type: 'insert', value: 'first', index: 0 },
    })
    assertEquals(result, ['first'])
  })

  await t.step('throws on negative index', () => {
    assertThrows(
      () => applyArrayOperation({
        currentArray: [1, 2, 3],
        operation: { type: 'insert', value: 0, index: -1 },
      }),
      ValidationError,
      'INSERT index -1 out of bounds',
    )
  })

  await t.step('throws on index beyond array length', () => {
    assertThrows(
      () => applyArrayOperation({
        currentArray: [1, 2, 3],
        operation: { type: 'insert', value: 5, index: 4 },
      }),
      ValidationError,
      'INSERT index 4 out of bounds',
    )
  })

  await t.step('throws ValidationError on missing value', () => {
    assertThrows(
      () => applyArrayOperation({
        currentArray: [1, 2, 3],
        operation: { type: 'insert', index: 1 },
      }),
      ValidationError,
      'INSERT operation requires a value',
    )
  })

  await t.step('throws ValidationError on missing index', () => {
    assertThrows(
      () => applyArrayOperation({
        currentArray: [1, 2, 3],
        operation: { type: 'insert', value: 4 },
      }),
      ValidationError,
      'INSERT operation requires an index',
    )
  })
})

Deno.test('Array Operations - SPLICE', async (t) => {
  await t.step('removes and inserts elements', () => {
    const result = applyArrayOperation({
      currentArray: ['a', 'b', 'c', 'd'],
      operation: { type: 'splice', index: 1, deleteCount: 2, value: ['x', 'y'] },
    })
    assertEquals(result, ['a', 'x', 'y', 'd'])
  })

  await t.step('removes elements without inserting (no value)', () => {
    const result = applyArrayOperation({
      currentArray: [1, 2, 3, 4, 5],
      operation: { type: 'splice', index: 1, deleteCount: 2 },
    })
    assertEquals(result, [1, 4, 5])
  })

  await t.step('inserts single value', () => {
    const result = applyArrayOperation({
      currentArray: ['a', 'b', 'd'],
      operation: { type: 'splice', index: 2, deleteCount: 0, value: 'c' },
    })
    assertEquals(result, ['a', 'b', 'c', 'd'])
  })

  await t.step('uses default deleteCount of 1', () => {
    const result = applyArrayOperation({
      currentArray: [1, 2, 3, 4],
      operation: { type: 'splice', index: 1, value: 'x' },
    })
    assertEquals(result, [1, 'x', 3, 4])
  })

  await t.step('removes all elements from index to end with large deleteCount', () => {
    const result = applyArrayOperation({
      currentArray: [1, 2, 3, 4, 5],
      operation: { type: 'splice', index: 2, deleteCount: 10 },
    })
    assertEquals(result, [1, 2])
  })

  await t.step('throws on negative index', () => {
    assertThrows(
      () => applyArrayOperation({
        currentArray: [1, 2, 3],
        operation: { type: 'splice', index: -1, deleteCount: 1 },
      }),
      ValidationError,
      'SPLICE index -1 out of bounds',
    )
  })

  await t.step('throws on index beyond array bounds', () => {
    assertThrows(
      () => applyArrayOperation({
        currentArray: [1, 2, 3],
        operation: { type: 'splice', index: 3, deleteCount: 1 },
      }),
      ValidationError,
      'SPLICE index 3 out of bounds',
    )
  })

  await t.step('throws on negative deleteCount', () => {
    assertThrows(
      () => applyArrayOperation({
        currentArray: [1, 2, 3],
        operation: { type: 'splice', index: 0, deleteCount: -1 },
      }),
      ValidationError,
      'SPLICE deleteCount must be non-negative',
    )
  })

  await t.step('throws ValidationError on missing index', () => {
    assertThrows(
      () => applyArrayOperation({
        currentArray: [1, 2, 3],
        operation: { type: 'splice', deleteCount: 1 },
      }),
      ValidationError,
      'SPLICE operation requires an index',
    )
  })
})

Deno.test('Array Operations - Error Cases', async (t) => {
  await t.step('throws on invalid operation type', () => {
    assertThrows(
      () => applyArrayOperation({
        currentArray: [1, 2, 3],
        operation: { type: 'invalid' as never },
      }),
      ValidationError,
      'Invalid array operation type: invalid',
    )
  })

  await t.step('preserves immutability - does not modify original array', () => {
    const original = [1, 2, 3]
    const result = applyArrayOperation({
      currentArray: original,
      operation: { type: 'append', value: 4 },
    })
    assertEquals(original, [1, 2, 3])
    assertEquals(result, [1, 2, 3, 4])
  })
})