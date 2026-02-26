# Scaffold App Catalog

The catalog is a discoverable directory of all scaffold MCP tool apps. It has three components sharing one data source:

1. **catalog.json** — canonical data at `docs/catalog/catalog.json`
2. **Static site** — browsable HTML at `docs/catalog/index.html` (GitHub Pages)
3. **MCP discovery server** — `examples/catalog-server/`, lets Claude search and install apps

## Browsing the Catalog

### Static Site

Open `docs/catalog/index.html` in a browser. Features:
- Search by name, description, tags, or tool names
- Filter by category (productivity, entertainment, lifestyle, utilities)
- Click an app card for full details
- "Copy MCP Config" button on each detail page — paste directly into Claude Desktop config

### MCP Discovery Server

Connect Claude to the catalog server and ask naturally:

```
"What scaffold apps are available?"
"Find me something for cooking"
"How do I install the watch recommender?"
```

**Tools:**

| Tool | Description |
|------|-------------|
| `catalog-list` | List all apps, optional category/status filter |
| `catalog-search` | Keyword search across names, descriptions, tags, tool names |
| `catalog-get` | Full details + ready-to-paste install config for one app |
| `catalog-stats` | Total apps, average quality scores, breakdown by category |

## Adding Apps to the Catalog

### Automatic (Factory Pipeline)

When the factory completes a cycle and publishes an app, `store.publishToCatalog()` writes the entry directly to `docs/catalog/catalog.json` in the scaffold repo. The GitHub Actions workflow then:

1. Regenerates the static site
2. Commits the updated HTML
3. Pushes catalog data to the discovery server's KV store

### Manual

Edit `docs/catalog/catalog.json` directly. Each app entry follows the `AppEntry` schema:

```json
{
  "name": "my-app",
  "displayName": "My App",
  "icon": "🔧",
  "version": "0.0.1",
  "category": "utilities",
  "tags": ["tag1", "tag2"],
  "description": "One-sentence description.",
  "cycleId": "manual-seed",
  "builtAt": "2026-02-26T00:00:00Z",
  "sourceUrl": "https://github.com/neilopet/scaffold/tree/master/examples/my-app",
  "tools": [
    { "name": "my-tool", "description": "What it does" }
  ],
  "quality": {
    "judgeScore": null,
    "judgeVerdict": null,
    "personaPassRate": null,
    "buildIterations": 1,
    "guardianPassed": null,
    "testCount": 0
  },
  "install": {
    "workerUrl": "https://scaffold-my-app.neilopet.workers.dev",
    "requiresAuth": true,
    "mcpConfig": {
      "mcpServers": {
        "my-app": {
          "url": "https://scaffold-my-app.neilopet.workers.dev/sse?token=YOUR_TOKEN"
        }
      }
    }
  },
  "status": "beta"
}
```

After editing, regenerate the static site:

```bash
npx tsx tools/catalog-site/generate.ts
```

Or just push the JSON change — GitHub Actions handles the rest.

## Deploying the Discovery Server

```bash
cd examples/catalog-server

# Local dev
npm start

# Deploy to Cloudflare
wrangler deploy
wrangler secret put ADMIN_KEY
```

KV data is populated by the GitHub Actions workflow, or manually:

```bash
wrangler kv key put --namespace-id=YOUR_NS_ID "catalog/apps" "$(cat docs/catalog/catalog.json | jq '.apps')"
```

## GitHub Actions Workflow

`.github/workflows/catalog.yml` triggers when `docs/catalog/catalog.json` changes on push.

**Loop prevention:**
- Skips runs triggered by `github-actions[bot]` commits
- Concurrency group prevents parallel runs
- Only commits when generated HTML actually changed
- Trigger scoped to `catalog.json` only, not all of `docs/catalog/`

**Required secrets** (for KV sync, optional):
- `CF_API_TOKEN` — Cloudflare API token
- `CATALOG_KV_ID` — KV namespace ID for catalog-server

If the secrets aren't configured, the workflow still generates and commits the static site — it just skips the KV sync step.

## Static Site Generator

`tools/catalog-site/generate.ts` reads `catalog.json` and outputs:

```
docs/catalog/
├── index.html                    # Homepage with search + filter
├── catalog.json                  # Source data (not generated)
└── apps/
    ├── notes-app/index.html
    ├── watch-recommender/index.html
    └── ...
```

All dynamic content is sanitized with `escapeHtml()` before template insertion. This is important because app names, descriptions, and tool info originate from LLM-generated content in the factory pipeline.
