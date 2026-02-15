# Reddit Launch Posts

Draft posts for different subreddits. Adapt tone to each community.

---

## r/ClaudeAI

**Title:** `Gave Claude persistent storage via a custom MCP server — open source framework if you want to do the same`

I got tired of copy-pasting context into Claude every session, so I built a framework for spinning up MCP servers that run on Cloudflare Workers.

The basic idea: you define tools (like "search notes" or "save note") in TypeScript, deploy to Workers, and point Claude Desktop at it. Claude can then read/write your stuff directly.

I started building these one-off but kept re-solving the same problems — auth, storage key patterns, making sure concurrent writes don't clobber each other. So I pulled the common bits into a framework called Scaffold.

It handles:

- Storage abstraction over Cloudflare KV with per-user key isolation, secondary indexes, pagination
- Optimistic locking so two Claude sessions don't stomp on each other's writes
- Auth with hashed keys, constant-time comparison, rate-limited scanning
- An admin dashboard for debugging what tools are registered and what's in storage

There are three example apps in the repo (notes, travel planner, local city guide) you can deploy as-is or use as starting points. The notes app is probably the simplest useful thing — four tools (save/list/read/delete) in about 130 lines.

MIT licensed, TypeScript, still early (0.1.0). Would genuinely appreciate feedback on the API surface.

[link]

---

## r/CloudFlare

**Title:** `Open source framework for building MCP servers on Workers — handles auth, KV storage patterns, concurrency`

Been building MCP servers on Workers for a few months. Every time I started a new one I'd copy-paste the same auth middleware, the same KV key-prefix patterns, the same optimistic locking logic. Eventually I factored it out.

Scaffold is a TypeScript framework specifically for Workers + KV. It's not a generic web framework with MCP bolted on — it's built around Workers constraints from the start (CPU time limits, no filesystem, KV eventual consistency).

Some specific things that were annoying to get right and are now just handled:

- **KV key scanning is expensive**, so auth uses a dedicated index with rate-limited fallback scan (max 5/min, cap at 100 keys)
- **Optimistic locking** via version fields — `getWithVersion` / `putIfMatch`. If your write conflicts, you get a clear error instead of silent data loss
- **Storage key patterns** are documented with a decision tree: per-user data (`user:{id}:notes:{noteId}`), shared data (`shared:templates:{name}`), hybrid patterns with secondary indexes
- **Admin dashboard** is bundled as server-rendered HTML with CSP headers, not string-concatenated templates (learned that lesson the hard way)

Curious if anyone else is building MCP servers on Workers. The edge deployment model is genuinely good for this — low latency, no cold starts to speak of, and KV is a natural fit for per-user tool state.

[link] — MIT, TypeScript, npm workspaces monorepo.

---

## r/typescript

**Title:** `Designing a tool-definition API for MCP servers — feedback on ergonomics welcome`

Working on a framework for MCP servers (the protocol Claude and other AI models use to call external tools). The core API decision was how developers define tools.

Landed on this:

```typescript
const searchNotes: ScaffoldTool = {
  name: 'notes:search',
  description: 'Search notes by keyword',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search term' },
    },
    required: ['query'],
  },
  handler: async (input, ctx) => {
    const results = await ctx.storage.list(`${ctx.userId}/notes/`);
    // filter and return matches...
  },
};
```

The `ctx` object gives you auth info (`userId`, `isAdmin`), a storage adapter (get/put/delete/list with optimistic locking), env vars, and a request ID for tracing. Tools are namespaced (`notes:search` not just `search`) to avoid collisions when you compose multiple tool sets.

Went back and forth on decorators vs. builder pattern vs. plain objects. Plain objects won because:
- Easiest to type-check — `ScaffoldTool` is a simple interface, no generics gymnastics
- Easy to test — pass a mock `ctx` with `InMemoryAdapter`, assert the output
- Easy to serialize — you can JSON.stringify everything except the handler, which is useful for the admin dashboard's tool inspector

Input validation uses JSON Schema directly because that's what MCP requires anyway. Wrapping it in zod just to convert back felt like ceremony for ceremony's sake.

The framework runs on Cloudflare Workers and handles auth, KV storage patterns, and an admin dashboard. Repo is here if you want to look at the full type definitions: [link]

Is this the kind of API you'd want to use, or does it feel too low-level? Genuinely curious.

---

## r/webdev

**Title:** `If you're building tools for AI assistants, the storage and auth problems are the same ones we've always had`

Spent the last few months building MCP servers — these are backends that let AI models like Claude call your custom APIs and access your data. It's a cool pattern but the security surface is the same stuff web devs have dealt with forever, and it's easy to skip when you're excited about getting tools working.

Things I ran into (my own early code included):

- Auth keys stored in plaintext in KV
- Admin dashboards built with string concatenation — XSS waiting to happen
- No concurrency control, so two AI sessions writing at once = last write wins, data gone
- Key comparison using `===` instead of constant-time compare (timing attacks)
- No key namespacing, so user A could theoretically read user B's data by guessing key names

None of this is new or specific to AI. But MCP is new enough that most tutorials skip straight to "here's how to make Claude call your function" and stop there. The moment you need persistent storage, you're assembling the same pieces every web developer has assembled before.

I ended up building a framework ([Scaffold](link)) that handles this stuff by default — SHA-256 hashed keys, CSP headers, optimistic locking, rate-limited auth, per-user key prefixes. It runs on Cloudflare Workers and is specifically designed for MCP servers that need to read and write data.

MIT licensed, TypeScript. Three example apps (notes, travel planner, local city guide) if you want to see what a production-ish MCP server looks like.

---

## r/LocalLLaMA (optional — broader AI audience)

**Title:** `Open source framework for giving AI models persistent storage via MCP`

MCP (Model Context Protocol) lets AI models call external tools — things like "save this note" or "search my bookmarks." Most tutorials show stateless examples, but the interesting use cases need persistent storage: personal knowledge bases, project management, trip planning, etc.

The problem is that once you add storage, you inherit all the usual backend concerns: auth, key design, concurrent writes, admin tooling. And you're solving them from scratch each time.

I built Scaffold to handle the infrastructure layer for MCP servers that store data. It runs on Cloudflare Workers with KV storage and gives you:

- A storage adapter with documented key patterns (per-user, shared, hybrid with indexes)
- Optimistic locking for concurrent writes (two sessions editing the same data won't silently clobber each other)
- Auth with hashed keys and rate limiting
- An admin dashboard for inspecting tools and stored data
- A plugin system for packaging tools into reusable modules

You define tools as plain TypeScript objects with a handler function that receives an authenticated context. Deploy to Workers, add the URL to your MCP client config, done.

Three example apps in the repo: a notes app, a travel planner, and a local city guide (with geohash-based location search). MIT licensed.

[link]
