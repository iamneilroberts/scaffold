# Design: Scaffold Admin Dashboard & Multi-User Provisioning

**Date:** 2026-02-24
**Status:** Approved

## Problem

Sharing scaffold apps (like watch-recommender) with friends/family requires them to deploy their own Worker, manage secrets, and configure MCP connectors. The goal is to make it trivially easy: admin creates a user, sends an email, recipient pastes a config block and starts using the app.

## Decisions

- **Per-app admin (not central hub):** Enhance scaffold-core's built-in `/admin` dashboard rather than creating a separate admin service. Every scaffold app gets user management for free. BECAUSE: simpler, no cross-service auth, no new infrastructure.
- **Hard cutoff on usage cap:** When a user hits their monthly TMDB request limit, tools stop working and return instructions to get their own free API key. BECAUSE: actually motivates the switch; soft warnings get ignored.
- **Per-user API keys stored in KV:** Users who bring their own TMDB key paste it into a settings page. It's stored in `{userId}/settings` and used instead of the shared key. BECAUSE: keeps the zero-effort spirit — no need to fork and deploy their own instance.
- **500 requests/month default cap:** Covers heavy personal use (5-10 lookups/session, several sessions/week) while catching runaway situations. TMDB has no hard daily/monthly quota — their limits are ~40-50 req/sec at CDN level — so this is a courtesy guardrail on the shared API key.

## Scope

**In scope:**
- App catalog tab in `/admin` — lists deployed scaffold apps with metadata
- User provisioning — create users with auth tokens, pre-fill KV seed data
- Setup email generation — copy-pasteable email with token, MCP config, instructions
- Per-user usage tracking with configurable hard cap and monthly reset
- Per-user settings (personal API keys)
- User detail view with usage stats

**Out of scope for v1:**
- Self-service signup
- Billing
- Analytics beyond usage counts
- Public-facing app storefront

## Architecture

All changes live in scaffold-core as framework features. Individual apps opt in via config. No new Workers, KV namespaces, secrets, or domains.

### Admin Routes

```
/admin/login          — existing, unchanged
/admin/overview       — existing, unchanged
/admin/apps           — NEW: catalog of scaffold apps
/admin/users          — NEW: user CRUD + token generation
/admin/users/:id      — NEW: user detail, usage stats, settings
/admin/users/:id/email — NEW: generate setup email body
```

## App Catalog

Each scaffold app adds optional metadata to its config:

```ts
{
  name: "WatchRec",
  description: "AI-powered movie & TV recommendations",
  icon: "🎬",
  workerUrl: "https://scaffold-watch-rec.somotravel.workers.dev"
}
```

The `/admin/apps` tab renders a card grid from this config. Read-only — a visual directory of what's deployed. Each card links to user management for that app.

## User Provisioning Flow

### Admin creates a user:

1. Admin clicks "New User" on `/admin/users`
2. Fills in: **name**, **email** (optional, for email body)
3. System generates:
   - Secure random auth token (32-byte hex)
   - userId from SHA-256 hash of token (matches existing auth pattern)
   - Auth index entry: `_auth-index/{hash}` with `{ userId, name, email, createdAt, createdBy: 'admin' }`

### KV data is pre-seeded:

```
{userId}/preferences     → { statements: [], streamingServices: [] }
{userId}/onboarding      → { completedPhases: [], lastRunAt: null }
{userId}/settings        → { tmdbUsageCap: 500, tmdbUsageCount: 0, tmdbUsageResetAt: <first-of-next-month>, personalTmdbKey: null }
```

Seed data is defined per-app via a config hook:

```ts
config.onUserCreate = (userId: string) => [
  { key: `${userId}/preferences`, value: { statements: [], streamingServices: [] } },
  { key: `${userId}/onboarding`, value: { completedPhases: [] } },
  { key: `${userId}/settings`, value: { tmdbUsageCap: 500, tmdbUsageCount: 0, tmdbUsageResetAt: "2026-03-01", personalTmdbKey: null } },
]
```

Each scaffold app defines its own seed data. Core handles auth + KV writes.

### Email generation:

After creation, the admin page shows a "Copy Email" button generating a body with:
- The user's personal auth token
- The app's worker URL
- Claude Desktop MCP config JSON (copy-paste into `claude_desktop_config.json`)
- ChatGPT custom connector instructions
- Link to personal web UI: `{workerUrl}/app?token={token}`

## Usage Tracking & TMDB Cap

### Config:

```ts
config.usage = {
  resource: "tmdb",
  defaultCap: 500,
  resetCycle: "monthly",
  trackedTools: ["watch-log", "watch-dismiss", "watch-lookup", "watch-import", "watch-recommend", "watch-check"]
}
```

### On each tracked tool call:

1. Read `{userId}/settings` from KV
2. If `tmdbUsageCount >= tmdbUsageCap` → return error: *"You've hit your monthly lookup limit. To continue, add your own free TMDB API key — here's how: [instructions + settings link]"*
3. Otherwise increment count and proceed
4. If `now > tmdbUsageResetAt`, reset count to 0 and set next reset date

### Personal API keys:

- User pastes their key into `/app?token=XXX` settings tab or calls a `watch-settings` tool
- Stored in `{userId}/settings.personalTmdbKey`
- TMDB client checks: personal key if set, else shared key
- Personal key = no counting, unlimited usage

### Admin visibility:

`/admin/users/:id` shows: current usage count, cap, reset date, personal key status.

## Data Model

All in the app's existing KV namespace:

```
# Auth (exists in scaffold-core, now used)
_auth-index/{sha256(token)}  → { userId, name, email?, createdAt, createdBy }

# Per-user settings (new)
{userId}/settings            → { tmdbUsageCap, tmdbUsageCount, tmdbUsageResetAt, personalTmdbKey }

# Per-user seed data (existing schema, pre-filled on create)
{userId}/preferences         → { statements: [], streamingServices: [] }
{userId}/onboarding          → { completedPhases: [], lastRunAt: null }
```

Admin user list derived by scanning `_auth-index/*` keys — small set, no performance concern.

## What Changes Where

| Layer | Changes |
|---|---|
| **scaffold-core `/admin`** | Apps tab, user CRUD, email generator, usage middleware |
| **scaffold-core auth** | Enable KV auth index (already implemented, just not used by watch-rec) |
| **watch-rec config** | Add app metadata, `onUserCreate` hook, `usage` config |
| **watch-rec tmdb.ts** | Check per-user API key before falling back to shared key |
| **watch-rec admin-page.ts** | Add "Settings" tab for users to paste their own TMDB key |
| **watch-rec wrangler.toml** | No changes |

## References

- [TMDB Rate Limiting](https://developer.themoviedb.org/docs/rate-limiting) — ~40-50 req/sec per IP, no daily/monthly quota
- [TMDB FAQ](https://developer.themoviedb.org/docs/faq) — free for non-commercial use with attribution
