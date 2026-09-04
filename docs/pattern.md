# The pattern

`@scaffold/core` is a small set of composable types and pure functions — not a runtime that owns your
app. It is the spine an AI-assisted expert tool needs to turn messy source data into a provable,
actionable deliverable, in six parts.

Every symbol named below is exported from the single barrel `@scaffold/core` and unit-tested in
`packages/core`.

## Part 1 — Rubric

A static, hand-maintained table: the single authority for what each *source* is and how it can be
acted on. Not a database — a typed array the domain author curates.

```ts
interface RubricEntry {
  source: string;                 // "kiwi", "usda-fdc", "openfema", ...
  productType: string;            // domain-defined
  class: 'actionable' | 'reference';
  actionable: 'managed' | 'referral' | 'none';
  quoteTtlMinutes: number;
  compensationAvailable: boolean;
  markupCapable: boolean;
  reachable: boolean;
}
```

Accessors are pure functions over a passed-in `RubricEntry[]` (the rubric is not a global):
`rubricFor`, `actionableFor` (defaults `'none'` for an unknown source), `compensationAvailableFor`,
`quoteTtlMinutesFor`. Look sources up by their `source` key — that is what keeps the classification
stable.

## Part 2 — Offer + offerRef

The uniform row every source normalizes to, and the adapter contract that produces it.

```ts
interface Offer {
  offerRef: string;               // opaque, minted `ofr_<rand>` — leaks nothing about the source
  productType: string;
  product: { title: string; subtitle?: string };
  source: string;
  actionable: 'managed' | 'referral' | 'none';   // copied from the Rubric at mint time, never model-typed
  price: { total: number | null; unit?: string; currency: string; incomplete?: boolean };
  economics: { compensation: Compensation | null; endUserPrice: number | null };
  attributes?: Record<string, unknown>;
  links?: { action?: string; verify?: string; detail?: string };
  section: string;
  // ...
}

interface OfferSource<Raw> { source: string; toOffers(raw: Raw): Offer[]; }
```

`toOffers` is the *only* place domain data touches the system. `mintOfferRef()` returns an opaque
`ofr_<rand>` — the ref leaks nothing about the source.

## Part 3 — the Gate (one write path)

Every mutation to a Case goes through the Gate. Nothing writes Case state directly.

- `applyAction(caseState, action, resolve)` is pure: validate → apply → stamp. `commitAction(store,
  caseId, action)` is the store-bound wrapper: read → applyAction → persist → append a Desk event.
- `add_item` accepts **only an `offerRef`**: the Gate resolves it to the stored Offer and **freezes
  the Offer's economics + actionable class + price into the item's stamp** — the price and basis at
  commit time are preserved. `add_item_unverified` is the escape hatch: it carries no compensation
  and is flagged.
- **State cap by actionable class:** `none` ≤ recommended · `referral` ≤ confirmed · `managed` = full
  funnel. A reference-only source can justify but can never be marked "confirmed work". A capped
  transition is rejected (`persist: false`, case unchanged) — not thrown, not silently clamped.
- `INVALIDATIONS` is a data-driven map from each action type to the derived views it invalidates.

The `chef` example proves this cap alone expresses an approved-source refusal — no domain allow-list
needed.

## Part 4 — projections + presets

Derived views are pure functions recomputed per read, never written back.

- `projectItems(caseState)` collapses the same underlying thing quoted by multiple sources into one
  item (dedupe on `offerRef`, merge on an optional `identityKey`), promoting to the strongest funnel
  state.
- `renderView(caseState, preset)` applies a named `ViewPreset` mask. `showCompensation: false` strips
  the expert's compensation from the output; `priceDisplayMode` chooses full / end-user / hidden
  price. One Case → N audience views. **The mask is the core's job** — a host should not re-mask on
  top of `renderView`, or a core regression would go unnoticed.

## Part 5 — frozen release

A versioned, immutable publication. Republish = a new release; nothing is mutated in place.

```ts
interface Release {
  publicationId: string;          // rel_<rand>
  caseId: string;
  createdAt: string;
  itemSet: Item[];                // exact items at publish time, compensation masked
  observedQuotes: Record<string, QuoteSnapshot>;   // per-item price + basis as observed (pre-mask)
  render: string;
  versions: { schema: string; rubric: string };
  contentHash: string;            // over itemSet + observedQuotes + versions (excludes id/timestamp)
}
```

`freezeRelease(caseState, render, versions)` is pure and masks compensation in the frozen `itemSet`;
`observedQuotes` preserves each line's observed basis (read before masking). A `KVStore`-backed
`putRelease`/`listReleases` pair persists and lists them. Because `contentHash` excludes the id and
timestamp, two freezes of genuinely different content hash differently while two freezes of identical
content do not — so "this is a different submission" is a real content claim. The `insurance` example
is built on this: a submitted claim freezes a `Release`; a supplemental claim is a **new** one.

## Part 6 — Desk (live external page)

A token-authed external page the end-user (or a second expert) watches while the Case is assembled.

- `deskPayload(store, caseId, since)` → `{ summary, offers, events, metrics, maxSeq }`. `summary`,
  `offers`, `metrics` are sent in full each poll (cheap reads); `events` is a true delta (`seq >
  since`).
- `metrics` is the generic "money bar" — the domain fills it (quoted/committed/paid, or
  claimed/approved/gap) via `setDeskMetrics`.
- `deskShellHtml(caseId)` is a static reference HTML shell (caseId is escaped — it is expected to be a
  URL path param). The host wires auth and storage.

## Storage

The core defines a minimal `KVStore` interface (`get`/`put`/`list` over string keys, JSON values) and
ships an in-memory `createMemoryStore()`. It never imports a concrete store — an example can run on
Cloudflare KV, SQLite, or the in-memory map.

## Adapting to a new domain

The core carries **zero domain words**. A new domain is built entirely in `examples/<domain>/` by
supplying data, not by forking the spine.

**You write (per domain):**

1. **A Rubric** — one `RubricEntry` per source.
2. **One `OfferSource` per feed** — a `toOffers(raw)` that normalizes the source to the uniform
   `Offer` (reading `actionable`/`compensationAvailable` from the Rubric by source, never hardcoded).
3. **View presets** — the named masks your audiences need.
4. **The money-bar labels** — what `metrics` your Desk shows.

**You reuse unchanged:** the Gate (`commitAction`/`applyAction` + the state cap + the stamp freeze),
projections (`projectItems`/`renderView`), frozen release (`freezeRelease`/`listReleases`), and the
Desk contract. The three example domains prove it — a `flight`, an `ingredient`, and a `claim-line`
all flow through byte-identical core code. If a domain needs behavior the spine can't express, that
is a **core gap to flag**, not a per-domain fork.
