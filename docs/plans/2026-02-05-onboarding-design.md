# Onboarding Design

**Goal:** Enable new users to clone this repo and get a working Scaffold app deployed in 10 minutes.

## Structure

```
docs/
  getting-started.md        # Rewrite as hub page
  tutorial.md               # New: step-by-step build guide
  prerequisites.md          # New: Cloudflare account setup checklist
examples/
  notes-app/
    src/index.ts            # Complete working app
    wrangler.toml           # Cloudflare config
    package.json
    tsconfig.json
    README.md               # Quick-deploy instructions
```

## User Journeys

1. **"I want to learn"** → getting-started → prerequisites → tutorial → deployed app
2. **"I just want to try it"** → getting-started → examples/notes-app/README → deploy in 2 minutes

---

## Component Details

### 1. getting-started.md (Hub Page)

Short page that routes users to their preferred path:

```markdown
# Getting Started with Scaffold

Scaffold is a security-first MCP framework for Cloudflare Workers.
Pick your path:

## Quick Start (2 minutes)
Deploy a working notes app to Cloudflare and start exploring.
→ [Deploy the notes example](../examples/notes-app/README.md)

## Tutorial (10 minutes)
Build your first Scaffold app from scratch. You'll learn:
- How to define MCP tools
- How storage and auth work
- How to deploy to Cloudflare Workers

→ [Start the tutorial](./tutorial.md)

## Already know the basics?
- [Public API Reference](./public-api.md)
- [Architecture deep-dive](./architecture.md)
- [Plugin development](./plugin-development.md)
```

### 2. prerequisites.md

Checklist format so users can verify setup before starting:

```markdown
# Prerequisites

Before starting the tutorial, make sure you have:

## Required
- [ ] **Node.js 18+** — [Download](https://nodejs.org/)
- [ ] **Cloudflare account** — [Sign up free](https://dash.cloudflare.com/sign-up)
- [ ] **Wrangler CLI** — `npm install -g wrangler`
- [ ] **Logged into Wrangler** — `wrangler login` (opens browser)

## Verify your setup
```bash
node --version    # v18.0.0 or higher
wrangler --version
wrangler whoami   # Shows your Cloudflare email
```

## Optional but recommended
- VS Code with the Cloudflare Workers extension
- An MCP client (Claude Desktop, etc.) for testing tools interactively

---

Ready? → [Start the tutorial](./tutorial.md)
```

### 3. tutorial.md

**Approach:** Copy-paste for boilerplate (tsconfig, wrangler.toml), build-up for Scaffold-specific code.

**Flow:**

1. **Create project** (copy-paste)
   - `mkdir notes-app && cd notes-app && npm init -y`
   - Copy-paste `tsconfig.json` and `package.json` with dependencies

2. **Create wrangler.toml** (copy-paste)
   - Basic Cloudflare Worker config
   - KV namespace binding (explain what KV is in 1 sentence)

3. **Create the server** (build-up)
   - Start with minimal `src/index.ts`: just ScaffoldServer + health check
   - Deploy it: `wrangler deploy`
   - Curl the health endpoint — first "it works!" moment

4. **Add your first tool** (build-up)
   - Add `save_note` tool, explain the anatomy of a tool
   - Redeploy, test with curl

5. **Add remaining tools** (faster pace)
   - Add `list_notes`, `read_note`, `delete_note`
   - Brief explanation of each, user understands the pattern now

6. **Final test** (smoke test)
   - Curl sequence: save → list → read → delete → list
   - "Congratulations, you built an MCP server!"

7. **Next steps**
   - Link to connecting an MCP client
   - Link to docs for auth, plugins, etc.

### 4. examples/notes-app/

**README.md (Quick Deploy):**

```markdown
# Notes App Example

A simple notes app built with Scaffold. Deploy to Cloudflare in 2 minutes.

## Deploy

1. Clone and install:
   ```bash
   git clone https://github.com/iamneilroberts/scaffold.git
   cd scaffold/examples/notes-app
   npm install
   ```

2. Create KV namespace:
   ```bash
   wrangler kv namespace create STORAGE
   ```
   Copy the ID into `wrangler.toml`

3. Deploy:
   ```bash
   wrangler deploy
   ```

4. Test it:
   ```bash
   curl -X POST https://your-app.workers.dev/mcp \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"save_note","arguments":{"title":"hello","content":"world"}},"id":1}'
   ```

## What's in here

- 4 tools: save_note, list_notes, read_note, delete_note
- Cloudflare KV storage
- Ready for MCP clients (Claude Desktop, etc.)

## Want to understand how it works?

→ [Follow the tutorial](../../docs/tutorial.md)
```

**src/index.ts:**

```typescript
import { ScaffoldServer, ScaffoldTool, CloudflareKVAdapter } from '@scaffold/core';

const tools: ScaffoldTool[] = [
  {
    name: 'save_note',
    description: 'Save a note with a title and content',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Note title' },
        content: { type: 'string', description: 'Note content' },
      },
      required: ['title', 'content'],
    },
    handler: async ({ title, content }, { storage, userId }) => {
      await storage.set(`user:${userId}:note:${title}`, { title, content });
      return { success: true, title };
    },
  },
  {
    name: 'list_notes',
    description: 'List all note titles',
    inputSchema: { type: 'object', properties: {} },
    handler: async (_, { storage, userId }) => {
      const keys = await storage.list(`user:${userId}:note:`);
      const titles = keys.map(k => k.replace(`user:${userId}:note:`, ''));
      return { titles };
    },
  },
  {
    name: 'read_note',
    description: 'Read a note by title',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Note title' },
      },
      required: ['title'],
    },
    handler: async ({ title }, { storage, userId }) => {
      const note = await storage.get(`user:${userId}:note:${title}`);
      if (!note) return { error: 'Note not found' };
      return note;
    },
  },
  {
    name: 'delete_note',
    description: 'Delete a note by title',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Note title' },
      },
      required: ['title'],
    },
    handler: async ({ title }, { storage, userId }) => {
      await storage.delete(`user:${userId}:note:${title}`);
      return { success: true, title };
    },
  },
];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const server = new ScaffoldServer({
      tools,
      storage: new CloudflareKVAdapter(env.STORAGE),
    });
    return server.handle(request);
  },
};
```

---

## Notes App Details

**4 tools:**
- `save_note` — Create or update a note by title
- `list_notes` — List all note titles
- `read_note` — Get a note's content by title
- `delete_note` — Remove a note

**Storage pattern:** `user:{userId}:note:{title}` — simple flat keys with per-user isolation.

**Teaching moments:**
- `ScaffoldTool` anatomy (name, description, inputSchema, handler)
- `storage` and `userId` from context (security comes free)
- How the Worker export wires it together
