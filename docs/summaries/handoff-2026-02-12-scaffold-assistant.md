# Session Handoff: Scaffold Assistant Design

**Date:** 2026-02-12
**Session Focus:** Brainstorming and designing the scaffold-assistant skill, npm publishing, and domain expert guide

## What Was Accomplished

1. Audited the repo for newcomer readiness — identified 3 critical gaps (no npm publish, no scaffolding tool, no domain expert guide)
2. Brainstormed the solution through structured Q&A with Neil
3. Designed the full system: npm publish + scaffold-assistant skill + building-domain-experts guide
4. Wrote approved design doc → `docs/plans/2026-02-12-scaffold-assistant-design.md`

## Decisions Made This Session

- **Skill not CLI**: Claude Code itself is the scaffolding tool — STATUS: confirmed
- **Standalone projects**: Generated apps use `@scaffold/core` from npm, not monorepo — STATUS: confirmed
- **Structured interview**: 6 fixed questions (domain, entities, actions, relationships, knowledge, quality) — STATUS: confirmed
- **Hybrid knowledge**: Skill proposes topics, user chooses research vs. provide per-topic — STATUS: confirmed
- **Claude-only for v1**: Generate connector URL for Claude Web. ChatGPT deferred — STATUS: confirmed
- **Built-in web tools for scraping**: WebSearch + WebFetch, no Playwright in v1 — STATUS: confirmed
- **Runtime knowledge ingestion**: `{prefix}-learn` tool with propose/apply two-step flow — STATUS: confirmed
- **Guide as parallel path**: Guide teaches manually, skill automates, either works alone, skill can resume mid-guide — STATUS: confirmed
- **Approach C**: Full skill + full guide (not one or the other) — STATUS: confirmed

## Files Created or Modified

| File Path | Action | Description |
|-----------|--------|-------------|
| `docs/plans/2026-02-12-scaffold-assistant-design.md` | Created | Full approved design with all decisions, architecture, and implementation order |
| `docs/summaries/handoff-2026-02-12-scaffold-assistant.md` | Created | This handoff file |

## What the NEXT Session Should Do

1. **First**: Read `docs/plans/2026-02-12-scaffold-assistant-design.md` for full context
2. **Then**: Invoke the `writing-plans` skill to create a detailed implementation plan from the design
3. **Then**: Execute the implementation plan (subagent-driven or parallel session)

Implementation order is specified in the design doc:
1. Publish `@scaffold/core` to npm (prerequisite)
2. Build the scaffold-assistant skill (main deliverable)
3. Write the building-domain-experts guide

## Open Questions Requiring User Input

- [ ] npm scope — does Neil own `@scaffold` on npm? May need `scaffold-core` instead
- [ ] Skill install format — verify exact `.claude/commands/` structure for slash commands
- [ ] Learn tool image handling — verify chatbot clients pass extracted text to MCP tools

## What NOT to Re-Read

- `docs/plans/2026-02-12-methodology-layer-design.md` — already implemented, merged to master
- `docs/plans/2026-02-12-methodology-layer-impl.md` — already implemented, merged to master
- `docs/summaries/handoff-2026-02-12-methodology-layer.md` — previous session, work complete

## Prior Context

The methodology layer (quality gates, knowledge files, progress tracking, additive merge) was implemented and merged to master in the session before this one. That work is a prerequisite for the scaffold-assistant skill — the generated apps will use all four methodology techniques.
