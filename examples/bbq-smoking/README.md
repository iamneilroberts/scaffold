# BBQ Smoking Expert

A BBQ smoking assistant built on the [Scaffold MCP framework](../../). Tracks cook sessions, logs events (temp checks, wraps, spritzes), saves recipes, and provides pitmaster-level guidance.

## Tools (9 total)

### Cook Sessions
| Tool | Description |
|------|-------------|
| `bbq:start_cook` | Start a new smoke session (meat, weight, temp, wood) |
| `bbq:get_cook` | Get full cook details with timeline of log entries |
| `bbq:list_cooks` | List all your cook sessions |
| `bbq:complete_cook` | Mark a cook done with final notes |

### Cook Logging
| Tool | Description |
|------|-------------|
| `bbq:add_log` | Log events: temp_check, wrap, spritz, add_wood, adjust_vent, rest, note |

### Recipes
| Tool | Description |
|------|-------------|
| `bbq:save_recipe` | Save a recipe with steps, temps, wood, and tips |
| `bbq:get_recipe` | View a saved recipe |
| `bbq:list_recipes` | Browse your saved recipes |

### Knowledge Base
| Tool | Description |
|------|-------------|
| `bbq:smoking_guide` | Look up smoking guidelines by meat type (brisket, pork butt, ribs, chicken, turkey, salmon) |

## Quick Start

```bash
# Install dependencies (from monorepo root)
cd /path/to/scaffold
npm install

# Run tests
cd examples/bbq-smoking
npm test

# Local dev
npm run dev
```

## Example Conversation

> **User:** I'm about to smoke a 14lb brisket for the first time. Help me out!
>
> **Assistant:** *calls bbq:smoking_guide for brisket, then bbq:start_cook*
>
> Let me pull up the brisket guide and start tracking your cook...

## Auth

This example uses **no-auth mode** (`requireAuth: false`), which means anyone can use the tools without providing an API key. This is ideal for:

- Personal tools where you're the only user
- Public demos
- Claude web custom connectors (which don't support custom auth headers)

All unauthenticated users share the `anonymous` userId. If you need per-user data isolation, set `requireAuth: true` and configure auth keys.

## Deploy

```bash
# Create KV namespace
wrangler kv namespace create DATA
# Update wrangler.toml with the namespace ID

# Set admin key (optional — only needed for admin tools)
wrangler secret put ADMIN_KEY

# Deploy
npm run deploy
```

## Connect to Claude Web

Since this example uses no-auth mode, you can connect it directly as a Claude web custom connector:

1. Deploy to Cloudflare Workers
2. In Claude web, go to **Settings → Integrations → Add Custom MCP**
3. Enter your Worker URL (e.g., `https://scaffold-bbq-smoking.your-subdomain.workers.dev`)

No auth configuration needed — it just works.
