# travel-thin

The thinnest scaffold-core example: one real, public, no-auth API (Kiwi.com flight
search) wired through every piece of the core spine except a frozen Release.

| Part | Exercised as |
|---|---|
| Rubric | one entry: `kiwi/flight`, `class: reference`, `actionable: referral`, `compensationAvailable: false` |
| Offer + `toOffers` | `kiwiOfferSource.toOffers(kiwiResult)` — real Kiwi `search-flight` MCP result shape |
| Gate | `commitAction(store, caseId, { type: 'add_item', offerRef })` per offer |
| projectItems / View | `renderView(caseState, ALL_FLIGHTS_PRESET)` |
| Desk | `deskPayload(store, caseId, 0)` |
| Frozen release | not exercised here — see `examples/insurance-claim` |

## Run it (no API key needed)

```bash
npm install
npm run demo -w examples/travel-thin
```

This runs entirely against a committed, recorded sample Kiwi response
(`src/fixtures/kiwi-sample.ts`) — no network call, no credentials.

## Run it against the real Kiwi API

Kiwi's `search-flight` MCP (`https://mcp.kiwi.com`) is public and requires no API
key, so the only difference is a live network round trip:

```bash
npm run demo:live -w examples/travel-thin
```

## Tests

```bash
npm test -w examples/travel-thin
```

All tests run offline by default. One integration test exercises the real network
and is skipped unless explicitly opted into:

```bash
RUN_LIVE_KIWI=1 npx vitest run examples/travel-thin/test/kiwi-client.live.test.ts
```
