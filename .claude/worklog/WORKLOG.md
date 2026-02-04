# Worklog Index

Entry point for session context. Read this file at the start of each session.

## Current Session

See [WORKLOG-current.md](./WORKLOG-current.md)

## Recent Sessions

| Date | Focus | Key Outcome |
|------|-------|-------------|
| 2026-02-04 12:30 | Worklog system setup | Designed and implemented automated worklog system |

## Key Decisions

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-04 | Store worklog in .claude/worklog/ | Keep organized with Claude config |
| 2026-02-04 | Claude-driven archiving | More control over content quality than shell scripts |
| 2026-02-04 | Hybrid end-of-session | Only log meaningful work, skip trivial Q&A |
| 2026-02-04 | Session journal not task tracking | TodoWrite handles tasks; worklog is historical record |

## Open Questions / Blockers

- (none currently)

## Archive

Browse older sessions in [archive/](./archive/)

---

## Worklog System Behavior

**On session start:**
1. Read this index for recent context
2. Check if WORKLOG-current.md is from a previous session
3. If so, archive it to `archive/WORKLOG_YYYYMMDD_HHMM.md`
4. Create fresh WORKLOG-current.md with new session header

**On session end:**
1. If meaningful work occurred, update WORKLOG-current.md
2. Update this index with one-line summary
3. Add key decisions to the table above

**Meaningful work includes:** code changes, design decisions, debugging findings, planning
**Skip logging for:** quick Q&A, simple lookups, no artifacts produced
