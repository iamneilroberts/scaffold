# Scaffold Assistant: Design & Handoff

**Date:** 2026-02-12
**Status:** Design approved, ready for implementation planning

## What We're Building

Three deliverables that make Scaffold accessible to newcomers:

1. **Publish `@scaffold/core` to npm** — prerequisite for standalone projects
2. **`scaffold-assistant` Claude Code skill** — interactive onboarding that interviews a developer, designs their expert assistant, generates the code, seeds domain knowledge, deploys to Cloudflare, and outputs a ready-to-paste Claude connector URL
3. **"Building a Domain Expert" guide** — a manual walkthrough of the same process, with callouts at each phase offering the skill as an alternative

## Key Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| CLI vs. skill | **Skill** | Claude Code IS the scaffolding tool. No separate CLI. |
| Generated project location | **Standalone** | Not inside the monorepo. Uses `@scaffold/core` as npm dep. |
| Interview style | **Structured** | Fixed 6-question sequence. Predictable, nothing gets missed. |
| Knowledge acquisition | **Hybrid** | Skill proposes topics, user chooses per-topic: "research it" or "I'll provide it." |
| Web scraping | **Built-in tools for v1** | Use Claude Code's WebSearch + WebFetch. No Playwright. |
| Chatbot connection | **Claude-only for v1** | Generate ready-to-paste connector URL. ChatGPT deferred. |
| Guide relationship to skill | **Parallel paths** | Guide teaches manually. Skill automates. Either works alone. Skill can pick up mid-guide. |
| Knowledge ingestion at runtime | **`{prefix}-learn` tool** | End users paste text/URL/screenshot in chat. Two-step: propose changes, then apply after approval. |

## Architecture

### The Skill

Lives at `skills/scaffold-assistant/` in the scaffold repo. Installable as a Claude Code slash command (`/scaffold-assistant`) either globally or per-project.

**6 phases, each a checkpoint:**

#### Phase 1: Interview

Six structured questions:

1. **Domain & Purpose** — "What kind of expert assistant?" → derives app name, slug, description
2. **Entities** — "What does it need to remember?" → entity names + fields. Skill proposes fields per entity based on domain.
3. **Actions** — "What should it do with each entity?" → tool list. Defaults: create, get, list, update, delete. Plus domain-specific actions.
4. **Relationships** — "How do entities relate?" → drives KV key schema (nested keys for parent-child).
5. **Domain Knowledge** — "What does it need to know to be expert?" → topic list. Per-topic: research or user-provided.
6. **Quality & Progress** — "Which actions should check quality?" → maps to `validate` functions and progress tracking.

After all 6, presents a summary for approval before proceeding.

#### Phase 2: Design

Presents the proposed architecture for approval:
- Entity type definitions
- Tool list with names, descriptions, schemas
- KV key patterns
- Knowledge topics and sources
- Quality gate definitions

#### Phase 3: Generate

Produces a standalone project:

```
my-expert-app/
├── package.json              # @scaffold/core as npm dep
├── tsconfig.json             # standard (identical across all apps)
├── wrangler.toml             # app name, KV binding placeholder
├── .dev.vars                 # ADMIN_KEY=change-me
├── .scaffold-assistant.json  # state file for resumability
├── README.md                 # tool reference, setup, connector URL placeholder
├── src/
│   ├── index.ts              # ScaffoldServer + knowledge seeding
│   ├── tools.ts              # tool registry array
│   ├── types.ts              # entity interfaces (from Q2)
│   ├── keys.ts               # storage key helpers (from Q4)
│   └── tools/
│       ├── {entity}-tools.ts       # CRUD + domain actions per entity
│       ├── guide-tools.ts          # knowledge lookup tool
│       └── learn-tool.ts           # runtime knowledge ingestion
├── src/__tests__/
│   ├── {entity}-tools.test.ts
│   ├── guide-tools.test.ts
│   └── learn-tool.test.ts
└── src/knowledge/
    ├── {topic-1}.md
    ├── {topic-2}.md
    └── ...
```

Skill dispatches subagents per tool file (tool + test), runs full test suite after generation.

#### Phase 4: Knowledge

For each topic from Q5:
- **User-provided**: asks for content (paste, file path, or URL to fetch)
- **Research**: web search → fetch 2-3 sources → synthesize structured markdown → present for review → save to `src/knowledge/{topic}.md`

Knowledge files are markdown optimized for LLM consumption: clear headings, tables for data, explicit rules.

Embedded in source as seed data. Seeded to KV (`_knowledge/{topic}`) on first deploy via `seedKnowledge()` in index.ts. Updatable at runtime via `scaffold-knowledge` admin tool without redeploying.

#### Phase 5: Deploy

1. `npm install`
2. Run tests — abort if failing
3. `wrangler kv namespace create DATA` → capture ID
4. `wrangler kv namespace create DATA --preview` → capture preview ID
5. Patch wrangler.toml with real IDs
6. `openssl rand -hex 20` → generate URL-safe auth token
7. `wrangler deploy`
8. `wrangler secret put ADMIN_KEY` with generated token
9. Write `.dev.vars` with same token
10. Curl health endpoint to verify

If wrangler not authenticated, prompts `wrangler login` first.
If user wants to deploy later, marks phase as skipped, prints manual instructions.

#### Phase 6: Connect

Outputs:
```
Worker URL: https://scaffold-{slug}.{subdomain}.workers.dev
Auth token: {hex-token}

To connect in Claude Web:
1. Settings → Connectors → Add connector
2. Paste: https://scaffold-{slug}.{subdomain}.workers.dev/sse?token={hex-token}
3. Name it (e.g. "BBQ Expert")
4. New conversation — tools appear automatically
```

### Resumability

State tracked in `.scaffold-assistant.json` in the project directory:

```json
{
  "phase": "knowledge",
  "appName": "BBQ Smoking Expert",
  "appSlug": "bbq-smoking-expert",
  "projectDir": "/home/neil/dev/bbq-smoking-expert",
  "interview": { "q1": "...", "q2": "...", ... },
  "design": { "entities": [...], "tools": [...], "knowledgePlan": [...] },
  "generated": true,
  "knowledgeTopics": {
    "smoking-temps": "complete",
    "wood-pairings": "complete",
    "food-safety": "pending"
  },
  "deployed": false,
  "workerUrl": null,
  "authToken": null
}
```

Re-running the skill detects this file and offers to continue from the current phase.

### Runtime Knowledge Ingestion: `{prefix}-learn`

Every generated assistant includes a `learn` tool for end users to feed in new knowledge through their chatbot.

**Input types:** text (pasted), URL (fetched), image (LLM extracts text before calling tool)

**Two-step flow:**
1. `action: 'propose'` — tool parses content, loads existing knowledge topics from KV, returns both to LLM. LLM identifies what's new, what conflicts, proposes changes to user.
2. `action: 'apply'` — after user approves in chat, LLM calls tool with merged content. Tool writes to `_knowledge/{topic}`.

**Schema:**
```typescript
{
  name: '{prefix}-learn',
  inputSchema: {
    properties: {
      action: { enum: ['propose', 'apply'] },
      content: { type: 'string' },
      contentType: { enum: ['text', 'url', 'image'] },
      topic: { type: 'string' },
      updatedContent: { type: 'string' },
    },
    required: ['action']
  }
}
```

**Image handling:** The chatbot client (Claude/ChatGPT) does vision. LLM extracts text from the image and passes it to the tool as a text string. The Cloudflare Worker never sees the image.

**Conflict detection:** The LLM handles this conversationally. Tool provides existing knowledge + new content. LLM spots conflicts and asks the user which version to keep.

### The Guide

`docs/building-domain-experts.md` — structured as 6 phases matching the skill:

1. Design Your Expert
2. Set Up the Project
3. Build Your Tools
4. Add Domain Knowledge
5. Quality Gates & Progress
6. Deploy & Connect

Each phase has a callout: "Want to skip ahead? Run `/scaffold-assistant` to automate the rest."

Also covers post-deployment topics:
- Updating knowledge without redeploying
- Adding new tools
- Debugging with admin dashboard
- Re-running the skill to add features

The guide does NOT cover: ChatGPT integration, plugin development, multi-user auth (those have their own docs).

## Scaffold App Anatomy Reference

For the next agent implementing this — here's what every generated app looks like, derived from existing examples.

### Always the Same (Boilerplate)

**package.json:**
```json
{
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": { "@scaffold/core": "^0.1.0" },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240512.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "wrangler": "^3.0.0"
  }
}
```

**tsconfig.json:** Identical across all apps. ES2022, ESNext modules, bundler resolution, strict, noEmit.

**Entry point pattern (index.ts):**
- Import ScaffoldServer, CloudflareKVAdapter from @scaffold/core
- Import tools array from ./tools.js
- Define Env interface: `{ DATA: KVNamespace; ADMIN_KEY: string }`
- Define config: app metadata, mcp serverName, auth settings
- Export default fetch handler: merge runtime config with env, create storage + server, return server.fetch()
- Include seedKnowledge() called via ctx.waitUntil() on every request (idempotent via _knowledge/_initialized flag)

**Test pattern:**
- vitest, InMemoryAdapter, makeCtx() helper
- makeCtx returns: { authKeyHash: 'test-key-hash', userId: 'user1', isAdmin: false, storage, env: {}, debugMode: false, requestId: 'req-1' }

### What Varies Per App

- App name, slug, description, MCP server name
- Auth mode (requireAuth: true recommended, false for no-auth)
- Tool prefix (e.g. 'bbq', 'notes', 'fitness')
- Entity types and their fields
- Tool definitions (name, description, schema, handler, validate)
- Storage key patterns
- Knowledge topics and content
- Quality gate checks

### Critical Patterns

- Tool names: `{prefix}-{action}` with hyphens, matching `^[a-zA-Z0-9_-]{1,64}$`
- Storage keys: `{userId}/{collection}/{id}` for user data, `_knowledge/{topic}` for shared knowledge
- TypeScript imports: always `.js` extension (ESM)
- Auth: `adminKey: undefined` in static config, merge from `env.ADMIN_KEY` at runtime
- When using monorepo: `"@scaffold/core": "*"`. When standalone: `"@scaffold/core": "^0.1.0"`

## Implementation Order

1. **Publish `@scaffold/core@0.1.0` to npm**
   - Verify package.json exports, types, files fields
   - `npm publish --access public`
   - Verify: `npm info @scaffold/core`

2. **Build the `scaffold-assistant` skill**
   - Phase 1-2: Interview + Design (the structured Q&A and schema design)
   - Phase 3: Generate (project scaffolding + subagent code generation)
   - Phase 4: Knowledge (research + synthesis using WebSearch/WebFetch)
   - Phase 5-6: Deploy + Connect (wrangler automation)
   - Resumability via .scaffold-assistant.json state file
   - The `{prefix}-learn` tool template for runtime knowledge ingestion

3. **Write the guide**
   - `docs/building-domain-experts.md`
   - Mirror the 6 phases
   - Include skill callouts at each phase boundary
   - Add post-deployment section

## Open Questions for Implementer

- **npm scope**: Is `@scaffold/core` the right scope? Does Neil own it on npm? May need `scaffold-core` without scope if not.
- **Skill format**: What's the exact format for installable Claude Code commands? Need to verify `.claude/commands/` structure.
- **Learn tool URL fetching**: Cloudflare Workers can `fetch()` URLs, but may hit size/timeout limits on large pages. May need to truncate or summarize. Test with real-world URLs during implementation.
- **Image content in learn tool**: Verify that Claude Web and ChatGPT both pass image-extracted text to MCP tools. If not, the learn tool may need to accept base64 image data and use a vision API.
