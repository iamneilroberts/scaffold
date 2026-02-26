# Session Handoff: Watch Recommender

**Date:** 2026-02-22
**Session Focus:** Design and plan a personal movie/TV recommendation MCP tool

## What Was Accomplished
1. Reviewed Reddit post about whatcaniwatch.org → assessed feasibility on Scaffold
2. Brainstormed requirements through 5 clarifying questions
3. Designed the app (Approach A: Taste Profile + TMDB)
4. Wrote full implementation plan with 14 TDD tasks

## Decisions Made This Session
- **Taste Profile approach**: Compress watch history into LLM-readable summary, not full history in context — BECAUSE context window limits make passing 500+ titles impractical — STATUS: confirmed
- **7 MCP tools**: watch-log, watch-dismiss, watch-preference, watch-profile, watch-recommend, watch-lookup, watch-import — STATUS: confirmed
- **TMDB API**: Free tier for metadata + streaming availability. `/search/multi` for combined movie+TV search. Store results after first fetch. — STATUS: confirmed
- **Admin page via `server.route()`**: Serve static HTML at `/app`, calls MCP tools via JSON-RPC POST. Three tabs: Import, History, Preferences. — STATUS: confirmed
- **Recommendations in chat only**: No recommendation UI on web page — Claude chat is the natural interface — STATUS: confirmed
- **Netflix CSV import**: Parse Title,Date columns, deduplicate TV episodes by extracting show name before first colon — STATUS: confirmed
- **Preference learning**: Both explicit statements AND inferred from dismissal/rating patterns feeding into taste profile — STATUS: confirmed
- **Tool names use hyphens** (not colons) per scaffold convention for remote MCP compatibility — STATUS: confirmed

## Files Created or Modified
| File Path | Action | Description |
|-----------|--------|-------------|
| `docs/plans/2026-02-22-watch-recommender-design.md` | Created | Full design doc |
| `docs/plans/2026-02-22-watch-recommender-impl.md` | Created | 14-task implementation plan with TDD steps and complete code |

## What the NEXT Session Should Do
1. **First**: Read `docs/plans/2026-02-22-watch-recommender-impl.md` — this is the complete implementation plan
2. **Then**: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` skill to execute the 14 tasks
3. The plan has complete code for every task — follow it task-by-task with TDD

## Key Context for Implementation
- Scaffold patterns: `@voygent/scaffold-core`, `"*"` for workspace deps, tool names with hyphens
- Existing examples at `examples/notes-app/` and `examples/bbq-smoking/` are good references
- `server.route('GET', '/app', handler)` for serving admin HTML (custom routes take priority over admin path)
- TMDB auth: `Authorization: Bearer {api_key}` header
- Netflix CSV: `Title,Date` columns, TV shows have `"Show Name: Season X: Episode"` format
- After modifying core, rebuild dist: `cd packages/core && npx tsc` (probably not needed here since we're only building an example app)
- `requireAuth: true` for deployed apps — ADMIN_KEY as Cloudflare secret, `.dev.vars` for local

## Open Questions Requiring User Input
- [ ] TMDB API key — user needs to create one at https://www.themoviedb.org/settings/api
- [ ] KV namespace IDs — created during deploy task (Task 14)

## What NOT to Re-Read
- The Reddit post — already analyzed, not relevant to implementation
- `packages/core/src/` — the plan has all the type info needed
