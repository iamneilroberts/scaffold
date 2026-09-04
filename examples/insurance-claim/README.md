# examples/insurance-claim

Case = one property's claim + rebuild. Expert = public adjuster / contractor-advocate.

Three real `OfferSource`s:
- **contractor-estimate** — a bid parser producing `managed` claim-line Offers. Compensation is
  `{ kind: 'pct_of_recovery', amount: null, basis: '10% of approved recovery, paid at settlement' }`
  — a percentage-of-recovery fee, not a per-booking commission.
- **BLS Producer Price Index API** (`WPU0811`, Softwood Lumber, no auth) — a `referral` materials
  cost-trend reference. PPI values are an index, not a $/unit price; this adapter is honest about
  that (`price.total: null`, the index parked in `attributes.index`).
- **OpenFEMA DisasterDeclarationsSummaries API** (no auth) — a `none`-actionable, never-bought
  reference that justifies the claim's covered peril for the property's county and date.

| Part | Exercised as |
|---|---|
| Rubric | `CLAIM_RUBRIC` — 3 entries (`contractor-estimate`, `bls-ppi`, `openfema`), each with a distinct `class`/`actionable` |
| Offer + `toOffers` | `toContractorOffers` / `toBlsPpiOffers` / `toOpenFemaOffers` against real API/bid response shapes |
| Gate | `commitAction` via `addClaimLine` / `transition_item`; a `none`-actionable coverage-basis item is capped at `recommended` and cannot reach `confirmed` |
| projectItems / View | `renderClaimView` with `INSURER_VIEW` / `HOMEOWNER_VIEW` (compensation masked) and `CONTRACTOR_VIEW` (compensation shown); `replace_item` dedupes a revised contractor bid |
| Frozen release | `submitClaim` freezes a `Release` (line set + observed quotes + content hash); a supplemental claim is a **new** `Release`, and `listClaimReleases` returns both — **headline** |
| Desk | `getClaimDeskPayload` publishes claimed/approved/gap money-bar metrics via the core `setDeskMetrics`/`deskPayload` contract |

A claim submission calls `submitClaim`, which freezes a `Release`: the exact line set, each line's
observed quote, and a content hash. A supplemental claim (new damage found later) is a **new**
`Release`, never an edit to the first — `listClaimReleases` returns both.

## Run it (offline by default)

```bash
npm install
npx vitest run examples/insurance-claim
```

Every test runs entirely against committed fixtures (`src/fixtures/`) — no network calls, no
secrets.

## Run it against the real APIs

```bash
RUN_LIVE_APIS=1 npx vitest run examples/insurance-claim/test/sources.bls-ppi.integration.test.ts examples/insurance-claim/test/sources.openfema.integration.test.ts
```

Both APIs are keyless; no `.env` is required.

## Honest caveats

- The BLS PPI series (`WPU0811`) is a materials-cost **trend/index** (base 1982=100), not a
  literal $/unit price — the adapter surfaces it as `price.total: null` with the index value in
  `attributes.index` rather than inventing a dollar figure.
- The contractor-estimate source's `pct_of_recovery` compensation has `amount: null` — it's a fee
  structure (10% of approved recovery, paid at settlement), not a fixed commission number.
- The demo and test suite run against recorded fixtures by default; the live-API path
  (`RUN_LIVE_APIS=1`) is opt-in and only covers the two keyless reference sources (BLS, OpenFEMA).
