# Watch Recommender

A personal MCP tool that tracks your movie and TV watch history, learns your taste, and gives you recommendations through natural conversation with Claude. Built on [Scaffold](../../packages/core/) and deployed as a Cloudflare Worker.

## Features

- **Import watch history** — bulk import from Netflix CSV exports
- **Taste profiling** — auto-generates a taste profile from your ratings and history
- **Smart recommendations** — personalized suggestions based on mood, taste, and preferences
- **Streaming lookup** — check where any title is available to stream (by region)
- **Preference management** — set genre preferences and streaming subscriptions
- **Dismiss titles** — mark titles as seen or not interested so they're never recommended
- **Admin UI** — web interface for importing history and managing preferences

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- A [Cloudflare](https://dash.cloudflare.com/) account
- A [TMDB API key](https://www.themoviedb.org/settings/api) (free — used for title search and streaming data)

### Install

```bash
cd examples/watch-recommender
npm install
```

### Create KV Namespace

```bash
npx wrangler kv namespace create DATA
npx wrangler kv namespace create DATA --preview
```

Update the `id` and `preview_id` in `wrangler.toml` with the returned values.

### Set Secrets

Generate a URL-safe auth token:

```bash
openssl rand -hex 20
```

Set the secrets in Cloudflare:

```bash
npx wrangler secret put ADMIN_KEY    # paste your hex token
npx wrangler secret put TMDB_API_KEY # paste your TMDB API key
```

For local development, create a `.dev.vars` file:

```
ADMIN_KEY=your_hex_token
TMDB_API_KEY=your_tmdb_api_key
```

### Local Dev

```bash
npx wrangler dev
```

### Deploy

```bash
npx wrangler deploy
```

## MCP Configuration

Add to your Claude Desktop config (`claude_desktop_config.json`) or Claude Code settings:

```json
{
  "mcpServers": {
    "watch-recommender": {
      "type": "url",
      "url": "https://scaffold-watch-recommender.YOUR_SUBDOMAIN.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_ADMIN_KEY"
      }
    }
  }
}
```

Replace `YOUR_SUBDOMAIN` with your Cloudflare Workers subdomain and `YOUR_ADMIN_KEY` with your hex token.

## Quick Start

1. **Import your history** — Export your Netflix viewing history CSV and upload it via the admin page, or paste the CSV content in a Claude chat
2. **Set preferences** — Tell Claude things like "I love slow-burn thrillers but hate slasher horror"
3. **Set streaming services** — Tell Claude which services you subscribe to (Netflix, Hulu, etc.)
4. **Generate taste profile** — Ask Claude: "Generate my taste profile"
5. **Get recommendations** — Ask Claude: "I'm in the mood for something like Severance"

## Tools Reference

| Tool | Description | Key Inputs |
|------|-------------|------------|
| `watch-import` | Bulk import watch history from CSV | `csv` (string), `source` (default: `"netflix"`) |
| `watch-log` | Log a single title as watched with optional rating | `title`, `rating` (1-5) |
| `watch-dismiss` | Dismiss a title from future recommendations | `title`, `reason` (`"seen"` or `"not-interested"`) |
| `watch-preference` | Manage preference statements and streaming services | `action` (`add`/`remove`/`set-services`/`list`) |
| `watch-profile` | View, generate, or save your taste profile | `action` (`view`/`generate`/`save`) |
| `watch-recommend` | Get personalized recommendations based on mood | `mood` (what you're in the mood for) |
| `watch-lookup` | Look up metadata and streaming availability | `title`, `region` (default: `"US"`) |

For detailed usage and examples, see the [Usage Guide](../../docs/guides/watch-recommender-usage.md).

## Admin Page

Visit `https://your-worker.workers.dev/app?token=YOUR_TOKEN` to access the web UI for importing history, viewing watched titles, and managing preferences.
