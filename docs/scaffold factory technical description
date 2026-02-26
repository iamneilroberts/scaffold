  Scaffold Factory                                              
                                                                
  The Stack                                   
                                     
  MCP (Model Context Protocol) is a standard that lets AI       
  chatbots like Claude call external tools. Instead of building 
  a standalone app with its own UI, you build a set of tools
  that plug into the chatbot the user already pays for. Think
  browser extensions, but for AI assistants.

  Scaffold is our framework for building these MCP tool servers.
   You define tools in TypeScript, deploy to Cloudflare Workers,
   and any MCP-compatible client (Claude Desktop, ChatGPT, etc.)
   can connect and use them. The framework handles storage (KV),
   auth, multi-user isolation, and admin dashboards. A habit
  tracker, for example, is ~100 lines of tool definitions — no
  frontend code.

  Clawd is our personal AI assistant that runs on
  WhatsApp/Telegram/Signal. It wraps the Claude Agent SDK with
  persistent memory, browser automation, and a scheduling
  system.

  What the Factory Does

  The factory is a pipeline built into clawd that autonomously
  creates new scaffold apps. You control it by texting commands
  to your phone.

  /scout  →  /scout pick 3  →  /build  →  /build approve  →
  test  →  judge  →  guardian  →  docs  →  /publish approve
    │          │ checkpoint       │          │ checkpoint
   │        │          │           │          │ checkpoint
    │          │                  │          │
   │        │          │           │          │
  scrape    human picks        Claude      human reviews     4
  AI      Claude     Claude     Claude      deploy +
  Reddit,   which idea        generates    generated code
  personas   scores    audits     writes      promote
  HN, PH    to build          a full app
  "use"     results   security   full docs
                                                            the
  app

  The Agentic Parts

  This is where it gets interesting. Each stage is a separate
  Claude agent invocation with a specialized system prompt and
  its own set of tools.

  Builder agent — gets the scaffold type definitions, one
  working example app, and the idea spec. Uses Write/Edit/Bash
  tools to generate a complete scaffold app (types, tools,
  tests, config). Runs tsc and vitest to validate. If tests
  fail, it iterates up to 3 times.

  Persona testing — this is the key innovation. The built app's
  tools get wrapped in an in-process MCP server (no deployment
  needed). Then 4 separate Claude agent sessions each get a
  different persona prompt:

  - "Casual User Sarah" — tries basic features, tests
  discoverability
  - "Power User Marcus" — pushes edge cases, rapid sequences
  - "Confused Newbie Jamie" — sends vague requests, misuses
  tools
  - "Adversarial Tester Priya" — injection attempts, huge
  payloads, empty strings

  Each persona makes 5-10 tool calls against the app and reports
   what worked and what didn't. This is basically automated QA
  using LLM agents as simulated users.

  Judge agent — reads all persona logs, scores the app on
  success rate, error quality, feature coverage, and edge case
  handling. Verdict: PASS, IMPROVE, or FAIL. On FAIL, it
  generates specific fix instructions and kicks back to the
  builder.

  Guardian agent — reads the source code directly. Checks for
  input validation gaps, cross-user data leaks, hardcoded
  secrets, type safety, and whether tool descriptions are clear
  enough for an LLM to use correctly.

  Doc-writer agent — reads the entire cycle history and
  generates: README, quick-start guide, detailed guide, the
  discovery story (how/why this idea was chosen), design
  decisions, testing summary, and draft social media posts for
  Reddit/HN/Twitter.

  Self-Improvement

  After each completed cycle, a retrospective agent analyzes
  what went well and what didn't, then updates the factory's own
   configuration — scouting criteria weights, persona prompts,
  evaluation rubrics. It can't modify its own code (that
  requires human approval), but its prompts evolve over time.

  The Catalog

  Built apps get listed on a static site (GitHub Pages) and also
   on an MCP discovery server — itself a scaffold app. Other
  developers can point their Claude at the catalog MCP server,
  search for apps, and get install instructions
  programmatically. The factory dogfoods its own framework.

  Why This Architecture

  The core bet: the right unit of software for the AI era isn't
  an app with a UI — it's a set of tools that run inside
  whatever chat client the user already has. Scaffold makes
  those tools trivial to build. The factory makes building them
  autonomous. Every piece (scouting, building, testing, judging,
   documenting) is a Claude agent call with a specialized prompt
   and toolset — the same primitive composed differently.
