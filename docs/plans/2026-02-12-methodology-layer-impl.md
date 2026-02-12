# Methodology Layer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add quality gates, knowledge files, progress tracking, and additive merge to @scaffold/core — then wire them into the bbq-smoking example as proof of concept.

**Architecture:** Four utilities in `packages/core/src/utils/`, two new core tools, type additions to `public-api.ts`, and a pipeline change in `mcp/tools.ts`. The bbq-smoking example demonstrates all four working together.

**Tech Stack:** TypeScript, Vitest, Cloudflare Workers, @scaffold/core

**Design doc:** `docs/plans/2026-02-12-methodology-layer-design.md`

**Resolved open questions:** Flat knowledge namespacing. Auto-logging always on (no opt-out flag).

---

### Task 1: Additive Merge — Types & Utility

**Files:**
- Create: `packages/core/src/utils/merge.ts`
- Create: `packages/core/src/utils/__tests__/merge.test.ts`

**Step 1: Write the failing tests**

```typescript
// packages/core/src/utils/__tests__/merge.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mergeAndPut } from '../merge.js';
import { InMemoryAdapter } from '../../storage/in-memory.js';
import type { StorageAdapter } from '../../types/public-api.js';

interface TestDoc {
  id: string;
  name: string;
  tags: string[];
  score: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

describe('mergeAndPut', () => {
  let storage: StorageAdapter;

  beforeEach(() => {
    storage = new InMemoryAdapter();
  });

  it('should create new record when key does not exist', async () => {
    const incoming = { id: '1', name: 'test', tags: ['a'], score: 10, createdAt: '2026-01-01', updatedAt: '2026-01-01' };
    const result = await mergeAndPut<TestDoc>(storage, 'doc/1', incoming);

    expect(result.created).toBe(true);
    expect(result.merged).toEqual(incoming);

    const stored = await storage.get<TestDoc>('doc/1');
    expect(stored).toEqual(incoming);
  });

  it('should merge incoming fields into existing record', async () => {
    await storage.put('doc/1', { id: '1', name: 'old', tags: ['a'], score: 5, createdAt: '2026-01-01', updatedAt: '2026-01-01' });

    const result = await mergeAndPut<TestDoc>(storage, 'doc/1', { name: 'new', score: 10, updatedAt: '2026-01-02' });

    expect(result.created).toBe(false);
    expect(result.merged.name).toBe('new');
    expect(result.merged.score).toBe(10);
    expect(result.merged.tags).toEqual(['a']); // untouched
    expect(result.merged.createdAt).toBe('2026-01-01'); // untouched
    expect(result.fieldsUpdated).toContain('name');
    expect(result.fieldsUpdated).toContain('score');
    expect(result.fieldsUpdated).not.toContain('tags');
  });

  it('should never overwrite with null or undefined', async () => {
    await storage.put('doc/1', { id: '1', name: 'keep', tags: ['a'], score: 5, createdAt: '2026-01-01', updatedAt: '2026-01-01' });

    const result = await mergeAndPut<TestDoc>(storage, 'doc/1', { name: null as unknown as string, notes: undefined });

    expect(result.merged.name).toBe('keep');
    expect(result.fieldsUpdated).not.toContain('name');
  });

  it('should respect preserveFields', async () => {
    await storage.put('doc/1', { id: '1', name: 'old', tags: [], score: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' });

    const result = await mergeAndPut<TestDoc>(storage, 'doc/1',
      { id: 'CHANGED', createdAt: 'CHANGED', name: 'new', updatedAt: '2026-01-02' },
      { preserveFields: ['id', 'createdAt'] }
    );

    expect(result.merged.id).toBe('1'); // preserved
    expect(result.merged.createdAt).toBe('2026-01-01'); // preserved
    expect(result.merged.name).toBe('new'); // updated
    expect(result.fieldsUpdated).toContain('name');
    expect(result.fieldsUpdated).not.toContain('id');
    expect(result.fieldsUpdated).not.toContain('createdAt');
  });

  it('should append arrays with arrayStrategy: append', async () => {
    await storage.put('doc/1', { id: '1', name: 'x', tags: ['a', 'b'], score: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' });

    const result = await mergeAndPut<TestDoc>(storage, 'doc/1',
      { tags: ['b', 'c'] },
      { arrayStrategy: 'append' }
    );

    expect(result.merged.tags).toEqual(['a', 'b', 'b', 'c']);
  });

  it('should deduplicate arrays with arrayStrategy: union', async () => {
    await storage.put('doc/1', { id: '1', name: 'x', tags: ['a', 'b'], score: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' });

    const result = await mergeAndPut<TestDoc>(storage, 'doc/1',
      { tags: ['b', 'c'] },
      { arrayStrategy: 'union' }
    );

    expect(result.merged.tags).toEqual(['a', 'b', 'c']);
  });

  it('should replace arrays by default', async () => {
    await storage.put('doc/1', { id: '1', name: 'x', tags: ['a', 'b'], score: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' });

    const result = await mergeAndPut<TestDoc>(storage, 'doc/1', { tags: ['x'] });

    expect(result.merged.tags).toEqual(['x']);
  });

  it('should use custom fieldMerger when provided', async () => {
    await storage.put('doc/1', { id: '1', name: 'x', tags: [], score: 5, createdAt: '2026-01-01', updatedAt: '2026-01-01' });

    const result = await mergeAndPut<TestDoc>(storage, 'doc/1',
      { score: 10 },
      { fieldMergers: { score: (existing, incoming) => Math.max(existing as number, incoming as number) } }
    );

    expect(result.merged.score).toBe(10);
    expect(result.fieldsUpdated).toContain('score');
  });

  it('should pass through putOptions to storage', async () => {
    const result = await mergeAndPut<TestDoc>(storage, 'doc/1',
      { id: '1', name: 'test', tags: [], score: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      { putOptions: { ttl: 3600 } }
    );

    expect(result.created).toBe(true);
    // TTL is passed to storage.put — InMemoryAdapter tracks it internally
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/neil/dev/scaffold/packages/core && npx vitest run src/utils/__tests__/merge.test.ts`
Expected: FAIL — cannot resolve `../merge.js`

**Step 3: Write the implementation**

```typescript
// packages/core/src/utils/merge.ts
import type { StorageAdapter, StoragePutOptions } from '../types/public-api.js';

export interface MergeOptions<T> {
  preserveFields?: (keyof T)[];
  fieldMergers?: Partial<Record<keyof T, (existing: unknown, incoming: unknown) => unknown>>;
  arrayStrategy?: 'replace' | 'append' | 'union';
  putOptions?: StoragePutOptions;
}

export interface MergeResult<T> {
  merged: T;
  created: boolean;
  fieldsUpdated: string[];
}

export async function mergeAndPut<T extends Record<string, unknown>>(
  storage: StorageAdapter,
  key: string,
  incoming: Partial<T>,
  options?: MergeOptions<T>
): Promise<MergeResult<T>> {
  const existing = await storage.get<T>(key);

  if (!existing) {
    await storage.put(key, incoming, options?.putOptions);
    return { merged: incoming as T, created: true, fieldsUpdated: Object.keys(incoming) };
  }

  const fieldsUpdated: string[] = [];
  const merged = { ...existing } as Record<string, unknown>;

  for (const [field, value] of Object.entries(incoming)) {
    // Rule 5: never overwrite with null/undefined
    if (value == null) continue;

    // Rule 1: preserve fields that already have values
    if (options?.preserveFields?.includes(field as keyof T) && existing[field] != null) {
      continue;
    }

    // Rule 2: custom field merger
    const merger = options?.fieldMergers?.[field as keyof T];
    if (merger) {
      merged[field] = merger(existing[field], value);
      fieldsUpdated.push(field);
      continue;
    }

    // Rule 3: array merge strategy
    if (Array.isArray(value) && Array.isArray(existing[field])) {
      const strategy = options?.arrayStrategy ?? 'replace';
      if (strategy === 'append') {
        merged[field] = [...(existing[field] as unknown[]), ...value];
      } else if (strategy === 'union') {
        merged[field] = [...new Set([...(existing[field] as unknown[]), ...value])];
      } else {
        merged[field] = value;
      }
      fieldsUpdated.push(field);
      continue;
    }

    // Rule 4: overwrite
    merged[field] = value;
    fieldsUpdated.push(field);
  }

  await storage.put(key, merged, options?.putOptions);
  return { merged: merged as T, created: false, fieldsUpdated };
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/neil/dev/scaffold/packages/core && npx vitest run src/utils/__tests__/merge.test.ts`
Expected: All 8 tests PASS

**Step 5: Commit**

```bash
git add packages/core/src/utils/merge.ts packages/core/src/utils/__tests__/merge.test.ts
git commit -m "feat(core): add mergeAndPut utility for additive document merges"
```

---

### Task 2: Quality Gates — Types

**Files:**
- Modify: `packages/core/src/types/public-api.ts`

**Step 1: Add QualityCheck and QualityGateResult types**

Add after the `ValidationError` interface (around line 812) in `packages/core/src/types/public-api.ts`:

```typescript
// ============================================================================
// Quality Gates
// ============================================================================

/**
 * Result of a quality gate check on a single criterion
 * @public
 */
export interface QualityCheck {
  /** Check name (e.g., 'has_temp_logs', 'reached_target') */
  name: string;
  /** Whether this check passed */
  passed: boolean;
  /** Explanation when check fails */
  message?: string;
  /** 'error' blocks the response; 'warning' annotates it */
  severity: 'error' | 'warning';
}

/**
 * Result of running all quality gate checks for a tool
 * @public
 */
export interface QualityGateResult {
  /** Whether all error-severity checks passed */
  passed: boolean;
  /** Individual check results */
  checks: QualityCheck[];
}
```

**Step 2: Add `validate` to ScaffoldTool interface**

In the `ScaffoldTool` interface (around line 267), add after `afterExecute`:

```typescript
  /** Quality gate — runs after handler, before response is sent. See QualityGateResult. */
  validate?: (input: unknown, result: ToolResult, ctx: ToolContext) => Promise<QualityGateResult>;
```

**Step 3: Add ProgressEntry type**

Add after the QualityGateResult interface:

```typescript
// ============================================================================
// Progress Tracking
// ============================================================================

/**
 * A single progress entry logged per tool call
 * @public
 */
export interface ProgressEntry {
  /** Tool that produced this entry */
  toolName: string;
  /** ISO timestamp */
  timestamp: string;
  /** Quality gate check results (auto-populated when validate exists) */
  checks?: QualityCheck[];
  /** App-defined numeric scores */
  scores?: Record<string, number>;
  /** Tags for filtering */
  tags?: string[];
  /** Freeform metadata */
  meta?: Record<string, unknown>;
}
```

**Step 4: Verify existing tests still pass**

Run: `cd /home/neil/dev/scaffold/packages/core && npx vitest run`
Expected: All existing tests PASS (type-only changes, backwards compatible)

**Step 5: Commit**

```bash
git add packages/core/src/types/public-api.ts
git commit -m "feat(core): add QualityCheck, QualityGateResult, ProgressEntry types"
```

---

### Task 3: Quality Gates — Execution Pipeline

**Files:**
- Modify: `packages/core/src/mcp/errors.ts`
- Modify: `packages/core/src/mcp/types.ts`
- Modify: `packages/core/src/mcp/tools.ts`
- Create: `packages/core/src/mcp/__tests__/quality-gates.test.ts`

**Step 1: Write the failing tests**

```typescript
// packages/core/src/mcp/__tests__/quality-gates.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { handleToolsCall } from '../tools.js';
import { InMemoryAdapter } from '../../storage/in-memory.js';
import type { ScaffoldTool, ScaffoldConfig, StorageAdapter } from '../../types/public-api.js';
import type { JsonRpcRequest } from '../types.js';

function makeConfig(overrides?: Partial<ScaffoldConfig['auth']>): ScaffoldConfig {
  return {
    app: { name: 'test', description: 'test', version: '0.0.1' },
    mcp: { serverName: 'test', protocolVersion: '2024-11-05' },
    auth: { requireAuth: false, enableKeyIndex: false, enableFallbackScan: false, fallbackScanRateLimit: 0, fallbackScanBudget: 0, ...overrides },
    admin: { path: '/admin' },
  };
}

function makeRequest(toolName: string, args?: Record<string, unknown>): JsonRpcRequest {
  return { jsonrpc: '2.0', id: '1', method: 'tools/call', params: { name: toolName, arguments: args } };
}

// Dummy HTTP request (no auth needed — requireAuth: false)
const httpRequest = new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': 'application/json' } });

describe('quality gates in tool execution', () => {
  let storage: StorageAdapter;
  let config: ScaffoldConfig;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    config = makeConfig();
  });

  it('should pass through when tool has no validate function', async () => {
    const tool: ScaffoldTool = {
      name: 'test-no_gate',
      description: 'no gate',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    };
    const tools = new Map([[tool.name, tool]]);

    const res = await handleToolsCall(makeRequest('test-no_gate'), httpRequest, tools, config, storage, {});
    const body = await res.json() as { result?: { content: { text: string }[] } };

    expect(body.result?.content[0].text).toBe('ok');
  });

  it('should pass through when all checks pass', async () => {
    const tool: ScaffoldTool = {
      name: 'test-all_pass',
      description: 'all pass',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => ({ content: [{ type: 'text', text: 'data' }] }),
      validate: async () => ({
        passed: true,
        checks: [{ name: 'check1', passed: true, severity: 'error' }],
      }),
    };
    const tools = new Map([[tool.name, tool]]);

    const res = await handleToolsCall(makeRequest('test-all_pass'), httpRequest, tools, config, storage, {});
    const body = await res.json() as { result?: { content: { text: string }[] } };

    expect(body.result?.content[0].text).toBe('data');
  });

  it('should block response when an error-severity check fails', async () => {
    const tool: ScaffoldTool = {
      name: 'test-error_gate',
      description: 'error gate',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => ({ content: [{ type: 'text', text: 'should not see this' }] }),
      validate: async () => ({
        passed: false,
        checks: [
          { name: 'critical', passed: false, message: 'data quality too low', severity: 'error' },
        ],
      }),
    };
    const tools = new Map([[tool.name, tool]]);

    const res = await handleToolsCall(makeRequest('test-error_gate'), httpRequest, tools, config, storage, {});
    const body = await res.json() as { error?: { code: number; message: string } };

    expect(body.error).toBeDefined();
    expect(body.error!.message).toContain('Quality gate failed');
  });

  it('should annotate warnings but still return result', async () => {
    const tool: ScaffoldTool = {
      name: 'test-warning_gate',
      description: 'warning gate',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => ({ content: [{ type: 'text', text: 'data' }] }),
      validate: async () => ({
        passed: true,
        checks: [
          { name: 'minor', passed: false, message: 'could be better', severity: 'warning' },
        ],
      }),
    };
    const tools = new Map([[tool.name, tool]]);

    const res = await handleToolsCall(makeRequest('test-warning_gate'), httpRequest, tools, config, storage, {});
    const body = await res.json() as { result?: { content: { text: string }[] } };

    // Result should still be returned
    expect(body.result?.content[0].text).toBe('data');
  });

  it('should auto-log progress when validate exists', async () => {
    const tool: ScaffoldTool = {
      name: 'test-progress_log',
      description: 'progress log',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
      validate: async () => ({
        passed: true,
        checks: [{ name: 'check1', passed: true, severity: 'warning' }],
      }),
    };
    const tools = new Map([[tool.name, tool]]);

    await handleToolsCall(makeRequest('test-progress_log'), httpRequest, tools, config, storage, {});

    // Check that a progress entry was written
    const progressList = await storage.list('anonymous/_progress/test-progress_log/');
    expect(progressList.keys.length).toBe(1);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/neil/dev/scaffold/packages/core && npx vitest run src/mcp/__tests__/quality-gates.test.ts`
Expected: FAIL — no quality gate logic yet

**Step 3: Add `TOOL_VALIDATION_FAILED` error code**

In `packages/core/src/mcp/types.ts`, add to `JSON_RPC_ERROR_CODES` (around line 77):

```typescript
  TOOL_VALIDATION_FAILED: -32007,
```

**Step 4: Add `toolValidationFailed` error factory**

In `packages/core/src/mcp/errors.ts`, add after the `toolExecutionError` function:

```typescript
/**
 * Tool quality gate failed
 */
export function toolValidationFailed(
  id: string | number | null,
  checks: { name: string; message?: string }[]
): Response {
  const failedNames = checks.map(c => c.name).join(', ');
  return errorResponse(
    id,
    JSON_RPC_ERROR_CODES.TOOL_VALIDATION_FAILED,
    `Quality gate failed: ${failedNames}`,
    { checks }
  );
}
```

**Step 5: Wire quality gates into `handleToolsCall`**

In `packages/core/src/mcp/tools.ts`, add `toolValidationFailed` to the imports from `./errors.js`. Then replace the try block inside `handleToolsCall` (lines 121-154) with:

```typescript
  try {
    // Run beforeExecute hook if defined
    if (tool.beforeExecute) {
      await tool.beforeExecute(params.arguments ?? {}, ctx);
    }

    // Execute the tool handler
    const result = await tool.handler(params.arguments ?? {}, ctx);

    // Quality gate — run after handler, before response
    let gateResult: import('../types/public-api.js').QualityGateResult | undefined;
    if (tool.validate) {
      gateResult = await tool.validate(params.arguments ?? {}, result, ctx);

      const failedErrors = gateResult.checks.filter(c => !c.passed && c.severity === 'error');
      if (failedErrors.length > 0) {
        return toolValidationFailed(request.id, failedErrors);
      }

      // Attach warnings to metadata
      const warnings = gateResult.checks.filter(c => !c.passed && c.severity === 'warning');
      if (warnings.length > 0) {
        result.metadata = { ...result.metadata, qualityWarnings: warnings };
      }
    }

    // Run afterExecute hook if defined
    if (tool.afterExecute) {
      await tool.afterExecute(result, ctx);
    }

    // Auto-log progress when validate exists
    if (tool.validate && gateResult) {
      const progressKey = `${ctx.userId}/_progress/${tool.name}/${new Date().toISOString()}`;
      try {
        await ctx.storage.put(progressKey, {
          toolName: tool.name,
          timestamp: new Date().toISOString(),
          checks: gateResult.checks,
        }, { ttl: 90 * 86400 });
      } catch {
        // Progress logging is best-effort — don't fail the tool call
      }
    }

    // Return result in MCP format
    const mcpResult: ToolsCallResult = {
      content: result.content,
      isError: result.isError,
    };

    return jsonResponse(request.id, mcpResult);
  } catch (error) {
    const message = ctx.debugMode && error instanceof Error
      ? error.message
      : 'Tool execution failed';
    const details = ctx.debugMode && error instanceof Error
      ? { stack: error.stack }
      : undefined;
    return toolExecutionError(request.id, message, details);
  }
```

Add the needed type import at the top of `tools.ts`:

```typescript
import type { QualityGateResult } from '../types/public-api.js';
```

And update the import from errors:

```typescript
import {
  authRequired,
  authFailed,
  toolNotFound,
  invalidParams,
  toolExecutionError,
  toolValidationFailed,
} from './errors.js';
```

**Step 6: Run tests to verify they pass**

Run: `cd /home/neil/dev/scaffold/packages/core && npx vitest run src/mcp/__tests__/quality-gates.test.ts`
Expected: All 5 tests PASS

**Step 7: Run all existing tests to verify no regressions**

Run: `cd /home/neil/dev/scaffold/packages/core && npx vitest run`
Expected: All tests PASS

**Step 8: Commit**

```bash
git add packages/core/src/mcp/errors.ts packages/core/src/mcp/types.ts packages/core/src/mcp/tools.ts packages/core/src/mcp/__tests__/quality-gates.test.ts
git commit -m "feat(core): quality gates — validate tool output before sending response"
```

---

### Task 4: Knowledge Files — Utility & Tool

**Files:**
- Create: `packages/core/src/utils/knowledge.ts`
- Create: `packages/core/src/utils/__tests__/knowledge.test.ts`
- Create: `packages/core/src/tools/knowledge-tool.ts`
- Create: `packages/core/src/tools/__tests__/knowledge-tool.test.ts`

**Step 1: Write the failing utility tests**

```typescript
// packages/core/src/utils/__tests__/knowledge.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { loadKnowledge, listKnowledgeTopics } from '../knowledge.js';
import { InMemoryAdapter } from '../../storage/in-memory.js';
import type { StorageAdapter } from '../../types/public-api.js';

describe('loadKnowledge', () => {
  let storage: StorageAdapter;

  beforeEach(async () => {
    storage = new InMemoryAdapter();
    await storage.put('_knowledge/bbq-basics', '# BBQ Basics\n\nLow and slow.');
    await storage.put('_knowledge/wood-types', '# Wood Types\n\nOak, hickory, cherry.');
  });

  it('should load a single topic', async () => {
    const result = await loadKnowledge(storage, ['bbq-basics']);
    expect(result).toBe('# BBQ Basics\n\nLow and slow.');
  });

  it('should load multiple topics separated by divider', async () => {
    const result = await loadKnowledge(storage, ['bbq-basics', 'wood-types']);
    expect(result).toContain('# BBQ Basics');
    expect(result).toContain('# Wood Types');
    expect(result).toContain('\n\n---\n\n');
  });

  it('should return empty string when no topics found', async () => {
    const result = await loadKnowledge(storage, ['nonexistent']);
    expect(result).toBe('');
  });

  it('should skip missing topics and return found ones', async () => {
    const result = await loadKnowledge(storage, ['nonexistent', 'bbq-basics']);
    expect(result).toBe('# BBQ Basics\n\nLow and slow.');
  });
});

describe('listKnowledgeTopics', () => {
  let storage: StorageAdapter;

  beforeEach(async () => {
    storage = new InMemoryAdapter();
    await storage.put('_knowledge/bbq-basics', 'content');
    await storage.put('_knowledge/wood-types', 'content');
    await storage.put('other/key', 'not knowledge');
  });

  it('should list all knowledge topics', async () => {
    const topics = await listKnowledgeTopics(storage);
    expect(topics).toEqual(['bbq-basics', 'wood-types']);
  });

  it('should return empty array when no knowledge exists', async () => {
    const emptyStorage = new InMemoryAdapter();
    const topics = await listKnowledgeTopics(emptyStorage);
    expect(topics).toEqual([]);
  });
});
```

**Step 2: Run to verify failure**

Run: `cd /home/neil/dev/scaffold/packages/core && npx vitest run src/utils/__tests__/knowledge.test.ts`
Expected: FAIL

**Step 3: Implement the utility**

```typescript
// packages/core/src/utils/knowledge.ts
import type { StorageAdapter } from '../types/public-api.js';

const KNOWLEDGE_PREFIX = '_knowledge/';

/**
 * Load one or more knowledge topics from storage.
 * Returns concatenated markdown, or empty string if none found.
 */
export async function loadKnowledge(
  storage: StorageAdapter,
  topics: string[]
): Promise<string> {
  const sections: string[] = [];
  for (const topic of topics) {
    const content = await storage.get<string>(`${KNOWLEDGE_PREFIX}${topic}`);
    if (content) sections.push(content);
  }
  return sections.join('\n\n---\n\n');
}

/**
 * List all available knowledge topics.
 * Returns topic names (without the _knowledge/ prefix).
 */
export async function listKnowledgeTopics(
  storage: StorageAdapter
): Promise<string[]> {
  const result = await storage.list(KNOWLEDGE_PREFIX);
  return result.keys.map(key => key.slice(KNOWLEDGE_PREFIX.length));
}
```

**Step 4: Run utility tests**

Run: `cd /home/neil/dev/scaffold/packages/core && npx vitest run src/utils/__tests__/knowledge.test.ts`
Expected: All 5 tests PASS

**Step 5: Write the failing tool tests**

```typescript
// packages/core/src/tools/__tests__/knowledge-tool.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { knowledgeTool } from '../knowledge-tool.js';
import { InMemoryAdapter } from '../../storage/in-memory.js';
import type { ToolContext } from '../../types/public-api.js';

function createTestContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    authKeyHash: 'test-hash',
    userId: 'test-user',
    isAdmin: false,
    storage: new InMemoryAdapter(),
    env: {},
    debugMode: false,
    requestId: 'req-1',
    ...overrides,
  };
}

describe('scaffold-knowledge', () => {
  let storage: InMemoryAdapter;

  beforeEach(async () => {
    storage = new InMemoryAdapter();
    await storage.put('_knowledge/topic-a', '# Topic A\n\nContent A');
    await storage.put('_knowledge/topic-b', '# Topic B\n\nContent B');
  });

  it('should list topics (any user)', async () => {
    const ctx = createTestContext({ storage });
    const result = await knowledgeTool.handler({ action: 'list' }, ctx);
    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed.topics).toEqual(['topic-a', 'topic-b']);
  });

  it('should get a topic (any user)', async () => {
    const ctx = createTestContext({ storage });
    const result = await knowledgeTool.handler({ action: 'get', topic: 'topic-a' }, ctx);
    expect(result.content[0].text).toContain('# Topic A');
  });

  it('should return error for missing topic on get', async () => {
    const ctx = createTestContext({ storage });
    const result = await knowledgeTool.handler({ action: 'get', topic: 'nope' }, ctx);
    expect(result.isError).toBe(true);
  });

  it('should set a topic (admin only)', async () => {
    const ctx = createTestContext({ storage, isAdmin: true });
    await knowledgeTool.handler({ action: 'set', topic: 'new-topic', content: '# New' }, ctx);

    const stored = await storage.get<string>('_knowledge/new-topic');
    expect(stored).toBe('# New');
  });

  it('should reject set for non-admin', async () => {
    const ctx = createTestContext({ storage, isAdmin: false });
    const result = await knowledgeTool.handler({ action: 'set', topic: 'x', content: 'y' }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Admin');
  });

  it('should delete a topic (admin only)', async () => {
    const ctx = createTestContext({ storage, isAdmin: true });
    await knowledgeTool.handler({ action: 'delete', topic: 'topic-a' }, ctx);

    const stored = await storage.get('_knowledge/topic-a');
    expect(stored).toBeNull();
  });

  it('should reject delete for non-admin', async () => {
    const ctx = createTestContext({ storage, isAdmin: false });
    const result = await knowledgeTool.handler({ action: 'delete', topic: 'topic-a' }, ctx);
    expect(result.isError).toBe(true);
  });
});
```

**Step 6: Run to verify failure**

Run: `cd /home/neil/dev/scaffold/packages/core && npx vitest run src/tools/__tests__/knowledge-tool.test.ts`
Expected: FAIL

**Step 7: Implement the knowledge tool**

```typescript
// packages/core/src/tools/knowledge-tool.ts
import type { ScaffoldTool, ToolContext, ToolResult } from '../types/public-api.js';
import { loadKnowledge, listKnowledgeTopics } from '../utils/knowledge.js';

const KNOWLEDGE_PREFIX = '_knowledge/';

export const knowledgeTool: ScaffoldTool = {
  name: 'scaffold-knowledge',
  description: 'Manage the knowledge base. Actions: list, get (any user), set, delete (admin only).',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['list', 'get', 'set', 'delete'], description: 'Action to perform' },
      topic: { type: 'string', description: 'Topic name (required for get, set, delete)' },
      content: { type: 'string', description: 'Markdown content (required for set)' },
    },
    required: ['action'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { action, topic, content } = input as { action: string; topic?: string; content?: string };

    if (action === 'list') {
      const topics = await listKnowledgeTopics(ctx.storage);
      return { content: [{ type: 'text', text: JSON.stringify({ topics, count: topics.length }, null, 2) }] };
    }

    if (!topic) {
      return { content: [{ type: 'text', text: 'Error: topic is required for this action' }], isError: true };
    }

    if (action === 'get') {
      const loaded = await loadKnowledge(ctx.storage, [topic]);
      if (!loaded) {
        return { content: [{ type: 'text', text: `Knowledge topic "${topic}" not found.` }], isError: true };
      }
      return { content: [{ type: 'text', text: loaded }] };
    }

    // set and delete require admin
    if (!ctx.isAdmin) {
      return { content: [{ type: 'text', text: 'Error: Admin access required for this action' }], isError: true };
    }

    if (action === 'set') {
      if (!content) {
        return { content: [{ type: 'text', text: 'Error: content is required for set' }], isError: true };
      }
      await ctx.storage.put(`${KNOWLEDGE_PREFIX}${topic}`, content);
      return { content: [{ type: 'text', text: `Knowledge topic "${topic}" saved (${content.length} chars).` }] };
    }

    if (action === 'delete') {
      await ctx.storage.delete(`${KNOWLEDGE_PREFIX}${topic}`);
      return { content: [{ type: 'text', text: `Knowledge topic "${topic}" deleted.` }] };
    }

    return { content: [{ type: 'text', text: `Unknown action: ${action}` }], isError: true };
  },
};
```

**Step 8: Run tool tests**

Run: `cd /home/neil/dev/scaffold/packages/core && npx vitest run src/tools/__tests__/knowledge-tool.test.ts`
Expected: All 7 tests PASS

**Step 9: Commit**

```bash
git add packages/core/src/utils/knowledge.ts packages/core/src/utils/__tests__/knowledge.test.ts packages/core/src/tools/knowledge-tool.ts packages/core/src/tools/__tests__/knowledge-tool.test.ts
git commit -m "feat(core): knowledge files — KV-backed domain knowledge with admin CRUD tool"
```

---

### Task 5: Progress Tracking — Utility & Tool

**Files:**
- Create: `packages/core/src/utils/progress.ts`
- Create: `packages/core/src/utils/__tests__/progress.test.ts`
- Create: `packages/core/src/tools/progress-tool.ts`
- Create: `packages/core/src/tools/__tests__/progress-tool.test.ts`

**Step 1: Write the failing utility tests**

```typescript
// packages/core/src/utils/__tests__/progress.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { logProgress, getProgress } from '../progress.js';
import { InMemoryAdapter } from '../../storage/in-memory.js';
import type { ToolContext } from '../../types/public-api.js';

function createTestContext(storage: InMemoryAdapter): ToolContext {
  return {
    authKeyHash: 'test-hash',
    userId: 'user-1',
    isAdmin: false,
    storage,
    env: {},
    debugMode: false,
    requestId: 'req-1',
  };
}

describe('logProgress', () => {
  it('should write a progress entry to storage', async () => {
    const storage = new InMemoryAdapter();
    const ctx = createTestContext(storage);

    await logProgress(ctx, 'my-tool', { scores: { accuracy: 0.9 }, tags: ['test'] });

    const keys = await storage.list('user-1/_progress/my-tool/');
    expect(keys.keys.length).toBe(1);
  });
});

describe('getProgress', () => {
  let storage: InMemoryAdapter;

  beforeEach(async () => {
    storage = new InMemoryAdapter();
    // Seed 6 entries with known timestamps and scores
    const base = new Date('2026-01-01T00:00:00Z');
    for (let i = 0; i < 6; i++) {
      const ts = new Date(base.getTime() + i * 86400000).toISOString();
      await storage.put(`user-1/_progress/my-tool/${ts}`, {
        toolName: 'my-tool',
        timestamp: ts,
        checks: [{ name: 'check1', passed: i >= 3, severity: 'warning' }],
        scores: { accuracy: 0.5 + i * 0.1 },
      });
    }
  });

  it('should return entries sorted newest first', async () => {
    const result = await getProgress(storage, 'user-1', 'my-tool', 10);
    expect(result.entries.length).toBe(6);
    expect(result.entries[0].timestamp > result.entries[5].timestamp).toBe(true);
  });

  it('should respect limit', async () => {
    const result = await getProgress(storage, 'user-1', 'my-tool', 3);
    expect(result.entries.length).toBe(3);
    expect(result.totalEntries).toBe(6);
  });

  it('should compute trends for checks', async () => {
    const result = await getProgress(storage, 'user-1', 'my-tool', 10);
    const checkTrend = result.trends['check1'];
    expect(checkTrend).toBeDefined();
    // Last 3 entries all pass, first 3 all fail → improving
    expect(checkTrend.direction).toBe('improving');
  });

  it('should compute trends for scores', async () => {
    const result = await getProgress(storage, 'user-1', 'my-tool', 10);
    const scoreTrend = result.trends['accuracy'];
    expect(scoreTrend).toBeDefined();
    expect(scoreTrend.direction).toBe('improving');
  });

  it('should return empty result for no entries', async () => {
    const result = await getProgress(storage, 'user-1', 'no-tool', 10);
    expect(result.entries).toEqual([]);
    expect(result.totalEntries).toBe(0);
    expect(result.trends).toEqual({});
  });
});
```

**Step 2: Run to verify failure**

Run: `cd /home/neil/dev/scaffold/packages/core && npx vitest run src/utils/__tests__/progress.test.ts`
Expected: FAIL

**Step 3: Implement the utility**

```typescript
// packages/core/src/utils/progress.ts
import type { StorageAdapter, ToolContext, ProgressEntry, QualityCheck } from '../types/public-api.js';

const PROGRESS_TTL = 90 * 86400; // 90 days

export interface TrendInfo {
  direction: 'improving' | 'declining' | 'stable';
  recentValue: number;
  priorValue: number;
}

export interface ProgressResult {
  entries: ProgressEntry[];
  totalEntries: number;
  trends: Record<string, TrendInfo>;
}

/**
 * Log a progress entry for a tool call.
 */
export async function logProgress(
  ctx: ToolContext,
  toolName: string,
  data: Omit<ProgressEntry, 'toolName' | 'timestamp'>
): Promise<void> {
  const timestamp = new Date().toISOString();
  const key = `${ctx.userId}/_progress/${toolName}/${timestamp}`;
  const entry: ProgressEntry = { toolName, timestamp, ...data };
  await ctx.storage.put(key, entry, { ttl: PROGRESS_TTL });
}

/**
 * Get progress entries and computed trends for a tool.
 */
export async function getProgress(
  storage: StorageAdapter,
  userId: string,
  toolName: string,
  limit: number
): Promise<ProgressResult> {
  const prefix = `${userId}/_progress/${toolName}/`;
  const listResult = await storage.list(prefix, { limit: 1000 });
  const totalEntries = listResult.keys.length;

  if (totalEntries === 0) {
    return { entries: [], totalEntries: 0, trends: {} };
  }

  // Load all entries for trend calculation, sort newest first
  const allEntries: ProgressEntry[] = [];
  for (const key of listResult.keys) {
    const entry = await storage.get<ProgressEntry>(key);
    if (entry) allEntries.push(entry);
  }
  allEntries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  // Compute trends using all entries (split-half)
  const trends = computeTrends(allEntries);

  // Return only the requested limit
  const entries = allEntries.slice(0, limit);

  return { entries, totalEntries, trends };
}

/**
 * Split entries into recent vs prior halves, compute direction for each metric.
 */
function computeTrends(entries: ProgressEntry[]): Record<string, TrendInfo> {
  if (entries.length < 2) return {};

  const mid = Math.floor(entries.length / 2);
  // entries are newest-first, so recent = first half, prior = second half
  const recent = entries.slice(0, mid);
  const prior = entries.slice(mid);
  const trends: Record<string, TrendInfo> = {};

  // Trend for checks (pass rate)
  const checkNames = new Set<string>();
  for (const e of entries) {
    for (const c of e.checks ?? []) checkNames.add(c.name);
  }

  for (const name of checkNames) {
    const recentRate = passRate(recent, name);
    const priorRate = passRate(prior, name);
    trends[name] = { direction: direction(recentRate, priorRate), recentValue: recentRate, priorValue: priorRate };
  }

  // Trend for scores (average)
  const scoreNames = new Set<string>();
  for (const e of entries) {
    for (const key of Object.keys(e.scores ?? {})) scoreNames.add(key);
  }

  for (const name of scoreNames) {
    const recentAvg = avgScore(recent, name);
    const priorAvg = avgScore(prior, name);
    trends[name] = { direction: direction(recentAvg, priorAvg), recentValue: recentAvg, priorValue: priorAvg };
  }

  return trends;
}

function passRate(entries: ProgressEntry[], checkName: string): number {
  let total = 0;
  let passed = 0;
  for (const e of entries) {
    const check = (e.checks ?? []).find(c => c.name === checkName);
    if (check) {
      total++;
      if (check.passed) passed++;
    }
  }
  return total === 0 ? 0 : passed / total;
}

function avgScore(entries: ProgressEntry[], scoreName: string): number {
  let total = 0;
  let sum = 0;
  for (const e of entries) {
    const val = e.scores?.[scoreName];
    if (val != null) {
      total++;
      sum += val;
    }
  }
  return total === 0 ? 0 : sum / total;
}

function direction(recent: number, prior: number): 'improving' | 'declining' | 'stable' {
  const diff = recent - prior;
  if (diff > 0.1) return 'improving';
  if (diff < -0.1) return 'declining';
  return 'stable';
}
```

**Step 4: Run utility tests**

Run: `cd /home/neil/dev/scaffold/packages/core && npx vitest run src/utils/__tests__/progress.test.ts`
Expected: All 5 tests PASS

**Step 5: Write the failing tool tests**

```typescript
// packages/core/src/tools/__tests__/progress-tool.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { progressTool } from '../progress-tool.js';
import { InMemoryAdapter } from '../../storage/in-memory.js';
import type { ToolContext } from '../../types/public-api.js';

function createTestContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    authKeyHash: 'test-hash',
    userId: 'user-1',
    isAdmin: false,
    storage: new InMemoryAdapter(),
    env: {},
    debugMode: false,
    requestId: 'req-1',
    ...overrides,
  };
}

describe('scaffold-progress', () => {
  let storage: InMemoryAdapter;

  beforeEach(async () => {
    storage = new InMemoryAdapter();
    for (let i = 0; i < 4; i++) {
      const ts = new Date(Date.now() - i * 86400000).toISOString();
      await storage.put(`user-1/_progress/my-tool/${ts}`, {
        toolName: 'my-tool',
        timestamp: ts,
        scores: { accuracy: 0.7 + i * 0.05 },
      });
    }
  });

  it('should return progress for a tool', async () => {
    const ctx = createTestContext({ storage });
    const result = await progressTool.handler({ toolName: 'my-tool' }, ctx);
    const parsed = JSON.parse(result.content[0].text!);

    expect(parsed.entries.length).toBe(4);
    expect(parsed.totalEntries).toBe(4);
    expect(parsed.trends).toBeDefined();
  });

  it('should respect limit parameter', async () => {
    const ctx = createTestContext({ storage });
    const result = await progressTool.handler({ toolName: 'my-tool', limit: 2 }, ctx);
    const parsed = JSON.parse(result.content[0].text!);

    expect(parsed.entries.length).toBe(2);
    expect(parsed.totalEntries).toBe(4);
  });

  it('should return empty for unknown tool', async () => {
    const ctx = createTestContext({ storage });
    const result = await progressTool.handler({ toolName: 'nope' }, ctx);
    const parsed = JSON.parse(result.content[0].text!);

    expect(parsed.entries).toEqual([]);
    expect(parsed.totalEntries).toBe(0);
  });
});
```

**Step 6: Run to verify failure**

Run: `cd /home/neil/dev/scaffold/packages/core && npx vitest run src/tools/__tests__/progress-tool.test.ts`
Expected: FAIL

**Step 7: Implement the progress tool**

```typescript
// packages/core/src/tools/progress-tool.ts
import type { ScaffoldTool, ToolContext, ToolResult } from '../types/public-api.js';
import { getProgress } from '../utils/progress.js';

export const progressTool: ScaffoldTool = {
  name: 'scaffold-progress',
  description: 'View progress and trends for a tool. Shows quality gate pass rates and score trends over time.',
  inputSchema: {
    type: 'object',
    properties: {
      toolName: { type: 'string', description: 'Tool name to get progress for' },
      limit: { type: 'number', description: 'Max entries to return (default 20)', default: 20 },
    },
    required: ['toolName'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { toolName, limit } = input as { toolName: string; limit?: number };
    const result = await getProgress(ctx.storage, ctx.userId, toolName, limit ?? 20);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    };
  },
};
```

**Step 8: Run tool tests**

Run: `cd /home/neil/dev/scaffold/packages/core && npx vitest run src/tools/__tests__/progress-tool.test.ts`
Expected: All 3 tests PASS

**Step 9: Commit**

```bash
git add packages/core/src/utils/progress.ts packages/core/src/utils/__tests__/progress.test.ts packages/core/src/tools/progress-tool.ts packages/core/src/tools/__tests__/progress-tool.test.ts
git commit -m "feat(core): progress tracking — log tool quality over time with trend analysis"
```

---

### Task 6: Register New Tools & Export Everything

**Files:**
- Modify: `packages/core/src/tools/core-tools.ts`
- Modify: `packages/core/src/utils/index.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/tools/__tests__/core-tools.test.ts`

**Step 1: Add new tools to core-tools.ts**

In `packages/core/src/tools/core-tools.ts`, add imports:

```typescript
import { knowledgeTool } from './knowledge-tool.js';
import { progressTool } from './progress-tool.js';
```

Add to the `coreTools` array (around line 317):

```typescript
export const coreTools: ScaffoldTool[] = [
  getContextTool,
  healthCheckTool,
  debugInfoTool,
  listKeysTool,
  echoTool,
  knowledgeTool,
  progressTool,
];
```

**Step 2: Export new utilities from utils/index.ts**

In `packages/core/src/utils/index.ts`, add:

```typescript
export { knowledge } from './knowledge.js';
export { progress } from './progress.js';
export { merge } from './merge.js';
```

This requires adding namespace exports to each utility file. Add to the bottom of each:

In `packages/core/src/utils/knowledge.ts`:
```typescript
export const knowledge = { loadKnowledge, listKnowledgeTopics };
```

In `packages/core/src/utils/progress.ts`:
```typescript
export const progress = { logProgress, getProgress };
```

In `packages/core/src/utils/merge.ts`:
```typescript
export const merge = { mergeAndPut };
```

**Step 3: Export new types and utilities from index.ts**

In `packages/core/src/index.ts`, add to the type exports:

```typescript
  // Quality Gates
  QualityCheck,
  QualityGateResult,

  // Progress Tracking
  ProgressEntry,
```

Update the utility re-export:

```typescript
export { auth, storage, errors, validation, knowledge, progress, merge } from './utils/index.js';
```

Also export the utilities directly for convenient named imports:

```typescript
// Direct utility exports (convenience)
export { loadKnowledge, listKnowledgeTopics } from './utils/knowledge.js';
export { logProgress, getProgress } from './utils/progress.js';
export { mergeAndPut } from './utils/merge.js';
```

Also export the type for MergeOptions and MergeResult:

```typescript
export type { MergeOptions, MergeResult } from './utils/merge.js';
export type { TrendInfo, ProgressResult } from './utils/progress.js';
```

**Step 4: Update the core-tools test**

In `packages/core/src/tools/__tests__/core-tools.test.ts`, update the expected tool count and names:

```typescript
  it('should export all core tools', () => {
    expect(coreTools).toHaveLength(7);
    expect(coreTools.map(t => t.name)).toEqual([
      'scaffold-get_context',
      'scaffold-health_check',
      'scaffold-debug_info',
      'scaffold-list_keys',
      'scaffold-echo',
      'scaffold-knowledge',
      'scaffold-progress',
    ]);
  });

  it('should create a map of core tools', () => {
    const map = createCoreToolsMap();
    expect(map.size).toBe(7);
    // ...existing assertions plus:
    expect(map.has('scaffold-knowledge')).toBe(true);
    expect(map.has('scaffold-progress')).toBe(true);
  });
```

**Step 5: Run all tests**

Run: `cd /home/neil/dev/scaffold/packages/core && npx vitest run`
Expected: All tests PASS

**Step 6: Rebuild dist**

Run: `cd /home/neil/dev/scaffold/packages/core && npx tsc`
Expected: Clean compile, no errors

**Step 7: Commit**

```bash
git add packages/core/src/tools/core-tools.ts packages/core/src/tools/__tests__/core-tools.test.ts packages/core/src/utils/index.ts packages/core/src/utils/knowledge.ts packages/core/src/utils/progress.ts packages/core/src/utils/merge.ts packages/core/src/index.ts
git commit -m "feat(core): register knowledge + progress tools, export all new utilities"
```

---

### Task 7: BBQ Smoking Example — Wire Up All Four Techniques

**Files:**
- Modify: `examples/bbq-smoking/src/tools/cook-tools.ts`
- Modify: `examples/bbq-smoking/src/tools/guide-tools.ts`
- Modify: `examples/bbq-smoking/src/index.ts`

This task demonstrates all four techniques working together in a real example app. The changes are:

1. **Additive merge** — use `mergeAndPut` in recipe update tool
2. **Quality gates** — add `validate` to `bbq-complete_cook`
3. **Knowledge files** — seed knowledge on first request, use `loadKnowledge` in guide tool
4. **Progress tracking** — automatic via quality gates (no code needed)

**Step 1: Add quality gate to `bbq-complete_cook`**

In `examples/bbq-smoking/src/tools/cook-tools.ts`, add import:

```typescript
import { loadKnowledge } from '@scaffold/core';
```

Add `validate` to `completeCookTool` (after the handler):

```typescript
  validate: async (input, _result, ctx) => {
    const { cookId } = input as { cookId: string };
    const logList = await ctx.storage.list(logsPrefix(ctx.userId, cookId));
    const logCount = logList.keys.filter(k => k.includes('/logs/')).length;

    return {
      passed: true, // warnings only — never block
      checks: [
        {
          name: 'has_temp_logs',
          passed: logCount >= 2,
          message: 'Cook completed with fewer than 2 temp logs — data may be incomplete for future reference',
          severity: 'warning' as const,
        },
      ],
    };
  },
```

**Step 2: Update guide tool to use knowledge files**

In `examples/bbq-smoking/src/tools/guide-tools.ts`, replace the hardcoded guide data lookup with a `loadKnowledge` call. Keep the existing hardcoded data as a fallback (and as the seed source).

Add import:

```typescript
import { loadKnowledge } from '@scaffold/core';
```

In the `smokingGuideTool` handler, add knowledge loading before the existing hardcoded fallback:

```typescript
handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
  const { topic } = input as { topic: string };

  // Try knowledge base first
  const knowledge = await loadKnowledge(ctx.storage, [topic]);
  if (knowledge) {
    return { content: [{ type: 'text', text: knowledge }] };
  }

  // Fallback to hardcoded guides
  // ... existing code ...
},
```

**Step 3: Add knowledge seeding to index.ts**

In `examples/bbq-smoking/src/index.ts`, add a seed function that runs on first request:

```typescript
import { ScaffoldServer, CloudflareKVAdapter, type ScaffoldConfig } from '@scaffold/core';
import { bbqTools } from './tools.js';

// ... existing config ...

async function seedKnowledge(storage: CloudflareKVAdapter): Promise<void> {
  const initialized = await storage.get('_knowledge/_initialized');
  if (initialized) return;

  await storage.put('_knowledge/smoking-temps', `# Smoking Temperature Guide

## Target Internal Temperatures
- **Brisket**: 195-205°F (rest at 203°F for best results)
- **Pork Butt**: 195-205°F (pull at 195°F for slicing, 205°F for pulling)
- **Ribs**: 190-203°F (bend test: ribs crack but don't break)
- **Chicken**: 165°F minimum (thigh meat best at 175°F)
- **Turkey**: 165°F breast, 175°F thigh

## Smoker Temperatures
- **Low & slow**: 225-250°F (brisket, pork butt)
- **Hot & fast**: 275-325°F (chicken, turkey, ribs)
- **Searing**: 400°F+ (reverse sear finish)`);

  await storage.put('_knowledge/wood-pairings', `# Wood & Meat Pairings

| Wood | Flavor | Best For |
|------|--------|----------|
| Post Oak | Medium smoke, clean | Brisket (Texas style) |
| Hickory | Strong, bacon-like | Pork, ribs |
| Cherry | Mild, sweet, color | Pork, poultry, ribs |
| Apple | Mild, fruity | Poultry, pork |
| Pecan | Medium, nutty | Everything, good blending wood |
| Mesquite | Very strong, earthy | Short cooks, grilling (use sparingly for smoking) |`);

  await storage.put('_knowledge/_initialized', 'true');
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const runtimeConfig = { ...config, auth: { ...config.auth, adminKey: env.ADMIN_KEY } };
    const storage = new CloudflareKVAdapter(env.DATA);

    // Seed knowledge base on first request
    ctx.waitUntil(seedKnowledge(storage));

    const server = new ScaffoldServer({ config: runtimeConfig, storage, tools: bbqTools });
    return server.fetch(request, env as unknown as Record<string, unknown>, ctx);
  },
};
```

**Step 4: Update recipe tool to use mergeAndPut**

In `examples/bbq-smoking/src/tools/recipe-tools.ts`, find the update recipe handler. Replace the `storage.get` → modify → `storage.put` pattern with:

```typescript
import { mergeAndPut } from '@scaffold/core';
```

Then in the update handler:

```typescript
const { merged, fieldsUpdated } = await mergeAndPut<Recipe>(
  ctx.storage,
  recipeKey(ctx.userId, recipeId),
  { ...updates, updatedAt: new Date().toISOString() },
  {
    preserveFields: ['id', 'createdAt'],
    arrayStrategy: 'union',
  }
);

return {
  content: [{
    type: 'text',
    text: `Updated recipe "${merged.name}" — changed: ${fieldsUpdated.join(', ')}`,
  }],
};
```

**Step 5: Run bbq-smoking tests**

Run: `cd /home/neil/dev/scaffold && npm test --workspace=examples/bbq-smoking`
Expected: All tests PASS (or if no tests exist for these specific changes, verify the build works)

**Step 6: Build the example to verify TypeScript compiles**

Run: `cd /home/neil/dev/scaffold/examples/bbq-smoking && npx tsc --noEmit`
Expected: No errors

**Step 7: Commit**

```bash
git add examples/bbq-smoking/src/
git commit -m "feat(bbq-smoking): wire up quality gates, knowledge files, merge, and progress tracking"
```

---

### Task 8: Final Verification & Full Test Suite

**Files:** None (verification only)

**Step 1: Run the full test suite**

Run: `cd /home/neil/dev/scaffold/packages/core && npx vitest run`
Expected: All tests PASS

**Step 2: Rebuild core dist**

Run: `cd /home/neil/dev/scaffold/packages/core && npx tsc`
Expected: Clean compile

**Step 3: Verify exports work**

Run a quick import check:
```bash
cd /home/neil/dev/scaffold && node -e "
const core = require('./packages/core/dist/index.js');
console.log('mergeAndPut:', typeof core.mergeAndPut);
console.log('loadKnowledge:', typeof core.loadKnowledge);
console.log('logProgress:', typeof core.logProgress);
console.log('getProgress:', typeof core.getProgress);
console.log('knowledge ns:', typeof core.knowledge);
console.log('progress ns:', typeof core.progress);
console.log('merge ns:', typeof core.merge);
"
```
Expected: All should print `function` or `object`

**Step 4: Commit the design doc update**

Update `docs/plans/2026-02-12-methodology-layer-design.md` status from "Design" to "Implemented":

```bash
git add docs/plans/2026-02-12-methodology-layer-design.md docs/plans/2026-02-12-methodology-layer-impl.md
git commit -m "docs: methodology layer design and implementation plan"
```
