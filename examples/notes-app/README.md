# Notes App

A simple note-taking MCP server. Demonstrates per-user CRUD — the most common Scaffold pattern.

## Tools

| Tool | Description |
|------|-------------|
| `notes:save` | Create or update a note (id, title, content) |
| `notes:list` | List all notes for the current user |
| `notes:read` | Read a note by ID |
| `notes:delete` | Delete a note by ID |

## Storage pattern

Each user's notes are stored under `{userId}/notes/{noteId}`. This means users can only see their own notes, and listing is a simple prefix scan.

## Run tests

From the repo root (after `npm install && npm run build`):

```bash
cd examples/notes-app
npm test
```

## Run locally

No Cloudflare account needed — `wrangler dev` uses local storage automatically.

```bash
cd examples/notes-app
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

# Save a note (auth required — use the ADMIN_KEY from wrangler.toml)
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer change-me-in-production" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"notes:save","arguments":{"id":"hello","title":"Hello","content":"My first note"}}}'
```

## Deploy to Cloudflare

1. Create a KV namespace: `npx wrangler kv:namespace create DATA`
2. Update the `id` and `preview_id` in `wrangler.toml`
3. Set a real admin key: `npx wrangler secret put ADMIN_KEY`
4. Deploy: `npx wrangler deploy`
