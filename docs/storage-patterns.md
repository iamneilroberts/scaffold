# Storage Patterns

This guide covers key structure patterns for Scaffold applications. Choosing the right pattern affects performance, scalability, and data isolation.

## Choosing a Pattern

Use this decision tree to select the right storage pattern:

```
Is the data owned by a specific user?
├── YES → Does each user need their own isolated data?
│         ├── YES → User-Owned Pattern
│         └── NO  → Hybrid Pattern
└── NO  → Is the data shared across all users?
          ├── YES → Shared Pattern
          └── NO  → Consider Hybrid Pattern
```

## Pattern 1: User-Owned

Each user's data is completely isolated with user ID prefixes.

### When to Use
- User-specific data (notes, preferences, history)
- Privacy-sensitive information
- Data that users "own" and control

### Key Structure

```
user:{userId}:{resourceType}:{resourceId}
```

### Examples

```typescript
// User notes
`user:${ctx.userId}:notes:${noteId}`
// user:a1b2c3d4:notes:note_001

// User preferences
`user:${ctx.userId}:preferences`
// user:a1b2c3d4:preferences

// User sessions
`user:${ctx.userId}:sessions:${sessionId}`
// user:a1b2c3d4:sessions:sess_abc123
```

### Implementation

```typescript
const saveNoteTool: ScaffoldTool = {
  name: 'myapp:save_note',
  description: 'Save a note for the current user',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      content: { type: 'string' },
    },
    required: ['title', 'content'],
  },
  handler: async (input, ctx) => {
    const noteId = `note_${Date.now()}`;
    const key = `user:${ctx.userId}:notes:${noteId}`;

    await ctx.storage.put(key, {
      id: noteId,
      title: input.title,
      content: input.content,
      createdAt: new Date().toISOString(),
    });

    return {
      content: [{ type: 'text', text: `Saved note: ${noteId}` }],
    };
  },
};
```

### Listing User Data

```typescript
// List all notes for current user
const result = await ctx.storage.list(`user:${ctx.userId}:notes:`);
// Returns only keys for this user
```

## Pattern 2: Shared

Data is shared across all users with no isolation.

### When to Use
- Global configuration
- Shared resources (templates, categories)
- Public data (announcements, documentation)
- Counters and aggregates

### Key Structure

```
shared:{resourceType}:{resourceId}
```

### Examples

```typescript
// Global config
'shared:config:app'

// Shared templates
'shared:templates:welcome_email'

// Global counter
'shared:stats:total_users'
```

### Implementation

```typescript
const getTemplateTool: ScaffoldTool = {
  name: 'myapp:get_template',
  description: 'Get a shared template',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
    },
    required: ['name'],
  },
  handler: async (input, ctx) => {
    const key = `shared:templates:${input.name}`;
    const template = await ctx.storage.get(key);

    if (!template) {
      return errors.createToolError({
        code: 'NOT_FOUND',
        message: `Template "${input.name}" not found`,
        retryable: false,
      });
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(template) }],
    };
  },
};
```

## Pattern 3: Hybrid

Combines user-owned and shared data for complex applications.

### When to Use
- Social features (posts visible to others)
- Collaborative data
- User data with shared indexes

### Key Structure

```
# User's copy
user:{userId}:posts:{postId}

# Shared index for discovery
shared:posts:recent:{timestamp}:{postId}
shared:posts:by_tag:{tag}:{postId}
```

### Implementation

```typescript
const createPostTool: ScaffoldTool = {
  name: 'myapp:create_post',
  description: 'Create a public post',
  inputSchema: {
    type: 'object',
    properties: {
      content: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
    },
    required: ['content'],
  },
  handler: async (input, ctx) => {
    const postId = `post_${Date.now()}`;
    const timestamp = Date.now();
    const post = {
      id: postId,
      userId: ctx.userId,
      content: input.content,
      tags: input.tags ?? [],
      createdAt: new Date().toISOString(),
    };

    // Store the post under user's namespace
    await ctx.storage.put(`user:${ctx.userId}:posts:${postId}`, post);

    // Add to shared recent index
    await ctx.storage.put(
      `shared:posts:recent:${timestamp}:${postId}`,
      { postId, userId: ctx.userId }
    );

    // Add to tag indexes
    for (const tag of post.tags) {
      await ctx.storage.put(
        `shared:posts:by_tag:${tag}:${postId}`,
        { postId, userId: ctx.userId }
      );
    }

    return {
      content: [{ type: 'text', text: `Created post: ${postId}` }],
    };
  },
};
```

## Secondary Indexes

Secondary indexes enable efficient queries beyond the primary key.

### When to Add Indexes

- Querying by non-primary attributes
- Sorting by different fields
- Filtering without full scans

### Index Structure

```
index:{indexName}:{indexValue}:{primaryKey}
```

### Example: Email Lookup Index

```typescript
// Primary data
await storage.put(`user:${userId}`, { email, name, ... });

// Secondary index for email lookup
await storage.put(`index:email:${email}`, userId);

// Lookup by email
async function findByEmail(email: string): Promise<User | null> {
  const userId = await storage.get(`index:email:${email}`);
  if (!userId) return null;
  return storage.get(`user:${userId}`);
}
```

### Maintaining Index Consistency

Always update indexes atomically with primary data:

```typescript
async function updateUserEmail(userId: string, newEmail: string) {
  const user = await storage.get(`user:${userId}`);
  if (!user) throw new Error('User not found');

  // Remove old index
  await storage.delete(`index:email:${user.email}`);

  // Update user
  user.email = newEmail;
  await storage.put(`user:${userId}`, user);

  // Add new index
  await storage.put(`index:email:${newEmail}`, userId);
}
```

## Geohash Indexing

For location-based queries, use geohash encoding.

### How Geohash Works

Geohash converts latitude/longitude into a string where:
- Longer strings = more precision
- Strings with common prefixes = nearby locations

| Precision | Cell Size | Use Case |
|-----------|-----------|----------|
| 4 chars   | ~39km     | Regional |
| 5 chars   | ~5km      | City area |
| 6 chars   | ~1.2km    | Neighborhood |
| 7 chars   | ~150m     | Block |
| 8 chars   | ~38m      | Building |

### Implementation

```typescript
// Using a geohash library (e.g., ngeohash)
import geohash from 'ngeohash';

const saveLocationTool: ScaffoldTool = {
  name: 'myapp:save_location',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      lat: { type: 'number' },
      lon: { type: 'number' },
    },
    required: ['name', 'lat', 'lon'],
  },
  handler: async (input, ctx) => {
    const locationId = `loc_${Date.now()}`;
    const hash = geohash.encode(input.lat, input.lon, 6); // 6 = ~1.2km precision

    // Store location
    await ctx.storage.put(`locations:${locationId}`, {
      id: locationId,
      name: input.name,
      lat: input.lat,
      lon: input.lon,
      geohash: hash,
    });

    // Index by geohash for nearby queries
    await ctx.storage.put(`index:geo:${hash}:${locationId}`, locationId);

    return {
      content: [{ type: 'text', text: `Saved: ${locationId}` }],
    };
  },
};

// Find nearby locations
async function findNearby(lat: number, lon: number, precision = 5) {
  const hash = geohash.encode(lat, lon, precision);
  const result = await storage.list(`index:geo:${hash}:`);

  const locations = [];
  for (const key of result.keys) {
    const locationId = await storage.get(key);
    const location = await storage.get(`locations:${locationId}`);
    if (location) locations.push(location);
  }

  return locations;
}
```

## Common Mistakes

### Anti-Pattern 1: No Namespace Isolation

```typescript
// BAD: Keys can collide between users
await storage.put(`notes:${noteId}`, data);

// GOOD: Prefix with user ID
await storage.put(`user:${ctx.userId}:notes:${noteId}`, data);
```

### Anti-Pattern 2: User ID in Value Only

```typescript
// BAD: Can't list user's data efficiently
await storage.put(`notes:${noteId}`, { userId, ...data });

// GOOD: User ID in key enables prefix queries
await storage.put(`user:${userId}:notes:${noteId}`, data);
```

### Anti-Pattern 3: Unpredictable Key Structure

```typescript
// BAD: Inconsistent structure
await storage.put(`user_${userId}_note_${noteId}`, data);
await storage.put(`users/${userId}/notes/${noteId}`, data);
await storage.put(`${userId}-notes-${noteId}`, data);

// GOOD: Consistent colon-separated structure
await storage.put(`user:${userId}:notes:${noteId}`, data);
```

### Anti-Pattern 4: Missing Indexes

```typescript
// BAD: Requires full scan to find by email
const users = await storage.list('user:');
const user = users.find(u => u.email === targetEmail);

// GOOD: Secondary index for O(1) lookup
const userId = await storage.get(`index:email:${targetEmail}`);
const user = await storage.get(`user:${userId}`);
```

### Anti-Pattern 5: Orphaned Indexes

```typescript
// BAD: Delete user but leave index
await storage.delete(`user:${userId}`);

// GOOD: Delete both
await storage.delete(`index:email:${user.email}`);
await storage.delete(`user:${userId}`);
```

## Migration Strategies

### Adding a New Index

```typescript
// Migration script to add email index to existing users
async function migrateAddEmailIndex(storage: StorageAdapter) {
  let cursor: string | undefined;

  do {
    const result = await storage.list('user:', { limit: 100, cursor });

    for (const key of result.keys) {
      const user = await storage.get(key);
      if (user?.email) {
        const userId = key.replace('user:', '');
        await storage.put(`index:email:${user.email}`, userId);
      }
    }

    cursor = result.cursor;
  } while (cursor);
}
```

### Changing Key Structure

```typescript
// Migration: notes:{id} → user:{userId}:notes:{id}
async function migrateNoteKeys(storage: StorageAdapter) {
  const result = await storage.list('notes:');

  for (const oldKey of result.keys) {
    const note = await storage.get(oldKey);
    if (note?.userId) {
      const noteId = oldKey.replace('notes:', '');
      const newKey = `user:${note.userId}:notes:${noteId}`;

      await storage.put(newKey, note);
      await storage.delete(oldKey);
    }
  }
}
```

## Best Practices Summary

1. **Always prefix with owner** - `user:{userId}:` or `shared:`
2. **Use consistent separators** - Colons (`:`) work well
3. **Put queryable fields in keys** - Not just values
4. **Create indexes for non-primary queries** - Email, geohash, timestamps
5. **Keep indexes in sync** - Update/delete together with primary data
6. **Use meaningful key segments** - `user:abc:notes:` not `u:abc:n:`
7. **Plan for pagination** - Use cursor-based listing
8. **Document your key schema** - Future you will thank you
