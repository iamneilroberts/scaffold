# Migration Guide

This guide covers upgrading between Scaffold versions and migrating storage data.

## Versioning Policy

Scaffold follows **Semantic Versioning 2.0.0**:

- **MAJOR** (1.0.0 → 2.0.0): Breaking changes to public API or storage format
- **MINOR** (1.0.0 → 1.1.0): New features, deprecations (backwards compatible)
- **PATCH** (1.0.0 → 1.0.1): Bug fixes, internal changes

## Checking Versions

### In Code

```typescript
import { VERSION } from '@scaffold/core';
console.log(VERSION); // "0.1.0"

// Or via server
ScaffoldServer.VERSION; // "0.1.0"
```

### In Storage

Scaffold stores version info in KV:

```typescript
// Key: _scaffold/version
{
  scaffoldVersion: "0.1.0",
  storageSchemaVersion: "1",
  installedAt: "2024-02-04T12:00:00.000Z",
  lastUpdated: "2024-02-04T12:00:00.000Z"
}
```

## Upgrade Process

### 1. Review Changelog

Before upgrading, review the changelog for:
- Breaking changes
- Deprecation warnings
- New required configuration
- Storage schema changes

### 2. Update Dependencies

```bash
# Check current version
npm list @scaffold/core

# Update to latest
npm update @scaffold/core

# Or update to specific version
npm install @scaffold/core@1.2.0
```

### 3. Run Type Check

```bash
npm run type-check
```

Fix any type errors from API changes.

### 4. Run Tests

```bash
npm test
```

Ensure all tests pass before deploying.

### 5. Deploy to Staging

```bash
npm run deploy:staging
```

Test thoroughly in staging environment.

### 6. Deploy to Production

```bash
npm run deploy:production
```

## Version-Specific Migrations

### v0.x → v1.0 (Future)

When v1.0 releases, this section will cover:

- API changes from beta
- Configuration changes
- Storage schema migrations
- Deprecation removals

## Storage Migrations

### When Migrations Are Needed

- Key structure changes (e.g., `notes:{id}` → `user:{userId}:notes:{id}`)
- Value format changes (e.g., adding required fields)
- Index structure changes
- Auth key format changes

### Migration Strategies

#### Strategy 1: Lazy Migration

Migrate data on first access. Good for large datasets.

```typescript
async function getUserWithMigration(userId: string, storage: StorageAdapter) {
  // Try new key format first
  let user = await storage.get(`user:${userId}:profile`);

  if (!user) {
    // Try legacy key format
    user = await storage.get(`users/${userId}`);

    if (user) {
      // Migrate to new format
      await storage.put(`user:${userId}:profile`, user);
      await storage.delete(`users/${userId}`);
    }
  }

  return user;
}
```

#### Strategy 2: Batch Migration

Migrate all data at once. Good for small datasets or when lazy migration isn't feasible.

```typescript
async function migrateAllUsers(storage: StorageAdapter) {
  const log = { migrated: 0, skipped: 0, errors: 0 };
  let cursor: string | undefined;

  do {
    const result = await storage.list('users/', { limit: 100, cursor });

    for (const oldKey of result.keys) {
      try {
        const user = await storage.get(oldKey);
        if (!user) continue;

        // Extract userId from old key format
        const userId = oldKey.replace('users/', '');
        const newKey = `user:${userId}:profile`;

        // Check if already migrated
        const existing = await storage.get(newKey);
        if (existing) {
          log.skipped++;
          continue;
        }

        // Migrate
        await storage.put(newKey, user);
        await storage.delete(oldKey);
        log.migrated++;

      } catch (error) {
        console.error(`Failed to migrate ${oldKey}:`, error);
        log.errors++;
      }
    }

    cursor = result.cursor;
  } while (cursor);

  return log;
}
```

#### Strategy 3: Dual-Write Migration

Write to both old and new formats during transition period.

```typescript
async function saveUser(userId: string, data: User, storage: StorageAdapter) {
  const newKey = `user:${userId}:profile`;
  const oldKey = `users/${userId}`; // Legacy format

  // Write to both during migration period
  await Promise.all([
    storage.put(newKey, data),
    storage.put(oldKey, data), // Remove after migration complete
  ]);
}
```

### Running Migrations Safely

#### 1. Backup First

Export critical data before running migrations:

```typescript
async function backupUsers(storage: StorageAdapter) {
  const backup: Record<string, unknown> = {};
  let cursor: string | undefined;

  do {
    const result = await storage.list('user:', { limit: 100, cursor });

    for (const key of result.keys) {
      backup[key] = await storage.get(key);
    }

    cursor = result.cursor;
  } while (cursor);

  // Store backup with timestamp
  await storage.put(`_backups/${Date.now()}`, backup);
  return backup;
}
```

#### 2. Test in Staging

Always run migrations in staging first:

```bash
# Export staging data
npx wrangler kv:key list --binding DATA --env staging > staging-keys.json

# Run migration
npm run migrate:staging

# Verify
npm run verify:staging
```

#### 3. Monitor Production

After production migration:

```typescript
// Add to health check
const migrationStatus = await storage.get('_scaffold/migration-status');
console.log('Migration status:', migrationStatus);
```

### Auth Index Migration

When auth configuration changes, rebuild the auth index:

```typescript
import { buildAuthIndex } from '@scaffold/core/auth';

async function rebuildAuthIndex(
  storage: StorageAdapter,
  validKeys: string[]
) {
  // Clear existing index
  const existing = await storage.list('_auth-index/');
  for (const key of existing.keys) {
    await storage.delete(key);
  }

  // Rebuild from valid keys
  for (const authKey of validKeys) {
    await buildAuthIndex(
      hashKeySync(authKey), // userId
      authKey,
      storage,
      { isAdmin: false }
    );
  }
}
```

## Deprecation Handling

### Identifying Deprecations

Deprecations are marked in TypeScript with `@deprecated` JSDoc:

```typescript
/**
 * @deprecated Use `newMethod()` instead. Will be removed in v2.0.
 */
export function oldMethod() { ... }
```

Your IDE will show strikethrough for deprecated items.

### Deprecation Timeline

1. **Deprecated** - Feature marked, alternative available
2. **Warning** - Console warning when used (optional)
3. **Removed** - Feature removed in next major version

### Example: Handling a Deprecated API

```typescript
// Old way (deprecated)
server.registerRoute('GET', '/api', handler);

// New way
server.route('GET', '/api', handler);
```

## Rollback Procedures

### Quick Rollback

If issues occur after upgrade:

```bash
# Rollback to previous deployment
npx wrangler rollback

# Or pin to specific version
npx wrangler rollback --version <deployment-id>
```

### npm Version Rollback

```bash
# Downgrade @scaffold/core
npm install @scaffold/core@0.0.9

# Redeploy
npm run deploy
```

### Data Rollback

If storage migration caused issues and you have backups:

```typescript
async function rollbackFromBackup(
  storage: StorageAdapter,
  backupTimestamp: number
) {
  const backup = await storage.get(`_backups/${backupTimestamp}`);
  if (!backup) throw new Error('Backup not found');

  for (const [key, value] of Object.entries(backup)) {
    await storage.put(key, value);
  }
}
```

## Testing Migrations

### Unit Testing

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@scaffold/core/storage';

describe('User Migration', () => {
  let storage: InMemoryAdapter;

  beforeEach(() => {
    storage = new InMemoryAdapter();
  });

  it('should migrate legacy user keys', async () => {
    // Setup legacy data
    await storage.put('users/123', { name: 'Alice' });

    // Run migration
    await migrateAllUsers(storage);

    // Verify
    const newData = await storage.get('user:123:profile');
    expect(newData).toEqual({ name: 'Alice' });

    const oldData = await storage.get('users/123');
    expect(oldData).toBeNull();
  });

  it('should skip already migrated users', async () => {
    // Setup both old and new
    await storage.put('users/123', { name: 'Old' });
    await storage.put('user:123:profile', { name: 'New' });

    // Run migration
    const log = await migrateAllUsers(storage);

    // Should skip, not overwrite
    expect(log.skipped).toBe(1);
    const data = await storage.get('user:123:profile');
    expect(data).toEqual({ name: 'New' });
  });
});
```

## Changelog Template

When releasing new versions, include:

```markdown
## [1.2.0] - 2024-02-15

### Added
- New `server.route()` fluent API for registering routes

### Changed
- Improved error messages for auth failures

### Deprecated
- `server.registerRoute()` - Use `server.route()` instead

### Fixed
- Rate limiter now correctly resets after window expires

### Security
- Updated CSP defaults to be more restrictive

### Migration Required
- None for this release
```
