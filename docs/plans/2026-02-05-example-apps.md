# Example Apps Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build 3 example apps demonstrating Scaffold's storage patterns and MCP tool system.

**Architecture:** Each example is a standalone Cloudflare Worker package in `examples/`. They import `@scaffold/core`, define tools using `ScaffoldTool`, and wire up a `ScaffoldServer`. Each uses `InMemoryAdapter` for tests and `CloudflareKVAdapter` for production. The examples progress from simple per-user CRUD to shared geospatial data.

**Tech Stack:** TypeScript, @scaffold/core, Cloudflare Workers, Vitest, wrangler

---

## Workspace Setup

Before any example app, the root workspace config needs to include `examples/*`.

---

### Task 1: Add examples to monorepo workspace

**Files:**
- Modify: `package.json` (root)

**Step 1: Add examples glob to workspaces**

In the root `package.json`, change:
```json
"workspaces": [
  "packages/*"
]
```
to:
```json
"workspaces": [
  "packages/*",
  "examples/*"
]
```

**Step 2: Commit**

```bash
git add package.json
git commit -m "chore: add examples/* to workspaces"
```

---

## Example 1: notes-app (starter-generic)

Simple per-user notes CRUD. Demonstrates the most basic Scaffold pattern: user-prefixed keys with a flat key structure.

**Storage pattern:** `{userId}/notes/{noteId}`

**Tools:**
- `notes:save` — Create or update a note
- `notes:list` — List all notes for the current user
- `notes:read` — Read a single note by ID
- `notes:delete` — Delete a note by ID

---

### Task 2: Scaffold notes-app package

**Files:**
- Create: `examples/notes-app/package.json`
- Create: `examples/notes-app/tsconfig.json`
- Create: `examples/notes-app/wrangler.toml`

**Step 1: Create package.json**

```json
{
  "name": "@scaffold/example-notes",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@scaffold/core": "workspace:*"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240512.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "wrangler": "^3.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules"]
}
```

**Step 3: Create wrangler.toml**

```toml
name = "scaffold-notes-app"
main = "src/index.ts"
compatibility_date = "2024-09-23"

[vars]
ADMIN_KEY = "change-me-in-production"

[[kv_namespaces]]
binding = "DATA"
id = "your-kv-namespace-id"
preview_id = "your-preview-kv-namespace-id"
```

**Step 4: Commit**

```bash
git add examples/notes-app/
git commit -m "chore: scaffold notes-app example package"
```

---

### Task 3: Implement notes-app tools

**Files:**
- Create: `examples/notes-app/src/tools.ts`

**Step 1: Write the tools file**

This defines all 4 notes tools as `ScaffoldTool` objects. Key pattern: `{userId}/notes/{noteId}`.

```typescript
import type { ScaffoldTool, ToolContext, ToolResult } from '@scaffold/core';

interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

function noteKey(userId: string, noteId: string): string {
  return `${userId}/notes/${noteId}`;
}

function notesPrefix(userId: string): string {
  return `${userId}/notes/`;
}

export const saveNoteTool: ScaffoldTool = {
  name: 'notes:save',
  description: 'Create or update a note. Provide an id, title, and content.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Note ID (lowercase, hyphens, e.g. "meeting-notes")' },
      title: { type: 'string', description: 'Note title' },
      content: { type: 'string', description: 'Note content (markdown supported)' },
    },
    required: ['id', 'title', 'content'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { id, title, content } = input as { id: string; title: string; content: string };
    const key = noteKey(ctx.userId, id);
    const existing = await ctx.storage.get<Note>(key);

    const note: Note = {
      id,
      title,
      content,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await ctx.storage.put(key, note);

    return {
      content: [{ type: 'text', text: `Saved note "${title}" (${id})` }],
    };
  },
};

export const listNotesTool: ScaffoldTool = {
  name: 'notes:list',
  description: 'List all notes for the current user.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  handler: async (_input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const prefix = notesPrefix(ctx.userId);
    const result = await ctx.storage.list(prefix);

    if (result.keys.length === 0) {
      return { content: [{ type: 'text', text: 'No notes found.' }] };
    }

    const notes: Note[] = [];
    for (const key of result.keys) {
      const note = await ctx.storage.get<Note>(key);
      if (note) notes.push(note);
    }

    const summary = notes
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(n => `- **${n.title}** (${n.id}) — updated ${n.updatedAt}`)
      .join('\n');

    return { content: [{ type: 'text', text: summary }] };
  },
};

export const readNoteTool: ScaffoldTool = {
  name: 'notes:read',
  description: 'Read a note by ID.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Note ID to read' },
    },
    required: ['id'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { id } = input as { id: string };
    const note = await ctx.storage.get<Note>(noteKey(ctx.userId, id));

    if (!note) {
      return { content: [{ type: 'text', text: `Note "${id}" not found.` }], isError: true };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(note, null, 2),
      }],
    };
  },
};

export const deleteNoteTool: ScaffoldTool = {
  name: 'notes:delete',
  description: 'Delete a note by ID.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Note ID to delete' },
    },
    required: ['id'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { id } = input as { id: string };
    const key = noteKey(ctx.userId, id);
    const existing = await ctx.storage.get<Note>(key);

    if (!existing) {
      return { content: [{ type: 'text', text: `Note "${id}" not found.` }], isError: true };
    }

    await ctx.storage.delete(key);
    return { content: [{ type: 'text', text: `Deleted note "${existing.title}" (${id})` }] };
  },
};

export const notesTools: ScaffoldTool[] = [
  saveNoteTool,
  listNotesTool,
  readNoteTool,
  deleteNoteTool,
];
```

**Step 2: Commit**

```bash
git add examples/notes-app/src/tools.ts
git commit -m "feat(notes-app): add notes CRUD tools"
```

---

### Task 4: Implement notes-app server entry point

**Files:**
- Create: `examples/notes-app/src/index.ts`

**Step 1: Write the entry point**

```typescript
import { ScaffoldServer, type ScaffoldConfig } from '@scaffold/core';
import { CloudflareKVAdapter } from '@scaffold/core/storage';
import { notesTools } from './tools.js';

interface Env {
  DATA: KVNamespace;
  ADMIN_KEY: string;
}

const config: ScaffoldConfig = {
  app: {
    name: 'Scaffold Notes',
    description: 'Simple note-taking assistant',
    version: '0.0.1',
  },
  mcp: {
    serverName: 'scaffold-notes',
    protocolVersion: '2024-11-05',
  },
  auth: {
    adminKey: undefined, // Set from env at runtime
    enableKeyIndex: false,
    enableFallbackScan: false,
    fallbackScanRateLimit: 0,
    fallbackScanBudget: 0,
  },
  admin: {
    path: '/admin',
  },
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const runtimeConfig = {
      ...config,
      auth: { ...config.auth, adminKey: env.ADMIN_KEY },
    };

    const storage = new CloudflareKVAdapter(env.DATA);
    const server = new ScaffoldServer({
      config: runtimeConfig,
      storage,
      tools: notesTools,
    });

    return server.fetch(request, env as unknown as Record<string, unknown>, ctx);
  },
};
```

> **Note:** The import path `@scaffold/core/storage` may need adjustment depending on how core exports storage adapters. If it's not a separate export, import `CloudflareKVAdapter` from the main `@scaffold/core` entry point instead, or use a relative workaround. Check `packages/core/src/index.ts` exports during implementation.

**Step 2: Commit**

```bash
git add examples/notes-app/src/index.ts
git commit -m "feat(notes-app): add server entry point"
```

---

### Task 5: Write notes-app tests

**Files:**
- Create: `examples/notes-app/src/__tests__/tools.test.ts`

**Step 1: Write tests**

Tests use `InMemoryAdapter` to verify all 4 tools work end-to-end without Cloudflare.

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@scaffold/core/storage';
import type { ToolContext } from '@scaffold/core';
import { saveNoteTool, listNotesTool, readNoteTool, deleteNoteTool } from '../tools.js';

function makeCtx(storage: InMemoryAdapter, userId = 'user1'): ToolContext {
  return {
    authKey: 'test-key',
    userId,
    isAdmin: false,
    storage,
    env: {},
    debugMode: false,
    requestId: 'req-1',
  };
}

describe('notes tools', () => {
  let storage: InMemoryAdapter;
  let ctx: ToolContext;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    ctx = makeCtx(storage);
  });

  it('saves and reads a note', async () => {
    await saveNoteTool.handler({ id: 'test', title: 'Test', content: 'Hello' }, ctx);
    const result = await readNoteTool.handler({ id: 'test' }, ctx);
    const note = JSON.parse(result.content[0]!.text!);
    expect(note.title).toBe('Test');
    expect(note.content).toBe('Hello');
  });

  it('lists notes', async () => {
    await saveNoteTool.handler({ id: 'a', title: 'First', content: '1' }, ctx);
    await saveNoteTool.handler({ id: 'b', title: 'Second', content: '2' }, ctx);
    const result = await listNotesTool.handler({}, ctx);
    expect(result.content[0]!.text).toContain('First');
    expect(result.content[0]!.text).toContain('Second');
  });

  it('returns error for missing note', async () => {
    const result = await readNoteTool.handler({ id: 'nope' }, ctx);
    expect(result.isError).toBe(true);
  });

  it('deletes a note', async () => {
    await saveNoteTool.handler({ id: 'del', title: 'Delete Me', content: 'bye' }, ctx);
    await deleteNoteTool.handler({ id: 'del' }, ctx);
    const result = await readNoteTool.handler({ id: 'del' }, ctx);
    expect(result.isError).toBe(true);
  });

  it('isolates notes between users', async () => {
    const ctx2 = makeCtx(storage, 'user2');
    await saveNoteTool.handler({ id: 'shared-id', title: 'User1 Note', content: 'mine' }, ctx);
    await saveNoteTool.handler({ id: 'shared-id', title: 'User2 Note', content: 'theirs' }, ctx2);

    const r1 = await readNoteTool.handler({ id: 'shared-id' }, ctx);
    const r2 = await readNoteTool.handler({ id: 'shared-id' }, ctx2);
    expect(JSON.parse(r1.content[0]!.text!).title).toBe('User1 Note');
    expect(JSON.parse(r2.content[0]!.text!).title).toBe('User2 Note');
  });
});
```

**Step 2: Run tests**

```bash
cd examples/notes-app && npx vitest run
```

Expected: All 5 tests pass.

**Step 3: Commit**

```bash
git add examples/notes-app/src/__tests__/
git commit -m "test(notes-app): add tool tests with InMemoryAdapter"
```

---

## Example 2: travel-planner (starter-user-owned)

Per-user trip planning with entity hierarchy. Demonstrates nested entities (trip → stops) and session-like state.

**Storage pattern:**
- Trip: `{userId}/trips/{tripId}`
- Stop: `{userId}/trips/{tripId}/stops/{stopId}`

**Tools:**
- `trip:create` — Create a new trip
- `trip:add_stop` — Add a stop to a trip
- `trip:list` — List all trips
- `trip:get` — Get trip details including stops
- `trip:delete` — Delete a trip and its stops

---

### Task 6: Scaffold travel-planner package

**Files:**
- Create: `examples/travel-planner/package.json`
- Create: `examples/travel-planner/tsconfig.json`
- Create: `examples/travel-planner/wrangler.toml`

**Step 1: Create package.json**

Same structure as notes-app but with name `@scaffold/example-travel-planner`.

```json
{
  "name": "@scaffold/example-travel-planner",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@scaffold/core": "workspace:*"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240512.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "wrangler": "^3.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

Same as notes-app.

**Step 3: Create wrangler.toml**

```toml
name = "scaffold-travel-planner"
main = "src/index.ts"
compatibility_date = "2024-09-23"

[vars]
ADMIN_KEY = "change-me-in-production"

[[kv_namespaces]]
binding = "DATA"
id = "your-kv-namespace-id"
preview_id = "your-preview-kv-namespace-id"
```

**Step 4: Commit**

```bash
git add examples/travel-planner/
git commit -m "chore: scaffold travel-planner example package"
```

---

### Task 7: Implement travel-planner tools

**Files:**
- Create: `examples/travel-planner/src/tools.ts`

**Step 1: Write the tools file**

```typescript
import type { ScaffoldTool, ToolContext, ToolResult } from '@scaffold/core';

interface Trip {
  id: string;
  name: string;
  description: string;
  startDate?: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
}

interface Stop {
  id: string;
  tripId: string;
  name: string;
  location?: string;
  notes?: string;
  order: number;
  createdAt: string;
}

function tripKey(userId: string, tripId: string): string {
  return `${userId}/trips/${tripId}`;
}

function tripsPrefix(userId: string): string {
  return `${userId}/trips/`;
}

function stopKey(userId: string, tripId: string, stopId: string): string {
  return `${userId}/trips/${tripId}/stops/${stopId}`;
}

function stopsPrefix(userId: string, tripId: string): string {
  return `${userId}/trips/${tripId}/stops/`;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export const createTripTool: ScaffoldTool = {
  name: 'trip:create',
  description: 'Create a new trip.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Trip name' },
      description: { type: 'string', description: 'Trip description' },
      startDate: { type: 'string', description: 'Start date (ISO 8601)' },
      endDate: { type: 'string', description: 'End date (ISO 8601)' },
    },
    required: ['name', 'description'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const params = input as { name: string; description: string; startDate?: string; endDate?: string };
    const id = generateId();
    const trip: Trip = {
      id,
      name: params.name,
      description: params.description,
      startDate: params.startDate,
      endDate: params.endDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await ctx.storage.put(tripKey(ctx.userId, id), trip);

    return {
      content: [{ type: 'text', text: `Created trip "${trip.name}" (${id})` }],
    };
  },
};

export const addStopTool: ScaffoldTool = {
  name: 'trip:add_stop',
  description: 'Add a stop to an existing trip.',
  inputSchema: {
    type: 'object',
    properties: {
      tripId: { type: 'string', description: 'Trip ID to add stop to' },
      name: { type: 'string', description: 'Stop name (e.g. city or landmark)' },
      location: { type: 'string', description: 'Address or coordinates' },
      notes: { type: 'string', description: 'Notes about this stop' },
    },
    required: ['tripId', 'name'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const params = input as { tripId: string; name: string; location?: string; notes?: string };
    const trip = await ctx.storage.get<Trip>(tripKey(ctx.userId, params.tripId));

    if (!trip) {
      return { content: [{ type: 'text', text: `Trip "${params.tripId}" not found.` }], isError: true };
    }

    // Count existing stops to determine order
    const existingStops = await ctx.storage.list(stopsPrefix(ctx.userId, params.tripId));
    const stopId = generateId();

    const stop: Stop = {
      id: stopId,
      tripId: params.tripId,
      name: params.name,
      location: params.location,
      notes: params.notes,
      order: existingStops.keys.length + 1,
      createdAt: new Date().toISOString(),
    };

    await ctx.storage.put(stopKey(ctx.userId, params.tripId, stopId), stop);

    return {
      content: [{ type: 'text', text: `Added stop "${params.name}" (#${stop.order}) to trip "${trip.name}"` }],
    };
  },
};

export const listTripsTool: ScaffoldTool = {
  name: 'trip:list',
  description: 'List all trips for the current user.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  handler: async (_input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const prefix = tripsPrefix(ctx.userId);
    const result = await ctx.storage.list(prefix);

    // Filter to only trip keys (not stop sub-keys)
    const tripKeys = result.keys.filter(k => {
      const rel = k.slice(prefix.length);
      return !rel.includes('/');
    });

    if (tripKeys.length === 0) {
      return { content: [{ type: 'text', text: 'No trips found.' }] };
    }

    const trips: Trip[] = [];
    for (const key of tripKeys) {
      const trip = await ctx.storage.get<Trip>(key);
      if (trip) trips.push(trip);
    }

    const summary = trips
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(t => `- **${t.name}** (${t.id})${t.startDate ? ` — ${t.startDate}` : ''}`)
      .join('\n');

    return { content: [{ type: 'text', text: summary }] };
  },
};

export const getTripTool: ScaffoldTool = {
  name: 'trip:get',
  description: 'Get full trip details including all stops.',
  inputSchema: {
    type: 'object',
    properties: {
      tripId: { type: 'string', description: 'Trip ID' },
    },
    required: ['tripId'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { tripId } = input as { tripId: string };
    const trip = await ctx.storage.get<Trip>(tripKey(ctx.userId, tripId));

    if (!trip) {
      return { content: [{ type: 'text', text: `Trip "${tripId}" not found.` }], isError: true };
    }

    // Fetch all stops
    const stopsList = await ctx.storage.list(stopsPrefix(ctx.userId, tripId));
    const stops: Stop[] = [];
    for (const key of stopsList.keys) {
      const stop = await ctx.storage.get<Stop>(key);
      if (stop) stops.push(stop);
    }
    stops.sort((a, b) => a.order - b.order);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ ...trip, stops }, null, 2),
      }],
    };
  },
};

export const deleteTripTool: ScaffoldTool = {
  name: 'trip:delete',
  description: 'Delete a trip and all its stops.',
  inputSchema: {
    type: 'object',
    properties: {
      tripId: { type: 'string', description: 'Trip ID to delete' },
    },
    required: ['tripId'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { tripId } = input as { tripId: string };
    const trip = await ctx.storage.get<Trip>(tripKey(ctx.userId, tripId));

    if (!trip) {
      return { content: [{ type: 'text', text: `Trip "${tripId}" not found.` }], isError: true };
    }

    // Delete all stops first
    const stopsList = await ctx.storage.list(stopsPrefix(ctx.userId, tripId));
    for (const key of stopsList.keys) {
      await ctx.storage.delete(key);
    }

    // Delete trip
    await ctx.storage.delete(tripKey(ctx.userId, tripId));

    return {
      content: [{ type: 'text', text: `Deleted trip "${trip.name}" and ${stopsList.keys.length} stop(s)` }],
    };
  },
};

export const travelTools: ScaffoldTool[] = [
  createTripTool,
  addStopTool,
  listTripsTool,
  getTripTool,
  deleteTripTool,
];
```

**Step 2: Commit**

```bash
git add examples/travel-planner/src/tools.ts
git commit -m "feat(travel-planner): add trip/stop CRUD tools"
```

---

### Task 8: Implement travel-planner entry point

**Files:**
- Create: `examples/travel-planner/src/index.ts`

**Step 1: Write the entry point**

Same pattern as notes-app but with `travelTools` and different app metadata.

```typescript
import { ScaffoldServer, type ScaffoldConfig } from '@scaffold/core';
import { CloudflareKVAdapter } from '@scaffold/core/storage';
import { travelTools } from './tools.js';

interface Env {
  DATA: KVNamespace;
  ADMIN_KEY: string;
}

const config: ScaffoldConfig = {
  app: {
    name: 'Scaffold Travel Planner',
    description: 'Personal trip planning assistant with nested stops',
    version: '0.0.1',
  },
  mcp: {
    serverName: 'scaffold-travel-planner',
    protocolVersion: '2024-11-05',
  },
  auth: {
    adminKey: undefined,
    enableKeyIndex: false,
    enableFallbackScan: false,
    fallbackScanRateLimit: 0,
    fallbackScanBudget: 0,
  },
  admin: {
    path: '/admin',
  },
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const runtimeConfig = {
      ...config,
      auth: { ...config.auth, adminKey: env.ADMIN_KEY },
    };

    const storage = new CloudflareKVAdapter(env.DATA);
    const server = new ScaffoldServer({
      config: runtimeConfig,
      storage,
      tools: travelTools,
    });

    return server.fetch(request, env as unknown as Record<string, unknown>, ctx);
  },
};
```

**Step 2: Commit**

```bash
git add examples/travel-planner/src/index.ts
git commit -m "feat(travel-planner): add server entry point"
```

---

### Task 9: Write travel-planner tests

**Files:**
- Create: `examples/travel-planner/src/__tests__/tools.test.ts`

**Step 1: Write tests**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@scaffold/core/storage';
import type { ToolContext } from '@scaffold/core';
import {
  createTripTool,
  addStopTool,
  listTripsTool,
  getTripTool,
  deleteTripTool,
} from '../tools.js';

function makeCtx(storage: InMemoryAdapter, userId = 'user1'): ToolContext {
  return {
    authKey: 'test-key',
    userId,
    isAdmin: false,
    storage,
    env: {},
    debugMode: false,
    requestId: 'req-1',
  };
}

function extractId(text: string): string {
  const match = text.match(/\(([a-z0-9]+)\)/);
  return match?.[1] ?? '';
}

describe('travel-planner tools', () => {
  let storage: InMemoryAdapter;
  let ctx: ToolContext;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    ctx = makeCtx(storage);
  });

  it('creates a trip and retrieves it', async () => {
    const createResult = await createTripTool.handler(
      { name: 'Road Trip', description: 'Cross-country drive' },
      ctx,
    );
    const tripId = extractId(createResult.content[0]!.text!);
    expect(tripId).toBeTruthy();

    const getResult = await getTripTool.handler({ tripId }, ctx);
    const trip = JSON.parse(getResult.content[0]!.text!);
    expect(trip.name).toBe('Road Trip');
    expect(trip.stops).toEqual([]);
  });

  it('adds stops to a trip in order', async () => {
    const createResult = await createTripTool.handler(
      { name: 'Coastal', description: 'Beach tour' },
      ctx,
    );
    const tripId = extractId(createResult.content[0]!.text!);

    await addStopTool.handler({ tripId, name: 'San Diego' }, ctx);
    await addStopTool.handler({ tripId, name: 'Los Angeles' }, ctx);
    await addStopTool.handler({ tripId, name: 'San Francisco' }, ctx);

    const getResult = await getTripTool.handler({ tripId }, ctx);
    const trip = JSON.parse(getResult.content[0]!.text!);
    expect(trip.stops).toHaveLength(3);
    expect(trip.stops[0].name).toBe('San Diego');
    expect(trip.stops[0].order).toBe(1);
    expect(trip.stops[2].name).toBe('San Francisco');
    expect(trip.stops[2].order).toBe(3);
  });

  it('lists multiple trips', async () => {
    await createTripTool.handler({ name: 'Trip A', description: 'a' }, ctx);
    await createTripTool.handler({ name: 'Trip B', description: 'b' }, ctx);

    const result = await listTripsTool.handler({}, ctx);
    expect(result.content[0]!.text).toContain('Trip A');
    expect(result.content[0]!.text).toContain('Trip B');
  });

  it('deletes a trip and its stops', async () => {
    const createResult = await createTripTool.handler(
      { name: 'Delete Me', description: 'temp' },
      ctx,
    );
    const tripId = extractId(createResult.content[0]!.text!);
    await addStopTool.handler({ tripId, name: 'Stop 1' }, ctx);

    const deleteResult = await deleteTripTool.handler({ tripId }, ctx);
    expect(deleteResult.content[0]!.text).toContain('1 stop(s)');

    const getResult = await getTripTool.handler({ tripId }, ctx);
    expect(getResult.isError).toBe(true);
  });

  it('isolates trips between users', async () => {
    const ctx2 = makeCtx(storage, 'user2');
    await createTripTool.handler({ name: 'User1 Trip', description: 'mine' }, ctx);
    await createTripTool.handler({ name: 'User2 Trip', description: 'theirs' }, ctx2);

    const r1 = await listTripsTool.handler({}, ctx);
    const r2 = await listTripsTool.handler({}, ctx2);
    expect(r1.content[0]!.text).toContain('User1 Trip');
    expect(r1.content[0]!.text).not.toContain('User2 Trip');
    expect(r2.content[0]!.text).toContain('User2 Trip');
    expect(r2.content[0]!.text).not.toContain('User1 Trip');
  });
});
```

**Step 2: Run tests**

```bash
cd examples/travel-planner && npx vitest run
```

Expected: All 5 tests pass.

**Step 3: Commit**

```bash
git add examples/travel-planner/src/__tests__/
git commit -m "test(travel-planner): add tool tests with InMemoryAdapter"
```

---

## Example 3: local-guide (starter-shared-location)

Shared place catalog with geohash indexing + per-user favorites. Demonstrates the split between shared data (everyone sees the same places) and per-user state (favorites).

**Storage pattern:**
- Shared: `places/geohash/{hash}` — bucket of places by geohash
- Shared: `places/id/{placeId}` — individual place by ID
- Per-user: `{userId}/favorites/{placeId}` — user's saved favorites

**Tools:**
- `guide:search_nearby` — Find places near a lat/lng
- `guide:get_details` — Get full details for a place by ID
- `guide:save_favorite` — Save a place to the user's favorites
- `guide:list_favorites` — List the user's saved favorites

---

### Task 10: Scaffold local-guide package

**Files:**
- Create: `examples/local-guide/package.json`
- Create: `examples/local-guide/tsconfig.json`
- Create: `examples/local-guide/wrangler.toml`

**Step 1: Create package.json**

```json
{
  "name": "@scaffold/example-local-guide",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@scaffold/core": "workspace:*"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240512.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "wrangler": "^3.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

Same as other examples.

**Step 3: Create wrangler.toml**

```toml
name = "scaffold-local-guide"
main = "src/index.ts"
compatibility_date = "2024-09-23"

[vars]
ADMIN_KEY = "change-me-in-production"

[[kv_namespaces]]
binding = "DATA"
id = "your-kv-namespace-id"
preview_id = "your-preview-kv-namespace-id"
```

**Step 4: Commit**

```bash
git add examples/local-guide/
git commit -m "chore: scaffold local-guide example package"
```

---

### Task 11: Implement geohash utility

**Files:**
- Create: `examples/local-guide/src/geohash.ts`

**Step 1: Write a minimal geohash encoder**

No external dependencies — a self-contained geohash implementation (~50 lines). This keeps the example zero-dependency.

```typescript
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export function encode(lat: number, lng: number, precision = 4): string {
  let latMin = -90, latMax = 90;
  let lngMin = -180, lngMax = 180;
  let hash = '';
  let bit = 0;
  let ch = 0;
  let isLng = true;

  while (hash.length < precision) {
    if (isLng) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) {
        ch = ch | (1 << (4 - bit));
        lngMin = mid;
      } else {
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        ch = ch | (1 << (4 - bit));
        latMin = mid;
      } else {
        latMax = mid;
      }
    }
    isLng = !isLng;
    bit++;
    if (bit === 5) {
      hash += BASE32[ch]!;
      bit = 0;
      ch = 0;
    }
  }

  return hash;
}

export function neighbors(hash: string): string[] {
  // Simplified: return center + 8 neighbors by adjusting last character
  // For a production app, use a full neighbor calculation
  const idx = BASE32.indexOf(hash[hash.length - 1]!);
  const prefix = hash.slice(0, -1);
  const result: string[] = [hash];

  for (const offset of [-1, 1]) {
    const ni = idx + offset;
    if (ni >= 0 && ni < 32) {
      result.push(prefix + BASE32[ni]!);
    }
  }

  return result;
}

export function bucketKey(hash: string): string {
  return `places/geohash/${hash}`;
}

export function nearbyBucketKeys(lat: number, lng: number, precision = 4): string[] {
  const center = encode(lat, lng, precision);
  return neighbors(center).map(bucketKey);
}
```

**Step 2: Commit**

```bash
git add examples/local-guide/src/geohash.ts
git commit -m "feat(local-guide): add minimal geohash utility"
```

---

### Task 12: Implement local-guide tools

**Files:**
- Create: `examples/local-guide/src/tools.ts`

**Step 1: Write the tools file**

```typescript
import type { ScaffoldTool, ToolContext, ToolResult } from '@scaffold/core';
import { nearbyBucketKeys, encode as geohashEncode } from './geohash.js';

interface Place {
  id: string;
  name: string;
  category: string;
  description: string;
  lat: number;
  lng: number;
  geohash: string;
  address?: string;
  phone?: string;
  website?: string;
}

interface PlaceBucket {
  geohash: string;
  places: Place[];
  updatedAt: string;
}

interface FavoriteEntry {
  placeId: string;
  savedAt: string;
  note?: string;
}

function placeByIdKey(placeId: string): string {
  return `places/id/${placeId}`;
}

function favoriteKey(userId: string, placeId: string): string {
  return `${userId}/favorites/${placeId}`;
}

function favoritesPrefix(userId: string): string {
  return `${userId}/favorites/`;
}

export const searchNearbyTool: ScaffoldTool = {
  name: 'guide:search_nearby',
  description: 'Search for places near a location. Returns places within the geohash bucket and its neighbors.',
  inputSchema: {
    type: 'object',
    properties: {
      lat: { type: 'number', description: 'Latitude' },
      lng: { type: 'number', description: 'Longitude' },
      category: { type: 'string', description: 'Filter by category (optional)' },
    },
    required: ['lat', 'lng'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { lat, lng, category } = input as { lat: number; lng: number; category?: string };
    const bucketKeys = nearbyBucketKeys(lat, lng);

    const allPlaces: Place[] = [];
    for (const key of bucketKeys) {
      const bucket = await ctx.storage.get<PlaceBucket>(key);
      if (bucket) {
        allPlaces.push(...bucket.places);
      }
    }

    let filtered = allPlaces;
    if (category) {
      const cat = category.toLowerCase();
      filtered = allPlaces.filter(p => p.category.toLowerCase() === cat);
    }

    if (filtered.length === 0) {
      return { content: [{ type: 'text', text: 'No places found nearby.' }] };
    }

    const summary = filtered
      .map(p => `- **${p.name}** (${p.category}) — ${p.description}${p.address ? ` | ${p.address}` : ''}`)
      .join('\n');

    return { content: [{ type: 'text', text: `Found ${filtered.length} place(s):\n\n${summary}` }] };
  },
};

export const getDetailsTool: ScaffoldTool = {
  name: 'guide:get_details',
  description: 'Get full details for a place by ID.',
  inputSchema: {
    type: 'object',
    properties: {
      placeId: { type: 'string', description: 'Place ID' },
    },
    required: ['placeId'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { placeId } = input as { placeId: string };
    const place = await ctx.storage.get<Place>(placeByIdKey(placeId));

    if (!place) {
      return { content: [{ type: 'text', text: `Place "${placeId}" not found.` }], isError: true };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(place, null, 2) }],
    };
  },
};

export const saveFavoriteTool: ScaffoldTool = {
  name: 'guide:save_favorite',
  description: 'Save a place to your favorites.',
  inputSchema: {
    type: 'object',
    properties: {
      placeId: { type: 'string', description: 'Place ID to favorite' },
      note: { type: 'string', description: 'Optional personal note' },
    },
    required: ['placeId'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { placeId, note } = input as { placeId: string; note?: string };

    // Verify place exists
    const place = await ctx.storage.get<Place>(placeByIdKey(placeId));
    if (!place) {
      return { content: [{ type: 'text', text: `Place "${placeId}" not found.` }], isError: true };
    }

    const entry: FavoriteEntry = {
      placeId,
      savedAt: new Date().toISOString(),
      note,
    };

    await ctx.storage.put(favoriteKey(ctx.userId, placeId), entry);

    return {
      content: [{ type: 'text', text: `Saved "${place.name}" to favorites.` }],
    };
  },
};

export const listFavoritesTool: ScaffoldTool = {
  name: 'guide:list_favorites',
  description: 'List your saved favorite places.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  handler: async (_input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const prefix = favoritesPrefix(ctx.userId);
    const result = await ctx.storage.list(prefix);

    if (result.keys.length === 0) {
      return { content: [{ type: 'text', text: 'No favorites saved yet.' }] };
    }

    const lines: string[] = [];
    for (const key of result.keys) {
      const entry = await ctx.storage.get<FavoriteEntry>(key);
      if (!entry) continue;

      const place = await ctx.storage.get<Place>(placeByIdKey(entry.placeId));
      const name = place?.name ?? entry.placeId;
      lines.push(`- **${name}**${entry.note ? ` — "${entry.note}"` : ''} (saved ${entry.savedAt})`);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
};

export const guideTools: ScaffoldTool[] = [
  searchNearbyTool,
  getDetailsTool,
  saveFavoriteTool,
  listFavoritesTool,
];
```

**Step 2: Commit**

```bash
git add examples/local-guide/src/tools.ts
git commit -m "feat(local-guide): add search, details, favorites tools"
```

---

### Task 13: Implement local-guide entry point

**Files:**
- Create: `examples/local-guide/src/index.ts`

**Step 1: Write the entry point**

Same pattern as other examples with `guideTools`.

```typescript
import { ScaffoldServer, type ScaffoldConfig } from '@scaffold/core';
import { CloudflareKVAdapter } from '@scaffold/core/storage';
import { guideTools } from './tools.js';

interface Env {
  DATA: KVNamespace;
  ADMIN_KEY: string;
}

const config: ScaffoldConfig = {
  app: {
    name: 'Scaffold Local Guide',
    description: 'Discover nearby places with shared catalog and personal favorites',
    version: '0.0.1',
  },
  mcp: {
    serverName: 'scaffold-local-guide',
    protocolVersion: '2024-11-05',
  },
  auth: {
    adminKey: undefined,
    enableKeyIndex: false,
    enableFallbackScan: false,
    fallbackScanRateLimit: 0,
    fallbackScanBudget: 0,
  },
  admin: {
    path: '/admin',
  },
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const runtimeConfig = {
      ...config,
      auth: { ...config.auth, adminKey: env.ADMIN_KEY },
    };

    const storage = new CloudflareKVAdapter(env.DATA);
    const server = new ScaffoldServer({
      config: runtimeConfig,
      storage,
      tools: guideTools,
    });

    return server.fetch(request, env as unknown as Record<string, unknown>, ctx);
  },
};
```

**Step 2: Commit**

```bash
git add examples/local-guide/src/index.ts
git commit -m "feat(local-guide): add server entry point"
```

---

### Task 14: Write local-guide tests

**Files:**
- Create: `examples/local-guide/src/__tests__/tools.test.ts`

**Step 1: Write tests**

Tests seed the storage with place data, then exercise search, details, and favorites.

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@scaffold/core/storage';
import type { ToolContext } from '@scaffold/core';
import { encode as geohashEncode, bucketKey } from '../geohash.js';
import {
  searchNearbyTool,
  getDetailsTool,
  saveFavoriteTool,
  listFavoritesTool,
} from '../tools.js';

function makeCtx(storage: InMemoryAdapter, userId = 'user1'): ToolContext {
  return {
    authKey: 'test-key',
    userId,
    isAdmin: false,
    storage,
    env: {},
    debugMode: false,
    requestId: 'req-1',
  };
}

async function seedPlaces(storage: InMemoryAdapter) {
  // Mobile, AL area (lat ~30.69, lng ~-88.04)
  const hash = geohashEncode(30.69, -88.04, 4);

  const places = [
    {
      id: 'cafe-1',
      name: 'Downtown Cafe',
      category: 'food',
      description: 'Great coffee and pastries',
      lat: 30.693,
      lng: -88.043,
      geohash: hash,
      address: '123 Main St',
    },
    {
      id: 'park-1',
      name: 'Riverside Park',
      category: 'outdoors',
      description: 'Walking trails along the river',
      lat: 30.688,
      lng: -88.039,
      geohash: hash,
    },
  ];

  // Store in geohash bucket
  await storage.put(bucketKey(hash), {
    geohash: hash,
    places,
    updatedAt: new Date().toISOString(),
  });

  // Store individual place records
  for (const place of places) {
    await storage.put(`places/id/${place.id}`, place);
  }
}

describe('local-guide tools', () => {
  let storage: InMemoryAdapter;
  let ctx: ToolContext;

  beforeEach(async () => {
    storage = new InMemoryAdapter();
    ctx = makeCtx(storage);
    await seedPlaces(storage);
  });

  it('searches nearby places', async () => {
    const result = await searchNearbyTool.handler({ lat: 30.69, lng: -88.04 }, ctx);
    expect(result.content[0]!.text).toContain('Downtown Cafe');
    expect(result.content[0]!.text).toContain('Riverside Park');
  });

  it('filters search by category', async () => {
    const result = await searchNearbyTool.handler({ lat: 30.69, lng: -88.04, category: 'food' }, ctx);
    expect(result.content[0]!.text).toContain('Downtown Cafe');
    expect(result.content[0]!.text).not.toContain('Riverside Park');
  });

  it('gets place details by ID', async () => {
    const result = await getDetailsTool.handler({ placeId: 'cafe-1' }, ctx);
    const place = JSON.parse(result.content[0]!.text!);
    expect(place.name).toBe('Downtown Cafe');
    expect(place.address).toBe('123 Main St');
  });

  it('returns error for missing place', async () => {
    const result = await getDetailsTool.handler({ placeId: 'nope' }, ctx);
    expect(result.isError).toBe(true);
  });

  it('saves and lists favorites', async () => {
    await saveFavoriteTool.handler({ placeId: 'cafe-1', note: 'Love the espresso' }, ctx);
    await saveFavoriteTool.handler({ placeId: 'park-1' }, ctx);

    const result = await listFavoritesTool.handler({}, ctx);
    expect(result.content[0]!.text).toContain('Downtown Cafe');
    expect(result.content[0]!.text).toContain('Love the espresso');
    expect(result.content[0]!.text).toContain('Riverside Park');
  });

  it('isolates favorites between users', async () => {
    const ctx2 = makeCtx(storage, 'user2');
    await saveFavoriteTool.handler({ placeId: 'cafe-1' }, ctx);

    const r1 = await listFavoritesTool.handler({}, ctx);
    const r2 = await listFavoritesTool.handler({}, ctx2);
    expect(r1.content[0]!.text).toContain('Downtown Cafe');
    expect(r2.content[0]!.text).toContain('No favorites');
  });

  it('rejects favorite for nonexistent place', async () => {
    const result = await saveFavoriteTool.handler({ placeId: 'fake' }, ctx);
    expect(result.isError).toBe(true);
  });
});
```

**Step 2: Run tests**

```bash
cd examples/local-guide && npx vitest run
```

Expected: All 7 tests pass.

**Step 3: Commit**

```bash
git add examples/local-guide/src/__tests__/
git commit -m "test(local-guide): add tool tests with seeded place data"
```

---

### Task 15: Verify all examples build and test

**Step 1: Install dependencies from root**

```bash
npm install
```

**Step 2: Run all tests**

```bash
npm run test
```

Expected: All tests across core + 3 examples pass.

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: add 3 example apps (notes, travel-planner, local-guide)"
```

---

## Summary

| Task | What | Effort |
|------|------|--------|
| 1 | Add examples to workspace | 1 min |
| 2-5 | notes-app (generic CRUD) | 10 min |
| 6-9 | travel-planner (entity hierarchy) | 15 min |
| 10-14 | local-guide (shared + user overlay) | 15 min |
| 15 | Integration verify | 5 min |

**Import note:** The examples import from `@scaffold/core` and its storage subpath. If `@scaffold/core` doesn't export `InMemoryAdapter`/`CloudflareKVAdapter` from a public path, you'll need to either:
1. Add `"./storage"` to core's `package.json` exports map, or
2. Import from the internal path directly (less clean but works for examples)

Check this during Task 2 and fix if needed.
