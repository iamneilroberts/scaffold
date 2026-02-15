# Code Review Issues - 2026-02-05

External code review performed using Codex (OpenAI CLI agent) on @voygent/scaffold-core.

**Repository:** https://github.com/iamneilroberts/scaffold

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 1 | **Fixed** (#1) |
| High | 9 | Open |
| Medium | 13 | Open |
| Low | 1 | Open (collection) |

## Fixed Issues

| # | Title | Commit |
|---|-------|--------|
| 1 | [CRITICAL] Storage: User metadata can override version field | `80f47cb` |

## Open Issues by Priority

### High Severity (Fix First)

| # | Area | Issue | Notes |
|---|------|-------|-------|
| 2 | Storage | Optimistic locking not atomic on KV | Architectural - consider Durable Objects |
| 3 | Auth | Fallback scan rate limiting easily bypassed | Per-key in-memory limits ineffective |
| 4 | Auth | Plaintext auth keys stored in user records | Storage compromise = key leak |
| 5 | MCP | Schema validation bypass with null/arrays | **Quick fix** - input validation |
| 6 | MCP | JSON-RPC notifications incorrectly receive responses | Protocol violation |
| 7 | Admin | XSS vulnerability in Users tab | **Quick fix** - escape lastSeen |
| 8 | Admin | CSP uses unsafe-inline, effectively disabled | Larger refactor needed |
| 9 | Types | getConfig() exposes secrets to plugins | API design concern |
| 10 | Types | Admin tabs allow raw HTML/JS injection | Plugin trust boundary |

### Medium Severity

| # | Area | Issue |
|---|------|-------|
| 11 | Storage | getWithVersion defaults to version '1' when metadata missing |
| 12 | Storage | InMemoryAdapter returns object references |
| 13 | Auth | Unsalted SHA-256 for index keys |
| 14 | Auth | Constant-time comparison has timing leaks |
| 15 | Auth | DJB2 userId derivation is collision-prone |
| 16 | MCP | Error details leaked to clients |
| 17 | MCP | logging/setLevel is unauthenticated |
| 18 | Admin | Auth cookie security issues |
| 19 | Admin | Logout doesn't clear cookie, key in sessionStorage |
| 20 | Admin | Path handling breaks with trailing slash |
| 21 | Types | ToolContent not a discriminated union |
| 22 | Types | AuthResult allows invalid states |
| 23 | MCP | Required prompt arguments reject empty strings |

### Low Severity

| # | Issue |
|---|-------|
| 24 | Collection of low-severity issues (see issue for details) |

## Recommended Fix Order

### Quick Wins (start here)
1. **#5** - Schema validation bypass (high impact, simple fix)
2. **#7** - Admin XSS fix (high impact, simple fix)
3. **#20** - Trailing slash bug (medium, simple fix)
4. **#23** - Empty string prompt args (medium, simple fix)

### Security Hardening
5. **#6** - JSON-RPC notification handling
6. **#16** - Error detail leakage
7. **#17** - logging/setLevel auth
8. **#18** - Cookie security
9. **#19** - Logout/sessionStorage

### Larger Refactors
10. **#8** - CSP overhaul (move to nonces/external assets)
11. **#21, #22** - Type system improvements

### Architectural Decisions Needed
- **#2** - KV atomicity (Durable Objects?)
- **#3** - Distributed rate limiting
- **#4** - Key storage strategy
- **#9, #10** - Plugin trust model

## Links

- [All Issues](https://github.com/iamneilroberts/scaffold/issues)
- [PR #25](https://github.com/iamneilroberts/scaffold/pull/25) - Critical fix merged
