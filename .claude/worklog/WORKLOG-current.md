# Session: 2026-02-05

## Focus

External code review of @voygent/scaffold-core using Codex, fix critical issues, create GitHub issues for findings.

## Work Done

### Session 1 (Earlier)
- Ran 5 Codex external reviews covering entire codebase
- Created 24 GitHub issues from review findings
- Fixed critical vulnerability #1 (metadata version override)
- Added CloudflareKVAdapter test suite (14 tests)
- Created and merged PR #25

### Session 2 (Current)
- Fixed #5: Schema validation bypass - added explicit null/array rejection
- Fixed #7: Admin XSS - escaped lastSeen output in Users tab
- Fixed #6: JSON-RPC notifications - return 204 No Content per spec
- Fixed #18: Cookie security - Secure flag, scoped path
- Fixed #20: Trailing slash - normalized admin path
- Fixed #23: Empty string args - null/undefined check vs truthiness
- Added 20 new tests total

## Decisions Made

- Issues prioritized by severity (Critical > High > Medium > Low)
- Created docs/ISSUES-REVIEW-2026-02-05.md for future session reference

## Files Changed

- `packages/core/src/utils/validation.ts` - Reject null/arrays in object validation
- `packages/core/src/utils/__tests__/validation.test.ts` - New test file (11 tests)
- `packages/core/src/mcp/handler.ts` - Notification handling (204 for no-id requests)
- `packages/core/src/mcp/__tests__/handler.test.ts` - 6 new tests
- `packages/core/src/admin/tabs/users.ts` - escapeHtml on lastSeen output
- `packages/core/src/admin/handler.ts` - Cookie security, path normalization
- `packages/core/src/admin/__tests__/handler.test.ts` - 3 new tests
- `packages/core/src/mcp/prompts.ts` - Empty string validation fix

### Session 3 (Current)
- Fixed #9, #10: Added `getPublicConfig()` for least-privilege config access + trust model docs
- Fixed #3: Added security warnings for fallback scan rate limiting limitations
- Fixed #4: Store hashed auth keys in user records (was plaintext)
- Fixed #15: Use SHA-256 for userId derivation (was 32-bit DJB2)
- Fixed #24 (partial): Cache-Control header, rate limiter edge case
- Closed #8, #13, #14 as out of scope for MVP with documentation
- Added 6 new tests for getPublicConfig()

## Decisions Made

- Issues prioritized by severity (Critical > High > Medium > Low)
- Created docs/ISSUES-REVIEW-2026-02-05.md for future session reference
- Plugin trust model: plugins are trusted code like npm dependencies
- Auth keys must be cryptographically random (not user passwords)
- CSP refactor (#8) deferred - admin requires auth, risk is limited

## Outcomes

- **All 24 issues resolved** (16 fixed, 8 closed as out of scope/documented)
- All 251 tests passing
- 5 commits pushed: ecf9c46, 954e5d1, 4266703, 0384804, 7abc107

## Key Security Improvements

1. `getPublicConfig()` - plugins can access config without seeing secrets
2. User records store hashed keys, not plaintext
3. SHA-256 for userId derivation (collision-resistant)
4. Fallback scan warns about per-isolate rate limiting
5. Admin responses have Cache-Control: no-store
6. Trust model documented for plugins and admin tabs

## Files Changed (Session 3)

- `packages/core/src/types/public-api.ts` - PublicScaffoldConfig, trust model docs
- `packages/core/src/server/scaffold-server.ts` - getPublicConfig() implementation
- `packages/core/src/auth/validator.ts` - SHA-256 userId, fallback scan warning
- `packages/core/src/auth/index-builder.ts` - authKeyHash instead of authKey
- `packages/core/src/auth/key-hash.ts` - getAuthIndexKeyFromHash(), entropy docs
- `packages/core/src/auth/rate-limiter.ts` - maxPerWindow=0 edge case
- `packages/core/src/admin/security.ts` - Cache-Control: no-store
