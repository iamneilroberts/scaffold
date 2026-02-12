# Methodology Layer: Quality Gates, Knowledge Files, Progress Tracking, Additive Merge

**Date:** 2026-02-12
**Status:** Design — awaiting implementation plan
**Inspiration:** [claude-interview-coach](https://github.com/raphaotten/claude-interview-coach) patterns adapted for deployed MCP servers

## Motivation

The interview coach project demonstrates that structured methodology — quality checklists, domain knowledge, progress tracking, and careful data handling — makes AI tools dramatically more useful. But it only works locally in Claude Code with file-system access.

Scaffold already solves deployment, auth, and storage. These four techniques add the *methodology layer* on top — the part that makes a tool feel like working with an expert rather than a CRUD API.

They reinforce each other:
- **Quality gates** produce structured pass/fail data per tool call
- **Progress tracking** stores that data over time and surfaces trends
- **Knowledge files** provide the domain expertise that defines what "quality" means
- **Additive merge** ensures none of this accumulated data gets accidentally destroyed

## 1. Quality Gates

### Problem

Tool handlers mix business logic with validation. There's no way to inspect what checks a tool performs, and no framework-level enforcement. The LLM gets back whatever the handler returns — good or bad.

### Design

Add an optional `validate` function to `ScaffoldTool`. The framework calls it after the handler returns, before sending the response to the MCP client.

#### Type changes (`public-api.ts`)

```typescript
export interface ScaffoldTool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  handler: (input: unknown, ctx: ToolContext) => Promise<ToolResult>;
  beforeExecute?: (input: unknown, ctx: ToolContext) => Promise<void>;
  afterExecute?: (result: ToolResult, ctx: ToolContext) => Promise<void>;

  /** Quality gate — runs after handler, before response is sent */
  validate?: (input: unknown, result: ToolResult, ctx: ToolContext) => Promise<QualityGateResult>;
}

export interface QualityGateResult {
  passed: boolean;
  checks: QualityCheck[];
}

export interface QualityCheck {
  name: string;
  passed: boolean;
  /** Explanation when check fails */
  message?: string;
  /** 'error' blocks the response; 'warning' annotates it */
  severity: 'error' | 'warning';
}
```

#### Execution flow change (`tools.ts`)

```
handler() → validate() → afterExecute() → response
```

- If any check with `severity: 'error'` fails → return a `toolValidationFailed` error response (new error factory in `errors.ts`). The handler's result is discarded.
- If only `severity: 'warning'` checks fail → attach warnings to `result.metadata.qualityWarnings` and return normally. The LLM sees the warnings alongside the data.
- If `validate` is not defined → skip (backwards compatible).

#### Example: `bbq-complete_cook`

```typescript
validate: async (input, result, ctx) => {
  const { cookId } = input as { cookId: string };
  const cook = await ctx.storage.get<Cook>(cookKey(ctx.userId, cookId));
  const logList = await ctx.storage.list(logsPrefix(ctx.userId, cookId));

  return {
    passed: true,
    checks: [
      {
        name: 'has_temp_logs',
        passed: logList.keys.length >= 2,
        message: 'Cook completed with fewer than 2 temp logs',
        severity: 'warning',
      },
      {
        name: 'reached_target',
        passed: logList.keys.length > 0, // simplified — real impl checks actual temps
        message: 'No log entry reached the target internal temperature',
        severity: 'warning',
      },
    ],
  };
},
```

#### Admin dashboard integration

The admin tools tab can list tools with their gate check names, giving visibility into what validation each tool performs without reading source code.

### Decisions

- **validate runs after handler, not before.** Input validation already happens via JSON Schema. Quality gates validate the *output* — did the tool produce something good enough to send back?
- **Warnings don't block.** Only `severity: 'error'` prevents the response. This avoids being overly strict while still surfacing issues to the LLM.
- **validate receives both input and result.** It may need to cross-reference what was asked with what was produced.


## 2. Knowledge Files

### Problem

Scaffold tools embed domain knowledge as hardcoded strings in TypeScript (see `guide-tools.ts` in bbq-smoking). This couples expertise to code, requires redeployment to update, and can't be managed by non-developers.

### Design

Store domain knowledge in KV under a `_knowledge/` prefix. Provide a utility to load it and a core admin tool to manage it.

#### Storage convention

```
_knowledge/{topic}     →  string (markdown content)
```

Examples:
```
_knowledge/smoking-guide      →  "# BBQ Smoking Guide\n\n## Brisket..."
_knowledge/wood-pairings      →  "# Wood & Meat Pairings\n\n| Wood | Flavor |..."
_knowledge/food-safety        →  "# Food Safety\n\nMinimum internal temps..."
```

#### Core utility — `knowledge.ts`

```typescript
/**
 * Load one or more knowledge topics from storage.
 * Returns concatenated markdown, or empty string if none found.
 */
export async function loadKnowledge(
  storage: StorageAdapter,
  topics: string[]
): Promise<string>;

/**
 * List all available knowledge topics.
 */
export async function listKnowledgeTopics(
  storage: StorageAdapter
): Promise<string[]>;
```

#### Core tool — `scaffold-knowledge` (admin only)

Actions: `list`, `get`, `set`, `delete`.

```typescript
// List all topics
scaffold-knowledge { action: 'list' }

// Read a topic
scaffold-knowledge { action: 'get', topic: 'smoking-guide' }

// Create or update a topic
scaffold-knowledge { action: 'set', topic: 'smoking-guide', content: '# BBQ Smoking...' }

// Delete a topic
scaffold-knowledge { action: 'delete', topic: 'smoking-guide' }
```

#### How tools use it

```typescript
handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
  const { question } = input as { question: string };
  const knowledge = await loadKnowledge(ctx.storage, ['smoking-guide', 'wood-pairings']);

  return {
    content: [{
      type: 'text',
      text: knowledge
        ? `## Reference\n\n${knowledge}\n\n## Question\n\n${question}`
        : `No knowledge base loaded. Answer based on general knowledge.\n\n## Question\n\n${question}`,
    }],
  };
},
```

#### Seeding knowledge at deploy time

Two approaches (both supported):

1. **Code-based seeding:** Example app's `index.ts` checks for `_knowledge/_initialized` on first request, seeds from hardcoded strings if missing. Simple, no extra tooling.

2. **File-based seeding (future):** A `scaffold seed` CLI command reads `knowledge/*.md` from the project directory and uploads to KV. Better for larger knowledge bases.

For now, approach 1 is sufficient. Approach 2 is a natural extension when `create-scaffold-app` exists.

### Decisions

- **KV not filesystem.** Scaffold runs on Cloudflare Workers. KV is the storage layer. Knowledge can be updated without redeployment.
- **Plain markdown strings, not structured objects.** Knowledge is meant to be injected into LLM context. Markdown is the native format for that.
- **Admin-only writes.** Any authenticated user's tools can *read* knowledge, but only admins can create/update/delete. Prevents users from poisoning the knowledge base.
- **No knowledge versioning in v1.** Keep it simple. If versioning is needed later, add `_knowledge-history/{topic}/{timestamp}`.


## 3. Progress Tracking

### Problem

Tool calls are fire-and-forget. There's no way to see patterns over time — are the user's BBQ cooks improving? Are they consistently hitting temp targets? The interview coach tracks 16 anti-patterns across sessions and shows trend arrows. Scaffold has nothing equivalent.

### Design

A storage convention for logging per-tool-call quality data, plus a core tool to query it.

#### Storage convention

```
{userId}/_progress/{toolName}/{timestamp}  →  ProgressEntry
```

```typescript
export interface ProgressEntry {
  toolName: string;
  timestamp: string;
  /** Quality gate results from technique #1, auto-populated */
  checks?: QualityCheck[];
  /** App-defined numeric scores */
  scores?: Record<string, number>;
  /** Tags for filtering */
  tags?: string[];
  /** Freeform metadata */
  meta?: Record<string, unknown>;
}
```

#### Auto-population from quality gates

When a tool has `validate` defined, the framework automatically logs the gate results to progress storage in the `afterExecute` phase. No opt-in required — if you have quality gates, you get progress tracking for free.

```typescript
// In handleToolsCall, after validate passes:
if (tool.validate && gateResult) {
  const progressKey = `${ctx.userId}/_progress/${tool.name}/${new Date().toISOString()}`;
  await ctx.storage.put(progressKey, {
    toolName: tool.name,
    timestamp: new Date().toISOString(),
    checks: gateResult.checks,
  }, { ttl: 90 * 86400 }); // 90-day retention
}
```

#### Manual logging from tool handlers

Apps can log additional scores beyond what quality gates capture:

```typescript
import { logProgress } from '@scaffold/core';

afterExecute: async (result, ctx) => {
  await logProgress(ctx, 'bbq-complete_cook', {
    scores: { cookDurationAccuracy: 0.85, tempConsistency: 0.92 },
    tags: ['brisket', 'completed'],
  });
},
```

#### Core tool — `scaffold-progress`

```typescript
// Get progress for a specific tool
scaffold-progress { toolName: 'bbq-complete_cook', limit: 10 }

// Response:
{
  entries: [ /* last 10 ProgressEntry objects */ ],
  trends: {
    "has_temp_logs": { direction: "improving", recentRate: 0.9, priorRate: 0.6 },
    "reached_target": { direction: "stable", recentRate: 1.0, priorRate: 1.0 },
    "cookDurationAccuracy": { direction: "improving", recentAvg: 0.85, priorAvg: 0.72 }
  },
  totalEntries: 23
}
```

#### Trend calculation

Split entries into two halves (recent vs. prior). For boolean checks: compare pass rates. For numeric scores: compare averages. Direction thresholds:
- Improving: recent > prior by 10%+
- Declining: recent < prior by 10%+
- Stable: within 10%

#### TTL and cleanup

Progress entries have a 90-day TTL by default (configurable). Cloudflare KV handles expiration automatically. No cleanup job needed.

### Decisions

- **Auto-log from quality gates.** This is the killer connection between technique #1 and #3. Define quality checks once, get progress tracking for free.
- **Per-user isolation.** Progress is under `{userId}/_progress/`. Users only see their own data.
- **90-day default TTL.** Progress data is useful for trends, not archival. KV handles expiration.
- **Simple trend math.** Split-half comparison is good enough. No need for rolling averages or statistical tests in v1.


## 4. Additive Merge Helper

### Problem

Every Scaffold example does `storage.get()` → modify → `storage.put()`, which is a full replace. This is error-prone when:
- The LLM sends a partial update and accidentally nulls fields it didn't mention
- Two concurrent calls both read the same record; the second overwrites the first's changes
- The user has manually edited data that the tool shouldn't overwrite

### Design

A utility function that reads, merges, and writes in one call with configurable field-level behavior.

#### Core utility — `merge.ts`

```typescript
export interface MergeOptions<T> {
  /** Fields that should never be overwritten once set (e.g., 'id', 'createdAt') */
  preserveFields?: (keyof T)[];
  /** Custom merge function per field */
  fieldMergers?: Partial<Record<keyof T, (existing: unknown, incoming: unknown) => unknown>>;
  /** How to merge arrays: 'replace' (default), 'append', or 'union' (deduplicated) */
  arrayStrategy?: 'replace' | 'append' | 'union';
  /** Storage put options (TTL, metadata) */
  putOptions?: StoragePutOptions;
}

export interface MergeResult<T> {
  /** The merged document */
  merged: T;
  /** Whether this was a new record (no existing data) */
  created: boolean;
  /** Which fields were actually changed */
  fieldsUpdated: string[];
}

/**
 * Read existing data, merge with incoming, write back.
 * If no existing data, writes incoming as-is.
 */
export async function mergeAndPut<T extends Record<string, unknown>>(
  storage: StorageAdapter,
  key: string,
  incoming: Partial<T>,
  options?: MergeOptions<T>
): Promise<MergeResult<T>>;
```

#### Merge behavior

For each field in `incoming`:
1. If field is in `preserveFields` and existing value is non-null → skip
2. If a custom `fieldMerger` is defined for this field → use it
3. If both values are arrays → apply `arrayStrategy`
4. If incoming value is non-null → overwrite
5. If incoming value is null/undefined → keep existing (never delete via merge)

Rule 5 is the key difference from `put()`. Merge never removes data — it only adds or updates.

#### Example: updating a recipe

```typescript
const { merged, fieldsUpdated } = await mergeAndPut<Recipe>(
  ctx.storage,
  recipeKey(ctx.userId, recipeId),
  { ...updates, updatedAt: new Date().toISOString() },
  {
    preserveFields: ['id', 'createdAt', 'createdBy'],
    arrayStrategy: 'union', // tags accumulate
  }
);

return {
  content: [{
    type: 'text',
    text: `Updated "${merged.name}" — changed: ${fieldsUpdated.join(', ')}`,
  }],
};
```

#### What about concurrency?

`mergeAndPut` uses simple read-then-write, which is sufficient for most Scaffold use cases (single-user, low concurrency). For apps that need stronger guarantees, a `mergeIfMatch` variant could use `getWithVersion` + `putIfMatch` internally. Not in v1 unless needed.

### Decisions

- **Utility function, not a storage adapter wrapper.** Keeps the StorageAdapter interface simple. Apps opt into merge behavior per-call rather than globally.
- **Never delete via merge.** This is the core safety property. If you need to delete a field, use `storage.put()` directly with the full document. Merge is for the common case of "add or update, don't lose data."
- **No concurrency control in v1.** Cloudflare KV is eventually consistent anyway. The simple read-merge-write is correct for the single-user-per-session model most Scaffold apps use.


## File Map

| New file | Purpose |
|---|---|
| `packages/core/src/utils/knowledge.ts` | `loadKnowledge`, `listKnowledgeTopics` |
| `packages/core/src/utils/progress.ts` | `logProgress`, `getProgress`, trend calculation |
| `packages/core/src/utils/merge.ts` | `mergeAndPut` |
| `packages/core/src/tools/knowledge-tool.ts` | `scaffold-knowledge` admin tool |
| `packages/core/src/tools/progress-tool.ts` | `scaffold-progress` tool |

| Modified file | Change |
|---|---|
| `packages/core/src/types/public-api.ts` | Add `QualityGateResult`, `QualityCheck`, `ProgressEntry` types; add `validate` to `ScaffoldTool` |
| `packages/core/src/mcp/tools.ts` | Call `validate` in execution pipeline, auto-log progress |
| `packages/core/src/mcp/errors.ts` | Add `toolValidationFailed` error factory |
| `packages/core/src/tools/core-tools.ts` | Register new core tools |
| `packages/core/src/index.ts` | Export new utilities and types |

## Implementation Order

1. **Additive merge** — standalone utility, no dependencies, immediately useful
2. **Quality gates** — types + execution pipeline change
3. **Knowledge files** — utility + core tool
4. **Progress tracking** — depends on quality gates for auto-population
5. **Example app updates** — wire all four into bbq-smoking as proof of concept

## Open Questions

- **Should progress auto-logging be opt-out?** Currently proposed as automatic when `validate` exists. Could add a `disableProgressTracking?: boolean` on `ScaffoldTool` if some tools want gates without logging.
- **Knowledge topic namespacing.** Should topics be flat (`smoking-guide`) or support hierarchy (`bbq/smoking-guide`)? Flat is simpler. Hierarchy is more organized for apps with lots of knowledge.
