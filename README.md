# Scaffold

A framework for building MCP servers that need to store data.

If you've built an MCP server for Claude (or any LLM), you've probably hit the same wall: the protocol itself is straightforward, but the moment your tools need to **read and write persistent data**, you're on your own. You end up hand-rolling auth, figuring out KV key patterns, worrying about what happens when two AI sessions write at the same time, and realizing your admin page has an XSS vulnerability because you built it with string concatenation at 2am.

Scaffold handles the infrastructure so you can focus on your tools.

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

That's a complete MCP server. `ctx.storage` is a full storage adapter with get/put/delete/list. `ctx.userId` is already authenticated. Deploy to Cloudflare Workers and connect it to Claude Desktop.

## What you get

**Storage that works.** Scaffold gives you a storage abstraction over Cloudflare KV with documented patterns for per-user data (`user:{id}:notes:{noteId}`), shared data (`shared:templates:{name}`), secondary indexes, and even geohash-based location queries. Swap in `InMemoryAdapter` for tests. The interface is the same.

**Concurrent writes that don't corrupt data.** Two Claude sessions editing the same note? Scaffold has optimistic locking built in — `getWithVersion` / `putIfMatch` — so conflicting writes fail explicitly instead of silently overwriting each other.

**Auth that isn't a security hole.** Keys are SHA-256 hashed before storage. Comparison is constant-time (no timing attacks). The fallback auth scan is rate-limited and budget-capped. Admin sessions use HttpOnly + Secure + SameSite cookies. This isn't novel — it's just the stuff that's easy to skip when you're focused on getting tools working.

**An admin dashboard that isn't a liability.** Server-rendered HTML with CSP headers, not `<h1>${userInput}</h1>`. Tab system, tool inspector, storage browser.

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
