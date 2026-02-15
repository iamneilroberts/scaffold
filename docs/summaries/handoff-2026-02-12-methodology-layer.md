# Session Handoff: Methodology Layer Implementation

**Date:** 2026-02-12
**Session Focus:** Design and plan quality gates, knowledge files, progress tracking, and additive merge for @scaffold/core

## What Was Accomplished
1. Analyzed [claude-interview-coach](https://github.com/raphaotten/claude-interview-coach) repo for techniques to adapt
2. Compared against Scaffold's current architecture
3. Designed four new features with user approval → `docs/plans/2026-02-12-methodology-layer-design.md`
4. Wrote full TDD implementation plan (8 tasks) → `docs/plans/2026-02-12-methodology-layer-impl.md`

## Decisions Made This Session
- **Flat knowledge namespacing** (`smoking-guide` not `bbq/smoking-guide`) — CONFIRMED
- **Auto-logging always on** (no opt-out flag for progress tracking when validate exists) — CONFIRMED
- **Quality gate severity model**: `error` blocks response, `warning` annotates it — CONFIRMED
- **mergeAndPut never deletes**: null/undefined values in incoming are skipped — CONFIRMED
- **90-day TTL** on progress entries, KV handles expiration — CONFIRMED
- **Progress trend math**: split-half comparison, 10% threshold for direction — CONFIRMED

## Key Numbers/Metrics
- 8 implementation tasks, TDD (test-first for each)
- 5 new files to create in `packages/core/src/utils/` and `packages/core/src/tools/`
- 3 modified core files (`public-api.ts`, `mcp/tools.ts`, `mcp/errors.ts`)
- 2 new core tools (`scaffold-knowledge`, `scaffold-progress`)
- Core tool count goes from 5 → 7

## Files Created This Session
| File Path | Action | Description |
|-----------|--------|-------------|
| `docs/plans/2026-02-12-methodology-layer-design.md` | Created | Full design doc with all 4 techniques |
| `docs/plans/2026-02-12-methodology-layer-impl.md` | Created | TDD implementation plan, 8 tasks with exact code |
| `docs/summaries/handoff-2026-02-12-methodology-layer.md` | Created | This file |

## What the NEXT Session Should Do
1. **First**: Read `docs/plans/2026-02-12-methodology-layer-impl.md` — this is the implementation plan
2. **Execute using**: `superpowers:subagent-driven-development` skill — dispatch fresh subagent per task
3. **Implementation order**: Tasks 1-8 as written (merge → types → pipeline → knowledge → progress → exports → bbq example → verify)
4. **After each task**: Run tests, commit, move to next
5. **After all tasks**: Run full test suite, rebuild dist, verify exports

## What NOT to Re-Read
- The interview coach repo — already analyzed, findings are in the design doc
- The Reddit thread — context captured in design doc motivation section
- `packages/core/src/types/public-api.ts` — exact changes are in the plan
- `packages/core/src/mcp/tools.ts` — exact changes are in the plan

## Critical Reminders
- After modifying `packages/core/src/index.ts`, must rebuild: `cd packages/core && npx tsc`
- Test files use `.js` extensions in imports (ESM compliance)
- `createTestContext()` uses `authKeyHash` (not `authKey`)
- Tool names follow `{prefix}-{action}` pattern with `^[a-zA-Z0-9_-]{1,64}$`
- Utility files export a namespace object (e.g., `export const merge = { mergeAndPut }`) for the `utils/index.ts` barrel
