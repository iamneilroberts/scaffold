# Storage Health

This guide covers monitoring, diagnosing, and maintaining the health of your Scaffold storage.

## Overview

Storage health involves:
- Monitoring key counts and patterns
- Detecting orphaned or stale data
- Validating index consistency
- Tracking storage usage

## Built-in Health Tools

### scaffold:health_check

Basic server health check:

```bash
curl -X POST https://your-app.workers.dev \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "scaffold:health_check"
    }
  }'
```

Response:
```json
{
  "status": "ok",
  "version": "0.1.0",
  "timestamp": "2024-02-04T12:00:00.000Z"
}
```

### scaffold:list_keys (Admin Only)

List storage keys by prefix:

```bash
curl -X POST https://your-app.workers.dev \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-admin-key" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "scaffold:list_keys",
      "arguments": {
        "prefix": "user:",
        "limit": 100
      }
    }
  }'
```

### scaffold:debug_info (Admin Only)

Get detailed debug information:

```bash
curl -X POST https://your-app.workers.dev \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-admin-key" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "scaffold:debug_info"
    }
  }'
```

## Storage Diagnostics

### Key Count Analysis

Analyze key distribution across prefixes:

```typescript
async function analyzeKeyDistribution(storage: StorageAdapter) {
  const prefixes = ['user:', 'shared:', 'index:', '_auth-index/', '_scaffold/'];
  const stats: Record<string, number> = {};

  for (const prefix of prefixes) {
    const result = await storage.list(prefix);
    stats[prefix] = result.keys.length;

    // For large datasets, count with pagination
    if (!result.complete) {
      let cursor = result.cursor;
      while (cursor) {
        const more = await storage.list(prefix, { cursor });
        stats[prefix] += more.keys.length;
        cursor = more.cursor;
      }
    }
  }

  return stats;
}

// Usage
const distribution = await analyzeKeyDistribution(storage);
console.log(distribution);
// { 'user:': 1523, 'shared:': 45, 'index:': 1523, '_auth-index/': 1523, '_scaffold/': 2 }
```

### Orphan Detection

Find keys that should have corresponding data but don't:

```typescript
async function findOrphanedIndexes(storage: StorageAdapter) {
  const orphans: string[] = [];
  let cursor: string | undefined;

  do {
    const result = await storage.list('index:email:', { limit: 100, cursor });

    for (const indexKey of result.keys) {
      const userId = await storage.get(indexKey);
      if (userId) {
        const user = await storage.get(`user:${userId}`);
        if (!user) {
          orphans.push(indexKey);
        }
      }
    }

    cursor = result.cursor;
  } while (cursor);

  return orphans;
}
```

### Stale Data Detection

Find data that hasn't been updated recently:

```typescript
interface TimestampedData {
  updatedAt: string;
  [key: string]: unknown;
}

async function findStaleData(
  storage: StorageAdapter,
  prefix: string,
  maxAgeDays: number
) {
  const stale: string[] = [];
  const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
  let cursor: string | undefined;

  do {
    const result = await storage.list(prefix, { limit: 100, cursor });

    for (const key of result.keys) {
      const data = await storage.get<TimestampedData>(key);
      if (data?.updatedAt) {
        const updated = new Date(data.updatedAt).getTime();
        if (updated < cutoff) {
          stale.push(key);
        }
      }
    }

    cursor = result.cursor;
  } while (cursor);

  return stale;
}

// Find sessions older than 7 days
const staleSessions = await findStaleData(storage, 'session:', 7);
```

### Index Consistency Check

Verify primary data and indexes are in sync:

```typescript
async function checkIndexConsistency(storage: StorageAdapter) {
  const issues: { key: string; issue: string }[] = [];
  let cursor: string | undefined;

  // Check all users have email indexes
  do {
    const result = await storage.list('user:', { limit: 100, cursor });

    for (const userKey of result.keys) {
      if (!userKey.includes(':profile')) continue;

      const user = await storage.get<{ email?: string }>(userKey);
      if (user?.email) {
        const indexedUserId = await storage.get(`index:email:${user.email}`);
        const userId = userKey.replace('user:', '').replace(':profile', '');

        if (!indexedUserId) {
          issues.push({ key: userKey, issue: 'Missing email index' });
        } else if (indexedUserId !== userId) {
          issues.push({ key: userKey, issue: 'Email index points to wrong user' });
        }
      }
    }

    cursor = result.cursor;
  } while (cursor);

  return issues;
}
```

## Storage Maintenance

### Cleanup Expired Data

Remove data past its retention period:

```typescript
async function cleanupExpiredSessions(storage: StorageAdapter) {
  const deleted: string[] = [];
  const now = Date.now();
  let cursor: string | undefined;

  do {
    const result = await storage.list('session:', { limit: 100, cursor });

    for (const key of result.keys) {
      const session = await storage.get<{ expiresAt?: number }>(key);
      if (session?.expiresAt && session.expiresAt < now) {
        await storage.delete(key);
        deleted.push(key);
      }
    }

    cursor = result.cursor;
  } while (cursor);

  return { deleted: deleted.length };
}
```

### Repair Orphaned Indexes

Fix indexes pointing to deleted data:

```typescript
async function repairOrphanedIndexes(storage: StorageAdapter) {
  const orphans = await findOrphanedIndexes(storage);

  for (const indexKey of orphans) {
    await storage.delete(indexKey);
    console.log(`Deleted orphaned index: ${indexKey}`);
  }

  return { repaired: orphans.length };
}
```

### Rebuild All Indexes

Nuclear option - rebuild indexes from primary data:

```typescript
async function rebuildAllIndexes(storage: StorageAdapter) {
  // 1. Clear all indexes
  let cursor: string | undefined;
  do {
    const result = await storage.list('index:', { limit: 100, cursor });
    for (const key of result.keys) {
      await storage.delete(key);
    }
    cursor = result.cursor;
  } while (cursor);

  // 2. Rebuild from primary data
  cursor = undefined;
  let rebuilt = 0;
  do {
    const result = await storage.list('user:', { limit: 100, cursor });

    for (const userKey of result.keys) {
      if (!userKey.includes(':profile')) continue;

      const user = await storage.get<{ email?: string }>(userKey);
      const userId = userKey.replace('user:', '').replace(':profile', '');

      if (user?.email) {
        await storage.put(`index:email:${user.email}`, userId);
        rebuilt++;
      }
    }

    cursor = result.cursor;
  } while (cursor);

  return { rebuilt };
}
```

## Health Monitoring

### Custom Health Tab

Add a health tab to the admin dashboard:

```typescript
const healthTab: AdminTab = {
  id: 'health',
  label: 'Storage Health',
  icon: '💚',
  order: 40,

  render: async (ctx) => {
    // Gather health metrics
    const userCount = (await ctx.storage.list('user:')).keys.length;
    const indexCount = (await ctx.storage.list('index:')).keys.length;
    const authIndexCount = (await ctx.storage.list('_auth-index/')).keys.length;

    // Check version
    const version = await ctx.storage.get('_scaffold/version');

    return {
      html: `
        <div class="page-header">
          <h2 class="page-title">Storage Health</h2>
        </div>

        <div class="stat-grid">
          <div class="stat-card">
            <div class="stat-label">Users</div>
            <div class="stat-value">${userCount}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Indexes</div>
            <div class="stat-value">${indexCount}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Auth Index</div>
            <div class="stat-value">${authIndexCount}</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">Version Info</div>
          <div class="card-body">
            <pre>${JSON.stringify(version, null, 2)}</pre>
          </div>
        </div>
      `,
    };
  },

  getBadge: async (ctx) => {
    // Check for issues
    const issues = await checkIndexConsistency(ctx.storage);
    if (issues.length > 0) {
      return { text: String(issues.length), type: 'warning' };
    }
    return null;
  },
};
```

### Automated Health Checks

Create a scheduled health check (using Cloudflare Cron Triggers):

```typescript
// wrangler.toml
// [triggers]
// crons = ["0 * * * *"]  # Every hour

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const storage = new CloudflareKVAdapter(env.DATA);

    // Run health checks
    const orphans = await findOrphanedIndexes(storage);
    const stale = await findStaleData(storage, 'session:', 7);

    // Log results
    console.log(`Health check: ${orphans.length} orphans, ${stale.length} stale sessions`);

    // Auto-cleanup if configured
    if (env.AUTO_CLEANUP === 'true') {
      await cleanupExpiredSessions(storage);
    }
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // Regular request handling
  },
};
```

### Alerting

Set up alerts for storage issues:

```typescript
async function checkHealthWithAlerts(storage: StorageAdapter, alertEndpoint: string) {
  const issues: string[] = [];

  // Check index consistency
  const indexIssues = await checkIndexConsistency(storage);
  if (indexIssues.length > 0) {
    issues.push(`${indexIssues.length} index consistency issues`);
  }

  // Check for orphans
  const orphans = await findOrphanedIndexes(storage);
  if (orphans.length > 0) {
    issues.push(`${orphans.length} orphaned indexes`);
  }

  // Send alert if issues found
  if (issues.length > 0) {
    await fetch(alertEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        severity: 'warning',
        message: 'Storage health issues detected',
        issues,
        timestamp: new Date().toISOString(),
      }),
    });
  }

  return { healthy: issues.length === 0, issues };
}
```

## Best Practices

1. **Monitor key counts** - Sudden changes may indicate issues
2. **Run consistency checks regularly** - Weekly at minimum
3. **Clean up stale data** - Don't let old sessions accumulate
4. **Test maintenance scripts** - Always test in staging first
5. **Back up before repairs** - Especially before rebuilding indexes
6. **Log maintenance actions** - Track what was changed and when
7. **Set up alerts** - Don't wait for users to report issues
