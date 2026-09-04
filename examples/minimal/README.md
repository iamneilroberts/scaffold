# minimal

The smallest possible `@scaffold/core` domain — copy this directory to start your own.

One source (`catalog`), one product type (`widget`), one test that runs the full
mandatory call sequence: `newCase` → `putCase` → `stageOffers` → `commitAction(add_item)`
→ assert the item's frozen stamp. No API, no fixtures, no live path — see
`examples/travel-thin` (or `chef-weekly-order`, `insurance-claim`) for a real-API,
fuller-coverage example once you've copied this skeleton.

| File | What it is |
|---|---|
| `src/rubric.ts` | one `RubricEntry`: `catalog/widget`, `actionable: 'referral'` |
| `src/offer-source.ts` | one `OfferSource<RawWidget[]>` — `toOffers` normalizes a raw array to `Offer[]` |
| `test/minimal.test.ts` | stage → commit → assert, plus the "never staged" failure case |

## Run it

```bash
npm install
npm test -w examples/minimal
```

## Copying this to your own domain

1. Rename `catalog` (source) and `widget` (productType) in `src/rubric.ts` and
   `src/offer-source.ts` to your own.
2. Replace `RawWidget` with your real feed's shape, and `toOffers` with your real
   normalization.
3. Everything else — the Gate, projections, frozen release, Desk — is reused unchanged.
   See [docs/pattern.md § Adapting to a new domain](../../docs/pattern.md#adapting-to-a-new-domain).
