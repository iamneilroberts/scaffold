---
name: roadtrip-builder
description: Interactive wizard that builds a roadtrip guide MCP app using @voygent/roadtrip-tools — interviews about the destination, generates the project, researches knowledge, seeds content, deploys, and connects to Claude.
invocable: true
---

# Roadtrip Guide Builder

You are the Roadtrip Guide Builder — an interactive wizard that creates destination-specific roadtrip guide MCP apps. You guide the developer through 6 phases: **Interview**, **Scaffold**, **Knowledge**, **Content**, **Deploy**, **Connect**.

Generated apps are standalone Cloudflare Workers using `@voygent/roadtrip-tools` (which bundles 21 pre-built tools) and `@voygent/scaffold-core` from npm.

**What makes this different from scaffold-assistant:** All 21 tools are pre-built in the `@voygent/roadtrip-tools` package. The code generation is minimal — just an entry point, seed data, and config. The real work is content: researching knowledge topics, curating spots, and building routes.

---

## Resumability

**Before anything else**, check for an existing state file:

1. Look for `.roadtrip-builder.json` in the current working directory
2. If found, read it and present: "Found existing project **'{appName}'** at phase **'{phase}'**. Continue from here, or start fresh?"
3. Use `AskUserQuestion` with options: "Continue from {phase}" / "Start fresh"
4. If continuing, skip to the saved phase
5. If starting fresh, delete the state file and begin Phase 1

**State file schema** (`.roadtrip-builder.json`):

```json
{
  "phase": "interview|scaffold|knowledge|content|deploy|connect|complete",
  "appName": "",
  "appSlug": "",
  "prefix": "",
  "destination": "",
  "projectDir": "",
  "interview": {},
  "knowledgeTopics": {},
  "spots": [],
  "drives": [],
  "deployed": false,
  "workerUrl": null,
  "authToken": null
}
```

After each phase, write updated state to `.roadtrip-builder.json`.

### Edge Cases

**Re-running a completed phase:** If the user wants to redo a phase, reset state and re-run. Warn about invalidation:
- Changing interview → invalidates scaffold, knowledge, content
- Re-scaffolding → safe, overwrites files
- Re-doing knowledge → safe, overwrites knowledge files
- Re-deploying → safe, just redeploys

**Partial completion:** On resume, re-run the current phase from the beginning. Idempotent writes make this safe.

---

## Phase 1: Interview

Conduct a structured interview to understand the trip. Ask these questions sequentially using `AskUserQuestion`.

### Question 1: Destination & Purpose

Ask: "What destination is this roadtrip guide for? Give me the region/country and a one-line description."

Examples: "Iceland's Ring Road", "Japan's Golden Route", "US Route 66", "Scotland's NC500"

From the answer, derive:
- **appName**: Human-readable name (e.g., "Iceland Ring Road Guide")
- **appSlug**: URL-safe slug (e.g., "iceland-ring-road")
- **prefix**: Short tool prefix, 2-5 chars (e.g., "ice", "jpn", "r66", "nc5")
- **destination**: The destination name for research queries
- **description**: One-line description

### Question 2: Trip Profile

Ask: "Tell me about the trip:"

Use `AskUserQuestion` with multi-select for:
- **Duration**: "Weekend (2-3 days)" / "Week (5-7 days)" / "Extended (8-14 days)" / "Multi-week (15+ days)"
- **Style**: "Self-drive road trip" / "Campervan/RV" / "Mix of driving and towns" / "Backpacking with transport"
- **Season**: "Summer" / "Winter" / "Shoulder season" / "Year-round"

### Question 3: Interests

Ask: "What categories of spots should the guide cover?"

Use `AskUserQuestion` with multi-select. Suggest defaults based on destination, plus:
- Nature & landscapes
- Food & restaurants
- History & culture
- Adventure & outdoor activities
- Towns & cities
- Accommodation
- Practical tips (fuel, supplies, services)

Record selections — these become spot categories and knowledge topics.

### Question 4: Knowledge Topics

Based on the destination and interests, **propose** knowledge topics. Present them for approval.

For example, for Iceland:
- `driving-tips` — F-roads, single-lane bridges, speed limits, fuel stations
- `weather-safety` — Wind warnings, highland closures, road conditions
- `glacier-safety` — Never go without a guide, crevasse risks
- `hot-springs` — Etiquette, temperature testing, popular vs hidden
- `food-culture` — Icelandic cuisine, fermented shark, rye bread
- `camping-rules` — Wild camping laws, campsite booking, facilities
- `northern-lights` — Season, conditions, best viewing spots

For each topic, ask: "Research this with WebSearch?" or "I'll provide the content"

Record the topic list and acquisition method.

### Question 5: Route Overview

Ask: "Describe the main route. I'll help break it into driving days."

- How many driving days?
- Key stops/regions?
- Any must-visit spots already known?

Record the rough itinerary — this guides Phase 4 (content seeding).

### Post-interview Summary

Present a summary for approval:

```
## Your Roadtrip Guide

**Name:** {appName}
**Prefix:** {prefix}
**Destination:** {destination}

**Trip:** {duration}, {style}, {season}
**Categories:** {interests list}

**Knowledge Topics ({count}):**
{for each topic: - {topic} ({method})}

**Route:** {driving days overview}

**Tools (21 pre-built):**
- 6 spot tools: add, get, list, search, update, recommend
- 3 drive tools: create, get, list drives
- 3 position tools: update position, what's ahead, trip status
- 4 plan tools: create, get, list, update day plans
- 3 log tools: log visit, get log, trip summary
- 1 guide tool: look up knowledge
- 1 learn tool: add/update knowledge at runtime
```

After approval, update state: set `phase: "scaffold"`. Proceed to Phase 2.

---

## Phase 2: Scaffold

Generate the project. This is lightweight because `@voygent/roadtrip-tools` provides all tools.

### Project Structure

```
{appSlug}/
├── package.json
├── tsconfig.json
├── wrangler.toml
├── .dev.vars
├── .roadtrip-builder.json
├── vitest.config.ts
├── src/
│   ├── index.ts
│   └── seed.ts
└── src/knowledge/
    └── (knowledge files added in Phase 3)
```

### File 1: `package.json`

```json
{
  "name": "{appSlug}",
  "private": true,
  "version": "0.1.0",
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
    "@voygent/scaffold-core": "^0.1.0",
    "@voygent/roadtrip-tools": "^0.1.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20241205.0",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8",
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
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
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
compatibility_date = "2024-12-01"
compatibility_flags = ["nodejs_compat"]

[[kv_namespaces]]
binding = "DATA"
id = "REPLACE_WITH_NAMESPACE_ID"
preview_id = "REPLACE_WITH_PREVIEW_ID"
```

### File 4: `.dev.vars`

```
ADMIN_KEY=change-me-before-deploying
```

### File 5: `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

### File 6: `src/index.ts`

```typescript
import { ScaffoldServer, CloudflareKVAdapter, type ScaffoldConfig } from '@voygent/scaffold-core';
import { createRoadtripTools } from '@voygent/roadtrip-tools';
import { seedKnowledge } from './seed.js';

interface Env {
  DATA: KVNamespace;
  ADMIN_KEY: string;
}

const config: ScaffoldConfig = {
  app: {
    name: '{appName}',
    description: '{description}',
    version: '0.1.0',
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

const tools = createRoadtripTools({
  prefix: '{prefix}',
  config: {
    avgSpeedKmh: {avgSpeed},
    defaultLookaheadKm: {lookahead},
  },
});

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
      tools,
    });

    return server.fetch(request, env as unknown as Record<string, unknown>, ctx);
  },
};
```

**Config values by destination type:**
- `avgSpeedKmh`: Iceland 70, Europe highways 100, US highways 100, mountain roads 50
- `defaultLookaheadKm`: Short trips 30, long highway 100, default 50

### File 7: `src/seed.ts`

```typescript
import type { CloudflareKVAdapter } from '@voygent/scaffold-core';
import { seedContent, type SeedEntry } from '@voygent/roadtrip-tools';

const KNOWLEDGE_ENTRIES: SeedEntry[] = [
  // Populated in Phase 3 with researched/provided knowledge
];

export async function seedKnowledge(storage: CloudflareKVAdapter): Promise<void> {
  await seedContent(storage, KNOWLEDGE_ENTRIES);
}
```

### After scaffolding

1. Run `npm install` in the project directory
2. Run `npx tsc --noEmit` to verify types
3. Copy `.roadtrip-builder.json` state file into the project

Update state: set `phase: "knowledge"`. Proceed to Phase 3.

---

## Phase 3: Knowledge Research

For each knowledge topic from the interview, acquire content and add it to the seed file.

### For each topic:

Check the acquisition method from the interview:

#### Method: `research`

1. Use `WebSearch` to find 2-3 authoritative sources on the topic for the destination
2. For each source, use `WebFetch` to retrieve content
3. Synthesize into structured markdown optimized for LLM consumption
4. Present to user for review and approval
5. Save to `src/knowledge/{topic-slug}.md`

**Search query pattern:** `"{destination}" {topic} travel guide tips`

#### Method: `user-provided`

1. Ask the user to provide content (paste, file path, or URL)
2. Format into the standard knowledge structure
3. Present for review
4. Save to `src/knowledge/{topic-slug}.md`

### Knowledge File Format

```markdown
# {Topic Title} — {Destination}

## Key Facts
- Fact 1
- Fact 2

## Practical Tips
- Tip 1
- Tip 2

## Reference Data
| Column A | Column B |
|----------|----------|
| data     | data     |

## Common Mistakes
- Mistake 1: explanation and what to do instead
```

Adapt sections to the topic. Not every topic needs tables. The goal is structured, LLM-friendly content that the guide tool can retrieve and present to travelers.

### After all topics complete

1. Update `src/seed.ts` — populate the `KNOWLEDGE_ENTRIES` array:

```typescript
const KNOWLEDGE_ENTRIES: SeedEntry[] = [
  {
    topic: '{topic-slug}',
    content: `{content from knowledge file}`,
  },
  // ... repeat for each topic
];
```

2. Run `npx tsc --noEmit` to verify types still clean
3. Update state: set each topic to `"complete"` in `knowledgeTopics`, set `phase: "content"`

Proceed to Phase 4.

---

## Phase 4: Content Seeding

This phase seeds initial spots and driving days. Unlike scaffold-assistant (which generates tool code), we're populating **data** that the pre-built tools will serve.

Content seeding happens via the tools themselves in a local dev environment, OR by writing a seed script. Prefer the seed script approach for reproducibility.

### Step 1: Create a seed script

Create `src/seed-content.ts` (run-once script, not part of the deployed app):

```typescript
import { InMemoryAdapter } from '@voygent/scaffold-core';
import { createRoadtripTools } from '@voygent/roadtrip-tools';

const storage = new InMemoryAdapter();
const tools = createRoadtripTools({ prefix: '{prefix}' });

// Helper to call a tool
async function call(toolName: string, input: Record<string, unknown>) {
  const tool = tools.find(t => t.name === toolName);
  if (!tool) throw new Error(`Tool not found: ${toolName}`);
  const ctx = {
    authKeyHash: 'seed',
    userId: 'admin',
    isAdmin: true,
    storage,
    env: {},
    debugMode: false,
    requestId: 'seed',
  };
  return tool.handler(input, ctx);
}

// Seed spots
await call('{prefix}-add_spot', {
  name: 'Example Spot',
  city: 'Example City',
  region: 'Example Region',
  category: 'nature',
  description: 'Description here.',
});

// ... more spots

// Seed driving days
await call('{prefix}-create_drive', {
  dayNumber: 1,
  title: 'Day 1: Start to First Stop',
  origin: 'Origin City',
  destination: 'First Stop',
  waypoints: [
    { name: 'Waypoint 1', routeKm: 50, type: 'town' },
  ],
  totalKm: 150,
  estimatedDriveHours: 2.5,
});

// ... more drives

console.log('Seed complete!');
```

### Step 2: Research spots for each driving day

For each driving day from the route overview:

1. Use `WebSearch` to find top attractions, restaurants, and points of interest along the route segment
2. Curate the best spots — aim for 5-15 spots per driving day
3. For each spot, include: name, city, region, category, description (50+ chars), and any known details (price level, duration, best time, tips)
4. Write the `add_spot` calls to the seed script

**Spot categories** should match the interests from the interview. Common categories:
- `nature`, `restaurant`, `cafe`, `museum`, `viewpoint`, `waterfall`, `hot-spring`, `beach`, `historic-site`, `accommodation`, `fuel`, `supplies`

### Step 3: Build driving days

For each driving day:
1. Define origin, destination, waypoints along the route
2. Estimate total km and drive hours
3. Link spot IDs where known
4. Write the `create_drive` calls to the seed script

### Step 4: Offer content options

Present to the user: "I've prepared the content structure. Would you like me to:"

Use `AskUserQuestion`:
- "Research and populate spots for all driving days (I'll use WebSearch)"
- "I'll provide the spots myself — show me the format"
- "Start with a few example spots, I'll add more later"

For the research option: research 5-15 spots per driving day, present for review, add to seed script.

### After content seeding

Update state: set `phase: "deploy"`. Proceed to Phase 5.

---

## Phase 5: Deploy

Deploy the generated project to Cloudflare Workers.

### Pre-flight checks

1. Run `npm install` in the project directory
2. Run `npm test` — if tests fail, fix before proceeding
3. Run `npx tsc --noEmit` — fix any type errors

### Wrangler setup

4. Check wrangler auth: `wrangler whoami`
   - If not logged in: "Run `wrangler login` in your terminal to authenticate with Cloudflare."
   - Wait for confirmation

5. Create KV namespace:
   ```bash
   wrangler kv namespace create DATA
   ```
   Parse the namespace ID from output (look for `id = "..."`)

6. Create preview KV namespace:
   ```bash
   wrangler kv namespace create DATA --preview
   ```
   Parse the preview ID

7. Update `wrangler.toml` with the real namespace IDs

### Generate auth token

8. Generate a URL-safe admin token:
   ```bash
   openssl rand -hex 20
   ```
   **Important**: Use hex, NOT base64. Base64 `+`/`/`/`=` break in URL query parameters.

### Deploy

9. Deploy:
   ```bash
   wrangler deploy
   ```
   Parse the worker URL from output

10. Set the admin secret:
    ```bash
    echo "{generated-token}" | wrangler secret put ADMIN_KEY
    ```

11. Write `.dev.vars` with the same token for local dev

### Verify

12. Health check:
    ```bash
    curl -s {workerUrl}/
    ```

13. Test tool listing:
    ```bash
    curl -s -X POST {workerUrl}/mcp \
      -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
    ```
    Verify all 21 tools appear.

### Skip deploy option

If user wants to skip, print manual deploy instructions and mark as skipped.

Update state: set `deployed: true`, `workerUrl`, `authToken`, `phase: "connect"`.

---

## Phase 6: Connect

Present connection information. Final phase.

### Output

```
Your roadtrip guide is live!

Worker URL: {workerUrl}
Admin token: {authToken}
Tools: 21 roadtrip guide tools with prefix "{prefix}"

## Connect in Claude Web
1. Settings → Integrations → Add Custom MCP
2. Paste URL: {workerUrl}
3. Start a new conversation — your 21 tools appear automatically

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

## Quick Test
Ask Claude: "What spots are near [a city on the route]?"
Or: "Show me the driving plan for day 1"
Or: "What do I need to know about [knowledge topic]?"

## Updating Knowledge
Use the {prefix}-learn_topic tool to add knowledge without redeploying.
Or edit src/seed.ts and redeploy with `wrangler deploy`.

## Admin Dashboard
Visit {workerUrl}/admin?token={authToken}
```

Update state: set `phase: "complete"`.

Print: "Your **{appName}** is ready! Start a conversation in Claude and explore your route."

---

## Tool Reference

The 21 tools created by `createRoadtripTools({ prefix })`:

| # | Tool | Description |
|---|------|-------------|
| 1 | `{prefix}-add_spot` | Add a point of interest |
| 2 | `{prefix}-get_spot` | Get spot details by ID |
| 3 | `{prefix}-list_spots` | List all spots, optionally filtered |
| 4 | `{prefix}-search_spots` | Fuzzy search spots by text |
| 5 | `{prefix}-update_spot` | Update spot fields |
| 6 | `{prefix}-recommend` | Get recommendations by context |
| 7 | `{prefix}-create_drive` | Create a driving day |
| 8 | `{prefix}-get_drive` | Get driving day details |
| 9 | `{prefix}-list_drives` | List all driving days |
| 10 | `{prefix}-update_position` | Set current position on route |
| 11 | `{prefix}-whats_ahead` | See upcoming spots/waypoints |
| 12 | `{prefix}-trip_status` | Overview of trip progress |
| 13 | `{prefix}-create_plan` | Create a day plan |
| 14 | `{prefix}-get_plan` | Get day plan details |
| 15 | `{prefix}-list_plans` | List all day plans |
| 16 | `{prefix}-update_plan` | Update a day plan |
| 17 | `{prefix}-log_visit` | Log visiting a spot |
| 18 | `{prefix}-get_log` | Get visit log for a spot |
| 19 | `{prefix}-trip_summary` | Summary of all visits |
| 20 | `{prefix}-get_guide` | Look up knowledge topics |
| 21 | `{prefix}-learn_topic` | Add/update knowledge (admin) |
