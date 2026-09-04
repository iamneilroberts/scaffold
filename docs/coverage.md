# Example coverage matrix

Which of the six core-spine parts (Rubric, Offer + `toOffers`, Gate, projectItems / View, frozen
Release, Desk) each example exercises. A cell is only checked when there's a real test covering it
— see each example's own README for the specifics and file references.

> This table is scaffolded incrementally, one row per example plan. The `core`, `travel-thin`, and
> `chef-weekly-order` rows are filled in by their own plans; only `insurance-claim` is recorded here
> so far.

| Example | Rubric | Offer + `toOffers` | Gate | projectItems / View | Frozen release | Desk |
|---|---|---|---|---|---|---|
| insurance-claim | ✅ | ✅ (contractor-estimate + BLS PPI + OpenFEMA) | ✅ (coverage-basis freeze / none-actionable state cap) | ✅ (insurer/homeowner/contractor masks) | ✅ **HEADLINE** (submitClaim freeze + supplemental = new Release) | ✅ (claimed/approved/gap money bar) |
