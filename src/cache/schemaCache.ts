/**
 * Schema Cache Module
 * Provides in-memory caching with TTL and optional file persistence
 * for schema inference results to avoid expensive re-computation
 * @module
 */

import type { InferredSchema, TypeSystemConfig } from '../types/infer.ts'

/**
 * Cache configuration options
 */
export type CacheConfig = {
  /** Whether caching is enabled (default: false) */
  enabled: boolean

  /** Time-to-live in milliseconds (default: 1 hour) */
  ttlMs: number

  /** Maximum number of cache entries (default: 100) */
  maxEntries: number

  /** Optional file path for persistent cache storage */
  persistPath?: string
}

/**
 * Default cache configuration
 */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  enabled: false,
  ttlMs: 3600000, // 1 hour
  maxEntries: 100,
}

/**
 * Cache entry with metadata
 */
type CacheEntry = {
  /** The cached schema */
  schema: InferredSchema

  /** Timestamp when entry was created */
  createdAt: number

  /** Timestamp when entry expires */
  expiresAt: number

  /** Last access timestamp (for LRU) */
  lastAccessedAt: number

  /** Access count */
  accessCount: number
}

/**
 * Cache statistics
 */
export type CacheStats = {
  /** Total cache hits */
  hits: number

  /** Total cache misses */
  misses: number

  /** Current number of entries */
  size: number

  /** Maximum capacity */
  maxSize: number

  /** Hit rate percentage (0-100) */
  hitRate: number

  /** Number of evictions performed */
  evictions: number
}

/**
 * Cache key parameters
 */
export type CacheKeyParams = {
  /** Database name */
  database: string

  /** Container name */
  container: string

  /** Sample size used */
  sampleSize: number

  /** Type system configuration hash */
  configHash: string
}

/**
 * Schema cache with TTL and optional file persistence
 *
 * Features:
 * - In-memory caching with TTL expiration
 * - LRU eviction when max entries reached
 * - Optional file-based persistence
 * - Thread-safe concurrent access
 * - Statistics tracking
 *
 * @example
 * ```ts
 * const cache = new SchemaCache({
 *   enabled: true,
 *   ttlMs: 3600000, // 1 hour
 *   maxEntries: 100,
 *   persistPath: './cache/schemas.json',
 * })
 *
 * const key = cache.generateKey({
 *   database: 'mydb',
 *   container: 'users',
 *   sampleSize: 500,
 *   configHash: 'abc123',
 * })
 *
 * // Try to get cached schema
 * const cached = await cache.get(key)
 * if (cached) {
 *   console.log('Cache hit!')
 * } else {
 *   // Perform expensive inference
 *   const schema = await inferSchema(...)
 *   await cache.set(key, schema)
 * }
 * ```
 */
export class SchemaCache {
  private readonly config: CacheConfig
  private readonly cache: Map<string, CacheEntry> = new Map()
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  }
  private readonly locks: Map<string, { promise: Promise<void>; resolve: () => void }> = new Map()

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config }
  }

  /**
   * Generate a cache key from parameters
   *
   * @param params - Cache key parameters
   * @returns Cache key string
   */
  generateKey(params: CacheKeyParams): string {
    return `${params.database}:${params.container}:${params.sampleSize}:${params.configHash}`
  }

  /**
   * Generate a hash of type system configuration
   *
   * @param config - Type system configuration
   * @returns Configuration hash string
   */
  async hashConfig(config?: Partial<TypeSystemConfig>): Promise<string> {
    if (!config) {
      return 'default'
    }

    // Create stable JSON string for hashing
    const normalized = {
      conflictResolution: config.conflictResolution,
      maxNestingDepth: config.maxNestingDepth,
      nestedTypeFallback: config.nestedTypeFallback,
      numberInference: config.numberInference,
      requiredThreshold: config.requiredThreshold,
      sampleSize: config.sampleSize,
    }

    const json = JSON.stringify(normalized, Object.keys(normalized).sort())
    const encoder = new TextEncoder()
    const data = encoder.encode(json)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').substring(0, 16)
  }

  /**
   * Get cached schema if available and not expired
   *
   * @param key - Cache key
   * @returns Cached schema or undefined
   */
  async get(key: string): Promise<InferredSchema | undefined> {
    if (!this.config.enabled) {
      return undefined
    }

    // Acquire lock for this key
    await this.acquireLock(key)

    try {
      const entry = this.cache.get(key)

      if (!entry) {
        this.stats.misses++
        return undefined
      }

      const now = Date.now()

      // Check if expired
      if (now > entry.expiresAt) {
        this.cache.delete(key)
        this.stats.misses++
        return undefined
      }

      // Update access metadata (for LRU)
      entry.lastAccessedAt = now
      entry.accessCount++
      this.stats.hits++

      return entry.schema
    } finally {
      this.releaseLock(key)
    }
  }

  /**
   * Store schema in cache with TTL
   *
   * @param key - Cache key
   * @param schema - Schema to cache
   */
  async set(key: string, schema: InferredSchema): Promise<void> {
    if (!this.config.enabled) {
      return
    }

    // Acquire lock for this key
    await this.acquireLock(key)

    try {
      const now = Date.now()

      // Check if we need to evict entries
      if (this.cache.size >= this.config.maxEntries && !this.cache.has(key)) {
        this.evictLRU()
      }

      const entry: CacheEntry = {
        schema,
        createdAt: now,
        expiresAt: now + this.config.ttlMs,
        lastAccessedAt: now,
        accessCount: 0,
      }

      this.cache.set(key, entry)

      // Persist to file if configured
      if (this.config.persistPath) {
        await this.persistToFile()
      }
    } finally {
      this.releaseLock(key)
    }
  }

  /**
   * Manually invalidate a cache entry
   *
   * @param key - Cache key to invalidate
   * @returns Whether entry was removed
   */
  async invalidate(key: string): Promise<boolean> {
    if (!this.config.enabled) {
      return false
    }

    await this.acquireLock(key)

    try {
      const existed = this.cache.delete(key)

      if (existed && this.config.persistPath) {
        await this.persistToFile()
      }

      return existed
    } finally {
      this.releaseLock(key)
    }
  }

  /**
   * Clear entire cache
   */
  async clear(): Promise<void> {
    if (!this.config.enabled) {
      return
    }

    // Acquire global lock
    const globalKey = '__global__'
    await this.acquireLock(globalKey)

    try {
      this.cache.clear()
      this.stats = { hits: 0, misses: 0, evictions: 0 }

      if (this.config.persistPath) {
        await this.deletePersistentFile()
      }
    } finally {
      this.releaseLock(globalKey)
    }
  }

  /**
   * Get cache statistics
   *
   * @returns Cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: this.cache.size,
      maxSize: this.config.maxEntries,
      hitRate: Math.round(hitRate * 100) / 100,
      evictions: this.stats.evictions,
    }
  }

  /**
   * Load cache from persistent file
   */
  async loadFromFile(): Promise<void> {
    if (!this.config.enabled || !this.config.persistPath) {
      return
    }

    try {
      const data = await Deno.readTextFile(this.config.persistPath)
      const entries: Array<[string, CacheEntry]> = JSON.parse(data)

      const now = Date.now()
      let loaded = 0

      for (const [key, entry] of entries) {
        // Only load non-expired entries
        if (now <= entry.expiresAt) {
          this.cache.set(key, entry)
          loaded++
        }
      }
    } catch (error) {
      // File might not exist or be corrupted - ignore
      if (!(error instanceof Deno.errors.NotFound)) {
        console.warn(`Failed to load cache from file: ${error}`)
      }
    }
  }

  /**
   * Persist cache to file
   *
   * Writes the entire cache to a JSON file for persistent storage. Creates the
   * directory if it doesn't exist. This is called automatically after cache updates
   * when persistPath is configured.
   *
   * @example
   * ```ts
   * // Called internally after cache.set()
   * await this.persistToFile()
   * // Writes cache to configured persistPath
   * ```
   *
   * @internal
   */
  private async persistToFile(): Promise<void> {
    if (!this.config.persistPath) {
      return
    }

    try {
      const entries = Array.from(this.cache.entries())
      const data = JSON.stringify(entries, null, 2)

      // Ensure directory exists
      const dir = this.config.persistPath.substring(0, this.config.persistPath.lastIndexOf('/'))
      if (dir) {
        await Deno.mkdir(dir, { recursive: true })
      }

      await Deno.writeTextFile(this.config.persistPath, data)
    } catch (error) {
      console.warn(`Failed to persist cache to file: ${error}`)
    }
  }

  /**
   * Delete persistent file
   *
   * Removes the cache file from disk. Called when cache is cleared and file
   * persistence is enabled. Silently ignores NotFound errors (file already gone).
   *
   * @example
   * ```ts
   * // Called internally by cache.clear()
   * await this.deletePersistentFile()
   * ```
   *
   * @internal
   */
  private async deletePersistentFile(): Promise<void> {
    if (!this.config.persistPath) {
      return
    }

    try {
      await Deno.remove(this.config.persistPath)
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        console.warn(`Failed to delete cache file: ${error}`)
      }
    }
  }

  /**
   * Evict least recently used entry
   *
   * Removes the entry with the oldest lastAccessedAt timestamp when the cache
   * reaches maxEntries capacity. Uses LRU (Least Recently Used) eviction policy
   * to preserve frequently accessed entries.
   *
   * @example
   * ```ts
   * // Called internally when cache is full
   * this.evictLRU()
   * // Oldest entry removed, stats.evictions incremented
   * ```
   *
   * @internal
   */
  private evictLRU(): void {
    let oldestKey: string | undefined
    let oldestTime = Infinity

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
      this.stats.evictions++
    }
  }

  /**
   * Acquire lock for concurrent access control
   *
   * Implements a simple promise-based locking mechanism to prevent race conditions
   * when multiple operations access the same cache key concurrently. Waits for any
   * existing lock on the key to be released before proceeding.
   *
   * @param key - Cache key to lock (or '__global__' for cache-wide lock)
   *
   * @example
   * ```ts
   * // Called internally before cache operations
   * await this.acquireLock('mydb:mycont:500:abc123')
   * try {
   *   // Perform cache operation
   * } finally {
   *   this.releaseLock('mydb:mycont:500:abc123')
   * }
   * ```
   *
   * @internal
   */
  private async acquireLock(key: string): Promise<void> {
    // Wait for existing lock to be released
    while (this.locks.has(key)) {
      await this.locks.get(key)!.promise
    }

    // Create new lock
    let resolve!: () => void
    const promise = new Promise<void>((r) => {
      resolve = r
    })

    this.locks.set(key, { promise, resolve })
  }

  /**
   * Release lock for concurrent access control
   *
   * Resolves the lock promise for a key, allowing other waiting operations to proceed.
   * Must be called after acquireLock to prevent deadlocks. Typically used in a
   * try/finally block.
   *
   * @param key - Cache key to unlock
   *
   * @example
   * ```ts
   * // Always called in finally block
   * await this.acquireLock(key)
   * try {
   *   // ...
   * } finally {
   *   this.releaseLock(key)
   * }
   * ```
   *
   * @internal
   */
  private releaseLock(key: string): void {
    const lock = this.locks.get(key)
    if (lock) {
      lock.resolve()
      this.locks.delete(key)
    }
  }
}
