# Deploy Watch Recommender

## Prerequisites

- Cloudflare account with Workers enabled
- `CLOUDFLARE_API_TOKEN` — create at https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
- Secrets already configured via `wrangler secret put`:
  - `ADMIN_KEY`
  - `TMDB_API_KEY`

## Deploy

```bash
cd examples/watch-recommender
export CLOUDFLARE_API_TOKEN=<your-token>
npx wrangler deploy
```

## Verify

After deploy, confirm the worker is live:

```bash
curl https://scaffold-watch-rec.somotravel.workers.dev/health
```

Expected: `{"status":"ok","version":"...","timestamp":"..."}`
