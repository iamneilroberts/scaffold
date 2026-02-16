# @voygent/roadtrip-tools

21 pre-built MCP tools for roadtrip guide assistants. Add spots, driving days, position tracking, day plans, visit logging, knowledge lookup, and runtime learning — all wired up and ready to deploy on Cloudflare Workers.

## Quick Start

```bash
mkdir my-roadtrip-guide && cd my-roadtrip-guide
npm init -y
npm install @voygent/scaffold-core @voygent/roadtrip-tools
npm install -D @cloudflare/workers-types typescript wrangler
```

### Entry point (`src/index.ts`)

```typescript
import { ScaffoldServer, CloudflareKVAdapter, type ScaffoldConfig } from '@voygent/scaffold-core';
import { createRoadtripTools, seedContent, type SeedEntry } from '@voygent/roadtrip-tools';

interface Env {
  DATA: KVNamespace;
  ADMIN_KEY: string;
}

const config: ScaffoldConfig = {
  app: {
    name: 'Iceland Ring Road Guide',
    description: 'Roadtrip assistant for Iceland\'s Ring Road',
    version: '0.1.0',
  },
  mcp: {
    serverName: 'scaffold-iceland-ring-road',
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
  admin: { path: '/admin' },
};

// Create all 21 tools with a short prefix
const tools = createRoadtripTools({
  prefix: 'ice',
  config: { avgSpeedKmh: 70, defaultLookaheadKm: 50 },
});

// Seed knowledge on first request
const KNOWLEDGE: SeedEntry[] = [
  {
    topic: 'driving-tips',
    content: '# Driving in Iceland\n\n- Speed limit: 90 km/h on highways, 50 km/h in towns\n- Single-lane bridges: first to arrive has right of way\n- F-roads require 4WD — rental agreements prohibit 2WD on F-roads',
  },
  {
    topic: 'weather-safety',
    content: '# Weather Safety\n\n- Check road.is and vedur.is before driving\n- Wind gusts can exceed 100 km/h — hold car doors firmly\n- Conditions change rapidly — carry warm layers even in summer',
  },
];

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const storage = new CloudflareKVAdapter(env.DATA);
    ctx.waitUntil(seedContent(storage, KNOWLEDGE));

    const server = new ScaffoldServer({
      config: { ...config, auth: { ...config.auth, adminKey: env.ADMIN_KEY } },
      storage,
      tools,
    });

    return server.fetch(request, env as unknown as Record<string, unknown>, ctx);
  },
};
```

### Wrangler config (`wrangler.toml`)

```toml
name = "scaffold-iceland-ring-road"
main = "src/index.ts"
compatibility_date = "2024-12-01"
compatibility_flags = ["nodejs_compat"]

[[kv_namespaces]]
binding = "DATA"
id = "REPLACE_AFTER_wrangler_kv_namespace_create_DATA"
preview_id = "REPLACE_AFTER_wrangler_kv_namespace_create_DATA_--preview"
```

### Deploy

```bash
wrangler login
wrangler kv namespace create DATA          # copy the id into wrangler.toml
wrangler kv namespace create DATA --preview # copy the preview_id
wrangler deploy
openssl rand -hex 20                       # generate admin key (hex only, not base64)
echo "YOUR_KEY" | wrangler secret put ADMIN_KEY
```

### Connect to Claude

**Claude Web:** Settings → Integrations → Add Custom MCP → paste your Worker URL

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "iceland-ring-road": {
      "url": "https://scaffold-iceland-ring-road.YOUR-SUBDOMAIN.workers.dev/sse",
      "headers": { "Authorization": "Bearer YOUR-ADMIN-KEY" }
    }
  }
}
```

**Claude Code** (`.mcp.json`):
```json
{
  "mcpServers": {
    "iceland-ring-road": {
      "type": "sse",
      "url": "https://scaffold-iceland-ring-road.YOUR-SUBDOMAIN.workers.dev/sse",
      "headers": { "Authorization": "Bearer YOUR-ADMIN-KEY" }
    }
  }
}
```

## Tools (21)

All tools are created by `createRoadtripTools({ prefix })`. Tool names use the pattern `{prefix}-{action}`.

### Spots (6)

| Tool | Description |
|------|-------------|
| `add_spot` | Add a point of interest (restaurant, waterfall, viewpoint, etc.) |
| `get_spot` | Get spot details by ID |
| `list_spots` | List all spots, optionally filtered by category or region |
| `search_spots` | Fuzzy text search across spots |
| `update_spot` | Update spot fields |
| `recommend` | Get context-aware recommendations (nearby, by interest, by route position) |

### Driving Days (3)

| Tool | Description |
|------|-------------|
| `create_drive` | Create a driving day with waypoints, distance, and estimated time |
| `get_drive` | Get driving day details |
| `list_drives` | List all driving days sorted by day number |

### Position Tracking (3)

| Tool | Description |
|------|-------------|
| `update_position` | Set current position on route (waypoint + km) |
| `whats_ahead` | See upcoming waypoints and spots from current position |
| `trip_status` | Overview of trip progress across all driving days |

### Day Plans (4)

| Tool | Description |
|------|-------------|
| `create_plan` | Create a day plan grouping spots with a theme |
| `get_plan` | Get day plan details |
| `list_plans` | List all day plans |
| `update_plan` | Update a day plan |

### Visit Logging (3)

| Tool | Description |
|------|-------------|
| `log_visit` | Log visiting a spot with optional rating and notes |
| `get_log` | Get visit log for a spot |
| `trip_summary` | Summary of all visits with average rating |

### Knowledge (2)

| Tool | Description |
|------|-------------|
| `get_guide` | Look up a knowledge topic, or list all available topics |
| `learn_topic` | Add/update knowledge at runtime (admin only, two-step propose→apply) |

## API

### `createRoadtripTools(options)`

```typescript
import { createRoadtripTools } from '@voygent/roadtrip-tools';

const tools = createRoadtripTools({
  prefix: 'ice',                // 2-5 char prefix for tool names
  config: {                     // optional
    avgSpeedKmh: 70,            // for position extrapolation (default: 80)
    defaultLookaheadKm: 50,     // for whats_ahead radius (default: 50)
  },
});
```

Returns an array of 21 `ScaffoldTool` objects ready to pass to `ScaffoldServer`.

### `seedContent(storage, entries)`

```typescript
import { seedContent, type SeedEntry } from '@voygent/roadtrip-tools';

const entries: SeedEntry[] = [
  { topic: 'driving-tips', content: '# Driving Tips\n\n...' },
];

const result = await seedContent(storage, entries);
// { seeded: 2, skipped: 0 }  — first call
// { seeded: 0, skipped: 2 }  — subsequent calls (idempotent)
```

Knowledge is stored at `_knowledge/{topic}` and accessible via the `get_guide` tool.

### Individual tool creators

For custom composition (e.g. only spots + drives, no position tracking):

```typescript
import { createSpotTools, createDriveTools } from '@voygent/roadtrip-tools';

const tools = [
  ...createSpotTools('ice'),
  ...createDriveTools('ice'),
];
```

Available: `createSpotTools`, `createDriveTools`, `createPositionTools`, `createPlanTools`, `createLogTools`, `createGuideTools`, `createLearnTools`.

### Types

```typescript
import type {
  Spot, DrivingDay, Waypoint, Position,
  DayPlan, TravelerLog, RoadtripConfig,
} from '@voygent/roadtrip-tools';
```

### Key helpers

```typescript
import {
  spotKey, spotsPrefix,       // {userId}/spots/{id}
  driveKey, drivesPrefix,     // {userId}/drives/{id}
  positionKey,                // {userId}/position/current
  planKey, plansPrefix,       // {userId}/plans/{id}
  logKey, logsPrefix,         // {userId}/logs/{id}
  knowledgeKey,               // _knowledge/{topic}
  generateId, makeTestCtx,
} from '@voygent/roadtrip-tools';
```

## Storage Patterns

| Data | Key Pattern | Scope |
|------|-------------|-------|
| Spots | `{userId}/spots/{id}` | Per user |
| Drives | `{userId}/drives/{id}` | Per user |
| Position | `{userId}/position/current` | Per user (singleton) |
| Plans | `{userId}/plans/{id}` | Per user |
| Logs | `{userId}/logs/{id}` | Per user |
| Knowledge | `_knowledge/{topic}` | Shared (all users) |

## Interactive Setup

For a guided experience, use the `/roadtrip-builder` skill in Claude Code — it interviews you about the destination, generates the project, researches knowledge, and deploys.
