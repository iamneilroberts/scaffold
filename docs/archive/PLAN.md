# Scaffold - MCP Assistant Framework

*Build your specialized LLM assistant on a solid foundation*

---

## Implementation Prompt (for new session)

Copy everything below this line to give a fresh Claude Code session in `/home/neil/dev/scaffold/`:

---

```
You are implementing the **Scaffold** - a reusable framework for building specialized LLM chatbot connectors using Cloudflare Workers + MCP protocol.

## Project Goal

Extract common patterns from three existing projects into a reusable framework:
- /home/neil/dev/AAM (Active Aging Mobile)
- /home/neil/dev/claude-travel-assistant (Voygent)
- /home/neil/dev/roadtrip-buddyv2 (Roadtrip Buddy)

## What This Framework Provides

1. **MCP Server** - JSON-RPC 2.0 server for Claude Desktop/iOS and ChatGPT
2. **Multi-layer Auth** - ENV keys, KV index, fallback scan
3. **KV Utilities** - Patch operations, summaries, soft delete, activity log
4. **Telemetry** - Tool call metrics with percentiles
5. **Error Logging** - Classification and admin visibility
6. **Support Pipeline** - Tickets, PII redaction, admin messaging
7. **Knowledge Base** - Self-learning with admin approval
8. **User Preferences** - Explicit + learned preferences
9. **Debug Mode** - Tiered logging (brief/detailed/full)
10. **Scheduled Maintenance** - Cleanup, index repair, stats
11. **Modular Admin Dashboard** - Tab-based plugin system
12. **Core Tools** - get_context, CRUD operations, support tools

## Project Structure

```
scaffold/
├── worker/
│   ├── src/
│   │   ├── core/                 # FRAMEWORK (don't modify)
│   │   │   ├── mcp/              # JSON-RPC server, lifecycle
│   │   │   ├── auth/             # Multi-layer auth, key prefix
│   │   │   ├── kv/               # Patch, summaries, soft-delete
│   │   │   ├── telemetry/        # Metrics, percentiles
│   │   │   ├── errors/           # Error log, classification
│   │   │   ├── support/          # Tickets, PII, messaging
│   │   │   ├── knowledge/        # Proposals, keywords
│   │   │   ├── preferences/      # User preferences
│   │   │   ├── debug/            # Debug mode
│   │   │   ├── scheduled/        # Cron maintenance
│   │   │   └── admin/            # Modular dashboard
│   │   │
│   │   ├── tools/                # User's custom tools
│   │   ├── tool-defs/            # User's tool schemas
│   │   ├── models/               # User's data models
│   │   └── admin-tabs/           # User's custom admin tabs
│   │
│   ├── wrangler.toml
│   └── package.json
├── templates/                     # Scaffolding templates
├── scripts/                       # Setup scripts
├── docs/                          # Documentation
└── starter.config.ts              # Framework configuration
```

## Implementation Order

### Phase 1: Project Setup
1. Initialize npm workspace
2. Set up TypeScript config
3. Create wrangler.toml template
4. Add CLAUDE.md with framework instructions

### Phase 2: Core MCP (extract from AAM)
Source: /home/neil/dev/AAM/worker/src/
- worker.ts (lines ~100-250) → core/mcp/server.ts
- mcp/lifecycle.ts → core/mcp/lifecycle.ts
- mcp/helpers.ts → core/mcp/helpers.ts

### Phase 3: Auth (extract from AAM)
Source: /home/neil/dev/AAM/worker/src/
- worker.ts (validateAuthKey function) → core/auth/validate.ts
- lib/kv.ts (getKeyPrefix function) → core/auth/key-prefix.ts

### Phase 4: KV Utilities (extract from Voygent + AAM)
Source: /home/neil/dev/claude-travel-assistant/cloudflare-mcp-kv-store/src/
- mcp/tools/trips.ts (lines 390-530) → core/kv/patch.ts (rename to generic)
- lib/trip-summary.ts → core/kv/summaries.ts (rename to generic)
- lib/kv/pending-deletions.ts → core/kv/soft-delete.ts

Source: /home/neil/dev/AAM/worker/src/
- lib/kv.ts → core/kv/client.ts

### Phase 5: Telemetry & Errors (extract from AAM)
Source: /home/neil/dev/AAM/worker/src/
- lib/telemetry.ts → core/telemetry/metrics.ts
- mcp/metrics-wrapper.ts → core/telemetry/wrapper.ts
- lib/error-log.ts → core/errors/log.ts

### Phase 6: Support Pipeline (extract from all projects)
Source: /home/neil/dev/AAM/worker/src/tools/support.ts
- PII redaction patterns → core/support/pii-redaction.ts
- Ticket management → core/support/tickets.ts
- Admin messaging → core/support/messaging.ts

### Phase 7: Knowledge Base (extract from AAM)
Source: /home/neil/dev/AAM/worker/src/tools/knowledge.ts
- propose_solution → core/knowledge/proposals.ts
- Keyword extraction → core/knowledge/keywords.ts

### Phase 8: Preferences (extract from Roadtrip)
Source: /home/neil/dev/roadtrip-buddyv2/roadtrip-buddy-worker/src/tools/preferences.ts
- → core/preferences/store.ts

### Phase 9: Debug Mode (extract from Roadtrip)
Source: /home/neil/dev/roadtrip-buddyv2/roadtrip-buddy-worker/src/tools/debug.ts
- → core/debug/mode.ts

### Phase 10: Scheduled Maintenance (extract from both)
Source: /home/neil/dev/roadtrip-buddyv2/roadtrip-buddy-worker/src/scheduled/cleanup.ts
Source: /home/neil/dev/claude-travel-assistant/cloudflare-mcp-kv-store/src/lib/maintenance.ts
- → core/scheduled/cleanup.ts
- → core/scheduled/index-repair.ts
- → core/scheduled/stats.ts
- → core/scheduled/runner.ts

### Phase 11: Modular Admin Dashboard
Current monolith: /home/neil/dev/AAM/worker/src/admin-dashboard.ts (2200 lines)

Break into:
- core/admin/types.ts - AdminTab interface
- core/admin/shell.ts - Common CSS/JS (~500 lines)
- core/admin/dashboard.ts - Assembly function
- core/admin/router.ts - Route handler
- core/admin/tabs/overview.ts
- core/admin/tabs/metrics.ts
- core/admin/tabs/errors.ts
- core/admin/tabs/users.ts

## Key Patterns to Preserve

### Collision-Resistant Key Prefix
```typescript
// Encodes special chars to prevent collisions
// kim.abc → kim_2e_abc/
// kim-abc → kim_2d_abc/
export function getKeyPrefix(authKey: string): string
```

### Dot-Notation Patch
```typescript
// Surgical updates to nested JSON
await patchDocument(ns, key, {
  'meta.status': 'confirmed',
  'items[0].price': 99.99
});
```

### Multi-Layer Auth
```typescript
// 1. ENV ADMIN_KEY (fast path)
// 2. ENV AUTH_KEYS (comma-separated)
// 3. KV _auth-index/{key} (O(1) lookup)
// 4. KV _users/* scan (fallback, writes index)
```

### AdminTab Interface
```typescript
interface AdminTab {
  id: string;
  label: string;
  order: number;
  html: string;
  script: string;
  endpoints: Array<{method, path, handler}>;
  getBadge?: (env) => Promise<{text, type} | null>;
}
```

## Core Tools (Generic Names)

| Tool | Purpose |
|------|---------|
| get_context | Startup: system prompt + profile + notifications |
| get_prompt | Load dynamic prompts with knowledge filtering |
| get_record | Read a document by ID |
| list_records | List documents with optional summaries |
| save_record | Create/update a document |
| patch_record | Surgical update with dot-notation |
| delete_record | Soft-delete with undo |
| submit_support | Create ticket with PII redaction |
| reply_to_admin | User replies to admin threads |
| dismiss_admin_message | Mark as read |
| propose_solution | AI proposes knowledge entries |
| set_preference | Store preferences |
| get_preferences | Load preferences |
| set_debug_mode | Enable tiered logging |

## Full Plan

See: /home/neil/.claude/plans/serialized-doodling-summit.md
```

---

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Location** | New repo (`scaffold`) | Clean slate, avoid polluting existing projects |
| **Goal** | Both personal + community | Reduce duplication AND create shareable framework |
| **Scope** | Full featured | Onboarding wizard, templates, scaffolding, docs |
| **Admin Dashboard** | Modular tabs | Break up 2000+ line monoliths into composable pieces |

## Vision

Distill the common patterns from voygent, roadtrip-buddy, and AAM into a reusable framework that enables rapid development of specialized LLM chatbot connectors using Cloudflare Workers + MCP protocol.

**Target users**:
1. **You**: Reduce duplication across AAM, voygent, roadtrip-buddy
2. **Other developers**: Clone and customize for niche assistants

## Core Value Proposition

| What You Get | Without Framework | With Framework |
|--------------|-------------------|----------------|
| MCP Server | Build from scratch | Clone & configure |
| Auth | Design & implement | Multi-layer ready |
| Admin Dashboard | 2000+ lines HTML | Modular tabs |
| Telemetry | DIY or skip | Built-in |
| User Management | Build it | Ready to use |
| Deployment | Figure it out | Staging + Prod |

---

## Architecture Overview

```
scaffold/
├── worker/
│   ├── src/
│   │   ├── core/                 # FRAMEWORK (don't modify)
│   │   │   ├── mcp/              # JSON-RPC server, lifecycle
│   │   │   ├── auth/             # Multi-layer auth, key prefix
│   │   │   ├── kv/               # Generic KV helpers
│   │   │   ├── telemetry/        # Metrics, percentiles
│   │   │   ├── errors/           # Error log, classification
│   │   │   └── admin/            # MODULAR dashboard (see below)
│   │   │
│   │   ├── tools/                # YOUR custom tools
│   │   ├── tool-defs/            # YOUR tool schemas
│   │   ├── models/               # YOUR data models
│   │   ├── services/             # YOUR business logic
│   │   └── admin-tabs/           # YOUR custom admin tabs
│   │
│   └── wrangler.toml
├── scripts/                       # Data import scripts
├── templates/                     # Scaffolding templates
├── .claude/commands/              # Claude Code slash commands
└── starter.config.ts              # Framework configuration
```

---

## Modular Admin Dashboard Architecture

### Problem Statement
Current dashboards are 2000-4000 line monolithic HTML strings that are:
- Hard to maintain
- Hard to test
- Hard to customize per-app
- Not reusable across projects

### Solution: Tab Plugin System

**Core Shell** (`core/admin/shell.ts`) provides:
- HTML document structure
- Common CSS (theme variables, components, utilities)
- Tab navigation component
- Auth UI (login form, session check)
- Theme toggle (dark/light)
- Toast notifications
- API client helper
- Common JavaScript utilities

**Each Tab** is a separate module with:
```typescript
// admin-tabs/data-quality.ts
export const dataQualityTab: AdminTab = {
  id: 'data-quality',
  label: 'Data Quality',
  icon: 'chart-bar',  // optional
  order: 50,          // tab ordering

  // Badge for tab (e.g., error count)
  getBadge: async (env) => {
    const issues = await getIssueCount(env);
    return issues > 0 ? { text: String(issues), type: 'warning' } : null;
  },

  // HTML content for this tab only
  html: `
    <div class="section">
      <h2>Data Quality Report</h2>
      <div id="quality-report"></div>
    </div>
  `,

  // JavaScript for this tab
  script: `
    async function loadQualityReport() {
      const data = await api.get('/admin/data-quality');
      document.getElementById('quality-report').innerHTML = renderReport(data);
    }
  `,

  // API endpoints for this tab
  endpoints: [
    { method: 'GET', path: '/admin/data-quality', handler: getQualityReport },
    { method: 'POST', path: '/admin/data-quality/scan', handler: runScan },
  ],
};
```

**Tab Registration** (`admin-tabs/index.ts`):
```typescript
import { overviewTab } from '../core/admin/tabs/overview';
import { metricsTab } from '../core/admin/tabs/metrics';
import { errorsTab } from '../core/admin/tabs/errors';
import { usersTab } from '../core/admin/tabs/users';
import { dataQualityTab } from './data-quality';  // Custom

export const adminTabs: AdminTab[] = [
  overviewTab,    // Core
  metricsTab,     // Core
  errorsTab,      // Core
  usersTab,       // Core
  dataQualityTab, // Custom
].sort((a, b) => a.order - b.order);
```

**Dashboard Assembly** (`core/admin/dashboard.ts`):
```typescript
export function buildDashboard(tabs: AdminTab[]): string {
  return `<!DOCTYPE html>
<html>
<head>
  ${COMMON_HEAD}
  ${COMMON_STYLES}
</head>
<body>
  ${AUTH_FORM}
  <div id="dashboard" class="hidden">
    ${buildTabNav(tabs)}
    ${tabs.map(t => buildTabContent(t)).join('\n')}
  </div>
  ${COMMON_SCRIPTS}
  ${tabs.map(t => t.script).join('\n')}
</body>
</html>`;
}
```

### Core Tabs (included in framework)

| Tab | Purpose | Endpoints |
|-----|---------|-----------|
| Overview | Stats cards, recent activity | `/admin/stats` |
| Metrics | Tool call telemetry, latency p50/p95/p99 | `/admin/metrics`, `/admin/metrics/daily` |
| Errors | Error log, classification, clear | `/admin/errors`, `/admin/errors/clear` |
| Users | User list, create, view profile | `/admin/users`, `/admin/users/:id` |

### Custom Tabs (per-app)

Apps add their own tabs for domain-specific features:
- AAM: Data Quality, Catalog, Support
- Voygent: Trips, Publishing, Knowledge Base
- Roadtrip: Costs, Static Data, Test Sessions

---

## Core Modules

### 1. MCP Server (`core/mcp/`)

Handles JSON-RPC 2.0 protocol:
- `server.ts` - Request routing, tool dispatch
- `lifecycle.ts` - Initialize/initialized handlers
- `helpers.ts` - createResult(), createToolError()

### 2. Authentication (`core/auth/`)

Multi-layer auth pattern:
1. ENV `ADMIN_KEY` (fast path)
2. ENV `AUTH_KEYS` comma-separated list
3. KV index lookup (`_auth-index/{authKey}`)
4. KV fallback scan (writes to index for next time)

Key functions:
- `validateAuthKey(env, key)` - Returns AuthResult
- `getKeyPrefix(authKey)` - Collision-resistant encoding
- `isAdmin(env, key)` - Admin flag check

### 3. KV Layer (`core/kv/`)

Generic helpers:
- `listAllKeys(ns, prefix)` - With pagination
- `batchGet(ns, keys)` - Parallel fetch
- `withTTL(value, ttl)` - TTL wrapper
- Index patterns (auth, email, resource)

### 4. Telemetry (`core/telemetry/`)

- `withMetrics(name, handler)` - HOF wrapper
- `recordToolCall(env, metric)` - Write to KV
- `getPercentiles(data)` - p50, p95, p99
- Realtime buffer + daily aggregates

### 5. Error Logging (`core/errors/`)

- `logError(env, error, options)` - Capture with context
- `classifyError(error)` - validation, auth, timeout, etc.
- `getErrorStats(env)` - Aggregated counts

### 6. Patch Operations (`core/kv/patch.ts`)

Token-efficient surgical updates for JSON documents in KV. From voygent's `patch_trip`:

```typescript
// Instead of reading/writing 5KB document (~2000 tokens):
await patchDocument(env.TRIPS, keyPrefix + 'doc-id', {
  'meta.status': 'confirmed',
  'items[0].price': 99.99,
  'nested.deep.value': 'updated'
});
```

**Features:**
- Dot-notation paths with array indexing
- Auto-creates intermediate objects/arrays
- Security: blocks prototype pollution, validates bounds
- Limits: 100 updates/call, 10 levels deep, array index 0-10000

### 7. Summary Caching (`core/kv/summaries.ts`)

Lightweight document summaries for efficient list operations:
- Auto-compute summary on save/patch (10-20x smaller than full doc)
- Hash-based change detection
- Batch loading for list views

### 8. Soft Delete (`core/kv/soft-delete.ts`)

Pending deletion with TTL for undo capability:
- `addPendingDeletion(key, ttl)` - Mark for deletion
- `filterPendingDeletions(keys)` - Exclude pending from lists
- `removePendingDeletion(key)` - Cancel deletion (undo)

### 9. Activity Logging (`core/kv/activity-log.ts`)

Track user activity for context:
- Recent changes (last 20, capped)
- Last session timestamp
- Active items list

### 10. Support Pipeline (`core/support/`)

Full support ticket system from all three projects:

**Tools:**
- `submit_support` - Create tickets with PII redaction + diagnostics
- `log_support_intent` - Telemetry for resolved-in-chat issues
- `reply_to_admin` - User replies to admin threads
- `dismiss_admin_message` - Mark broadcasts/threads as read

**PII Redaction** (shared patterns):
- Credit cards, SSN, passport numbers
- API keys (sk-, pk-, api-, token-, secret-)
- Passwords, phone numbers, emails

**Admin Messaging:**
- Broadcasts with expiration + priority
- Direct message threads (open/closed)
- Per-user dismissal tracking
- Unread detection in get_context

### 11. Knowledge Base (`core/knowledge/`)

Self-learning system from AAM + Voygent:
- `propose_solution` - AI proposes solutions, admin approves
- Keyword extraction (remove stop words, limit 10)
- Daily per-user quota (10/day)
- Integration with `get_prompt` (keyword-filtered matching)

### 12. User Preferences (`core/preferences/`)

From roadtrip-buddy:
- Explicit preferences (user-stated)
- Learned preferences (inferred from behavior)
- Category system (customizable)
- Preference summary generation

### 13. Debug Mode (`core/debug/`)

From roadtrip-buddy:
- `set_test_mode` - Enable debug with tiered levels (brief/detailed/full)
- Auto-disable after 24h TTL
- Timing instrumentation for tool calls
- Diagnostic report generation

### 14. Scheduled Maintenance (`core/scheduled/`)

Standard cron jobs from roadtrip-buddy + voygent:

**Cleanup Tasks** (configurable thresholds):
| Task | Default TTL | Description |
|------|-------------|-------------|
| Support tickets | 90 days | Delete resolved/closed tickets |
| Admin threads | 90 days | Delete closed message threads |
| Error logs | 7 days | Delete old error entries |
| Telemetry | 7 days | Delete old tool call records |
| Activity logs | 7 days | Delete old activity entries |
| Daily quotas | 1 day | Delete expired rate limit counters |
| Pending users | 7 days | Delete unverified signups |
| Inactive users | 365 days | Delete users with no activity |

**Index Maintenance:**
- `validateRecordIndexes()` - Repair orphaned index entries
- `validateCommentIndexes()` - Repair comment tracking
- `updateGlobalStats()` - Aggregate stats for admin dashboard
- `buildDashboardCache()` - Pre-compute expensive queries

**Features:**
- Parallel execution where possible
- CPU budget limits (process N items per run)
- Cleanup history logging
- Admin visibility into last run results

**Cron Configuration:**
```toml
# wrangler.toml
[triggers]
crons = [
  "*/15 * * * *",  # Every 15 min: light maintenance
  "0 4 * * *",     # Daily 4 AM: extended cleanup
]
```

---

## Core Tools (Included in Framework)

These tools come pre-built and work for any specialized assistant:

| Tool | Purpose | Derived From |
|------|---------|--------------|
| `get_context` | Startup: system prompt + profile + notifications | All projects |
| `get_prompt` | Load dynamic prompts with knowledge base filtering | AAM |
| `get_record` | Read a document by ID | `read_trip` |
| `list_records` | List documents with optional summaries | `list_trips` |
| `save_record` | Create/update a document | `save_trip` |
| `patch_record` | Surgical update with dot-notation paths | `patch_trip` |
| `delete_record` | Soft-delete with undo capability | `delete_trip` |
| `submit_support` | Create support ticket with PII redaction | All projects |
| `log_support_intent` | Telemetry for resolved-in-chat issues | All projects |
| `reply_to_admin` | User replies to admin threads | All projects |
| `dismiss_admin_message` | Mark broadcasts/threads as read | All projects |
| `propose_solution` | AI proposes knowledge base entries | AAM + Voygent |
| `set_preference` | Store user preferences | Roadtrip |
| `get_preferences` | Load preferences for personalization | Roadtrip |
| `set_debug_mode` | Enable tiered debug logging | Roadtrip |

**Domain-specific tools** (users create these):
- Search/browse with domain-specific filters
- Matching algorithms
- Publishing/export tools
- Any specialized operations

---

## Extension Points

### Adding a Tool

1. Create handler in `tools/my-tool.ts`
2. Define schema in `tool-defs/my-tools.ts`
3. Register in `tools/index.ts`

Template available: `templates/tool.ts.template`

### Adding a Data Model

1. Define types in `models/my-model.ts`
2. Add KV helpers if needed
3. Export from `models/index.ts`

### Adding an Admin Tab

1. Create tab in `admin-tabs/my-tab.ts`
2. Import and add to `admin-tabs/index.ts`

Template available: `templates/admin-tab.ts.template`

### Adding an Integration

1. Create adapter in `integrations/google-places.ts`
2. Add env vars to `wrangler.toml`
3. Document in `docs/integrations.md`

---

## Configuration (`starter.config.ts`)

```typescript
export const config = {
  app: {
    name: 'my-app',
    description: 'My MCP-powered assistant',
  },

  mcp: {
    protocolVersion: '2024-11-05',
    serverName: 'my-app-mcp',
  },

  auth: {
    allowedOrigins: ['https://claude.ai', 'https://chatgpt.com'],
    adminKeyEnvVar: 'ADMIN_KEY',
  },

  kv: {
    profiles: 'PROFILES',
    data: 'DATA',
  },

  admin: {
    path: '/admin',
    defaultTheme: 'dark',
  },

  telemetry: {
    enabled: true,
    realtimeBufferSize: 100,
  },

  // Optional: location-based apps
  geo: {
    enabled: false,
    precision: 6,
  },
};
```

---

## Onboarding Flow

### Option A: Claude Code Interview (`/onboard`)

Claude Code asks:
1. "What is your app called?"
2. "Describe what it does in one sentence"
3. "What's your main data entity?" (Activity, Product, Task, etc.)
4. "Will it be location-based?"
5. "Any external integrations needed?" (Google Places, Stripe, etc.)

Then generates:
- `starter.config.ts`
- Initial data model
- Placeholder tools
- System prompt draft

### Option B: Template Selection

Pre-built templates for common use cases:
- `template-location`: Location-based matching (like AAM)
- `template-content`: Content management (like Voygent)
- `template-tracking`: State/journey tracking (like Roadtrip)
- `template-minimal`: Bare bones MCP server

---

## Deployment Strategy

### Environments

| Env | Domain | Purpose |
|-----|--------|---------|
| staging | `app-staging.workers.dev` | Testing |
| production | `app.yourdomain.com` | Live |

### Setup Commands

```bash
# Clone and install
npx create-mcp-starter my-app
cd my-app && npm install

# Create KV namespaces
npm run setup:staging
npm run setup:production

# Set secrets
wrangler secret put ADMIN_KEY --env staging
wrangler secret put AUTH_KEYS --env staging

# Deploy
npm run deploy:staging
npm run deploy:production
```

---

## Implementation Phases

### Phase 1: New Repo Setup
- [ ] Create `/home/neil/dev/scaffold/` directory
- [ ] Initialize npm workspace with `worker/` subdirectory
- [ ] Set up TypeScript config
- [ ] Create `wrangler.toml` template
- [ ] Add `CLAUDE.md` with framework instructions
- [ ] Create memory-bank structure

### Phase 2: Extract Core Modules (from AAM + Voygent + Roadtrip)

**MCP Infrastructure:**
- [ ] `core/mcp/server.ts` - JSON-RPC handler from `worker.ts`
- [ ] `core/mcp/lifecycle.ts` - Initialize handlers
- [ ] `core/mcp/helpers.ts` - createResult, createToolError

**Auth:**
- [ ] `core/auth/validate.ts` - Multi-layer auth from `worker.ts`
- [ ] `core/auth/key-prefix.ts` - Collision-resistant encoding from `kv.ts`

**KV Utilities:**
- [ ] `core/kv/client.ts` - Generic KV helpers (list, batch, TTL)
- [ ] `core/kv/patch.ts` - Dot-notation patch operations (Voygent)
- [ ] `core/kv/summaries.ts` - Summary caching (Voygent)
- [ ] `core/kv/soft-delete.ts` - Pending deletions with TTL (Voygent)
- [ ] `core/kv/activity-log.ts` - Recent changes tracking (Voygent)

**Telemetry & Errors:**
- [ ] `core/telemetry/metrics.ts` - Tool call recording
- [ ] `core/telemetry/wrapper.ts` - withMetrics HOF
- [ ] `core/errors/log.ts` - Error classification and logging

**Support Pipeline:**
- [ ] `core/support/tickets.ts` - Ticket creation and management
- [ ] `core/support/pii-redaction.ts` - PII patterns (all projects)
- [ ] `core/support/messaging.ts` - Admin broadcasts and threads

**Knowledge Base:**
- [ ] `core/knowledge/proposals.ts` - Solution proposals
- [ ] `core/knowledge/keywords.ts` - Keyword extraction

**Preferences:**
- [ ] `core/preferences/store.ts` - Explicit + learned preferences

**Debug:**
- [ ] `core/debug/mode.ts` - Debug mode with tiered levels

**Scheduled Maintenance:**
- [ ] `core/scheduled/cleanup.ts` - Age-based cleanup tasks
- [ ] `core/scheduled/index-repair.ts` - Index validation & repair
- [ ] `core/scheduled/stats.ts` - Global stats aggregation
- [ ] `core/scheduled/runner.ts` - Cron job orchestration

### Phase 3: Modular Admin Dashboard
- [ ] `core/admin/types.ts` - AdminTab interface
- [ ] `core/admin/shell.ts` - Common CSS/JS (~500 lines)
- [ ] `core/admin/dashboard.ts` - Assembly function
- [ ] `core/admin/router.ts` - Route handler
- [ ] `core/admin/tabs/overview.ts` - Stats tab (~150 lines)
- [ ] `core/admin/tabs/metrics.ts` - Telemetry tab (~200 lines)
- [ ] `core/admin/tabs/errors.ts` - Error log tab (~150 lines)
- [ ] `core/admin/tabs/users.ts` - User management tab (~200 lines)

### Phase 4: Templates & Scaffolding
- [ ] `templates/tool.ts.template` - Tool handler template
- [ ] `templates/tool-def.ts.template` - Tool schema template
- [ ] `templates/admin-tab.ts.template` - Custom tab template
- [ ] `templates/model.ts.template` - Data model template
- [ ] `.claude/commands/add-tool.md` - Scaffold tool
- [ ] `.claude/commands/add-admin-tab.md` - Scaffold tab

### Phase 5: Onboarding System
- [ ] `.claude/commands/onboard.md` - Interview wizard
- [ ] `scripts/setup-staging.sh` - Create KV namespaces
- [ ] `scripts/setup-production.sh` - Production setup
- [ ] App type templates:
  - [ ] `templates/app-minimal/` - Bare bones
  - [ ] `templates/app-location/` - Location-based (like AAM)
  - [ ] `templates/app-content/` - Content management (like Voygent)

### Phase 6: Documentation
- [ ] `docs/getting-started.md` - Quick start guide
- [ ] `docs/adding-tools.md` - Tool development guide
- [ ] `docs/admin-dashboard.md` - Tab customization guide
- [ ] `docs/deployment.md` - Staging/production setup
- [ ] `docs/architecture.md` - How it works
- [ ] `README.md` - Project overview

### Phase 7: Example App & Testing
- [ ] Create minimal example app (todo-assistant or similar)
- [ ] Unit tests for core modules
- [ ] Integration tests for MCP protocol
- [ ] E2E test for admin dashboard

### Phase 8: Cross-LLM & Refinement
- [ ] Test with ChatGPT plugins
- [ ] Document differences
- [ ] Add compatibility shims if needed
- [ ] Back-port improvements to AAM/voygent/roadtrip

---

## Monetization Considerations

### Option 1: Open Source + Consulting
- Framework is free/open source
- Revenue from consulting/customization
- Build reputation in niche

### Option 2: Hosted Service
- Provide managed hosting
- $X/month per app
- Handle deployment, monitoring, updates

### Option 3: Revenue Share
- Free for DIY developers
- Revenue share for apps that monetize
- Provide billing integration (Stripe)

### Option 4: Premium Features
- Core framework free
- Premium: advanced admin features, analytics, support
- Enterprise: custom domains, SLAs

---

## Files to Modify/Create

### From AAM (extract to core/):
- `worker/src/worker.ts` - Entry point pattern
- `worker/src/lib/kv.ts` - KV helpers
- `worker/src/lib/telemetry.ts` - Metrics
- `worker/src/lib/error-log.ts` - Error tracking
- `worker/src/mcp/lifecycle.ts` - MCP lifecycle
- `worker/src/mcp/helpers.ts` - Response helpers
- `worker/src/routes/admin.ts` - Admin API pattern
- `worker/src/admin-dashboard.ts` - Extract common CSS/JS

### New files to create:
- `starter.config.ts` - Configuration schema
- `core/admin/types.ts` - AdminTab interface
- `core/admin/shell.ts` - Dashboard shell
- `core/admin/tabs/overview.ts` - Core tab
- `core/admin/tabs/metrics.ts` - Core tab
- `core/admin/tabs/errors.ts` - Core tab
- `core/admin/tabs/users.ts` - Core tab
- `templates/tool.ts.template`
- `templates/admin-tab.ts.template`
- `.claude/commands/onboard.md`
- `.claude/commands/add-tool.md`
- `docs/getting-started.md`

---

## Verification Plan

1. **Unit test core modules**: Auth, KV helpers, telemetry
2. **Integration test MCP protocol**: Initialize, tools/list, tools/call
3. **E2E test admin dashboard**: Login, view tabs, API calls
4. **Template test**: Generate tool, verify it compiles and registers
5. **Deployment test**: Deploy to staging, verify MCP works with Claude Desktop

---

## First Implementation Session Goals

When we start implementing, the first session will focus on:

1. **Create the new repo** at `/home/neil/dev/scaffold/`
2. **Set up project structure** (worker/, scripts/, templates/, docs/)
3. **Extract core MCP modules** from AAM
4. **Extract core auth modules** from AAM
5. **Get a minimal MCP server working** with one placeholder tool

This gives us a deployable foundation to build on.

---

## Source Files Reference

Key files to extract from for each module:

### MCP Infrastructure
| Module | Source | Lines |
|--------|--------|-------|
| MCP Server | AAM `worker/src/worker.ts` | ~150 |
| MCP Lifecycle | AAM `worker/src/mcp/lifecycle.ts` | ~50 |
| MCP Helpers | AAM `worker/src/mcp/helpers.ts` | ~100 |

### Auth
| Module | Source | Lines |
|--------|--------|-------|
| Auth Validation | AAM `worker/src/worker.ts` | ~80 |
| Key Prefix | AAM `worker/src/lib/kv.ts` | ~50 |

### KV Utilities
| Module | Source | Lines |
|--------|--------|-------|
| KV Helpers | AAM `worker/src/lib/kv.ts` | ~200 |
| Patch Operations | Voygent `src/mcp/tools/trips.ts` (390-530) | ~140 |
| Summary Caching | Voygent `src/lib/trip-summary.ts` | ~200 |
| Soft Delete | Voygent `src/lib/kv/index.ts` | ~100 |
| Activity Log | Voygent `src/mcp/tools/trips.ts` (318-360) | ~50 |

### Telemetry & Errors
| Module | Source | Lines |
|--------|--------|-------|
| Telemetry | AAM `worker/src/lib/telemetry.ts` | ~250 |
| Error Log | AAM `worker/src/lib/error-log.ts` | ~150 |

### Support Pipeline
| Module | Source | Lines |
|--------|--------|-------|
| Support Tickets | AAM `worker/src/tools/support.ts` | ~300 |
| PII Redaction | All projects `support.ts` (identical) | ~50 |
| Admin Messaging | Voygent `src/mcp/tools/support.ts` | ~200 |

### Knowledge Base
| Module | Source | Lines |
|--------|--------|-------|
| Proposals | AAM `worker/src/tools/knowledge.ts` | ~150 |
| Keyword Extraction | AAM `worker/src/tools/knowledge.ts` | ~50 |

### Preferences
| Module | Source | Lines |
|--------|--------|-------|
| Preferences Store | Roadtrip `src/tools/preferences.ts` | ~200 |

### Debug
| Module | Source | Lines |
|--------|--------|-------|
| Debug Mode | Roadtrip `src/tools/debug.ts` | ~150 |

### Admin Dashboard
| Module | Source | Lines |
|--------|--------|-------|
| Admin Routes | AAM `worker/src/routes/admin.ts` | ~400 |
| Admin Dashboard | AAM `worker/src/admin-dashboard.ts` | ~2200 (modularize) |

### Scheduled Maintenance
| Module | Source | Lines |
|--------|--------|-------|
| Cleanup Tasks | Roadtrip `src/scheduled/cleanup.ts` | ~380 |
| Maintenance Runner | Voygent `src/lib/maintenance.ts` | ~480 |
| Index Validation | Voygent `src/lib/maintenance.ts` | ~150 |
| Stats Aggregation | Voygent `src/lib/indexes.ts` | ~200 |
