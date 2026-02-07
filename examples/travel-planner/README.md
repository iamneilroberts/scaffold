# Travel Planner

An MCP server for planning trips with stops. Demonstrates nested entities — trips contain stops, with parent-child relationships managed through key prefixes.

## Tools

| Tool | Description |
|------|-------------|
| `trip:create` | Create a new trip (name, description, dates) |
| `trip:add_stop` | Add a stop to a trip (name, location, notes) |
| `trip:list` | List all trips for the current user |
| `trip:get` | Get full trip details including all stops |
| `trip:delete` | Delete a trip and all its stops |

## Storage pattern

Trips are stored at `{userId}/trips/{tripId}` and stops at `{userId}/trips/{tripId}/stops/{stopId}`. This nesting means listing a trip's stops is a prefix scan on `{userId}/trips/{tripId}/stops/`, and deleting a trip can clean up all child stops by scanning the same prefix.

The `trip:list` tool filters out stop keys from the prefix scan so it only returns top-level trip objects.

## Run tests

From the repo root (after `npm install && npm run build`):

```bash
cd examples/travel-planner
npm test
```

## Run locally

No Cloudflare account needed — `wrangler dev` uses local storage automatically.

```bash
cd examples/travel-planner
npx wrangler dev
```

This starts a local server at `http://localhost:8787`. KV data is persisted locally in `.wrangler/state/`. The `ADMIN_KEY` is set to `change-me-in-production` in `wrangler.toml`.

Test it:

```bash
# Health check
curl http://localhost:8787/health

# List tools (no auth required)
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Create a trip (auth required — use the ADMIN_KEY from wrangler.toml)
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer change-me-in-production" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"trip:create","arguments":{"name":"Italy 2026","description":"Two weeks in Tuscany and the Amalfi Coast"}}}'
```

## Deploy to Cloudflare

1. Create a KV namespace: `npx wrangler kv:namespace create DATA`
2. Update the `id` and `preview_id` in `wrangler.toml`
3. Set a real admin key: `npx wrangler secret put ADMIN_KEY`
4. Deploy: `npx wrangler deploy`
