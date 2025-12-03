/**
 * Tests for multi-container validation
 * @module
 */

import { assertEquals, assertThrows } from '@std/assert'
import { describe, it } from '@std/testing/bdd'
import { validateContainerConfig } from '../../src/utils/validation.ts'
import { ValidationError } from '../../src/errors/mod.ts'

describe('validateContainerConfig', () => {
  it('should accept valid config with one container', () => {
    validateContainerConfig({
      config: {
        containers: [
          { name: 'users' },
        ],
      },
    })
  })

  it('should accept valid config with multiple containers', () => {
    validateContainerConfig({
      config: {
        containers: [
          { name: 'users' },
          { name: 'listings' },
          { name: 'files' },
        ],
      },
    })
  })

  it('should accept config with custom typeNames', () => {
    validateContainerConfig({
      config: {
        containers: [
          { name: 'users', typeName: 'User' },
          { name: 'listings', typeName: 'Listing' },
          { name: 'files', typeName: 'File' },
        ],
      },
    })
  })

  it('should accept config with per-container sampleSize', () => {
    validateContainerConfig({
      config: {
        containers: [
          { name: 'users', sampleSize: 1000 },
          { name: 'listings', sampleSize: 500 },
          { name: 'files', sampleSize: 100 },
        ],
      },
    })
  })

  it('should accept config with mixed optional parameters', () => {
    validateContainerConfig({
      config: {
        containers: [
          { name: 'users', typeName: 'User', sampleSize: 1000 },
          { name: 'listings', sampleSize: 500 },
          { name: 'files', typeName: 'File' },
        ],
      },
    })
  })

  it('should throw ValidationError when containers is not specified', () => {
    assertThrows(
      () => {
        validateContainerConfig({
          config: {},
        })
      },
      ValidationError,
      'Must specify at least one container',
    )
  })

  it('should throw ValidationError when containers array is empty', () => {
    assertThrows(
      () => {
        validateContainerConfig({
          config: {
            containers: [],
          },
        })
      },
      ValidationError,
      'Must specify at least one container',
    )
  })

  it('should throw ValidationError for duplicate container names', () => {
    assertThrows(
      () => {
        validateContainerConfig({
          config: {
            containers: [
              { name: 'users' },
              { name: 'listings' },
              { name: 'users' },
            ],
          },
        })
      },
      ValidationError,
      'Duplicate container name "users" found',
    )
  })

  it('should throw ValidationError for empty container name', () => {
    assertThrows(
      () => {
        validateContainerConfig({
          config: {
            containers: [
              { name: '' },
            ],
          },
        })
      },
      ValidationError,
      'container name is required and cannot be empty',
    )
  })

  it('should throw ValidationError for whitespace-only container name', () => {
    assertThrows(
      () => {
        validateContainerConfig({
          config: {
            containers: [
              { name: '   ' },
            ],
          },
        })
      },
      ValidationError,
      'container name is required and cannot be empty',
    )
  })

  it('should throw ValidationError for empty typeName', () => {
    assertThrows(
      () => {
        validateContainerConfig({
          config: {
            containers: [
              { name: 'users', typeName: '' },
            ],
          },
        })
      },
      ValidationError,
      'typeName cannot be empty or whitespace-only when provided',
    )
  })

  it('should throw ValidationError for whitespace-only typeName', () => {
    assertThrows(
      () => {
        validateContainerConfig({
          config: {
            containers: [
              { name: 'users', typeName: '   ' },
            ],
          },
        })
      },
      ValidationError,
      'typeName cannot be empty or whitespace-only when provided',
    )
  })

  it('should throw ValidationError for invalid sampleSize (zero)', () => {
    assertThrows(
      () => {
        validateContainerConfig({
          config: {
            containers: [
              { name: 'users', sampleSize: 0 },
            ],
          },
        })
      },
      ValidationError,
      'Invalid sampleSize for container "users". Must be a positive integer',
    )
  })

  it('should throw ValidationError for invalid sampleSize (negative)', () => {
    assertThrows(
      () => {
        validateContainerConfig({
          config: {
            containers: [
              { name: 'users', sampleSize: -100 },
            ],
          },
        })
      },
      ValidationError,
      'Invalid sampleSize for container "users". Must be a positive integer',
    )
  })

  it('should throw ValidationError for invalid sampleSize (float)', () => {
    assertThrows(
      () => {
        validateContainerConfig({
          config: {
            containers: [
              { name: 'users', sampleSize: 50.5 },
            ],
          },
        })
      },
      ValidationError,
      'Invalid sampleSize for container "users". Must be a positive integer',
    )
  })

  it('should trim container names', () => {
    validateContainerConfig({
      config: {
        containers: [
          { name: '  users  ' },
          { name: '  listings  ' },
        ],
      },
    })
  })

  it('should trim typeNames', () => {
    validateContainerConfig({
      config: {
        containers: [
          { name: 'users', typeName: '  User  ' },
        ],
      },
    })
  })

  it('should detect duplicates after trimming', () => {
    assertThrows(
      () => {
        validateContainerConfig({
          config: {
            containers: [
              { name: 'users' },
              { name: '  users  ' },
            ],
          },
        })
      },
      ValidationError,
      'Duplicate container name "users" found',
    )
  })

  it('should include custom component name in error context', () => {
    try {
      validateContainerConfig({
        config: {
          containers: [],
        },
        component: 'testComponent',
      })
    } catch (error) {
      if (error instanceof ValidationError) {
        assertEquals(error.context.component, 'testComponent')
      }
    }
  })

  it('should use default component name when not provided', () => {
    try {
      validateContainerConfig({
        config: {
          containers: [],
        },
      })
    } catch (error) {
      if (error instanceof ValidationError) {
        assertEquals(error.context.component, 'validateContainerConfig')
      }
    }
  })
})