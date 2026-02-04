# Architecture Brainstorm Summary

**Date**: 2025-02-04
**Status**: Decisions made, incorporated into REVISED-PLAN.md

---

## Topics Covered

### 1. Storage Abstraction

**Context**: Storage patterns differ by project type. Analyzed patterns across three existing projects (travel assistant, roadtrip buddy, AAM).

**Decisions**:
- 4 templates based on data ownership: generic, user-owned, shared-location, shared-entity
- `/storage-health` skill for analyzing patterns and suggesting migrations
- Telemetry default ON to power runtime analysis
- Start with generic template, migrate when needed

### 2. Route Composition

**Context**: Each project has custom HTTP handlers beyond MCP protocol.

**Decisions**:
- Built-in route composition pattern (handlers return `Response | null`)
- Default chain: CORS → health → user routes → admin → MCP → fallback
- Fluent API: `server.route(method, path, handler)`
- Plugins can contribute routes via `RouteGroup`

### 3. Error Handling

**Decisions**:
- Structured errors with codes (VALIDATION_ERROR, NOT_FOUND, RATE_LIMIT, etc.)
- Auto-log all errors to telemetry
- Sanitized details for LLM (remove stack traces, secrets; keep field names, IDs)
- `retryable` flag for LLM guidance

### 4. Local Development

**Decisions**:
- Miniflare local KV (persists between restarts)
- `InMemoryAdapter` for unit tests
- `scaffold call <tool>` CLI for testing without Claude Desktop
- Optional seed scripts in templates

### 5. Secrets/Config Management

**Decisions**:
- `.dev.vars` for local secrets (gitignored)
- `wrangler secret` for production
- `scaffold secrets` CLI helper
- Clear separation: config.ts (safe) vs env vars (secrets)

### 6. MCP Protocol

**Decisions**:
- Add: resources/list, resources/read, prompts/list, prompts/get, logging/setLevel
- Skip streaming for MVP
- Support both Authorization header and _meta.authKey

### 7. Multi-Tenant

**Decisions**:
- Document pattern only, no built-in support
- Users can implement tenant isolation using existing primitives

### 8. Cloudflare Limits

**Decisions**:
- Auto-chunk values >25MB (configurable, can disable)
- Validate key length before write (512 byte limit)
- Built-in cursor pagination for list operations
- Log warnings for slow tools (>5s)

### 9. Example Apps

**Decisions**:
- 4 example apps, one per template:
  - todo-assistant (generic)
  - trip-planner (user-owned)
  - local-discovery (shared-location)
  - knowledge-base (shared-entity)

### 10. Version Upgrades

**Decisions**:
- Warn only on version mismatch (no blocking)
- Store version in `_scaffold/version` KV key
- `scaffold migrate` CLI for migrations
- Deprecation warnings in minor, removal in major

---

## Next Steps

1. Begin Phase 1 implementation
2. Create git worktree for development
3. Follow REVISED-PLAN.md schedule

---

## Files Modified

- `REVISED-PLAN.md` - Updated with all decisions
- `docs/archive/REVISED-PLAN-2025-02-04-pre-brainstorm.md` - Archived previous version
