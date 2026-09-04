# Example coverage matrix

Which of the six core-spine parts (Rubric, Offer + `toOffers`, Gate, projectItems / View, frozen
Release, Desk) each example exercises. A cell is only checked when there's a real test covering it —
see each example's own README for the specifics and file references.

| Example | Rubric | Offer + `toOffers` | Gate | projectItems / View | Frozen release | Desk |
|---|---|---|---|---|---|---|
| `packages/core` | ✅ | ✅ (contract) | ✅ (stamp freeze, state cap, INVALIDATIONS) | ✅ (dedupe, masking) | ✅ (freeze + content hash) | ✅ (hybrid poll) |
| [`travel-thin`](../examples/travel-thin) | ✅ | ✅ (Kiwi) | ✅ (add_item / commit) | basic | — | ✅ |
| [`chef-weekly-order`](../examples/chef-weekly-order) | ✅ | ✅ (FDC + NASS + local-farm) | ✅ (**approved-source refusal** via state cap) | ✅ (provenance mask) | ✅ (order-cycle snapshot) | ✅ (planned/ordered/received) |
| [`insurance-claim`](../examples/insurance-claim) | ✅ | ✅ (contractor-estimate + BLS PPI + OpenFEMA) | ✅ (coverage-basis none-actionable cap) | ✅ (insurer/homeowner/contractor masks) | ✅ **HEADLINE** (submitClaim freeze + supplemental = new Release) | ✅ (claimed/approved/gap) |

Notes:

- `packages/core` is the library itself — every part is implemented and unit-tested in
  `packages/core/*.test.ts`; the example rows show each part exercised in a real domain.
- Every part is exercised by at least two example domains. **Frozen release** is carried primarily by
  `insurance-claim` (its headline) and secondarily by `chef-weekly-order` (a weekly-cycle snapshot);
  `travel-thin` is deliberately thin and does not exercise it.
- Each example is keyless/offline by default (committed fixtures); the live-API path is behind an
  opt-in env flag documented in that example's README.
