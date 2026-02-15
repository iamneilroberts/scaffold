# Building Domain Experts with Scaffold

This guide walks you through building a domain-expert MCP assistant from scratch — an AI tool server that knows your domain, tracks data, and connects to Claude.

> **Want to skip the manual steps?** Run `/scaffold-assistant` in Claude Code to generate everything interactively.

## Prerequisites

- Node.js 18+
- npm
- A Cloudflare account (free tier works)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm install -g wrangler`)

---

## 1. Design Your Expert

Before writing code, answer these questions:

**Domain & Purpose:** What does your assistant do? Give it a name and a one-line description.
- Example: "BBQ Smoking Expert — tracks cooks, logs temps, saves recipes, provides pitmaster guidance"

**Entities:** What things does it track?
- Example: Cook sessions, cook logs, recipes

**Actions:** What can users do with each entity?
- Default set: create, get, list, update, delete
- Domain-specific: complete a cook, add a log entry, look up a guide

**Relationships:** How do entities relate?
- Example: A cook session has many log entries (parent/child in KV)

**Knowledge:** What does your assistant "know"?
- Example: Smoking temperatures per meat, wood pairings, timing guidelines

**Quality checks:** Which actions should warn about potential issues?
- Example: Completing a cook with fewer than 2 temperature logs

---

## 2. Set Up the Project

```bash
mkdir my-expert && cd my-expert
npm init -y
npm install @voygent/scaffold-core
npm install -D @cloudflare/workers-types typescript vitest wrangler
```

Create the project structure:

```
my-expert/
├── package.json
├── tsconfig.json
├── wrangler.toml
├── .dev.vars
├── .gitignore
└── src/
    ├── index.ts          # Entry point
    ├── types.ts          # Entity interfaces
    ├── keys.ts           # KV key helpers
    ├── tools.ts          # Tool barrel export
    ├── tools/
    │   ├── {entity}-tools.ts   # Tools per entity
    │   ├── guide-tools.ts      # Knowledge lookup
    │   └── learn-tool.ts       # Runtime knowledge ingestion
    └── __tests__/
        ├── {entity}-tools.test.ts
        ├── guide-tools.test.ts
        └── learn-tool.test.ts
```

### package.json

```json
{
  "name": "my-expert",
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
    "@voygent/scaffold-core": "^0.1.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240512.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "wrangler": "^3.0.0"
  }
}
```

### tsconfig.json

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

### wrangler.toml

```toml
name = "scaffold-my-expert"
main = "src/index.ts"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]
workers_dev = true

[[kv_namespaces]]
binding = "DATA"
id = "placeholder"
preview_id = "placeholder"
```

### .dev.vars

```
ADMIN_KEY=dev-key-change-before-deploying
```

### .gitignore

```
node_modules/
dist/
.dev.vars
.wrangler/
```

---

## 3. Build Your Tools

### Define entity types (`src/types.ts`)

Every entity needs `id`, `createdAt`, and `updatedAt`:

```typescript
export interface Recipe {
  id: string;
  name: string;
  meat: string;
  smokerTempF: number;
  targetInternalF: number;
  woodType: string;
  steps: string[];
  tips?: string[];
  createdAt: string;
  updatedAt: string;
}
```

Use `string` for timestamps (ISO 8601). Use union types for status fields: `'active' | 'completed'`.

### Define key helpers (`src/keys.ts`)

Keys follow the pattern `{userId}/{entity}/{id}`. This ensures user isolation automatically.

```typescript
export function recipeKey(userId: string, recipeId: string): string {
  return `${userId}/recipes/${recipeId}`;
}

export function recipesPrefix(userId: string): string {
  return `${userId}/recipes/`;
}

// For parent/child: {userId}/cooks/{cookId}/logs/{logId}
export function logKey(userId: string, cookId: string, logId: string): string {
  return `${userId}/cooks/${cookId}/logs/${logId}`;
}

export function logsPrefix(userId: string, cookId: string): string {
  return `${userId}/cooks/${cookId}/logs/`;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
```

### Write tools (`src/tools/{entity}-tools.ts`)

Every tool follows the `ScaffoldTool` interface:

```typescript
import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import type { Recipe } from '../types.js';
import { recipeKey, recipesPrefix, generateId } from '../keys.js';

export const createRecipeTool: ScaffoldTool = {
  name: 'bbq-save_recipe',
  description: 'Save a BBQ recipe with temps, wood, and steps.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Recipe name' },
      meat: { type: 'string', description: 'Type of meat' },
      smokerTempF: { type: 'number', description: 'Smoker temp in °F' },
      targetInternalF: { type: 'number', description: 'Target internal temp in °F' },
      woodType: { type: 'string', description: 'Wood type' },
      steps: { type: 'array', items: { type: 'string' }, description: 'Steps' },
    },
    required: ['name', 'meat', 'smokerTempF', 'targetInternalF', 'woodType', 'steps'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const params = input as {
      name: string; meat: string; smokerTempF: number;
      targetInternalF: number; woodType: string; steps: string[];
    };
    const id = generateId();
    const now = new Date().toISOString();

    const recipe: Recipe = { id, ...params, createdAt: now, updatedAt: now };
    await ctx.storage.put(recipeKey(ctx.userId, id), recipe);

    return {
      content: [{ type: 'text', text: `Saved recipe "${params.name}" (${id})` }],
    };
  },
};
```

**Key conventions:**
- Tool names: `{prefix}-{action}` with hyphens (e.g., `bbq-save_recipe`). Must match `^[a-zA-Z0-9_-]{1,64}$`.
- Handler signature: `async (input: unknown, ctx: ToolContext): Promise<ToolResult>`
- Cast input: `const params = input as { ... }`
- User isolation: Always use `ctx.userId` in storage keys
- Not found: Return `{ content: [...], isError: true }`
- Empty lists: Return a helpful message pointing to the create tool
- All imports use `.js` extension (ESM requirement)
- Use `import type` for type-only imports

### Update tools with `mergeAndPut`

For partial updates, use the built-in `mergeAndPut` helper:

```typescript
import { mergeAndPut } from '@voygent/scaffold-core';

const { merged, fieldsUpdated } = await mergeAndPut<Recipe & Record<string, unknown>>(
  ctx.storage,
  key,
  { ...updates, updatedAt: new Date().toISOString() },
  { preserveFields: ['id', 'createdAt'], arrayStrategy: 'replace' }
);
```

### Barrel export (`src/tools.ts`)

```typescript
import type { ScaffoldTool } from '@voygent/scaffold-core';
import { createRecipeTool, getRecipeTool } from './tools/recipe-tools.js';
import { guideTool } from './tools/guide-tools.js';
import { learnTool } from './tools/learn-tool.js';

export const myTools: ScaffoldTool[] = [
  createRecipeTool,
  getRecipeTool,
  guideTool,
  learnTool,
];
```

### Write tests (`src/__tests__/{entity}-tools.test.ts`)

Use `InMemoryAdapter` for testing — no Cloudflare account needed:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import type { ToolContext } from '@voygent/scaffold-core';
import { createRecipeTool, getRecipeTool } from '../tools/recipe-tools.js';

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

describe('recipe tools', () => {
  let storage: InMemoryAdapter;
  let ctx: ToolContext;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    ctx = makeCtx(storage);
  });

  it('creates and retrieves a recipe', async () => {
    const result = await createRecipeTool.handler(
      { name: 'Brisket', meat: 'brisket', smokerTempF: 250, targetInternalF: 203, woodType: 'post oak', steps: ['Season', 'Smoke'] },
      ctx,
    );
    expect(result.content[0]!.text).toContain('Brisket');
  });

  it('isolates recipes between users', async () => {
    const ctx2 = makeCtx(storage, 'user2');
    // Create for user1, verify user2 can't see it
  });
});
```

Run tests: `npm test`

---

## 4. Add Domain Knowledge

### Seed knowledge at startup (`src/index.ts`)

```typescript
async function seedKnowledge(storage: CloudflareKVAdapter): Promise<void> {
  const initialized = await storage.get('_knowledge/_initialized');
  if (initialized) return;

  await storage.put('_knowledge/smoking-temps', `# Smoking Temperature Guide

## Key Facts
- Brisket: 250°F smoker, target 203°F internal
- Pork butt: 225°F smoker, target 195°F internal
- Ribs: 275°F smoker, target 190-203°F internal
`);

  await storage.put('_knowledge/_initialized', 'true');
}
```

Knowledge is stored under `_knowledge/{topic}` (no userId — shared across all users). The `_initialized` flag prevents re-seeding on every request.

### Look up knowledge (`src/tools/guide-tools.ts`)

Use `loadKnowledge` from scaffold-core:

```typescript
import { loadKnowledge } from '@voygent/scaffold-core';

// In your handler:
const knowledge = await loadKnowledge(ctx.storage, [topic]);
```

### Update knowledge at runtime (`src/tools/learn-tool.ts`)

The learn tool lets Claude update knowledge without redeploying:

1. **Propose**: Returns existing content + new content for review
2. **Apply**: Writes the merged content to KV

This is useful when the user shares new information during a conversation.

---

## 5. Quality Gates & Progress

### Quality gates

Add a `validate` function to any tool that should check conditions:

```typescript
export const completeCookTool: ScaffoldTool = {
  name: 'bbq-complete_cook',
  // ... inputSchema, handler ...
  validate: async (input, _result, ctx) => {
    const { cookId } = input as { cookId: string };
    const logList = await ctx.storage.list(logsPrefix(ctx.userId, cookId));
    const logCount = logList.keys.filter(k => k.includes('/logs/')).length;

    return {
      passed: true, // warnings don't block execution
      checks: [{
        name: 'has_temp_logs',
        passed: logCount >= 2,
        message: 'Cook completed with fewer than 2 temp logs',
        severity: 'warning' as const,
      }],
    };
  },
};
```

### Progress tracking

Use the built-in progress utilities:

```typescript
import { logProgress, getProgress } from '@voygent/scaffold-core';

// In a tool handler:
await logProgress(ctx.storage, ctx.userId, {
  entityType: 'cook',
  entityId: cookId,
  current: meatTempF,
  target: targetInternalF,
  unit: '°F',
});
```

---

## 6. Deploy & Connect

### Set up Cloudflare

```bash
wrangler login
wrangler kv namespace create DATA
# Copy the id from the output
wrangler kv namespace create DATA --preview
# Copy the preview_id from the output
```

Update `wrangler.toml` with the real IDs.

### Generate a secure admin key

```bash
openssl rand -hex 20
```

**Use hex, not base64** — base64 characters `+`, `/`, `=` break in URL parameters.

### Deploy

```bash
wrangler deploy
echo "your-hex-key" | wrangler secret put ADMIN_KEY
```

### Connect to Claude

**Claude Web:**
1. Settings → Integrations → Add Custom MCP
2. Paste your Worker URL: `https://scaffold-my-expert.your-subdomain.workers.dev`
3. Start a new conversation — your tools appear automatically

**Claude Desktop** — add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "my-expert": {
      "url": "https://scaffold-my-expert.your-subdomain.workers.dev/sse",
      "headers": { "Authorization": "Bearer your-hex-key" }
    }
  }
}
```

**Claude Code** — add to `.mcp.json`:

```json
{
  "mcpServers": {
    "my-expert": {
      "type": "sse",
      "url": "https://scaffold-my-expert.your-subdomain.workers.dev/sse",
      "headers": { "Authorization": "Bearer your-hex-key" }
    }
  }
}
```

---

## Post-Deployment

### Updating knowledge without redeploying

Use the `{prefix}-learn` tool in a Claude conversation:
1. Share new information with Claude
2. Claude calls `learn` with `action: "propose"` to see what exists
3. Claude merges and calls `learn` with `action: "apply"` to save

Or update `seedKnowledge()` in code and run `wrangler deploy`.

### Adding new tools

1. Create the tool in `src/tools/{feature}-tools.ts`
2. Add tests in `src/__tests__/{feature}-tools.test.ts`
3. Export from `src/tools.ts`
4. Run `npm test && wrangler deploy`

### Admin dashboard

Visit `https://your-worker-url/admin?token=your-hex-key` for:
- Tool listing and testing
- User activity overview
- Storage inspection

### Debugging

- Local dev: `npx wrangler dev` (uses local KV storage)
- Logs: `wrangler tail` (live production logs)
- Tests: `npm test` (runs against InMemoryAdapter)
