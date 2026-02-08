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

## Deploy

```bash
# Create KV namespace
wrangler kv namespace create DATA
# Update wrangler.toml with the namespace ID
npm run deploy
```
