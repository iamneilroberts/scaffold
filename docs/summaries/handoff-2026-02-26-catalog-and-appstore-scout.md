# Session Handoff: App Store Scout + Scaffold Catalog

**Date:** 2026-02-26
**Session Focus:** Implement the App Store opportunity finder for the factory scout and the scaffold app catalog (MCP server + static site + CI)

## What Was Accomplished

1. **App Store Scout** (Part 1) — new data source for the factory scout that scans iTunes Search API for abandoned/failing iOS apps whose needs map to MCP tools
2. **Catalog Schema + Seed Data** (Part 2) — `AppEntry` type, seeded 5 existing apps into `catalog.json`
3. **MCP Discovery Server** (Part 3) — `examples/catalog-server/` with 4 tools (list, search, get, stats)
4. **Static Site Generator** (Part 4) — `tools/catalog-site/generate.ts` with dark theme, search, filter, copy-config buttons
5. **GitHub Actions Workflow** (Part 5) — `.github/workflows/catalog.yml` with loop prevention, site regeneration, KV sync

## Decisions Made This Session

- **App Store scout is opt-in** (`enabled: false` default): won't break existing factory runs — STATUS: confirmed
- **Single source of truth**: factory writes directly to `~/dev/scaffold/docs/catalog/catalog.json`, no copy/sync step — STATUS: confirmed
- **Agent analyzes, JS persists**: cache writes are JS-only with atomic temp+rename to prevent LLM-corrupted data — STATUS: confirmed
- **Deep merge for getConfig()**: fixed pre-existing shallow merge bug where user config overrides would lose new defaults like `appStore` — STATUS: confirmed
- **Catalog server is public** (`requireAuth: false`): discovery should be unauthenticated — STATUS: confirmed

## Files Created or Modified

| File Path | Action | Repo |
|-----------|--------|------|
| `clawd/factory/stages/app-store-scout.js` | Created | clawd |
| `clawd/factory/stages/scout.js` | Modified | clawd |
| `clawd/factory/store.js` | Modified | clawd |
| `clawd/factory/prompts/scout.md` | Modified | clawd |
| `clawd/commands/factory-handler.js` | Modified | clawd |
| `clawd/factory/APP-STORE-SCOUT.md` | Created | clawd |
| `examples/catalog-server/` (all files) | Created | scaffold |
| `docs/catalog/catalog.json` | Created | scaffold |
| `docs/catalog/index.html` | Generated | scaffold |
| `docs/catalog/apps/*/index.html` | Generated | scaffold |
| `tools/catalog-site/generate.ts` | Created | scaffold |
| `.github/workflows/catalog.yml` | Created | scaffold |
| `docs/guides/catalog.md` | Created | scaffold |

## What the NEXT Session Should Do

1. **Test the App Store scout end-to-end**: Enable in config (`scoutSources.appStore.enabled: true`), run `/scout appstore`, verify real opportunities come back
2. **Deploy catalog-server**: Create KV namespace, `wrangler deploy`, load catalog data
3. **Enable GitHub Pages**: Point at `docs/catalog/` directory on master branch
4. **Configure GitHub secrets**: `CF_API_TOKEN` and `CATALOG_KV_ID` for the CI workflow
5. **Wire factory publish stage**: When a factory cycle completes, call `publishToCatalog()` + git commit/push to scaffold repo
6. **Run end-to-end test**: Complete a full factory cycle with App Store source, verify the app appears in both catalog and static site
7. **Fix tool naming**: notes-app, travel-planner, and local-guide use colon-separated tool names that violate Claude remote MCP regex (`^[a-zA-Z0-9_-]{1,64}$`). Either update the source apps or the catalog entries.

## Open Questions Requiring User Input

- [ ] Should the catalog-server `wrangler.toml` get a real KV namespace ID? — needs Cloudflare dashboard
- [ ] Should the colon-style tool names in older apps (notes:save, trip:create) be migrated to hyphens? — impacts deployed apps
- [ ] Is the GitHub repo `neilopet/scaffold`? The `sourceUrl` fields in catalog.json assume this — verify

## What NOT to Re-Read

- All factory source files (scout.js, store.js, etc.) — already summarized above and in `APP-STORE-SCOUT.md`
- The scaffold example app patterns — already analyzed and followed in catalog-server
