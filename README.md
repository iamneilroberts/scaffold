# scaffold

A small, generic **"Expert Workbench" core**: the reusable spine an AI-assisted expert tool needs to
turn messy source data into a provable, actionable deliverable. Travel words appear nowhere in the
core — it is domain-agnostic types + pure functions + one write path + one poll contract.

The pattern was extracted from a production travel-advisor product ([provenance](docs/provenance.md)),
but the core carries none of that business. You bring the domain; the core gives you the spine.

## The six-part spine

`packages/core` (published as `@scaffold/core`) is a library, not a framework. It is six small parts —
see [docs/pattern.md](docs/pattern.md) for the full writeup:

1. **Rubric** — a hand-curated table: the single authority for what each *source* is and how it may be acted on.
2. **Offer + `offerRef`** — the uniform row every source normalizes to (`toOffers`), plus an opaque minted ref.
3. **Gate** — the one write path. Every mutation goes through `applyAction`/`commitAction`; it freezes an offer's economics + actionable class into the item's stamp and enforces a state cap by actionable class.
4. **Projections + presets** — `projectItems` + `renderView`: derived audience views, recomputed per read, that mask compensation for end-user surfaces.
5. **Frozen release** — `freezeRelease`: a versioned, immutable publication. Republish = a new release; nothing is mutated in place.
6. **Desk** — a token-authed live external page contract (`deskPayload` hybrid poll + a reference HTML shell).

Plus a tiny `KVStore` interface (with an in-memory reference impl) so the core never imports a
concrete store.

## Three worked examples — each with a real public API

Every example runs the full spine in a real domain, keyless by default (against committed recorded
fixtures), with a live path behind an opt-in env flag. See [docs/coverage.md](docs/coverage.md) for
which parts each exercises.

| Example | Domain | Real API |
|---|---|---|
| [`examples/travel-thin`](examples/travel-thin) | flight search | **Kiwi** (public, no-auth) |
| [`examples/chef-weekly-order`](examples/chef-weekly-order) | a restaurant's weekly order cycle | **USDA FoodData Central** + **USDA NASS Quick Stats** |
| [`examples/insurance-claim`](examples/insurance-claim) | a property claim + rebuild | **OpenFEMA** + **BLS Producer Price Index** |

The examples are the proof: nothing in this repo is aspirational. `chef` proves the Gate's state cap
alone expresses an approved-source refusal (no domain allow-list); `insurance` is the frozen-release
headline (a submitted claim freezes an immutable `Release`; a supplemental claim is a new one).

## Run it

```bash
npm install
npm test
```

The default test run is fully offline — no network, no secrets. Each example's README documents its
opt-in live-API path.

- Node 20+, TypeScript (strict, ESM/NodeNext), tested with vitest.
- Monorepo via npm workspaces (`packages/*`, `examples/*`).

## Adapt it to your own domain

You write four things per domain; you reuse the whole spine unchanged. See
[docs/pattern.md § Adapting to a new domain](docs/pattern.md#adapting-to-a-new-domain).

## What stays out of the core

Adapters with credentials, operating-core prompts, curation rules, and supplier protocols are a
private business's moat — they are deliberately **not** here. This repo ships the *shape*; a real
product supplies the private feeds behind the `OfferSource` contract.
