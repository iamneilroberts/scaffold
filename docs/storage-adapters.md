# Storage Adapters

Scaffold uses a pluggable storage abstraction. This guide covers the built-in adapters and how to implement custom backends.

## Overview

All storage adapters implement the `StorageAdapter` interface:

```typescript
interface StorageAdapter {
  get<T>(key: string): Promise<T | null>;
  put<T>(key: string, value: T, options?: StoragePutOptions): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string, options?: StorageListOptions): Promise<StorageListResult>;
  getWithVersion<T>(key: string): Promise<StorageVersionedValue<T> | null>;
  putIfMatch<T>(key: string, value: T, expectedVersion: string, options?: StoragePutOptions): Promise<boolean>;
}
```

## Built-in Adapters

### InMemoryAdapter

For testing and local development. Data is lost when the process exits.

```typescript
import { InMemoryAdapter } from '@scaffold/core';

const storage = new InMemoryAdapter();

// Basic operations
await storage.put('user:123', { name: 'Alice' });
const user = await storage.get('user:123');
await storage.delete('user:123');

// With TTL (expires after 60 seconds)
await storage.put('session:abc', { token: 'xyz' }, { ttl: 60 });

// List keys by prefix
const result = await storage.list('user:');
console.log(result.keys); // ['user:123', 'user:456', ...]

// Testing utilities
storage.clear(); // Remove all entries
storage.size();  // Get entry count
```

**Key Prefix Isolation:**

```typescript
// All keys automatically prefixed with 'myapp:'
const storage = new InMemoryAdapter({ keyPrefix: 'myapp:' });

await storage.put('key', 'value'); // Stored as 'myapp:key'
await storage.get('key');          // Reads 'myapp:key'
```

### CloudflareKVAdapter

For production on Cloudflare Workers. Uses Cloudflare KV for persistence.

```typescript
import { CloudflareKVAdapter } from '@scaffold/core';

interface Env {
  MY_KV: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env) {
    const storage = new CloudflareKVAdapter(env.MY_KV);

    // Same API as InMemoryAdapter
    await storage.put('key', { data: 'value' });
    const data = await storage.get('key');

    // ...
  }
};
```

**Cloudflare KV Limits:**

| Limit | Value | Notes |
|-------|-------|-------|
| Value size | 25 MB | Consider chunking for larger values |
| Key size | 512 bytes | Includes any prefix |
| List operation | 1000 keys max | Use cursor pagination |
| Consistency | Eventually consistent | ~60s propagation |

## Optimistic Locking

Both adapters support version-based optimistic locking to prevent concurrent write conflicts.

### Manual Version Handling

```typescript
// Read value with version
const result = await storage.getWithVersion<Counter>('counter');
// result = { value: { count: 5 }, version: '3' }

// Update only if version matches
const success = await storage.putIfMatch(
  'counter',
  { count: 6 },
  result.version // '3'
);

if (!success) {
  // Another process updated the value - retry or handle conflict
}
```

### Using atomicUpdate Helper

The `storage.atomicUpdate` helper handles retries automatically:

```typescript
import { storage } from '@scaffold/core';

interface Counter {
  count: number;
}

const result = await storage.atomicUpdate<Counter>(
  adapter,
  'counter',
  (current) => ({
    count: (current?.count ?? 0) + 1
  }),
  {
    maxRetries: 3,   // Default: 3
    backoffMs: 50    // Default: 50ms, doubles each retry
  }
);

if (result.success) {
  console.log(`Updated to version ${result.version} after ${result.retries} retries`);
} else {
  console.log('Failed after max retries');
}
```

## Implementing Custom Adapters

Extend `BaseStorageAdapter` for common functionality:

```typescript
import type {
  StoragePutOptions,
  StorageListOptions,
  StorageListResult,
  StorageVersionedValue,
} from '@scaffold/core';

// Import the base class from the storage module
abstract class BaseStorageAdapter {
  protected readonly keyPrefix: string;

  constructor(options?: { keyPrefix?: string }) {
    this.keyPrefix = options?.keyPrefix ?? '';
  }

  protected prefixKey(key: string): string {
    return this.keyPrefix ? `${this.keyPrefix}${key}` : key;
  }

  protected unprefixKey(key: string): string {
    if (this.keyPrefix && key.startsWith(this.keyPrefix)) {
      return key.slice(this.keyPrefix.length);
    }
    return key;
  }
}
```

### Example: Redis Adapter

```typescript
import { createClient, type RedisClientType } from 'redis';

export class RedisAdapter extends BaseStorageAdapter {
  private client: RedisClientType;

  constructor(client: RedisClientType, options?: { keyPrefix?: string }) {
    super(options);
    this.client = client;
  }

  async get<T>(key: string): Promise<T | null> {
    const prefixedKey = this.prefixKey(key);
    const value = await this.client.get(prefixedKey);
    return value ? JSON.parse(value) : null;
  }

  async put<T>(key: string, value: T, options?: StoragePutOptions): Promise<void> {
    const prefixedKey = this.prefixKey(key);
    const serialized = JSON.stringify(value);

    if (options?.ttl) {
      await this.client.setEx(prefixedKey, options.ttl, serialized);
    } else {
      await this.client.set(prefixedKey, serialized);
    }

    // Update version in metadata key
    const versionKey = `${prefixedKey}:__version`;
    await this.client.incr(versionKey);
  }

  async delete(key: string): Promise<void> {
    const prefixedKey = this.prefixKey(key);
    await this.client.del(prefixedKey);
    await this.client.del(`${prefixedKey}:__version`);
  }

  async list(prefix: string, options?: StorageListOptions): Promise<StorageListResult> {
    const fullPrefix = this.prefixKey(prefix);
    const cursor = options?.cursor ?? '0';
    const limit = options?.limit ?? 1000;

    const result = await this.client.scan(parseInt(cursor), {
      MATCH: `${fullPrefix}*`,
      COUNT: limit,
    });

    return {
      keys: result.keys
        .filter(k => !k.endsWith(':__version'))
        .map(k => this.unprefixKey(k)),
      cursor: result.cursor === 0 ? undefined : String(result.cursor),
      complete: result.cursor === 0,
    };
  }

  async getWithVersion<T>(key: string): Promise<StorageVersionedValue<T> | null> {
    const prefixedKey = this.prefixKey(key);
    const [value, version] = await Promise.all([
      this.client.get(prefixedKey),
      this.client.get(`${prefixedKey}:__version`),
    ]);

    if (!value) return null;

    return {
      value: JSON.parse(value),
      version: version ?? '1',
    };
  }

  async putIfMatch<T>(
    key: string,
    value: T,
    expectedVersion: string,
    options?: StoragePutOptions
  ): Promise<boolean> {
    const prefixedKey = this.prefixKey(key);
    const versionKey = `${prefixedKey}:__version`;

    // Use Redis transaction for atomicity
    const currentVersion = await this.client.get(versionKey);

    if ((currentVersion ?? '0') !== expectedVersion) {
      return false;
    }

    // Note: For true atomicity, use WATCH/MULTI/EXEC
    await this.put(key, value, options);
    return true;
  }
}
```

### Example: Deno KV Adapter

```typescript
export class DenoKVAdapter extends BaseStorageAdapter {
  private kv: Deno.Kv;

  constructor(kv: Deno.Kv, options?: { keyPrefix?: string }) {
    super(options);
    this.kv = kv;
  }

  async get<T>(key: string): Promise<T | null> {
    const prefixedKey = this.prefixKey(key);
    const result = await this.kv.get<T>([prefixedKey]);
    return result.value;
  }

  async put<T>(key: string, value: T, options?: StoragePutOptions): Promise<void> {
    const prefixedKey = this.prefixKey(key);
    const expireIn = options?.ttl ? options.ttl * 1000 : undefined;
    await this.kv.set([prefixedKey], value, { expireIn });
  }

  async delete(key: string): Promise<void> {
    const prefixedKey = this.prefixKey(key);
    await this.kv.delete([prefixedKey]);
  }

  async list(prefix: string, options?: StorageListOptions): Promise<StorageListResult> {
    const fullPrefix = this.prefixKey(prefix);
    const limit = options?.limit ?? 1000;
    const keys: string[] = [];

    const iter = this.kv.list({ prefix: [fullPrefix] }, { limit });
    for await (const entry of iter) {
      keys.push(this.unprefixKey(entry.key[0] as string));
    }

    return {
      keys,
      complete: keys.length < limit,
    };
  }

  async getWithVersion<T>(key: string): Promise<StorageVersionedValue<T> | null> {
    const prefixedKey = this.prefixKey(key);
    const result = await this.kv.get<T>([prefixedKey]);

    if (result.value === null) return null;

    return {
      value: result.value,
      version: result.versionstamp ?? '1',
    };
  }

  async putIfMatch<T>(
    key: string,
    value: T,
    expectedVersion: string,
    options?: StoragePutOptions
  ): Promise<boolean> {
    const prefixedKey = this.prefixKey(key);
    const expireIn = options?.ttl ? options.ttl * 1000 : undefined;

    // Deno KV has native atomic operations
    const result = await this.kv.atomic()
      .check({ key: [prefixedKey], versionstamp: expectedVersion || null })
      .set([prefixedKey], value, { expireIn })
      .commit();

    return result.ok;
  }
}
```

## Batch Operations

Use the `storage.batchGet` and `storage.batchPut` helpers for efficient multi-key operations:

```typescript
import { storage } from '@scaffold/core';

// Fetch multiple keys in parallel
const results = await storage.batchGet<User>(adapter, [
  'user:1',
  'user:2',
  'user:3',
]);
// Returns Map<string, User>

// Write multiple keys in parallel
const entries = new Map([
  ['user:1', { name: 'Alice' }],
  ['user:2', { name: 'Bob' }],
]);
await storage.batchPut(adapter, entries, { ttl: 3600 });
```

## Best Practices

### Key Naming Conventions

```typescript
// Good: Namespaced, predictable structure
'user:123'
'user:123:settings'
'session:abc123'
'notes:user:123:note:456'

// Bad: Inconsistent, collision-prone
'123'
'user_settings_123'
'UserData'
```

### Handling Eventually Consistent Reads

Cloudflare KV has eventual consistency (~60s). For strong consistency:

1. **Use optimistic locking** for critical updates
2. **Design for idempotency** - operations should be safe to retry
3. **Consider Durable Objects** for real-time consistency requirements

### Memory Efficiency

```typescript
// For large lists, use pagination
let cursor: string | undefined;
do {
  const result = await storage.list('logs:', { limit: 100, cursor });
  for (const key of result.keys) {
    // Process each key
  }
  cursor = result.cursor;
} while (cursor);
```

### Error Handling

```typescript
import { errors } from '@scaffold/core';

try {
  await storage.put('key', value);
} catch (err) {
  return errors.createToolError({
    code: 'STORAGE_ERROR',
    message: 'Failed to save data. Please try again.',
    retryable: true,
    retryAfterMs: 1000,
  });
}
```
