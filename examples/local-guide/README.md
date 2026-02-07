# Local Guide

An MCP server for discovering nearby places. Demonstrates shared data (places visible to all users), per-user data (favorites), and geohash-based proximity search.

## Tools

| Tool | Description |
|------|-------------|
| `guide:search_nearby` | Search for places near a lat/lng, optionally filtered by category |
| `guide:get_details` | Get full details for a place by ID |
| `guide:save_favorite` | Save a place to your personal favorites |
| `guide:list_favorites` | List your saved favorite places |

## Storage pattern

This example uses two key patterns:

- **Shared data:** Places are stored in geohash buckets at `places/geo/{geohash}` and indexed by ID at `places/id/{placeId}`. These are shared across all users.
- **Per-user data:** Favorites are stored at `{userId}/favorites/{placeId}`, so each user has their own list.

Nearby search works by computing the geohash for the query coordinates, then scanning the target bucket and its 8 neighbors. This gives approximate proximity without requiring a full spatial index.

## Run tests

From the repo root (after `npm install && npm run build`):

```bash
cd examples/local-guide
npm test
```

## Run locally

No Cloudflare account needed — `wrangler dev` uses local storage automatically.

```bash
cd examples/local-guide
npx wrangler dev
```

This starts a local server at `http://localhost:8787`. KV data is persisted locally in `.wrangler/state/`. The `ADMIN_KEY` is set to `change-me-in-production` in `wrangler.toml`.

## Deploy to Cloudflare

1. Create a KV namespace: `npx wrangler kv:namespace create DATA`
2. Update the `id` and `preview_id` in `wrangler.toml`
3. Set a real admin key: `npx wrangler secret put ADMIN_KEY`
4. Deploy: `npx wrangler deploy`
