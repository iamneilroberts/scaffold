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

```bash
cd examples/travel-planner
npx wrangler dev
```

This starts a local server at `http://localhost:8787`. The `ADMIN_KEY` is set to `change-me-in-production` in `wrangler.toml`.

## Deploy to Cloudflare

1. Create a KV namespace: `npx wrangler kv:namespace create DATA`
2. Update the `id` and `preview_id` in `wrangler.toml`
3. Set a real admin key: `npx wrangler secret put ADMIN_KEY`
4. Deploy: `npx wrangler deploy`
