# Reconcile OpenClaw Port with Scaffold

**Date:** 2026-02-22
**Status:** Pending
**Branch:** `feat/port-extensions` on `iamneilroberts/openclaw` fork

## Context

The Scaffold App Factory and Salesbot were ported from `~/dev/open-claude-cowork/clawd/` to `~/dev/openclaw/extensions/` as OpenClaw plugin extensions. This work lives on `feat/port-extensions` and needs to be merged into the fork's `main` branch when ready.

The port was done because Anthropic banned consumer OAuth tokens in third-party tools. OpenClaw supports OpenAI, Claude, Gemini, OpenRouter, and Ollama natively — no paid API keys required.

## What Was Ported

### Scaffold App Factory (`extensions/scaffold-factory/`)
- `index.ts` — plugin entry with 4 commands (`/scout`, `/build`, `/test`, `/factory`) and 5 agent tools
- `src/store.ts` — cycle/config/catalog JSON persistence (from `clawd/factory/store.js`)
- `src/pipeline.ts` — stage progression state machine (from `clawd/factory/pipeline.js`)
- `src/stages/scout.ts` — web scraping stage, decomposed into message-building + response-processing
- `src/stages/builder.ts` — code generation stage, same decomposition
- `src/stages/tester.ts` — persona-based testing, same decomposition
- `src/prompts/` — all 5 prompts copied directly (scout, build, judge, guardian, doc-writer)
- `src/personas/` — all 4 personas copied directly

### Salesbot (`extensions/salesbot/`)
- `index.ts` — plugin entry with 4 commands, tool registration, `before_prompt_build` hook
- `src/db.ts` — SQLite persistence via better-sqlite3 (from `clawd/salesbot/db.js`)
- `src/tools.ts` — 15 sales pipeline tools using TypeBox schemas
- `src/approval.ts` — human-in-the-loop draft approval workflow

## Key Architecture Changes

| Clawd Pattern | OpenClaw Equivalent |
|---|---|
| `agent.runAndCollect()` | Stages split into `buildMessage()` + `processResponse()` — agent orchestrates externally |
| `createSdkMcpServer()` + `tool()` | `api.registerTool()` with TypeBox `Type.Unsafe()` parameters |
| `handler.js` switch/case | `api.registerCommand()` per command |
| `setContext()` | `api.on("before_prompt_build")` hook |
| Hardcoded `~/clawd/` paths | `api.runtime.state.resolveStateDir()` + `/plugins/<id>/` |

## TODO

1. **Merge `feat/port-extensions` into fork's `main`**
   - The fork's `main` is 33 commits ahead of local (upstream syncs + other work)
   - Need to merge or rebase `feat/port-extensions` onto current `main`
   - Watch for conflicts in `pnpm-lock.yaml`

2. **Verify runtime loading**
   - Run `pnpm openclaw gateway` and confirm both extensions load
   - Check that `/factory`, `/scout`, `/sales`, `/pipeline` commands respond via Telegram

3. **Consider syncing scaffold-factory changes back**
   - The OpenClaw port's store/pipeline/stages are TypeScript rewrites of the original JS
   - Any improvements made in `~/dev/scaffold/` since the port should be reconciled
   - The prompts and personas are direct copies — changes in either location need syncing

4. **Decide on canonical location**
   - Is `~/dev/scaffold/` the source of truth for factory logic, or is the OpenClaw extension?
   - Consider extracting shared core logic into a package both can consume
