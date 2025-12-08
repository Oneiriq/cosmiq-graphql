import { assertEquals, assertThrows } from '@std/assert'
import {
  resolveOperationConfig,
  validateOperationConfig,
  getResolverName,
  isOperationEnabled,
} from '../../src/handler/operation-config-resolver.ts'
import { ConfigValidationError } from '../../src/errors/mod.ts'
import type { CRUDConfig, OperationConfig } from '../../src/types/handler.ts'

Deno.test('resolveOperationConfig - container precedence over type', () => {
  const containerConfig: OperationConfig = { include: ['read', 'update'] }
  const crudConfig: CRUDConfig = {
    typeOperations: {
      User: { include: ['read', 'create'] },
    },
  }

  const resolved = resolveOperationConfig({
    containerConfig,
    typeName: 'User',
    crudConfig,
  })

  assertEquals(resolved.include, ['read', 'update'])
})

Deno.test('resolveOperationConfig - type precedence over global', () => {
  const crudConfig: CRUDConfig = {
    defaultOperations: ['read'],
    typeOperations: {
      User: { include: ['read', 'create'] },
    },
  }

  const resolved = resolveOperationConfig({
    typeName: 'User',
    crudConfig,
  })

  assertEquals(resolved.include, ['read', 'create'])
})

Deno.test('resolveOperationConfig - container precedence over global', () => {
  const containerConfig: OperationConfig = { include: ['read', 'update', 'delete'] }
  const crudConfig: CRUDConfig = {
    defaultOperations: ['read'],
  }

  const resolved = resolveOperationConfig({
    containerConfig,
    crudConfig,
  })

  assertEquals(resolved.include, ['read', 'update', 'delete'])
})

Deno.test('resolveOperationConfig - global config only', () => {
  const crudConfig: CRUDConfig = {
    defaultOperations: ['create', 'read'],
  }

  const resolved = resolveOperationConfig({
    crudConfig,
  })

  assertEquals(resolved.include, ['create', 'read'])
})

Deno.test('resolveOperationConfig - defaults when no config provided', () => {
  const resolved = resolveOperationConfig({})

  assertEquals(resolved.include, ['read', 'create', 'update', 'delete'])
})

Deno.test('resolveOperationConfig - exclude at container level', () => {
  const containerConfig: OperationConfig = { exclude: ['delete'] }

  const resolved = resolveOperationConfig({
    containerConfig,
  })

  assertEquals(resolved.exclude, ['delete'])
})

Deno.test('resolveOperationConfig - exclude at type level', () => {
  const crudConfig: CRUDConfig = {
    typeOperations: {
      User: { exclude: ['delete', 'softDelete'] },
    },
  }

  const resolved = resolveOperationConfig({
    typeName: 'User',
    crudConfig,
  })

  assertEquals(resolved.exclude, ['delete', 'softDelete'])
})

Deno.test('resolveOperationConfig - rename precedence container > type > global', () => {
  const containerConfig: OperationConfig = {
    rename: { read: 'fetch' },
  }
  const crudConfig: CRUDConfig = {
    globalRenames: { read: 'get', create: 'add' },
    typeOperations: {
      User: { rename: { read: 'retrieve' } },
    },
  }

  const resolved = resolveOperationConfig({
    containerConfig,
    typeName: 'User',
    crudConfig,
  })

  assertEquals(resolved.rename?.read, 'fetch')
  assertEquals(resolved.rename?.create, 'add')
})

Deno.test('resolveOperationConfig - rename merging', () => {
  const crudConfig: CRUDConfig = {
    globalRenames: { read: 'get', create: 'add' },
    typeOperations: {
      User: { rename: { update: 'modify' } },
    },
  }

  const resolved = resolveOperationConfig({
    typeName: 'User',
    crudConfig,
  })

  assertEquals(resolved.rename?.read, 'get')
  assertEquals(resolved.rename?.create, 'add')
  assertEquals(resolved.rename?.update, 'modify')
})

Deno.test('validateOperationConfig - valid config with include', () => {
  const config: OperationConfig = { include: ['read', 'update'] }

  validateOperationConfig({ config })
})

Deno.test('validateOperationConfig - valid config with exclude', () => {
  const config: OperationConfig = { exclude: ['delete', 'softDelete'] }

  validateOperationConfig({ config })
})

Deno.test('validateOperationConfig - valid config with all CRUD operations', () => {
  const config: OperationConfig = {
    include: ['create', 'read', 'update', 'replace', 'delete', 'softDelete'],
  }

  validateOperationConfig({ config })
})

Deno.test('validateOperationConfig - throws on invalid operation in include', () => {
  const config = { include: ['read', 'invalid'] } as unknown as OperationConfig

  assertThrows(
    () => validateOperationConfig({ config }),
    ConfigValidationError,
    'Invalid operation',
  )
})

Deno.test('validateOperationConfig - throws on invalid operation in exclude', () => {
  const config = { exclude: ['badOp'] } as unknown as OperationConfig

  assertThrows(
    () => validateOperationConfig({ config }),
    ConfigValidationError,
    'Invalid operation',
  )
})

Deno.test('validateOperationConfig - throws on invalid operation in rename', () => {
  const config = { rename: { wrongOp: 'get' } } as unknown as OperationConfig

  assertThrows(
    () => validateOperationConfig({ config }),
    ConfigValidationError,
    'Invalid operation',
  )
})

Deno.test('validateOperationConfig - throws on conflicting include/exclude', () => {
  const config: OperationConfig = {
    include: ['read', 'update'],
    exclude: ['update', 'delete'],
  }

  assertThrows(
    () => validateOperationConfig({ config }),
    ConfigValidationError,
    'cannot be in both include and exclude',
  )
})

Deno.test('validateOperationConfig - allows non-conflicting include/exclude', () => {
  const config: OperationConfig = {
    include: ['read', 'update'],
    exclude: ['delete'],
  }

  validateOperationConfig({ config })
})

Deno.test('validateOperationConfig - includes type name in error context', () => {
  const config: OperationConfig = { include: ['invalid' as never] }

  assertThrows(
    () => validateOperationConfig({ config, typeName: 'User' }),
    ConfigValidationError,
  )
})

Deno.test('getResolverName - returns operation name when no rename', () => {
  const config: OperationConfig = {}

  assertEquals(getResolverName('read', config), 'read')
  assertEquals(getResolverName('create', config), 'create')
  assertEquals(getResolverName('update', config), 'update')
})

Deno.test('getResolverName - returns renamed operation', () => {
  const config: OperationConfig = {
    rename: { read: 'get', create: 'add' },
  }

  assertEquals(getResolverName('read', config), 'get')
  assertEquals(getResolverName('create', config), 'add')
})

Deno.test('getResolverName - returns null for hidden operation', () => {
  const config: OperationConfig = {
    rename: { delete: null },
  }

  assertEquals(getResolverName('delete', config), null)
})

Deno.test('getResolverName - handles mixed renames and nulls', () => {
  const config: OperationConfig = {
    rename: { read: 'get', delete: null, update: 'modify' },
  }

  assertEquals(getResolverName('read', config), 'get')
  assertEquals(getResolverName('delete', config), null)
  assertEquals(getResolverName('update', config), 'modify')
  assertEquals(getResolverName('create', config), 'create')
})

Deno.test('isOperationEnabled - enabled by default when no config', () => {
  const config: OperationConfig = {}

  assertEquals(isOperationEnabled('read', config), true)
  assertEquals(isOperationEnabled('create', config), true)
})

Deno.test('isOperationEnabled - enabled when in include list', () => {
  const config: OperationConfig = { include: ['read', 'update'] }

  assertEquals(isOperationEnabled('read', config), true)
  assertEquals(isOperationEnabled('update', config), true)
})

Deno.test('isOperationEnabled - disabled when not in include list', () => {
  const config: OperationConfig = { include: ['read'] }

  assertEquals(isOperationEnabled('read', config), true)
  assertEquals(isOperationEnabled('update', config), false)
  assertEquals(isOperationEnabled('delete', config), false)
})

Deno.test('isOperationEnabled - disabled when in exclude list', () => {
  const config: OperationConfig = { exclude: ['delete', 'softDelete'] }

  assertEquals(isOperationEnabled('delete', config), false)
  assertEquals(isOperationEnabled('softDelete', config), false)
  assertEquals(isOperationEnabled('read', config), true)
})

Deno.test('isOperationEnabled - exclude takes precedence over include', () => {
  const config: OperationConfig = {
    include: ['read', 'update'],
    exclude: ['update'],
  }

  assertEquals(isOperationEnabled('update', config), false)
  assertEquals(isOperationEnabled('read', config), true)
})

Deno.test('isOperationEnabled - disabled when renamed to null', () => {
  const config: OperationConfig = {
    rename: { delete: null },
  }

  assertEquals(isOperationEnabled('delete', config), false)
  assertEquals(isOperationEnabled('read', config), true)
})

Deno.test('isOperationEnabled - enabled when renamed to non-null', () => {
  const config: OperationConfig = {
    include: ['read'],
    rename: { read: 'get' },
  }

  assertEquals(isOperationEnabled('read', config), true)
})

Deno.test('isOperationEnabled - all operations when only exclude is empty', () => {
  const config: OperationConfig = { exclude: [] }

  assertEquals(isOperationEnabled('read', config), true)
  assertEquals(isOperationEnabled('create', config), true)
  assertEquals(isOperationEnabled('delete', config), true)
})

Deno.test('isOperationEnabled - none when include is empty array', () => {
  const config: OperationConfig = { include: [] }

  assertEquals(isOperationEnabled('read', config), false)
  assertEquals(isOperationEnabled('create', config), false)
})