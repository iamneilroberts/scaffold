# chef-weekly-order

A weekly meal-plan/order-cycle example built on `@scaffold/core`. Two real USDA APIs feed the
Rubric-classified Offer sources: **FoodData Central** (ingredient identity/nutrition) and
**NASS Quick Stats** (commodity spot-market prices). A hand-curated approved-vendor list supplies
the contrasting `managed` source.

## Run it (no API keys needed)

```bash
npm install
npx vitest run examples/chef-weekly-order
npm run demo -w chef-weekly-order
```

Every test and the demo run entirely against recorded sample responses committed under
`test/fixtures/` — no network calls, no secrets.

## Run against the real APIs (optional)

1. Get a free FDC key: https://fdc.nal.usda.gov/api-key-signup.html
2. Get a free NASS key: https://quickstats.nass.usda.gov/api
3. Run:
   ```bash
   CHEF_LIVE=1 FDC_API_KEY=... NASS_API_KEY=... npx vitest run examples/chef-weekly-order/test/integration.live.test.ts
   ```

## What this proves

- The Gate refuses to confirm an order line sourced from a reference-only (`none`-actionable) price —
  see `test/order-cycle.test.ts`. The guest-facing "local Gulf shrimp" claim is a View **projection**
  of that confirmed provenance, never typed copy — see `test/views.test.ts`.
- Each weekly cycle freezes to an immutable `Release` via `freezeRelease`, with compensation masked —
  see `test/release.test.ts`.
- The Desk money bar (planned/ordered/received) is published through the core `setDeskMetrics` contract
  and read back via `deskPayload` — see `test/desk-metrics.test.ts` and `test/desk-payload.test.ts`.
