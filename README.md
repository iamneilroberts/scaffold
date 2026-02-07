# Scaffold

Build niche AI tools that run inside the chatbot you already pay for.

Most people already subscribe to Claude, ChatGPT, or another frontier model. That subscription gives you a powerful general-purpose AI — but on its own it can't remember things between sessions, store your data, or do anything specific to your domain. Scaffold changes that.

**Scaffold is a connector, not a wrapper.** It uses [MCP](https://modelcontextprotocol.io/) (Model Context Protocol) — an open standard that lets AI chat clients call external tools — to plug custom tools directly into your existing chat client. You don't replace your AI — you extend it. When Anthropic ships a better Claude or OpenAI upgrades GPT, your tools get smarter for free. You're always running on the best model your subscription provides.

**One remote MCP server does the work.** A single Cloudflare Worker hosts your tools — a focused, subject-matter expert backed by frontier model capability. A travel planner that remembers your trips. A note-taking system that works across devices. A local guide that knows your neighborhood. The LLM handles the conversation; your tools handle the data.

**A dead simple KV store holds everything.** All your data, prompts, templates, and config live on a key-value store organized around your project's needs. It's fast enough for most use cases, handles multiple users, and doesn't carry the overhead of a relational database. Start with local storage for development, then migrate to Cloudflare KV for persistent storage that works across platforms, devices, and sessions.

The goal is to make it easy for anyone to spin up their own niche-focused tools — DIY apps that live inside the chat interface millions of people already use every day.

```typescript
import { ScaffoldServer, CloudflareKVAdapter } from '@scaffold/core';
import type { ScaffoldTool } from '@scaffold/core';

const saveTool: ScaffoldTool = {
  name: 'notes:save',
  description: 'Save a note',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      content: { type: 'string' },
    },
    required: ['title', 'content'],
  },
  // ctx provides authenticated user info, storage, and environment
  handler: async (input, ctx) => {
    await ctx.storage.put(`${ctx.userId}/notes/${Date.now()}`, {
      title: input.title,
      content: input.content,
    });
    return { content: [{ type: 'text', text: `Saved "${input.title}"` }] };
  },
};

export default new ScaffoldServer({
  config: { /* ... */ },
  storage: new CloudflareKVAdapter(env.DATA),
  tools: [saveTool],
});
```

That's a complete MCP server. `ctx.storage` is a full storage adapter with get/put/delete/list. `ctx.userId` is already authenticated. Deploy to Cloudflare Workers and connect it to Claude Desktop, ChatGPT, or any MCP-compatible client.

## What's under the hood

**Storage that fits your project.** A storage abstraction over Cloudflare KV with documented patterns for per-user data (`{userId}/notes/{noteId}`), shared data (`shared/templates/{name}`), secondary indexes, and geohash-based location queries. Swap in `InMemoryAdapter` for local development and tests. The interface is the same.

**Multi-user without the headaches.** Multiple people (or multiple AI sessions) can use the same server. Optimistic locking (`getWithVersion` / `putIfMatch`) means conflicting writes fail explicitly instead of silently overwriting each other.

**Auth that isn't a security hole.** Keys are SHA-256 hashed. Comparison is constant-time. The fallback auth scan is rate-limited and budget-capped. Admin sessions use HttpOnly + Secure + SameSite cookies.

**An admin dashboard.** Server-rendered HTML with CSP headers. Tab system, tool inspector, storage browser.

**A plugin system.** Bundle tools, resources, prompts, and routes into a plugin. Register it once. Ship it as an npm package if you want.

## Examples

Three working apps you can deploy or use as starting points:

| Example | What it demonstrates |
|---------|---------------------|
| [notes-app](examples/notes-app) | Per-user CRUD — the simplest useful pattern |
| [travel-planner](examples/travel-planner) | Nested entities — trips containing stops, with cross-references |
| [local-guide](examples/local-guide) | Shared data + per-user favorites, geohash search for nearby places |

Each has tools, a Worker entry point, and tests against `InMemoryAdapter`.

## Try the examples locally

`@scaffold/core` isn't published to npm yet. To try Scaffold, clone the monorepo and run one of the examples:

```bash
git clone https://github.com/iamneilroberts/scaffold.git
cd scaffold
npm install
npm run build
```

Then run any example's tests:

```bash
cd examples/notes-app
npm test
```

Or start a local dev server (requires [Wrangler](https://developers.cloudflare.com/workers/wrangler/)):

```bash
cd examples/notes-app
npx wrangler dev
```

Each example has its own README with details.

## Docs

- [Getting Started](docs/getting-started.md) — zero to running server
- [Storage Patterns](docs/storage-patterns.md) — key design, indexes, anti-patterns
- [Security Guide](docs/security-guide.md) — auth layers, rate limiting, headers
- [Public API Reference](docs/public-api.md) — stable, semver-versioned types
- [Plugin Development](docs/plugin-development.md) — building reusable tool packages
- [Architecture](docs/architecture.md) — how the internals work
- [Deployment](docs/deployment.md) — Cloudflare Workers setup

## Status

Early (0.1.0). The public API is defined and versioned — breaking changes only on major bumps. Internals will change. Built for Cloudflare Workers; other runtimes are possible through the storage adapter interface but aren't tested yet.

## Security

See [SECURITY.md](SECURITY.md) for the full policy. Short version: auth keys are hashed, admin dashboard has proper headers, optimistic locking prevents write races, and there's a rate limiter on auth scanning. If you find a vulnerability, please report it privately.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
