# Worklog System Design

**Date**: 2026-02-04
**Status**: Implemented

## Overview

Automated worklog system for tracking session history and maintaining context across Claude Code sessions. Inspired by the memory-bank pattern from AAM project and centminmod/my-claude-code-setup.

## Purpose

- **Historical record**: What was worked on, decisions made, files changed
- **Context preservation**: Claude can read previous sessions to understand project state
- **Not task tracking**: TodoWrite handles in-session tasks; worklog is the journal

## File Structure

```
.claude/
  worklog/
    WORKLOG.md              # Index - entry point for Claude
    WORKLOG-current.md      # Active session journal
    archive/                # Timestamped archives
      WORKLOG_YYYYMMDD_HHMM.md
```

## Content Format

### WORKLOG.md (Index)

- Current session link
- Recent sessions table (date, focus, outcome)
- Key decisions table (date, decision, rationale)
- Open questions/blockers
- Link to archive folder
- Behavior instructions for Claude

### WORKLOG-current.md (Session)

- Session date/time header
- Focus (what this session is about)
- Work done (bullet list)
- Decisions made (with rationale)
- Files changed (paths + what changed)
- Outcomes achieved
- Next actions

## Hook Implementation

### PreToolUse Hook (Startup)

Triggers on first Read tool use. Outputs reminder for Claude to:
1. Read WORKLOG.md index
2. Check if WORKLOG-current.md is from previous session
3. Archive old session if needed
4. Create new session header

### Stop Hook (End)

Triggers when Claude finishes. Outputs reminder for Claude to:
1. Evaluate if meaningful work occurred
2. Update WORKLOG-current.md if yes
3. Update WORKLOG.md index
4. Skip if trivial session

## Claude Behavior

### On Session Start

1. Read `.claude/worklog/WORKLOG.md` for context
2. Check WORKLOG-current.md date
3. If from previous day/session, archive to `archive/WORKLOG_YYYYMMDD_HHMM.md`
4. Create fresh WORKLOG-current.md with new header

### On Session End

1. Evaluate: Was meaningful work done?
2. **Log if**: Code changes, design decisions, debugging findings, planning
3. **Skip if**: Quick Q&A, simple lookups, no artifacts
4. Update current file and index

## Configuration

Added to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Read",
        "hooks": [
          {
            "type": "command",
            "command": "echo '[WORKLOG] Session starting - read .claude/worklog/WORKLOG.md...'"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "echo '[WORKLOG] Session ending - if meaningful work was done, update worklog...'"
          }
        ]
      }
    ]
  }
}
```

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Store in `.claude/worklog/` | Organized with Claude config, not cluttering project root |
| Claude-driven archiving | Smarter than shell script - can evaluate content |
| Hybrid end behavior | Avoids cluttering worklog with trivial sessions |
| Session journal focus | Complements TodoWrite (tasks) with history (journal) |
| Hook reminders only | Lightweight hooks, Claude handles logic |

## Future Enhancements

- System state files (like AAM's progress.md, techContext.md)
- Auto-summarization of archived sessions
- Search across worklog history
