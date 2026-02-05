# Architecture

This document describes Scaffold's internal architecture and how the components work together.

## Overview

Scaffold is designed as a layered architecture for building MCP servers on Cloudflare Workers:

```
┌─────────────────────────────────────────────────────────────┐
│                    HTTP Request (fetch)                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     ScaffoldServer                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ CORS Handler│  │ Route Match │  │ User Routes         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
┌───────────────────┐ ┌───────────────┐ ┌───────────────────┐
│   AdminHandler    │ │  MCPHandler   │ │   Fallback/404    │
│  (Server-rendered │ │  (JSON-RPC)   │ │                   │
│   HTML dashboard) │ │               │ │                   │
└───────────────────┘ └───────────────┘ └───────────────────┘
            │                 │
            ▼                 ▼
┌─────────────────────────────────────────────────────────────┐
│                     Auth Validator                           │
│  ┌───────────┐  ┌───────────┐  ┌──────────┐  ┌───────────┐  │
│  │ ENV Admin │  │ Allowlist │  │ KV Index │  │  Fallback │  │
│  │   Key     │  │           │  │          │  │   Scan    │  │
│  └───────────┘  └───────────┘  └──────────┘  └───────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Storage Adapter                           │
│         ┌──────────────┐        ┌──────────────────┐        │
│         │ InMemoryAdapter│      │CloudflareKVAdapter│       │
│         │  (Testing)    │       │  (Production)     │        │
│         └──────────────┘        └──────────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### ScaffoldServer

The main entry point (`packages/core/src/server/scaffold-server.ts`).

**Responsibilities:**
- Route HTTP requests to appropriate handlers
- Manage CORS preflight requests
- Provide fluent API for route registration
- Hold references to all registered tools, resources, prompts
- Initialize and manage plugins

**Request Flow:**

```
1. CORS Preflight  → Return 204 with CORS headers
2. /health         → Return health JSON
3. User Routes     → Check registered routes in order
4. Admin Path      → Delegate to AdminHandler
5. POST + JSON     → Delegate to MCPHandler
6. Fallback        → User fallback or 404
```

### MCPHandler

Handles MCP protocol requests (`packages/core/src/mcp/handler.ts`).

**Responsibilities:**
- Parse and validate JSON-RPC 2.0 requests
- Route to method-specific handlers
- Build ToolContext for tool execution
- Return JSON-RPC responses

**Supported Methods:**

| Method | Handler | Description |
|--------|---------|-------------|
| `initialize` | `lifecycle.ts` | MCP handshake |
| `initialized` | `lifecycle.ts` | Acknowledge init |
| `tools/list` | `tools.ts` | List available tools |
| `tools/call` | `tools.ts` | Execute a tool |
| `resources/list` | `resources.ts` | List resources |
| `resources/read` | `resources.ts` | Read a resource |
| `prompts/list` | `prompts.ts` | List prompts |
| `prompts/get` | `prompts.ts` | Get prompt messages |
| `logging/setLevel` | `handler.ts` | Set log level |

### AdminHandler

Handles admin dashboard requests (`packages/core/src/admin/handler.ts`).

**Responsibilities:**
- Authenticate admin users
- Render server-side HTML
- Manage tab navigation
- Apply security headers

**Request Flow:**

```
1. POST /admin/auth  → Validate key, set cookie
2. No auth cookie    → Show login page
3. Valid admin       → Render dashboard with active tab
4. Invalid/non-admin → Clear cookie, show login
```

### Auth Validator

Multi-layer authentication (`packages/core/src/auth/validator.ts`).

**Validation Layers (checked in order):**

1. **ENV Admin Key** - Constant-time comparison against `config.auth.adminKey`
2. **ENV Allowlist** - Check against `config.auth.validKeys` array
3. **KV Index** - O(1) lookup in `_auth-index/{hash}` keys
4. **Fallback Scan** - Rate-limited scan of user records

**Supporting Components:**

- `key-hash.ts` - SHA-256 and DJB2 hashing
- `rate-limiter.ts` - Sliding window rate limiting
- `index-builder.ts` - Build/lookup auth index in KV

### Storage Adapters

Pluggable storage backends (`packages/core/src/storage/`).

**Interface:**

```typescript
interface StorageAdapter {
  get<T>(key: string): Promise<T | null>;
  put<T>(key: string, value: T, options?): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string, options?): Promise<StorageListResult>;
  getWithVersion<T>(key: string): Promise<StorageVersionedValue<T> | null>;
  putIfMatch<T>(key, value, version, options?): Promise<boolean>;
}
```

**Implementations:**

- `InMemoryAdapter` - Map-based, for testing
- `CloudflareKVAdapter` - Cloudflare KV, for production

## Data Flow

### Tool Execution

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│ JSON-RPC    │      │ MCPHandler  │      │ Auth        │
│ tools/call  │─────▶│ route()     │─────▶│ validateKey │
└─────────────┘      └─────────────┘      └─────────────┘
                                                 │
                                                 ▼
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│ Tool        │◀─────│ ToolContext │◀─────│ Build       │
│ handler()   │      │ created     │      │ Context     │
└─────────────┘      └─────────────┘      └─────────────┘
       │
       ▼
┌─────────────┐      ┌─────────────┐
│ ToolResult  │─────▶│ JSON-RPC    │
│             │      │ Response    │
└─────────────┘      └─────────────┘
```

### Admin Tab Rendering

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│ GET /admin  │─────▶│AdminHandler │─────▶│ extractAuth │
│ ?tab=users  │      │ handle()    │      │ Key()       │
└─────────────┘      └─────────────┘      └─────────────┘
                                                 │
                                                 ▼
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│ HTML        │◀─────│ dashboard   │◀─────│ tab.render  │
│ Response    │      │ Layout()    │      │ (ctx)       │
└─────────────┘      └─────────────┘      └─────────────┘
```

## Module Structure

```
packages/core/src/
├── index.ts              # Public exports
├── version.ts            # Version constant
│
├── types/
│   └── public-api.ts     # All public type definitions
│
├── server/
│   ├── index.ts          # Server exports
│   └── scaffold-server.ts # Main server class
│
├── mcp/
│   ├── index.ts          # MCP exports
│   ├── handler.ts        # Main MCP handler
│   ├── types.ts          # JSON-RPC types
│   ├── errors.ts         # JSON-RPC error responses
│   ├── lifecycle.ts      # initialize/initialized handlers
│   ├── tools.ts          # tools/list, tools/call handlers
│   ├── resources.ts      # resources/list, resources/read handlers
│   └── prompts.ts        # prompts/list, prompts/get handlers
│
├── auth/
│   ├── index.ts          # Auth exports
│   ├── validator.ts      # Multi-layer validation
│   ├── key-hash.ts       # Hashing utilities
│   ├── rate-limiter.ts   # Rate limiting
│   └── index-builder.ts  # Auth index management
│
├── storage/
│   ├── index.ts          # Storage exports
│   ├── adapter.ts        # Base adapter class
│   ├── in-memory.ts      # In-memory implementation
│   └── cloudflare-kv.ts  # Cloudflare KV implementation
│
├── admin/
│   ├── index.ts          # Admin exports
│   ├── handler.ts        # Admin request handler
│   ├── security.ts       # CSP, escaping, headers
│   ├── templates.ts      # HTML templates
│   └── tabs/
│       ├── index.ts      # Tab exports
│       ├── overview.ts   # Overview tab
│       ├── users.ts      # Users tab
│       └── tools.ts      # Tools tab
│
├── tools/
│   ├── index.ts          # Tools exports
│   └── core-tools.ts     # Built-in tools
│
└── utils/
    ├── index.ts          # Utils exports
    ├── auth.ts           # Auth utilities
    ├── storage.ts        # Storage utilities (atomicUpdate, batch)
    ├── errors.ts         # Error utilities
    └── validation.ts     # Validation utilities
```

## Security Architecture

### Defense in Depth

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Transport Security (HTTPS via Cloudflare)          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: CORS (configurable origins)                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Authentication (multi-layer key validation)        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 4: Authorization (admin vs user roles)                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 5: Input Validation (JSON Schema per tool)            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 6: Output Sanitization (HTML escape, error scrubbing) │
└─────────────────────────────────────────────────────────────┘
```

### Admin Dashboard Security

```
Request → Cookie/Header Auth → Validate Admin Key → Render
                                      │
                                      ▼
                              ┌───────────────┐
                              │ Security      │
                              │ Headers:      │
                              │ - CSP         │
                              │ - X-Frame     │
                              │ - X-XSS       │
                              │ - Referrer    │
                              └───────────────┘
```

## Concurrency Model

### Cloudflare Workers Execution

- Each request runs in an isolate
- No shared state between requests (stateless)
- State stored in KV (eventually consistent)

### Optimistic Locking

```
Read with version → Modify → Write if version matches
        ↓                           ↓
   version: "3"              putIfMatch("3")
                                    ↓
                        ┌──────────────────────┐
                        │ Match?               │
                        │ Yes → Write, return  │
                        │ No  → Retry/fail     │
                        └──────────────────────┘
```

### Rate Limiting

```
┌─────────────────────────────────────────────────────────────┐
│ RateLimiter (per-isolate, in-memory)                        │
│                                                             │
│  Key: "auth-scan:a1b2c3"                                    │
│  Window: 60 seconds                                         │
│  Count: 3 / 5 max                                           │
│  Reset: 45s remaining                                       │
│                                                             │
│  Note: Not distributed - each isolate has own limits        │
│  For distributed: use KV or Durable Objects                 │
└─────────────────────────────────────────────────────────────┘
```

## Plugin System

### Plugin Lifecycle

```
┌─────────────┐
│ Register    │ ScaffoldServer constructor
│ plugins     │ (sync - store reference)
└─────────────┘
       │
       ▼
┌─────────────┐
│ initPlugins │ First request or explicit call
│ ()          │ (async - call onRegister)
└─────────────┘
       │
       ▼
┌─────────────┐
│ Per-request │ Each request (if onInitialize defined)
│ init        │
└─────────────┘
       │
       ▼
┌─────────────┐
│ Shutdown    │ Server shutdown (if onShutdown defined)
│             │ (rarely used in Workers)
└─────────────┘
```

### Plugin Registration

```typescript
// Plugin provides
{
  tools: [...]       → server.registerTool()
  resources: [...]   → server.registerResource()
  prompts: [...]     → server.registerPrompt()
  routes: {...}      → server.routes()
  adminTabs: [...]   → server.registerAdminTab()
}
```

## Performance Considerations

### Cloudflare Workers Limits

| Resource | Limit | Scaffold Handling |
|----------|-------|-------------------|
| CPU time | 10-50ms | Async I/O doesn't count |
| Memory | 128 MB | Monitor via telemetry |
| Request size | 100 MB | Validate before processing |
| KV value | 25 MB | Auto-chunk (future) |

### Optimization Strategies

1. **Lazy initialization** - Plugins init on first request
2. **Parallel I/O** - `Promise.all` for independent operations
3. **Minimal allocations** - Reuse Maps, avoid copies
4. **Early returns** - Fail fast on validation errors
