# BBQ Smoking Expert MCP Chatbot — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a BBQ smoking expert assistant as a scaffold framework example that tracks cook sessions, logs events (temp checks, wraps, spritzes), saves recipes, and provides domain-expert guidance — demonstrating the framework's value as a quick niche-chatbot builder.

**Architecture:** Cloudflare Worker MCP server using `@scaffold/core`. Tools manage two entity types (cooks and recipes) with nested log entries under cooks. A static knowledge base of smoking guidelines is embedded directly in tool descriptions and a dedicated lookup tool, so the LLM has expert context without needing RAG. User data is isolated via `{userId}/` key prefixes.

**Tech Stack:** TypeScript, `@scaffold/core`, Cloudflare Workers, KV storage, Vitest

---

## Task 1: Project Scaffolding

**Files:**
- Create: `examples/bbq-smoking/package.json`
- Create: `examples/bbq-smoking/tsconfig.json`
- Create: `examples/bbq-smoking/wrangler.toml`
- Create: `examples/bbq-smoking/src/index.ts`
- Create: `examples/bbq-smoking/src/tools.ts` (empty export placeholder)

**Step 1: Create `package.json`**

Create `examples/bbq-smoking/package.json`:

```json
{
  "name": "@scaffold/example-bbq-smoking",
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
    "@scaffold/core": "*"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240512.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "wrangler": "^3.0.0"
  }
}
```

**Step 2: Create `tsconfig.json`**

Create `examples/bbq-smoking/tsconfig.json`:

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

**Step 3: Create `wrangler.toml`**

Create `examples/bbq-smoking/wrangler.toml`:

```toml
name = "scaffold-bbq-smoking"
main = "src/index.ts"
compatibility_date = "2024-09-23"

[vars]
ADMIN_KEY = "change-me-in-production"

[[kv_namespaces]]
binding = "DATA"
id = "your-kv-namespace-id"
preview_id = "your-preview-kv-namespace-id"
```

**Step 4: Create placeholder `src/tools.ts`**

Create `examples/bbq-smoking/src/tools.ts`:

```typescript
import type { ScaffoldTool } from '@scaffold/core';

export const bbqTools: ScaffoldTool[] = [];
```

**Step 5: Create `src/index.ts` (worker entry point)**

Create `examples/bbq-smoking/src/index.ts`:

```typescript
import { ScaffoldServer, CloudflareKVAdapter, type ScaffoldConfig } from '@scaffold/core';
import { bbqTools } from './tools.js';

interface Env {
  DATA: KVNamespace;
  ADMIN_KEY: string;
}

const config: ScaffoldConfig = {
  app: {
    name: 'Scaffold BBQ Smoking Expert',
    description: 'BBQ smoking assistant — tracks cooks, logs temps, saves recipes, and provides pitmaster guidance',
    version: '0.0.1',
  },
  mcp: {
    serverName: 'scaffold-bbq-smoking',
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
      tools: bbqTools,
    });

    return server.fetch(request, env as unknown as Record<string, unknown>, ctx);
  },
};
```

**Step 6: Install dependencies**

Run: `cd /home/neil/dev/scaffold && npm install`
Expected: Success, new example linked in workspace

**Step 7: Verify typecheck**

Run: `cd /home/neil/dev/scaffold/examples/bbq-smoking && npx tsc --noEmit`
Expected: No errors (tools.ts is just an empty export)

**Step 8: Commit**

```bash
cd /home/neil/dev/scaffold
git add examples/bbq-smoking/
git commit -m "feat(bbq-smoking): scaffold project structure"
```

---

## Task 2: Data Types and Key Helpers

**Files:**
- Create: `examples/bbq-smoking/src/types.ts`
- Create: `examples/bbq-smoking/src/keys.ts`

**Step 1: Create `src/types.ts`**

```typescript
export interface Cook {
  id: string;
  meat: string;           // "brisket", "pork butt", "ribs", "chicken", etc.
  weightLbs: number;
  smokerTempF: number;    // target smoker temp
  targetInternalF: number; // target internal meat temp
  woodType?: string;      // "oak", "hickory", "mesquite", "cherry", etc.
  rub?: string;           // rub description
  status: 'active' | 'completed';
  startedAt: string;      // ISO 8601
  completedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CookLog {
  id: string;
  cookId: string;
  timestamp: string;       // ISO 8601
  event: 'temp_check' | 'wrap' | 'spritz' | 'add_wood' | 'adjust_vent' | 'rest' | 'note';
  meatTempF?: number;
  smokerTempF?: number;
  details?: string;        // freeform (e.g., "wrapped in butcher paper at 165°F")
}

export interface Recipe {
  id: string;
  name: string;
  meat: string;
  smokerTempF: number;
  targetInternalF: number;
  woodType: string;
  estimatedMinutesPerLb: number;
  rub?: string;
  steps: string[];
  tips?: string[];
  createdAt: string;
  updatedAt: string;
}
```

**Step 2: Create `src/keys.ts`**

```typescript
// Per-user cook sessions
export function cookKey(userId: string, cookId: string): string {
  return `${userId}/cooks/${cookId}`;
}

export function cooksPrefix(userId: string): string {
  return `${userId}/cooks/`;
}

// Nested log entries under a cook
export function logKey(userId: string, cookId: string, logId: string): string {
  return `${userId}/cooks/${cookId}/logs/${logId}`;
}

export function logsPrefix(userId: string, cookId: string): string {
  return `${userId}/cooks/${cookId}/logs/`;
}

// Per-user recipes
export function recipeKey(userId: string, recipeId: string): string {
  return `${userId}/recipes/${recipeId}`;
}

export function recipesPrefix(userId: string): string {
  return `${userId}/recipes/`;
}

// ID generator (same pattern as other scaffold examples)
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
```

**Step 3: Verify typecheck**

Run: `cd /home/neil/dev/scaffold/examples/bbq-smoking && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
cd /home/neil/dev/scaffold
git add examples/bbq-smoking/src/types.ts examples/bbq-smoking/src/keys.ts
git commit -m "feat(bbq-smoking): add data types and KV key helpers"
```

---

## Task 3: Cook Session Tools (create, get, list, complete)

**Files:**
- Create: `examples/bbq-smoking/src/tools/cook-tools.ts`
- Create: `examples/bbq-smoking/src/__tests__/cook-tools.test.ts`

**Step 1: Write the failing tests**

Create `examples/bbq-smoking/src/__tests__/cook-tools.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@scaffold/core';
import type { ToolContext } from '@scaffold/core';
import {
  createCookTool,
  getCookTool,
  listCooksTool,
  completeCookTool,
} from '../tools/cook-tools.js';

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

describe('cook session tools', () => {
  let storage: InMemoryAdapter;
  let ctx: ToolContext;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    ctx = makeCtx(storage);
  });

  it('creates a cook and retrieves it', async () => {
    const result = await createCookTool.handler(
      { meat: 'brisket', weightLbs: 14, smokerTempF: 250, targetInternalF: 203, woodType: 'post oak' },
      ctx,
    );
    expect(result.content[0]!.text).toContain('brisket');
    const cookId = extractId(result.content[0]!.text!);
    expect(cookId).toBeTruthy();

    const getResult = await getCookTool.handler({ cookId }, ctx);
    const cook = JSON.parse(getResult.content[0]!.text!);
    expect(cook.meat).toBe('brisket');
    expect(cook.weightLbs).toBe(14);
    expect(cook.status).toBe('active');
    expect(cook.logs).toEqual([]);
  });

  it('lists cooks for the current user', async () => {
    await createCookTool.handler(
      { meat: 'brisket', weightLbs: 12, smokerTempF: 250, targetInternalF: 203 },
      ctx,
    );
    await createCookTool.handler(
      { meat: 'pork butt', weightLbs: 8, smokerTempF: 225, targetInternalF: 195 },
      ctx,
    );

    const result = await listCooksTool.handler({}, ctx);
    expect(result.content[0]!.text).toContain('brisket');
    expect(result.content[0]!.text).toContain('pork butt');
  });

  it('returns empty message when no cooks exist', async () => {
    const result = await listCooksTool.handler({}, ctx);
    expect(result.content[0]!.text).toContain('No cook');
  });

  it('completes an active cook', async () => {
    const createResult = await createCookTool.handler(
      { meat: 'ribs', weightLbs: 4, smokerTempF: 275, targetInternalF: 195 },
      ctx,
    );
    const cookId = extractId(createResult.content[0]!.text!);

    const completeResult = await completeCookTool.handler(
      { cookId, notes: 'Great bark, juicy inside' },
      ctx,
    );
    expect(completeResult.content[0]!.text).toContain('completed');

    const getResult = await getCookTool.handler({ cookId }, ctx);
    const cook = JSON.parse(getResult.content[0]!.text!);
    expect(cook.status).toBe('completed');
    expect(cook.notes).toBe('Great bark, juicy inside');
  });

  it('returns error when completing a non-existent cook', async () => {
    const result = await completeCookTool.handler({ cookId: 'nope' }, ctx);
    expect(result.isError).toBe(true);
  });

  it('isolates cooks between users', async () => {
    const ctx2 = makeCtx(storage, 'user2');
    await createCookTool.handler(
      { meat: 'brisket', weightLbs: 14, smokerTempF: 250, targetInternalF: 203 },
      ctx,
    );
    await createCookTool.handler(
      { meat: 'chicken', weightLbs: 5, smokerTempF: 325, targetInternalF: 165 },
      ctx2,
    );

    const r1 = await listCooksTool.handler({}, ctx);
    const r2 = await listCooksTool.handler({}, ctx2);
    expect(r1.content[0]!.text).toContain('brisket');
    expect(r1.content[0]!.text).not.toContain('chicken');
    expect(r2.content[0]!.text).toContain('chicken');
    expect(r2.content[0]!.text).not.toContain('brisket');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/neil/dev/scaffold/examples/bbq-smoking && npx vitest run src/__tests__/cook-tools.test.ts`
Expected: FAIL — module `../tools/cook-tools.js` does not exist

**Step 3: Implement cook tools**

Create `examples/bbq-smoking/src/tools/cook-tools.ts`:

```typescript
import type { ScaffoldTool, ToolContext, ToolResult } from '@scaffold/core';
import type { Cook, CookLog } from '../types.js';
import { cookKey, cooksPrefix, logsPrefix, generateId } from '../keys.js';

export const createCookTool: ScaffoldTool = {
  name: 'bbq:start_cook',
  description: `Start a new BBQ cook/smoke session. Tracks meat type, weight, temps, and wood choice.
Common combos: brisket (250°F, post oak, target 203°F), pork butt (225°F, hickory/cherry, target 195°F),
ribs (275°F, cherry/apple, target 190-203°F), chicken (325°F, apple/pecan, target 165°F).`,
  inputSchema: {
    type: 'object',
    properties: {
      meat: { type: 'string', description: 'Type of meat (e.g., brisket, pork butt, ribs, chicken)' },
      weightLbs: { type: 'number', description: 'Weight in pounds' },
      smokerTempF: { type: 'number', description: 'Target smoker temperature in °F' },
      targetInternalF: { type: 'number', description: 'Target internal meat temperature in °F' },
      woodType: { type: 'string', description: 'Wood type (e.g., post oak, hickory, cherry, apple, mesquite, pecan)' },
      rub: { type: 'string', description: 'Rub or seasoning description' },
    },
    required: ['meat', 'weightLbs', 'smokerTempF', 'targetInternalF'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const params = input as {
      meat: string; weightLbs: number; smokerTempF: number;
      targetInternalF: number; woodType?: string; rub?: string;
    };
    const id = generateId();
    const now = new Date().toISOString();

    const cook: Cook = {
      id,
      meat: params.meat,
      weightLbs: params.weightLbs,
      smokerTempF: params.smokerTempF,
      targetInternalF: params.targetInternalF,
      woodType: params.woodType,
      rub: params.rub,
      status: 'active',
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await ctx.storage.put(cookKey(ctx.userId, id), cook);

    const estimate = params.weightLbs * 60; // ~60 min/lb rough estimate
    const hours = Math.floor(estimate / 60);
    const mins = estimate % 60;

    return {
      content: [{
        type: 'text',
        text: `🔥 Started cooking ${params.meat} (${id}) — ${params.weightLbs} lbs at ${params.smokerTempF}°F${params.woodType ? ` with ${params.woodType}` : ''}. Rough estimate: ${hours}h${mins > 0 ? ` ${mins}m` : ''}. Use bbq:add_log to track progress.`,
      }],
    };
  },
};

export const getCookTool: ScaffoldTool = {
  name: 'bbq:get_cook',
  description: 'Get full details of a cook session including all log entries (temp checks, wraps, spritzes, etc.).',
  inputSchema: {
    type: 'object',
    properties: {
      cookId: { type: 'string', description: 'Cook session ID' },
    },
    required: ['cookId'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { cookId } = input as { cookId: string };
    const cook = await ctx.storage.get<Cook>(cookKey(ctx.userId, cookId));

    if (!cook) {
      return { content: [{ type: 'text', text: `Cook "${cookId}" not found.` }], isError: true };
    }

    const logsList = await ctx.storage.list(logsPrefix(ctx.userId, cookId));
    const logs: CookLog[] = [];
    for (const key of logsList.keys) {
      const log = await ctx.storage.get<CookLog>(key);
      if (log) logs.push(log);
    }
    logs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ ...cook, logs }, null, 2),
      }],
    };
  },
};

export const listCooksTool: ScaffoldTool = {
  name: 'bbq:list_cooks',
  description: 'List all cook sessions for the current user. Shows active and completed cooks.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  handler: async (_input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const prefix = cooksPrefix(ctx.userId);
    const result = await ctx.storage.list(prefix);

    // Filter to only top-level cook keys (not nested logs)
    const cookKeys = result.keys.filter(k => {
      const rel = k.slice(prefix.length);
      return !rel.includes('/');
    });

    if (cookKeys.length === 0) {
      return { content: [{ type: 'text', text: 'No cook sessions found. Use bbq:start_cook to begin one!' }] };
    }

    const cooks: Cook[] = [];
    for (const key of cookKeys) {
      const cook = await ctx.storage.get<Cook>(key);
      if (cook) cooks.push(cook);
    }

    const summary = cooks
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(c => {
        const status = c.status === 'active' ? '🔥' : '✅';
        return `${status} **${c.meat}** (${c.id}) — ${c.weightLbs} lbs at ${c.smokerTempF}°F [${c.status}]`;
      })
      .join('\n');

    return { content: [{ type: 'text', text: summary }] };
  },
};

export const completeCookTool: ScaffoldTool = {
  name: 'bbq:complete_cook',
  description: 'Mark a cook session as completed. Add final notes about how it turned out.',
  inputSchema: {
    type: 'object',
    properties: {
      cookId: { type: 'string', description: 'Cook session ID' },
      notes: { type: 'string', description: 'Final notes (bark quality, tenderness, what you would change)' },
    },
    required: ['cookId'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { cookId, notes } = input as { cookId: string; notes?: string };
    const cook = await ctx.storage.get<Cook>(cookKey(ctx.userId, cookId));

    if (!cook) {
      return { content: [{ type: 'text', text: `Cook "${cookId}" not found.` }], isError: true };
    }

    cook.status = 'completed';
    cook.completedAt = new Date().toISOString();
    cook.updatedAt = new Date().toISOString();
    if (notes) cook.notes = notes;

    await ctx.storage.put(cookKey(ctx.userId, cookId), cook);

    const duration = cook.completedAt && cook.startedAt
      ? Math.round((new Date(cook.completedAt).getTime() - new Date(cook.startedAt).getTime()) / 3600000 * 10) / 10
      : null;

    return {
      content: [{
        type: 'text',
        text: `✅ ${cook.meat} cook completed!${duration ? ` Total time: ${duration} hours.` : ''}${notes ? ` Notes: ${notes}` : ''}`,
      }],
    };
  },
};
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/neil/dev/scaffold/examples/bbq-smoking && npx vitest run src/__tests__/cook-tools.test.ts`
Expected: All 6 tests PASS

**Step 5: Commit**

```bash
cd /home/neil/dev/scaffold
git add examples/bbq-smoking/src/tools/cook-tools.ts examples/bbq-smoking/src/__tests__/cook-tools.test.ts
git commit -m "feat(bbq-smoking): cook session CRUD tools with tests"
```

---

## Task 4: Cook Log Tools (add_log)

**Files:**
- Create: `examples/bbq-smoking/src/tools/log-tools.ts`
- Create: `examples/bbq-smoking/src/__tests__/log-tools.test.ts`

**Step 1: Write the failing tests**

Create `examples/bbq-smoking/src/__tests__/log-tools.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@scaffold/core';
import type { ToolContext } from '@scaffold/core';
import { createCookTool, getCookTool } from '../tools/cook-tools.js';
import { addLogTool } from '../tools/log-tools.js';

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

describe('cook log tools', () => {
  let storage: InMemoryAdapter;
  let ctx: ToolContext;
  let cookId: string;

  beforeEach(async () => {
    storage = new InMemoryAdapter();
    ctx = makeCtx(storage);
    const result = await createCookTool.handler(
      { meat: 'brisket', weightLbs: 14, smokerTempF: 250, targetInternalF: 203 },
      ctx,
    );
    cookId = extractId(result.content[0]!.text!);
  });

  it('logs a temp check', async () => {
    const result = await addLogTool.handler(
      { cookId, event: 'temp_check', meatTempF: 160, smokerTempF: 248 },
      ctx,
    );
    expect(result.content[0]!.text).toContain('temp_check');
    expect(result.content[0]!.text).toContain('160');
  });

  it('logs a wrap event', async () => {
    const result = await addLogTool.handler(
      { cookId, event: 'wrap', meatTempF: 165, details: 'Wrapped in butcher paper' },
      ctx,
    );
    expect(result.content[0]!.text).toContain('wrap');
  });

  it('logs appear in cook details', async () => {
    await addLogTool.handler(
      { cookId, event: 'temp_check', meatTempF: 140, smokerTempF: 250 },
      ctx,
    );
    await addLogTool.handler(
      { cookId, event: 'spritz', details: 'Apple cider vinegar spritz' },
      ctx,
    );
    await addLogTool.handler(
      { cookId, event: 'wrap', meatTempF: 165 },
      ctx,
    );

    const getResult = await getCookTool.handler({ cookId }, ctx);
    const cook = JSON.parse(getResult.content[0]!.text!);
    expect(cook.logs).toHaveLength(3);
    expect(cook.logs[0].event).toBe('temp_check');
    expect(cook.logs[1].event).toBe('spritz');
    expect(cook.logs[2].event).toBe('wrap');
  });

  it('returns error for non-existent cook', async () => {
    const result = await addLogTool.handler(
      { cookId: 'nope', event: 'temp_check', meatTempF: 150 },
      ctx,
    );
    expect(result.isError).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/neil/dev/scaffold/examples/bbq-smoking && npx vitest run src/__tests__/log-tools.test.ts`
Expected: FAIL — module `../tools/log-tools.js` does not exist

**Step 3: Implement add_log tool**

Create `examples/bbq-smoking/src/tools/log-tools.ts`:

```typescript
import type { ScaffoldTool, ToolContext, ToolResult } from '@scaffold/core';
import type { Cook, CookLog } from '../types.js';
import { cookKey, logKey, generateId } from '../keys.js';

export const addLogTool: ScaffoldTool = {
  name: 'bbq:add_log',
  description: `Log an event during an active cook. Events: temp_check, wrap, spritz, add_wood, adjust_vent, rest, note.
Tips: Log temp every 30-60 min. Wrap brisket/pork butt at the stall (~150-170°F). Spritz every 45 min after bark sets.`,
  inputSchema: {
    type: 'object',
    properties: {
      cookId: { type: 'string', description: 'Cook session ID' },
      event: {
        type: 'string',
        enum: ['temp_check', 'wrap', 'spritz', 'add_wood', 'adjust_vent', 'rest', 'note'],
        description: 'Type of event',
      },
      meatTempF: { type: 'number', description: 'Current internal meat temp in °F' },
      smokerTempF: { type: 'number', description: 'Current smoker temp in °F' },
      details: { type: 'string', description: 'Freeform details (e.g., "wrapped in butcher paper", "added 2 chunks of cherry")' },
    },
    required: ['cookId', 'event'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const params = input as {
      cookId: string; event: CookLog['event'];
      meatTempF?: number; smokerTempF?: number; details?: string;
    };

    const cook = await ctx.storage.get<Cook>(cookKey(ctx.userId, params.cookId));
    if (!cook) {
      return { content: [{ type: 'text', text: `Cook "${params.cookId}" not found.` }], isError: true };
    }

    const id = generateId();
    const log: CookLog = {
      id,
      cookId: params.cookId,
      timestamp: new Date().toISOString(),
      event: params.event,
      meatTempF: params.meatTempF,
      smokerTempF: params.smokerTempF,
      details: params.details,
    };

    await ctx.storage.put(logKey(ctx.userId, params.cookId, id), log);

    // Update cook's updatedAt
    cook.updatedAt = new Date().toISOString();
    await ctx.storage.put(cookKey(ctx.userId, params.cookId), cook);

    // Build a human-friendly confirmation
    const parts = [`📝 Logged ${params.event}`];
    if (params.meatTempF) parts.push(`meat: ${params.meatTempF}°F`);
    if (params.smokerTempF) parts.push(`smoker: ${params.smokerTempF}°F`);
    if (params.details) parts.push(`— ${params.details}`);

    // Provide guidance based on event
    if (params.event === 'temp_check' && params.meatTempF) {
      const remaining = cook.targetInternalF - params.meatTempF;
      if (remaining > 0) {
        parts.push(`(${remaining}°F to go)`);
      } else {
        parts.push(`🎯 Target temp reached! Consider pulling it.`);
      }
    }

    return {
      content: [{ type: 'text', text: parts.join(' | ') }],
    };
  },
};
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/neil/dev/scaffold/examples/bbq-smoking && npx vitest run src/__tests__/log-tools.test.ts`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
cd /home/neil/dev/scaffold
git add examples/bbq-smoking/src/tools/log-tools.ts examples/bbq-smoking/src/__tests__/log-tools.test.ts
git commit -m "feat(bbq-smoking): cook log tool with temp tracking"
```

---

## Task 5: Recipe Tools (save, get, list)

**Files:**
- Create: `examples/bbq-smoking/src/tools/recipe-tools.ts`
- Create: `examples/bbq-smoking/src/__tests__/recipe-tools.test.ts`

**Step 1: Write the failing tests**

Create `examples/bbq-smoking/src/__tests__/recipe-tools.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@scaffold/core';
import type { ToolContext } from '@scaffold/core';
import {
  saveRecipeTool,
  getRecipeTool,
  listRecipesTool,
} from '../tools/recipe-tools.js';

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

describe('recipe tools', () => {
  let storage: InMemoryAdapter;
  let ctx: ToolContext;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    ctx = makeCtx(storage);
  });

  it('saves a recipe and retrieves it', async () => {
    const result = await saveRecipeTool.handler({
      name: 'Texas-Style Brisket',
      meat: 'brisket',
      smokerTempF: 250,
      targetInternalF: 203,
      woodType: 'post oak',
      estimatedMinutesPerLb: 60,
      rub: '50/50 salt and coarse black pepper',
      steps: [
        'Trim fat cap to 1/4 inch',
        'Apply rub generously',
        'Smoke fat side up at 250°F',
        'Spritz with apple cider vinegar every 45 min after bark sets',
        'Wrap in butcher paper at 165°F internal',
        'Pull at 203°F when probe tender',
        'Rest in cooler for 1-2 hours',
      ],
      tips: ['The stall is normal — don\'t panic', 'Probe tender matters more than exact temp'],
    }, ctx);

    expect(result.content[0]!.text).toContain('Texas-Style Brisket');
    const recipeId = extractId(result.content[0]!.text!);

    const getResult = await getRecipeTool.handler({ recipeId }, ctx);
    const recipe = JSON.parse(getResult.content[0]!.text!);
    expect(recipe.name).toBe('Texas-Style Brisket');
    expect(recipe.steps).toHaveLength(7);
    expect(recipe.tips).toHaveLength(2);
  });

  it('lists all recipes', async () => {
    await saveRecipeTool.handler({
      name: 'Simple Ribs',
      meat: 'ribs',
      smokerTempF: 275,
      targetInternalF: 195,
      woodType: 'cherry',
      estimatedMinutesPerLb: 75,
      steps: ['Season', 'Smoke 3 hrs', 'Wrap 2 hrs', 'Sauce 1 hr'],
    }, ctx);
    await saveRecipeTool.handler({
      name: 'Pulled Pork',
      meat: 'pork butt',
      smokerTempF: 225,
      targetInternalF: 195,
      woodType: 'hickory',
      estimatedMinutesPerLb: 90,
      steps: ['Rub overnight', 'Smoke at 225', 'Wrap at 160', 'Pull at 195'],
    }, ctx);

    const result = await listRecipesTool.handler({}, ctx);
    expect(result.content[0]!.text).toContain('Simple Ribs');
    expect(result.content[0]!.text).toContain('Pulled Pork');
  });

  it('returns empty message when no recipes exist', async () => {
    const result = await listRecipesTool.handler({}, ctx);
    expect(result.content[0]!.text).toContain('No recipe');
  });

  it('returns error for non-existent recipe', async () => {
    const result = await getRecipeTool.handler({ recipeId: 'nope' }, ctx);
    expect(result.isError).toBe(true);
  });

  it('isolates recipes between users', async () => {
    const ctx2 = makeCtx(storage, 'user2');
    await saveRecipeTool.handler({
      name: 'My Brisket', meat: 'brisket', smokerTempF: 250,
      targetInternalF: 203, woodType: 'oak', estimatedMinutesPerLb: 60,
      steps: ['smoke it'],
    }, ctx);
    await saveRecipeTool.handler({
      name: 'My Chicken', meat: 'chicken', smokerTempF: 325,
      targetInternalF: 165, woodType: 'apple', estimatedMinutesPerLb: 30,
      steps: ['smoke it'],
    }, ctx2);

    const r1 = await listRecipesTool.handler({}, ctx);
    const r2 = await listRecipesTool.handler({}, ctx2);
    expect(r1.content[0]!.text).toContain('My Brisket');
    expect(r1.content[0]!.text).not.toContain('My Chicken');
    expect(r2.content[0]!.text).toContain('My Chicken');
    expect(r2.content[0]!.text).not.toContain('My Brisket');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/neil/dev/scaffold/examples/bbq-smoking && npx vitest run src/__tests__/recipe-tools.test.ts`
Expected: FAIL — module `../tools/recipe-tools.js` does not exist

**Step 3: Implement recipe tools**

Create `examples/bbq-smoking/src/tools/recipe-tools.ts`:

```typescript
import type { ScaffoldTool, ToolContext, ToolResult } from '@scaffold/core';
import type { Recipe } from '../types.js';
import { recipeKey, recipesPrefix, generateId } from '../keys.js';

export const saveRecipeTool: ScaffoldTool = {
  name: 'bbq:save_recipe',
  description: 'Save a BBQ smoking recipe for future reference. Include steps, wood type, temps, and tips.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Recipe name' },
      meat: { type: 'string', description: 'Meat type' },
      smokerTempF: { type: 'number', description: 'Smoker temperature in °F' },
      targetInternalF: { type: 'number', description: 'Target internal temperature in °F' },
      woodType: { type: 'string', description: 'Wood type' },
      estimatedMinutesPerLb: { type: 'number', description: 'Estimated cook time in minutes per pound' },
      rub: { type: 'string', description: 'Rub or seasoning' },
      steps: { type: 'array', items: { type: 'string' }, description: 'Ordered steps' },
      tips: { type: 'array', items: { type: 'string' }, description: 'Pro tips' },
    },
    required: ['name', 'meat', 'smokerTempF', 'targetInternalF', 'woodType', 'estimatedMinutesPerLb', 'steps'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const params = input as {
      name: string; meat: string; smokerTempF: number; targetInternalF: number;
      woodType: string; estimatedMinutesPerLb: number; rub?: string;
      steps: string[]; tips?: string[];
    };

    const id = generateId();
    const now = new Date().toISOString();

    const recipe: Recipe = {
      id,
      name: params.name,
      meat: params.meat,
      smokerTempF: params.smokerTempF,
      targetInternalF: params.targetInternalF,
      woodType: params.woodType,
      estimatedMinutesPerLb: params.estimatedMinutesPerLb,
      rub: params.rub,
      steps: params.steps,
      tips: params.tips,
      createdAt: now,
      updatedAt: now,
    };

    await ctx.storage.put(recipeKey(ctx.userId, id), recipe);

    return {
      content: [{
        type: 'text',
        text: `📖 Saved recipe "${params.name}" (${id}) — ${params.meat} at ${params.smokerTempF}°F with ${params.woodType}, ${params.steps.length} steps.`,
      }],
    };
  },
};

export const getRecipeTool: ScaffoldTool = {
  name: 'bbq:get_recipe',
  description: 'Get full recipe details including steps and tips.',
  inputSchema: {
    type: 'object',
    properties: {
      recipeId: { type: 'string', description: 'Recipe ID' },
    },
    required: ['recipeId'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { recipeId } = input as { recipeId: string };
    const recipe = await ctx.storage.get<Recipe>(recipeKey(ctx.userId, recipeId));

    if (!recipe) {
      return { content: [{ type: 'text', text: `Recipe "${recipeId}" not found.` }], isError: true };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(recipe, null, 2),
      }],
    };
  },
};

export const listRecipesTool: ScaffoldTool = {
  name: 'bbq:list_recipes',
  description: 'List all saved BBQ recipes.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  handler: async (_input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const prefix = recipesPrefix(ctx.userId);
    const result = await ctx.storage.list(prefix);

    if (result.keys.length === 0) {
      return { content: [{ type: 'text', text: 'No recipes saved yet. Use bbq:save_recipe to save one!' }] };
    }

    const recipes: Recipe[] = [];
    for (const key of result.keys) {
      const recipe = await ctx.storage.get<Recipe>(key);
      if (recipe) recipes.push(recipe);
    }

    const summary = recipes
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(r => `- 📖 **${r.name}** (${r.id}) — ${r.meat}, ${r.smokerTempF}°F, ${r.woodType}`)
      .join('\n');

    return { content: [{ type: 'text', text: summary }] };
  },
};
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/neil/dev/scaffold/examples/bbq-smoking && npx vitest run src/__tests__/recipe-tools.test.ts`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
cd /home/neil/dev/scaffold
git add examples/bbq-smoking/src/tools/recipe-tools.ts examples/bbq-smoking/src/__tests__/recipe-tools.test.ts
git commit -m "feat(bbq-smoking): recipe CRUD tools with tests"
```

---

## Task 6: Smoking Guide Lookup Tool

**Files:**
- Create: `examples/bbq-smoking/src/tools/guide-tools.ts`
- Create: `examples/bbq-smoking/src/__tests__/guide-tools.test.ts`

This is the "expert knowledge" tool — it gives the LLM structured BBQ data to reference, making it a real domain expert rather than just relying on training data.

**Step 1: Write the failing tests**

Create `examples/bbq-smoking/src/__tests__/guide-tools.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@scaffold/core';
import type { ToolContext } from '@scaffold/core';
import { smokingGuideTool } from '../tools/guide-tools.js';

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

describe('smoking guide tool', () => {
  let storage: InMemoryAdapter;
  let ctx: ToolContext;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    ctx = makeCtx(storage);
  });

  it('returns guide for brisket', async () => {
    const result = await smokingGuideTool.handler({ meat: 'brisket' }, ctx);
    const text = result.content[0]!.text!;
    expect(text).toContain('brisket');
    expect(text).toContain('250');
    expect(text).toContain('203');
  });

  it('returns guide for ribs', async () => {
    const result = await smokingGuideTool.handler({ meat: 'ribs' }, ctx);
    expect(result.content[0]!.text).toContain('ribs');
  });

  it('returns guide for pork butt', async () => {
    const result = await smokingGuideTool.handler({ meat: 'pork butt' }, ctx);
    expect(result.content[0]!.text).toContain('pork');
  });

  it('returns all guides when no meat specified', async () => {
    const result = await smokingGuideTool.handler({}, ctx);
    const text = result.content[0]!.text!;
    expect(text).toContain('brisket');
    expect(text).toContain('ribs');
    expect(text).toContain('pork');
    expect(text).toContain('chicken');
  });

  it('returns helpful message for unknown meat', async () => {
    const result = await smokingGuideTool.handler({ meat: 'tofu' }, ctx);
    expect(result.content[0]!.text).toContain('don\'t have');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/neil/dev/scaffold/examples/bbq-smoking && npx vitest run src/__tests__/guide-tools.test.ts`
Expected: FAIL — module `../tools/guide-tools.js` does not exist

**Step 3: Implement guide tool with embedded knowledge**

Create `examples/bbq-smoking/src/tools/guide-tools.ts`:

```typescript
import type { ScaffoldTool, ToolContext, ToolResult } from '@scaffold/core';

interface SmokingGuide {
  meat: string;
  smokerTempF: string;
  targetInternalF: string;
  timePerLb: string;
  bestWood: string[];
  wrapTemp?: string;
  wrapMaterial?: string;
  keyTips: string[];
}

const GUIDES: SmokingGuide[] = [
  {
    meat: 'brisket',
    smokerTempF: '225-275°F (250°F is the sweet spot)',
    targetInternalF: '195-205°F (203°F is ideal, but probe-tender is the real test)',
    timePerLb: '60-90 min/lb',
    bestWood: ['post oak', 'hickory', 'mesquite (sparingly)'],
    wrapTemp: '160-170°F (when the stall hits)',
    wrapMaterial: 'Butcher paper (breathes, preserves bark) or foil (faster, softer bark)',
    keyTips: [
      'The stall at 150-170°F is caused by evaporative cooling — it\'s normal, don\'t crank the heat',
      'Fat cap orientation is debated: up retains moisture, down protects from direct heat',
      'Rest for minimum 1 hour, ideally 2-4 hours in a cooler wrapped in towels',
      'Slice against the grain — the flat and point have different grain directions',
      'The flat and point can be separated and sliced differently',
      'Spritz with apple cider vinegar or beef broth every 45 min after bark sets',
    ],
  },
  {
    meat: 'pork butt',
    smokerTempF: '225-250°F',
    targetInternalF: '195-205°F (must be probe-tender for pulling)',
    timePerLb: '75-90 min/lb',
    bestWood: ['hickory', 'cherry', 'apple', 'pecan'],
    wrapTemp: '160-170°F',
    wrapMaterial: 'Foil or butcher paper',
    keyTips: [
      'Very forgiving cut — hard to overcook due to high fat and collagen content',
      'The bone should slide out clean when done',
      'Let rest 30-60 min before pulling',
      'Apply mustard as a binder before rub — it cooks off but helps bark form',
      'Save the drippings to mix back into pulled pork',
    ],
  },
  {
    meat: 'ribs',
    smokerTempF: '250-275°F',
    targetInternalF: '190-205°F (or use the bend test)',
    timePerLb: '5-6 hours total for a full rack (3-2-1 method for spare ribs, 2-2-1 for baby backs)',
    bestWood: ['cherry', 'apple', 'hickory', 'pecan'],
    wrapTemp: 'After 2-3 hours when bark sets',
    wrapMaterial: 'Foil with liquid (apple juice, butter, brown sugar)',
    keyTips: [
      '3-2-1 method: 3 hrs smoke, 2 hrs wrapped, 1 hr unwrapped with sauce',
      'Remove membrane from bone side before seasoning',
      'The bend test: pick up the rack from one end — it should bend and crack but not break apart',
      'Baby backs cook faster than spare ribs — adjust time accordingly',
      'Meat pulling back from bones 1/4 to 1/2 inch is a good visual cue',
    ],
  },
  {
    meat: 'chicken',
    smokerTempF: '300-350°F (higher than other meats to get crispy skin)',
    targetInternalF: '165°F in the thickest part of the thigh',
    timePerLb: '30-45 min/lb',
    bestWood: ['apple', 'cherry', 'pecan', 'maple'],
    keyTips: [
      'Spatchcock (butterfly) for even cooking — remove the backbone',
      'Higher temp is critical: low and slow makes rubbery chicken skin',
      'Brine for 4-12 hours for juicier results',
      'Pat skin completely dry and optionally apply baking powder for crispier skin',
      'Let rest 10-15 min before carving',
    ],
  },
  {
    meat: 'turkey',
    smokerTempF: '275-325°F',
    targetInternalF: '165°F breast, 175°F thigh',
    timePerLb: '20-30 min/lb at 300°F',
    bestWood: ['cherry', 'apple', 'pecan', 'maple'],
    keyTips: [
      'Spatchcock for even cooking and shorter cook time',
      'Brine 12-24 hours (wet or dry brine)',
      'Shield the breast with foil if it\'s getting ahead of the thighs',
      'Compound butter under the skin adds flavor and moisture',
      'Dark meat takes longer — removing legs and cooking separately is an option',
    ],
  },
  {
    meat: 'salmon',
    smokerTempF: '200-225°F (low and gentle)',
    targetInternalF: '145°F (or when it flakes easily)',
    timePerLb: '45-60 min total for fillets',
    bestWood: ['alder', 'apple', 'cherry', 'maple'],
    keyTips: [
      'Cure with salt and brown sugar for 4-12 hours, then air-dry to form pellicle',
      'The pellicle (tacky surface) is essential — it catches smoke',
      'Don\'t flip — use a plank or foil',
      'White albumin on surface is normal but can be reduced by brining',
      'Done when it flakes at the thickest part',
    ],
  },
];

function formatGuide(guide: SmokingGuide): string {
  let text = `## ${guide.meat.toUpperCase()}\n`;
  text += `- **Smoker temp:** ${guide.smokerTempF}\n`;
  text += `- **Target internal:** ${guide.targetInternalF}\n`;
  text += `- **Time:** ${guide.timePerLb}\n`;
  text += `- **Best wood:** ${guide.bestWood.join(', ')}\n`;
  if (guide.wrapTemp) text += `- **Wrap at:** ${guide.wrapTemp}\n`;
  if (guide.wrapMaterial) text += `- **Wrap with:** ${guide.wrapMaterial}\n`;
  text += `- **Tips:**\n`;
  for (const tip of guide.keyTips) {
    text += `  - ${tip}\n`;
  }
  return text;
}

export const smokingGuideTool: ScaffoldTool = {
  name: 'bbq:smoking_guide',
  description: `Look up BBQ smoking guidelines for a specific meat. Returns temps, times, wood pairings, wrapping guidance, and pro tips. Available meats: brisket, pork butt, ribs, chicken, turkey, salmon. Call with no arguments to get all guides.`,
  inputSchema: {
    type: 'object',
    properties: {
      meat: { type: 'string', description: 'Meat type to look up (optional — omit for all guides)' },
    },
  },
  handler: async (input: unknown, _ctx: ToolContext): Promise<ToolResult> => {
    const { meat } = (input as { meat?: string }) || {};

    if (!meat) {
      const all = GUIDES.map(formatGuide).join('\n---\n\n');
      return { content: [{ type: 'text', text: all }] };
    }

    const normalized = meat.toLowerCase().trim();
    const guide = GUIDES.find(g =>
      g.meat === normalized ||
      normalized.includes(g.meat) ||
      g.meat.includes(normalized)
    );

    if (!guide) {
      const available = GUIDES.map(g => g.meat).join(', ');
      return {
        content: [{
          type: 'text',
          text: `I don't have a specific smoking guide for "${meat}". Available guides: ${available}. I can still help with general smoking advice!`,
        }],
      };
    }

    return { content: [{ type: 'text', text: formatGuide(guide) }] };
  },
};
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/neil/dev/scaffold/examples/bbq-smoking && npx vitest run src/__tests__/guide-tools.test.ts`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
cd /home/neil/dev/scaffold
git add examples/bbq-smoking/src/tools/guide-tools.ts examples/bbq-smoking/src/__tests__/guide-tools.test.ts
git commit -m "feat(bbq-smoking): smoking guide lookup with embedded BBQ knowledge"
```

---

## Task 7: Wire Up All Tools and Run Full Test Suite

**Files:**
- Modify: `examples/bbq-smoking/src/tools.ts` (replace placeholder)

**Step 1: Update `src/tools.ts` to export all tools**

Replace `examples/bbq-smoking/src/tools.ts` with:

```typescript
import type { ScaffoldTool } from '@scaffold/core';
import { createCookTool, getCookTool, listCooksTool, completeCookTool } from './tools/cook-tools.js';
import { addLogTool } from './tools/log-tools.js';
import { saveRecipeTool, getRecipeTool, listRecipesTool } from './tools/recipe-tools.js';
import { smokingGuideTool } from './tools/guide-tools.js';

export const bbqTools: ScaffoldTool[] = [
  // Cook session management
  createCookTool,
  getCookTool,
  listCooksTool,
  completeCookTool,

  // Cook logging
  addLogTool,

  // Recipes
  saveRecipeTool,
  getRecipeTool,
  listRecipesTool,

  // Knowledge base
  smokingGuideTool,
];
```

**Step 2: Run full test suite**

Run: `cd /home/neil/dev/scaffold/examples/bbq-smoking && npx vitest run`
Expected: All tests pass (15 tests across 3 test files)

**Step 3: Run typecheck**

Run: `cd /home/neil/dev/scaffold/examples/bbq-smoking && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
cd /home/neil/dev/scaffold
git add examples/bbq-smoking/src/tools.ts
git commit -m "feat(bbq-smoking): wire up all 9 tools in main export"
```

---

## Task 8: Create README

**Files:**
- Create: `examples/bbq-smoking/README.md`

**Step 1: Write README**

Create `examples/bbq-smoking/README.md`:

```markdown
# 🔥 BBQ Smoking Expert

A BBQ smoking assistant built on the [Scaffold MCP framework](../../). Tracks cook sessions, logs events (temp checks, wraps, spritzes), saves recipes, and provides pitmaster-level guidance.

## Tools (9 total)

### Cook Sessions
| Tool | Description |
|------|-------------|
| `bbq:start_cook` | Start a new smoke session (meat, weight, temp, wood) |
| `bbq:get_cook` | Get full cook details with timeline of log entries |
| `bbq:list_cooks` | List all your cook sessions |
| `bbq:complete_cook` | Mark a cook done with final notes |

### Cook Logging
| Tool | Description |
|------|-------------|
| `bbq:add_log` | Log events: temp_check, wrap, spritz, add_wood, adjust_vent, rest, note |

### Recipes
| Tool | Description |
|------|-------------|
| `bbq:save_recipe` | Save a recipe with steps, temps, wood, and tips |
| `bbq:get_recipe` | View a saved recipe |
| `bbq:list_recipes` | Browse your saved recipes |

### Knowledge Base
| Tool | Description |
|------|-------------|
| `bbq:smoking_guide` | Look up smoking guidelines by meat type (brisket, pork butt, ribs, chicken, turkey, salmon) |

## Quick Start

```bash
# Install dependencies (from monorepo root)
cd /path/to/scaffold
npm install

# Run tests
cd examples/bbq-smoking
npm test

# Local dev
npm run dev
```

## Example Conversation

> **User:** I'm about to smoke a 14lb brisket for the first time. Help me out!
>
> **Assistant:** *calls bbq:smoking_guide for brisket, then bbq:start_cook*
>
> Let me pull up the brisket guide and start tracking your cook...

## Deploy

```bash
# Create KV namespace
wrangler kv namespace create DATA
# Update wrangler.toml with the namespace ID
npm run deploy
```
```

**Step 2: Commit**

```bash
cd /home/neil/dev/scaffold
git add examples/bbq-smoking/README.md
git commit -m "docs(bbq-smoking): add README with tool reference"
```

---

## Summary

**Total: 9 tools across 4 categories**

| Category | Tools | Purpose |
|----------|-------|---------|
| Cook Sessions | start_cook, get_cook, list_cooks, complete_cook | Track active and past smokes |
| Cook Logging | add_log | Timeline of temp checks, wraps, spritzes, etc. |
| Recipes | save_recipe, get_recipe, list_recipes | Personal recipe book |
| Knowledge Base | smoking_guide | Embedded expert BBQ data |

**Files created: 12**
- 4 config files (package.json, tsconfig.json, wrangler.toml, README)
- 1 worker entry point (src/index.ts)
- 1 tool barrel export (src/tools.ts)
- 2 shared modules (src/types.ts, src/keys.ts)
- 4 tool modules in src/tools/ (cook, log, recipe, guide)
- 3 test files in src/__tests__/

**Test coverage: 15 tests** covering all tools, error cases, and user isolation.
