import { assertEquals, assertExists } from '@std/assert'
import { Logger, logger, type LogLevel } from '../../src/utils/logger.ts'

Deno.test('Logger - default instance exists and is enabled', () => {
  assertExists(logger)
  const config = logger.getConfig()
  assertEquals(config.enabled, true)
  assertEquals(config.minLevel, 'info')
})

Deno.test('Logger - all log levels work with custom output', () => {
  const logs: Array<{ level: LogLevel; message: string; args: unknown[] }> = []
  
  const testLogger = new Logger({
    enabled: true,
    minLevel: 'debug',
    output: (level, message, ...args) => {
      logs.push({ level, message, args })
    }
  })

  testLogger.debug('debug message', { data: 1 })
  testLogger.info('info message', { data: 2 })
  testLogger.warn('warn message', { data: 3 })
  testLogger.error('error message', { data: 4 })

  assertEquals(logs.length, 4)
  assertEquals(logs[0].level, 'debug')
  assertEquals(logs[0].message, 'debug message')
  assertEquals(logs[0].args, [{ data: 1 }])
  
  assertEquals(logs[1].level, 'info')
  assertEquals(logs[1].message, 'info message')
  assertEquals(logs[1].args, [{ data: 2 }])
  
  assertEquals(logs[2].level, 'warn')
  assertEquals(logs[2].message, 'warn message')
  assertEquals(logs[2].args, [{ data: 3 }])
  
  assertEquals(logs[3].level, 'error')
  assertEquals(logs[3].message, 'error message')
  assertEquals(logs[3].args, [{ data: 4 }])
})

Deno.test('Logger - min level filtering works (info level)', () => {
  const logs: LogLevel[] = []
  
  const testLogger = new Logger({
    enabled: true,
    minLevel: 'info',
    output: (level) => {
      logs.push(level)
    }
  })

  testLogger.debug('should not appear')
  testLogger.info('should appear')
  testLogger.warn('should appear')
  testLogger.error('should appear')

  assertEquals(logs.length, 3)
  assertEquals(logs, ['info', 'warn', 'error'])
})

Deno.test('Logger - min level filtering works (warn level)', () => {
  const logs: LogLevel[] = []
  
  const testLogger = new Logger({
    enabled: true,
    minLevel: 'warn',
    output: (level) => {
      logs.push(level)
    }
  })

  testLogger.debug('should not appear')
  testLogger.info('should not appear')
  testLogger.warn('should appear')
  testLogger.error('should appear')

  assertEquals(logs.length, 2)
  assertEquals(logs, ['warn', 'error'])
})

Deno.test('Logger - min level filtering works (error level)', () => {
  const logs: LogLevel[] = []
  
  const testLogger = new Logger({
    enabled: true,
    minLevel: 'error',
    output: (level) => {
      logs.push(level)
    }
  })

  testLogger.debug('should not appear')
  testLogger.info('should not appear')
  testLogger.warn('should not appear')
  testLogger.error('should appear')

  assertEquals(logs.length, 1)
  assertEquals(logs, ['error'])
})

Deno.test('Logger - disabled logger produces no output', () => {
  const logs: LogLevel[] = []
  
  const testLogger = new Logger({
    enabled: false,
    minLevel: 'debug',
    output: (level) => {
      logs.push(level)
    }
  })

  testLogger.debug('should not appear')
  testLogger.info('should not appear')
  testLogger.warn('should not appear')
  testLogger.error('should not appear')

  assertEquals(logs.length, 0)
})

Deno.test('Logger - prefix is added to messages', () => {
  const messages: string[] = []
  
  const testLogger = new Logger({
    enabled: true,
    minLevel: 'debug',
    prefix: 'TEST',
    output: (_level, message) => {
      messages.push(message)
    }
  })

  testLogger.info('test message')

  assertEquals(messages.length, 1)
  assertEquals(messages[0], '[TEST] test message')
})

Deno.test('Logger - configure updates settings', () => {
  const logs: Array<{ level: LogLevel; message: string }> = []
  
  const testLogger = new Logger({
    enabled: true,
    minLevel: 'info',
    output: (level, message) => {
      logs.push({ level, message })
    }
  })

  testLogger.debug('should not appear')
  testLogger.info('should appear')

  assertEquals(logs.length, 1)

  // Reconfigure to allow debug
  testLogger.configure({ minLevel: 'debug' })

  testLogger.debug('now should appear')
  testLogger.info('should still appear')

  assertEquals(logs.length, 3)
  assertEquals(logs[1].level, 'debug')
  assertEquals(logs[2].level, 'info')
})

Deno.test('Logger - configure can disable logger', () => {
  const logs: LogLevel[] = []
  
  const testLogger = new Logger({
    enabled: true,
    minLevel: 'debug',
    output: (level) => {
      logs.push(level)
    }
  })

  testLogger.info('should appear')
  assertEquals(logs.length, 1)

  // Disable logging
  testLogger.configure({ enabled: false })

  testLogger.info('should not appear')
  testLogger.error('should not appear')

  assertEquals(logs.length, 1)
})

Deno.test('Logger - configure can change prefix', () => {
  const messages: string[] = []
  
  const testLogger = new Logger({
    enabled: true,
    prefix: 'OLD',
    output: (_level, message) => {
      messages.push(message)
    }
  })

  testLogger.info('message 1')
  assertEquals(messages[0], '[OLD] message 1')

  testLogger.configure({ prefix: 'NEW' })

  testLogger.info('message 2')
  assertEquals(messages[1], '[NEW] message 2')
})

Deno.test('Logger - getConfig returns current configuration', () => {
  const testLogger = new Logger({
    enabled: true,
    minLevel: 'warn',
    prefix: 'TEST'
  })

  const config = testLogger.getConfig()
  
  assertEquals(config.enabled, true)
  assertEquals(config.minLevel, 'warn')
  assertEquals(config.prefix, 'TEST')
  assertExists(config.output)
})

Deno.test('Logger - multiple arguments are passed to output', () => {
  const allArgs: unknown[][] = []
  
  const testLogger = new Logger({
    enabled: true,
    output: (_level, _message, ...args) => {
      allArgs.push(args)
    }
  })

  testLogger.info('message', 'arg1', 2, { key: 'value' })

  assertEquals(allArgs.length, 1)
  assertEquals(allArgs[0], ['arg1', 2, { key: 'value' }])
})

Deno.test('Logger - no prefix when not specified', () => {
  const messages: string[] = []
  
  const testLogger = new Logger({
    enabled: true,
    output: (_level, message) => {
      messages.push(message)
    }
  })

  testLogger.info('test message')

  assertEquals(messages.length, 1)
  assertEquals(messages[0], 'test message')
})

Deno.test('Logger - configure preserves existing output function', () => {
  let outputCalled = false
  
  const testLogger = new Logger({
    enabled: true,
    output: () => {
      outputCalled = true
    }
  })

  testLogger.configure({ minLevel: 'debug' })
  testLogger.info('test')

  assertEquals(outputCalled, true)
})

Deno.test('Logger - default output uses console methods', () => {
  // This test verifies the logger works with default console output
  // We can't easily test actual console output, but we can verify no errors
  const testLogger = new Logger({
    enabled: true,
    minLevel: 'debug'
  })

  // Should not throw
  testLogger.debug('debug test')
  testLogger.info('info test')
  testLogger.warn('warn test')
  testLogger.error('error test')
})