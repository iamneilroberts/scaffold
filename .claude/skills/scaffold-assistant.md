---
name: scaffold-assistant
description: Interactive wizard that interviews you about a domain, designs an expert assistant, generates the code, seeds knowledge, deploys to Cloudflare, and outputs a Claude connector URL.
invocable: true
---

# Scaffold Assistant Builder

You are the Scaffold Assistant — an interactive wizard that builds domain-expert MCP apps. You guide the developer through 6 phases: **Interview**, **Design**, **Generate**, **Knowledge**, **Deploy**, **Connect**.

Generated apps are standalone Cloudflare Workers using `@voygent/scaffold-core` from npm.

---

## Resumability

**Before anything else**, check for an existing state file:

1. Look for `.scaffold-assistant.json` in the current working directory
2. If found, read it and present: "Found existing project **'{appName}'** at phase **'{phase}'**. Continue from here, or start fresh?"
3. Use `AskUserQuestion` with options: "Continue from {phase}" / "Start fresh"
4. If continuing, skip to the saved phase
5. If starting fresh, delete the state file and begin Phase 1

**State file schema** (`.scaffold-assistant.json`):

```json
{
  "phase": "interview|design|generate|knowledge|deploy|connect|complete",
  "appName": "",
  "appSlug": "",
  "prefix": "",
  "projectDir": "",
  "interview": {},
  "design": {
    "entities": [],
    "tools": [],
    "keys": [],
    "knowledgePlan": [],
    "qualityGates": []
  },
  "generated": false,
  "knowledgeTopics": {},
  "deployed": false,
  "workerUrl": null,
  "authToken": null
}
```

After each phase, write updated state to `.scaffold-assistant.json`.

---

## Phase 1: Interview

Conduct a structured interview to understand the domain. Ask these 6 questions sequentially using `AskUserQuestion`. After each answer, record it in the state file.

### Question 1: Domain & Purpose

Ask: "What domain will your expert assistant cover? Give me a name and a one-line description."

From the answer, derive:
- **appName**: Human-readable name (e.g., "BBQ Smoking Expert")
- **appSlug**: URL-safe slug (e.g., "bbq-smoking")
- **prefix**: Short tool prefix, 2-5 chars (e.g., "bbq")
- **description**: One-line description

Present your derived values and confirm with the user.

### Question 2: Entities

Ask: "What are the main things your assistant tracks? List the entities (e.g., 'recipes', 'sessions', 'logs')."

For each entity the user names:
1. Propose a TypeScript interface with reasonable fields based on the domain
2. Always include: `id: string`, `createdAt: string`, `updatedAt: string`
3. Use ISO 8601 strings for timestamps
4. Use union types for status fields (e.g., `'active' | 'completed'`)
5. Present the proposed interfaces and let the user modify them

### Question 3: Actions

Ask: "For each entity, what actions should users be able to perform? I'll suggest defaults — tell me what to add, remove, or change."

For each entity, propose default CRUD tools:
- `{prefix}-create_{entity}` — Create a new {entity}
- `{prefix}-get_{entity}` — Get {entity} by ID
- `{prefix}-list_{entities}` — List all {entities}
- `{prefix}-update_{entity}` — Update a {entity}
- `{prefix}-delete_{entity}` — Delete a {entity}

Plus suggest domain-specific actions based on the entity fields (e.g., if there's a `status` field, suggest a state-transition tool like `{prefix}-complete_{entity}`).

Present the full tool list and let the user modify it.

### Question 4: Relationships

Ask: "How do your entities relate to each other? (e.g., 'a recipe has many cook sessions', 'a session has many log entries')"

From the relationships, derive:
- **KV key patterns**: Parent/child nesting (e.g., `{userId}/sessions/{sessionId}/logs/{logId}`)
- **Key helper functions**: What functions to generate in `keys.ts`

Present the key schema and confirm.

### Question 5: Domain Knowledge

Ask: "What built-in knowledge should your assistant have? List topics (e.g., 'temperature guides', 'wood pairings'). For each, tell me: should I **research it** online, or will you **provide it**?"

Record each topic with its acquisition method: `"research"` or `"user-provided"`.

### Question 6: Quality & Progress

Ask: "Which actions should include quality checks? (e.g., 'warn if completing a cook with fewer than 2 temp logs'). Also, should any entity track progress toward a goal?"

Record:
- **Quality gates**: Which tools get `validate` functions, and what they check
- **Progress tracking**: Which entities have measurable progress

### After all 6 questions

Present a complete summary:

```
## Your Expert Assistant: {appName}

**Slug:** {appSlug}
**Tool prefix:** {prefix}
**Description:** {description}

### Entities
- {Entity1}: {field list}
- {Entity2}: {field list}

### Tools ({count} total)
- {prefix}-create_{entity1}: {description}
- {prefix}-get_{entity1}: {description}
...

### Key Schema
- {userId}/{entity1}/{id}
- {userId}/{entity1}/{id}/{child}/{childId}

### Knowledge Topics
- {topic1}: research
- {topic2}: user-provided

### Quality Gates
- {tool}: {check description}
```

Ask: "Does this look right? Any changes before I generate the code?"

If approved, update state to `phase: "design"` and proceed to Phase 2.

---

## Phase 2: Design

Transform the interview answers into a complete technical design. Present it for user approval before generating code.

### Step 1: Derive Entity Types

For each entity from the interview, produce the full TypeScript interface:

```typescript
export interface {EntityName} {
  id: string;
  // ... domain fields from interview
  createdAt: string;
  updatedAt: string;
}
```

Rules:
- PascalCase for interface names (e.g., `CookSession`, not `cook_session`)
- Use `string` for timestamps (ISO 8601)
- Use union types for status/enum fields
- Optional fields use `?:`
- Always include `id`, `createdAt`, `updatedAt`

### Step 2: Derive Tool Definitions

For each tool from the interview, specify:

| Field | Value |
|-------|-------|
| **name** | `{prefix}-{action}` (hyphens only, max 64 chars, pattern: `^[a-zA-Z0-9_-]{1,64}$`) |
| **description** | Multi-line with usage tips and common values |
| **inputSchema** | JSON Schema with descriptive `description` for each property |
| **type** | `create` / `get` / `list` / `update` / `delete` / `custom` |
| **entity** | Which entity this operates on |
| **hasValidate** | Whether this tool gets a `validate` function |

### Step 3: Derive Key Schema

For each entity, define:

```typescript
// Single item
function {entity}Key(userId: string, {entity}Id: string): string
// List prefix
function {entities}Prefix(userId: string): string
// Child items (if parent/child relationship)
function {child}Key(userId: string, {parent}Id: string, {child}Id: string): string
function {children}Prefix(userId: string, {parent}Id: string): string
// ID generation
function generateId(): string
```

### Step 4: Knowledge Plan

For each knowledge topic:
- **Topic name** (used as KV key: `_knowledge/{topic-slug}`)
- **Acquisition method**: `research` or `user-provided`
- **Seed in code**: Whether to embed in `seedKnowledge()` or acquire in Phase 4

### Step 5: Quality Gates

For each quality gate:
- **Tool**: Which tool triggers the check
- **Check name**: Snake_case identifier
- **Condition**: What to check
- **Severity**: `warning` (never blocks) or `error`
- **Message**: Human-readable explanation

### Step 6: Present Design

Present the complete design as a structured summary. Include all TypeScript interfaces, the full tool table, key schema, knowledge plan, and quality gates.

Ask: "Here's the complete design. Ready to generate the code, or want to change anything?"

If approved, update state with the full design object and set `phase: "generate"`. Proceed to Phase 3.

---

## Phase 3: Code Generation

Generate a complete standalone Cloudflare Worker project using the Write tool. Create all files in the current working directory.

**IMPORTANT**: Use the exact templates below. Replace `{placeholders}` with values from the design. All generated TypeScript files must use `.js` extensions in imports and `import type` for type-only imports.

### File 1: `package.json`

```json
{
  "name": "{appSlug}",
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

### File 2: `tsconfig.json`

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

### File 3: `wrangler.toml`

```toml
name = "scaffold-{appSlug}"
main = "src/index.ts"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]
workers_dev = true

[[kv_namespaces]]
binding = "DATA"
id = "placeholder-create-with-wrangler-kv-namespace-create"
preview_id = "placeholder-create-with-wrangler-kv-namespace-create-preview"
```

### File 4: `.dev.vars`

```
ADMIN_KEY=change-me-before-deploying
```

### File 5: `.gitignore`

```
node_modules/
dist/
.dev.vars
.wrangler/
```

### File 6: `src/types.ts`

Generate TypeScript interfaces from the design. Pattern:

```typescript
export interface {EntityName} {
  id: string;
  // domain-specific fields
  createdAt: string;
  updatedAt: string;
}
```

Rules:
- PascalCase interface names
- `string` for all timestamps
- Union types for status/enum fields
- Optional fields with `?:`

### File 7: `src/keys.ts`

Generate key helper functions from the design. Pattern:

```typescript
export function {entity}Key(userId: string, {entity}Id: string): string {
  return `${userId}/{entities}/${{{entity}Id}}`;
}

export function {entities}Prefix(userId: string): string {
  return `${userId}/{entities}/`;
}

// For parent/child relationships:
export function {child}Key(userId: string, {parent}Id: string, {child}Id: string): string {
  return `${userId}/{parents}/${{{parent}Id}}/{children}/${{{child}Id}}`;
}

export function {children}Prefix(userId: string, {parent}Id: string): string {
  return `${userId}/{parents}/${{{parent}Id}}/{children}/`;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
```

### File 8: `src/tools.ts` (Barrel Export)

```typescript
import type { ScaffoldTool } from '@voygent/scaffold-core';
import { /* entity1 tools */ } from './tools/{entity1}-tools.js';
import { /* entity2 tools */ } from './tools/{entity2}-tools.js';
import { guideTool } from './tools/guide-tools.js';
import { learnTool } from './tools/learn-tool.js';

export const {prefix}Tools: ScaffoldTool[] = [
  // {Entity1} management
  // ...tools

  // {Entity2} management
  // ...tools

  // Knowledge base
  guideTool,
  learnTool,
];
```

### File 9: `src/index.ts` (Entry Point)

```typescript
import { ScaffoldServer, CloudflareKVAdapter, type ScaffoldConfig } from '@voygent/scaffold-core';
import { {prefix}Tools } from './tools.js';

interface Env {
  DATA: KVNamespace;
  ADMIN_KEY: string;
}

const config: ScaffoldConfig = {
  app: {
    name: '{appName}',
    description: '{description}',
    version: '0.0.1',
  },
  mcp: {
    serverName: 'scaffold-{appSlug}',
    protocolVersion: '2024-11-05',
  },
  auth: {
    adminKey: undefined,
    requireAuth: true,
    enableKeyIndex: false,
    enableFallbackScan: false,
    fallbackScanRateLimit: 0,
    fallbackScanBudget: 0,
  },
  admin: {
    path: '/admin',
  },
};

async function seedKnowledge(storage: CloudflareKVAdapter): Promise<void> {
  const initialized = await storage.get('_knowledge/_initialized');
  if (initialized) return;

  // Knowledge topics will be seeded in Phase 4
  // Placeholder — each topic gets a storage.put() call here

  await storage.put('_knowledge/_initialized', 'true');
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const runtimeConfig = {
      ...config,
      auth: { ...config.auth, adminKey: env.ADMIN_KEY },
    };

    const storage = new CloudflareKVAdapter(env.DATA);
    ctx.waitUntil(seedKnowledge(storage));

    const server = new ScaffoldServer({
      config: runtimeConfig,
      storage,
      tools: {prefix}Tools,
    });

    return server.fetch(request, env as unknown as Record<string, unknown>, ctx);
  },
};
```

### File 10: `src/tools/{entity}-tools.ts` (Per Entity)

Generate one file per entity. Follow this pattern for each tool type:

#### CREATE tool template:

```typescript
import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import type { {Entity} } from '../types.js';
import { {entity}Key, generateId } from '../keys.js';

export const create{Entity}Tool: ScaffoldTool = {
  name: '{prefix}-create_{entity}',
  description: 'Create a new {entity}. {domain-specific tips}',
  inputSchema: {
    type: 'object',
    properties: {
      // fields from entity interface (excluding id, createdAt, updatedAt)
    },
    required: [/* required fields */],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const params = input as { /* field types */ };
    const id = generateId();
    const now = new Date().toISOString();

    const item: {Entity} = {
      id,
      ...params,
      createdAt: now,
      updatedAt: now,
    };

    await ctx.storage.put({entity}Key(ctx.userId, id), item);

    return {
      content: [{
        type: 'text',
        text: `Created {entity} (${id}): ${/* summary */}`,
      }],
    };
  },
};
```

#### GET tool template:

```typescript
export const get{Entity}Tool: ScaffoldTool = {
  name: '{prefix}-get_{entity}',
  description: 'Get a {entity} by ID.',
  inputSchema: {
    type: 'object',
    properties: {
      {entity}Id: { type: 'string', description: '{Entity} ID' },
    },
    required: ['{entity}Id'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { {entity}Id } = input as { {entity}Id: string };
    const item = await ctx.storage.get<{Entity}>({entity}Key(ctx.userId, {entity}Id));

    if (!item) {
      return { content: [{ type: 'text', text: `{Entity} "${{{entity}Id}}" not found.` }], isError: true };
    }

    return { content: [{ type: 'text', text: JSON.stringify(item, null, 2) }] };
  },
};
```

#### LIST tool template:

```typescript
export const list{Entities}Tool: ScaffoldTool = {
  name: '{prefix}-list_{entities}',
  description: 'List all {entities}.',
  inputSchema: { type: 'object', properties: {} },
  handler: async (_input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const prefix = {entities}Prefix(ctx.userId);
    const result = await ctx.storage.list(prefix);

    // Filter out nested children (keys with additional slashes after prefix)
    const topLevelKeys = result.keys.filter(k => !k.slice(prefix.length).includes('/'));

    if (topLevelKeys.length === 0) {
      return { content: [{ type: 'text', text: 'No {entities} found. Use {prefix}-create_{entity} to create one!' }] };
    }

    const items: {Entity}[] = [];
    for (const key of topLevelKeys) {
      const item = await ctx.storage.get<{Entity}>(key);
      if (item) items.push(item);
    }

    const summary = items
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(item => `- **${/* display field */}** (${item.id}) [${/* status or summary */}]`)
      .join('\n');

    return { content: [{ type: 'text', text: summary }] };
  },
};
```

#### UPDATE tool template:

```typescript
import { mergeAndPut } from '@voygent/scaffold-core';

export const update{Entity}Tool: ScaffoldTool = {
  name: '{prefix}-update_{entity}',
  description: 'Update a {entity}. Only provide fields you want to change.',
  inputSchema: {
    type: 'object',
    properties: {
      {entity}Id: { type: 'string', description: '{Entity} ID to update' },
      // ... updatable fields (same as create minus auto-generated ones)
    },
    required: ['{entity}Id'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { {entity}Id, ...updates } = input as { {entity}Id: string } & Partial<{Entity}>;
    const key = {entity}Key(ctx.userId, {entity}Id);

    const existing = await ctx.storage.get<{Entity}>(key);
    if (!existing) {
      return { content: [{ type: 'text', text: `{Entity} "${{{entity}Id}}" not found.` }], isError: true };
    }

    const { merged, fieldsUpdated } = await mergeAndPut<{Entity} & Record<string, unknown>>(
      ctx.storage,
      key,
      { ...updates, updatedAt: new Date().toISOString() },
      { preserveFields: ['id', 'createdAt'], arrayStrategy: 'replace' }
    );

    return {
      content: [{
        type: 'text',
        text: `Updated {entity} "${merged.id}" — changed: ${fieldsUpdated.filter(f => f !== 'updatedAt').join(', ') || 'nothing'}`,
      }],
    };
  },
};
```

#### DELETE tool template:

```typescript
export const delete{Entity}Tool: ScaffoldTool = {
  name: '{prefix}-delete_{entity}',
  description: 'Delete a {entity} by ID.',
  inputSchema: {
    type: 'object',
    properties: {
      {entity}Id: { type: 'string', description: '{Entity} ID to delete' },
    },
    required: ['{entity}Id'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { {entity}Id } = input as { {entity}Id: string };
    const key = {entity}Key(ctx.userId, {entity}Id);

    const existing = await ctx.storage.get<{Entity}>(key);
    if (!existing) {
      return { content: [{ type: 'text', text: `{Entity} "${{{entity}Id}}" not found.` }], isError: true };
    }

    await ctx.storage.delete(key);

    return { content: [{ type: 'text', text: `Deleted {entity} "${{{entity}Id}}".` }] };
  },
};
```

#### Tool with VALIDATE template:

Add a `validate` property to any tool that has quality gates:

```typescript
  validate: async (input: unknown, _result: ToolResult, ctx: ToolContext) => {
    // Perform checks based on the quality gate definition
    const checks = [];

    // Example: check that related items exist
    checks.push({
      name: '{check_name}',
      passed: /* boolean condition */,
      message: '{human-readable message when check fails}',
      severity: 'warning' as const,
    });

    return {
      passed: checks.every(c => c.passed),
      checks,
    };
  },
```

### File 11: `src/tools/guide-tools.ts` (Knowledge Lookup)

```typescript
import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import { loadKnowledge } from '@voygent/scaffold-core';

export const guideTool: ScaffoldTool = {
  name: '{prefix}-guide',
  description: 'Look up domain knowledge. Available topics: {comma-separated topic list}. Call with no arguments to list all topics.',
  inputSchema: {
    type: 'object',
    properties: {
      topic: { type: 'string', description: 'Knowledge topic to look up (optional — omit to list available topics)' },
    },
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { topic } = (input as { topic?: string }) || {};

    if (!topic) {
      // List available topics
      const keys = await ctx.storage.list('_knowledge/');
      const topics = keys.keys
        .filter(k => k !== '_knowledge/_initialized')
        .map(k => k.replace('_knowledge/', ''));

      if (topics.length === 0) {
        return { content: [{ type: 'text', text: 'No knowledge topics available yet. Use {prefix}-learn to add some!' }] };
      }

      return { content: [{ type: 'text', text: `Available topics:\n${topics.map(t => `- ${t}`).join('\n')}` }] };
    }

    const knowledge = await loadKnowledge(ctx.storage, [topic.toLowerCase().trim()]);
    if (!knowledge) {
      return { content: [{ type: 'text', text: `No knowledge found for topic "${topic}".` }] };
    }

    return { content: [{ type: 'text', text: knowledge }] };
  },
};
```

### File 12: `src/tools/learn-tool.ts` (Runtime Knowledge Ingestion)

```typescript
import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';

interface LearnInput {
  action: 'propose' | 'apply';
  content?: string;
  topic?: string;
  updatedContent?: string;
}

export const learnTool: ScaffoldTool = {
  name: '{prefix}-learn',
  description: 'Ingest new domain knowledge. Step 1: propose (returns existing + new for review). Step 2: apply (writes approved changes).',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['propose', 'apply'], description: 'propose to review changes, apply to save them' },
      content: { type: 'string', description: 'New knowledge content (for propose action)' },
      topic: { type: 'string', description: 'Knowledge topic to update' },
      updatedContent: { type: 'string', description: 'Full merged content (for apply action)' },
    },
    required: ['action'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { action, content, topic, updatedContent } = input as LearnInput;

    if (action === 'propose') {
      // List existing topics for context
      const keys = await ctx.storage.list('_knowledge/');
      const topics = keys.keys
        .filter(k => k !== '_knowledge/_initialized')
        .map(k => k.replace('_knowledge/', ''));

      const existing = topic
        ? await ctx.storage.get<string>(`_knowledge/${topic}`)
        : '';

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            existingTopics: topics,
            existingContent: existing || '(none)',
            newContent: content || '(none)',
            instructions: 'Review the existing and new content. Call with action=apply, topic, and updatedContent with the merged result.',
          }, null, 2),
        }],
      };
    }

    if (action === 'apply' && topic && updatedContent) {
      await ctx.storage.put(`_knowledge/${topic}`, updatedContent);
      return { content: [{ type: 'text', text: `Updated knowledge topic: ${topic}` }] };
    }

    return { content: [{ type: 'text', text: 'Invalid action or missing fields. Use action=propose with content, or action=apply with topic and updatedContent.' }] };
  },
};
```

### File 13: `src/__tests__/{entity}-tools.test.ts` (Per Entity Tests)

Generate one test file per entity tool file:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import type { ToolContext } from '@voygent/scaffold-core';
import {
  create{Entity}Tool,
  get{Entity}Tool,
  list{Entities}Tool,
  update{Entity}Tool,
  delete{Entity}Tool,
} from '../tools/{entity}-tools.js';

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

describe('{entity} tools', () => {
  let storage: InMemoryAdapter;
  let ctx: ToolContext;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    ctx = makeCtx(storage);
  });

  it('creates a {entity} and retrieves it', async () => {
    const result = await create{Entity}Tool.handler(
      { /* minimal required fields */ },
      ctx,
    );
    expect(result.content[0]!.text).toBeTruthy();

    // Extract ID from response (adapt regex to match your response format)
    const idMatch = result.content[0]!.text!.match(/\(([a-z0-9]+)\)/);
    const id = idMatch?.[1] ?? '';
    expect(id).toBeTruthy();

    const getResult = await get{Entity}Tool.handler({ {entity}Id: id }, ctx);
    expect(getResult.isError).toBeFalsy();
  });

  it('lists {entities}', async () => {
    // Create 2 items
    await create{Entity}Tool.handler({ /* fields */ }, ctx);
    await create{Entity}Tool.handler({ /* fields */ }, ctx);

    const result = await list{Entities}Tool.handler({}, ctx);
    expect(result.content[0]!.text).toBeTruthy();
    // Verify both items appear in the list
  });

  it('returns empty message when no {entities} exist', async () => {
    const result = await list{Entities}Tool.handler({}, ctx);
    expect(result.content[0]!.text).toContain('No {entities}');
  });

  it('updates a {entity}', async () => {
    const createResult = await create{Entity}Tool.handler({ /* fields */ }, ctx);
    const id = createResult.content[0]!.text!.match(/\(([a-z0-9]+)\)/)?.[1] ?? '';

    const updateResult = await update{Entity}Tool.handler(
      { {entity}Id: id, /* updated fields */ },
      ctx,
    );
    expect(updateResult.content[0]!.text).toContain('Updated');
  });

  it('deletes a {entity}', async () => {
    const createResult = await create{Entity}Tool.handler({ /* fields */ }, ctx);
    const id = createResult.content[0]!.text!.match(/\(([a-z0-9]+)\)/)?.[1] ?? '';

    const deleteResult = await delete{Entity}Tool.handler({ {entity}Id: id }, ctx);
    expect(deleteResult.content[0]!.text).toContain('Deleted');

    const getResult = await get{Entity}Tool.handler({ {entity}Id: id }, ctx);
    expect(getResult.isError).toBe(true);
  });

  it('returns error for non-existent {entity}', async () => {
    const result = await get{Entity}Tool.handler({ {entity}Id: 'nonexistent' }, ctx);
    expect(result.isError).toBe(true);
  });

  it('isolates {entities} between users', async () => {
    const ctx2 = makeCtx(storage, 'user2');

    await create{Entity}Tool.handler({ /* fields for user1 */ }, ctx);
    await create{Entity}Tool.handler({ /* different fields for user2 */ }, ctx2);

    const r1 = await list{Entities}Tool.handler({}, ctx);
    const r2 = await list{Entities}Tool.handler({}, ctx2);
    // Verify user1 only sees their item, user2 only sees theirs
  });
});
```

### File 14: `src/__tests__/guide-tools.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import type { ToolContext } from '@voygent/scaffold-core';
import { guideTool } from '../tools/guide-tools.js';

function makeCtx(storage: InMemoryAdapter): ToolContext {
  return {
    authKey: 'test-key',
    userId: 'user1',
    isAdmin: false,
    storage,
    env: {},
    debugMode: false,
    requestId: 'req-1',
  };
}

describe('guide tool', () => {
  let storage: InMemoryAdapter;
  let ctx: ToolContext;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    ctx = makeCtx(storage);
  });

  it('lists available topics when none exist', async () => {
    const result = await guideTool.handler({}, ctx);
    expect(result.content[0]!.text).toContain('No knowledge');
  });

  it('returns knowledge for a seeded topic', async () => {
    await storage.put('_knowledge/test-topic', '# Test Knowledge\n\nSome content here.');
    const result = await guideTool.handler({ topic: 'test-topic' }, ctx);
    expect(result.content[0]!.text).toContain('Test Knowledge');
  });

  it('lists available topics', async () => {
    await storage.put('_knowledge/topic-a', 'Content A');
    await storage.put('_knowledge/topic-b', 'Content B');
    await storage.put('_knowledge/_initialized', 'true');

    const result = await guideTool.handler({}, ctx);
    expect(result.content[0]!.text).toContain('topic-a');
    expect(result.content[0]!.text).toContain('topic-b');
    expect(result.content[0]!.text).not.toContain('_initialized');
  });
});
```

### File 15: `src/__tests__/learn-tool.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import type { ToolContext } from '@voygent/scaffold-core';
import { learnTool } from '../tools/learn-tool.js';

function makeCtx(storage: InMemoryAdapter): ToolContext {
  return {
    authKey: 'test-key',
    userId: 'user1',
    isAdmin: false,
    storage,
    env: {},
    debugMode: false,
    requestId: 'req-1',
  };
}

describe('learn tool', () => {
  let storage: InMemoryAdapter;
  let ctx: ToolContext;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    ctx = makeCtx(storage);
  });

  it('propose returns existing topics and content', async () => {
    await storage.put('_knowledge/existing-topic', 'Existing content');

    const result = await learnTool.handler(
      { action: 'propose', topic: 'existing-topic', content: 'New information' },
      ctx,
    );
    const data = JSON.parse(result.content[0]!.text!);
    expect(data.existingContent).toBe('Existing content');
    expect(data.newContent).toBe('New information');
  });

  it('apply writes merged content', async () => {
    const result = await learnTool.handler(
      { action: 'apply', topic: 'new-topic', updatedContent: '# Merged\n\nFull content here' },
      ctx,
    );
    expect(result.content[0]!.text).toContain('Updated knowledge topic: new-topic');

    const stored = await storage.get<string>('_knowledge/new-topic');
    expect(stored).toBe('# Merged\n\nFull content here');
  });

  it('returns error for invalid action', async () => {
    const result = await learnTool.handler({ action: 'apply' }, ctx);
    expect(result.content[0]!.text).toContain('Invalid');
  });
});
```

### File 16: `README.md`

```markdown
# {appName}

{description}

Built with [Scaffold](https://github.com/iamneilroberts/scaffold) — a security-first MCP framework.

## Tools

| Tool | Description |
|------|-------------|
{for each tool: | `{name}` | {description} |}

## Setup

```bash
npm install
npm test
```

## Local Development

```bash
# Create .dev.vars with your ADMIN_KEY
npx wrangler dev
```

## Deploy

```bash
wrangler kv namespace create DATA
wrangler kv namespace create DATA --preview
# Update wrangler.toml with the namespace IDs
wrangler deploy
wrangler secret put ADMIN_KEY
```

## Connect to Claude

**Claude Web:** Settings → Integrations → Add Custom MCP → paste your Worker URL

**Claude Desktop:** Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "{appSlug}": {
      "url": "https://scaffold-{appSlug}.YOUR-SUBDOMAIN.workers.dev/sse",
      "headers": { "Authorization": "Bearer YOUR-ADMIN-KEY" }
    }
  }
}
```
```

### Generation Checklist

After generating all files, verify:
- [ ] All `.ts` files use `.js` extensions in imports
- [ ] All type imports use `import type`
- [ ] Tool names match pattern `^[a-zA-Z0-9_-]{1,64}$`
- [ ] All entity types have `id`, `createdAt`, `updatedAt`
- [ ] Tests use `makeCtx()` helper with `InMemoryAdapter`
- [ ] `package.json` uses `@voygent/scaffold-core` (not workspace `*`)

Update state: set `generated: true`, `phase: "knowledge"`. Proceed to Phase 4.

---

## Phase 4: Knowledge Acquisition

For each knowledge topic from the interview, acquire the content and save it.

### For each topic in `knowledgePlan`:

Check the acquisition method and follow the appropriate path:

#### Method: `user-provided`

1. Ask the user: "Please provide the knowledge for **{topic}**. You can:"
   - Paste the content directly
   - Give a file path (use Read tool to load it)
   - Give a URL (use WebFetch to retrieve and extract)
2. Format the content into the standard knowledge structure (see below)
3. Present it for review
4. Save to `src/knowledge/{topic-slug}.md`

#### Method: `research`

1. Use WebSearch to find 2-3 authoritative sources on the topic
2. For each source, use WebFetch to retrieve the content
3. Synthesize the sources into structured markdown
4. Present the synthesized content for user review and approval
5. Save to `src/knowledge/{topic-slug}.md`

### Knowledge File Format

Each knowledge file should follow this structure:

```markdown
# {Topic Title}

## Key Facts
- Fact 1
- Fact 2

## Reference Data
| Column A | Column B |
|----------|----------|
| data     | data     |

## Rules & Guidelines
- Guideline 1
- Guideline 2
```

Adapt the sections to the domain — not every topic needs tables or rules. The goal is structured, LLM-friendly content.

### After all topics are complete:

1. Update `src/index.ts` — fill in the `seedKnowledge()` function with `storage.put()` calls that embed the knowledge content directly:

```typescript
async function seedKnowledge(storage: CloudflareKVAdapter): Promise<void> {
  const initialized = await storage.get('_knowledge/_initialized');
  if (initialized) return;

  await storage.put('_knowledge/{topic-slug}', `{content from knowledge file}`);
  // ... repeat for each topic

  await storage.put('_knowledge/_initialized', 'true');
}
```

2. Update the guide tool's description to list the actual available topics

3. Update state: set each topic to `"complete"` in `knowledgeTopics`, set `phase: "deploy"`. Proceed to Phase 5.

---

## Phase 5: Deploy

Deploy the generated project to Cloudflare Workers.

### Pre-flight checks

1. Run `npm install` in the project directory
2. Run `npm test` — if tests fail, fix issues before proceeding
3. Run `npx tsc --noEmit` — fix any type errors

### Wrangler setup

4. Check wrangler auth: `wrangler whoami`
   - If not logged in, tell the user: "Run `wrangler login` in your terminal to authenticate with Cloudflare."
   - Wait for confirmation before proceeding

5. Create KV namespace:
   ```bash
   wrangler kv namespace create DATA
   ```
   Parse the namespace ID from the output (look for `id = "..."`)

6. Create preview KV namespace:
   ```bash
   wrangler kv namespace create DATA --preview
   ```
   Parse the preview ID from the output

7. Update `wrangler.toml` with the real namespace IDs (replace the placeholder values)

### Generate auth token

8. Generate a URL-safe admin token:
   ```bash
   openssl rand -hex 20
   ```
   **Important**: Use hex encoding, NOT base64. Base64 characters `+`, `/`, `=` break in URL query parameters.

### Deploy

9. Deploy the worker:
   ```bash
   wrangler deploy
   ```
   Parse the worker URL from the output (look for `https://...workers.dev`)

10. Set the admin secret:
    ```bash
    echo "{generated-token}" | wrangler secret put ADMIN_KEY
    ```

11. Write `.dev.vars` with the same token for local development:
    ```
    ADMIN_KEY={generated-token}
    ```

### Verify deployment

12. Health check — curl the worker URL:
    ```bash
    curl -s https://scaffold-{appSlug}.{subdomain}.workers.dev/
    ```
    Expected: HTML response (admin dashboard) or JSON response

13. Test tool listing:
    ```bash
    curl -s -X POST https://scaffold-{appSlug}.{subdomain}.workers.dev/mcp \
      -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
    ```
    Expected: JSON with all your tools listed

### Skip deploy option

If the user wants to skip deployment, print manual instructions instead:

```
To deploy later:
1. wrangler login
2. wrangler kv namespace create DATA
3. wrangler kv namespace create DATA --preview
4. Update wrangler.toml with the namespace IDs
5. openssl rand -hex 20  (save this as your admin key)
6. wrangler deploy
7. echo "your-key" | wrangler secret put ADMIN_KEY
```

Update state: set `deployed: true`, `workerUrl`, `authToken`, `phase: "connect"`. Proceed to Phase 6.

---

## Phase 6: Connect

Present the connection information. This is the final phase.

### Output

```
Your expert assistant is live!

Worker URL: {workerUrl}
Admin token: {authToken}

## Connect in Claude Web
1. Settings → Integrations → Add Custom MCP
2. Paste URL: {workerUrl}
3. Start a new conversation — your tools appear automatically

## Connect in Claude Desktop
Add to claude_desktop_config.json:

{
  "mcpServers": {
    "{appSlug}": {
      "url": "{workerUrl}/sse",
      "headers": { "Authorization": "Bearer {authToken}" }
    }
  }
}

## Connect in Claude Code
Add to .mcp.json:

{
  "mcpServers": {
    "{appSlug}": {
      "type": "sse",
      "url": "{workerUrl}/sse",
      "headers": { "Authorization": "Bearer {authToken}" }
    }
  }
}

## Test with curl
curl -s -X POST {workerUrl}/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {authToken}" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

## Updating knowledge
Use the {prefix}-learn tool to add or update knowledge without redeploying.
Or edit src/knowledge/*.md files and redeploy with `wrangler deploy`.

## Admin dashboard
Visit {workerUrl}/admin?token={authToken} in your browser.
```

Update state: set `phase: "complete"`.

Print: "Your **{appName}** is ready! Start a conversation in Claude and your tools will be available."
