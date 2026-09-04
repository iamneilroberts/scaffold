# Provenance

This pattern was extracted from **Voygent**, a production AI-assisted travel-advisor product. The
architecture here is a clean, generic re-authoring of the spine that product uses — not a copy of it.

There is **no code link, no import, and no extraction tooling** between this repo and Voygent. Nothing
in `@scaffold/core` depends on, embeds, or reproduces any Voygent source. The core was hand-authored
against the *shape* of the proven pattern, then verified by the three example domains — which is why
the examples, not any claim about Voygent internals, are what this repo's honesty rests on.

## Where each part was hardened

Each of the six parts earned its shape in a real product before being generalized here:

- **Rubric** — the discipline of a single hand-curated source-of-truth table for what each supplier is
  and how it may be acted on, rather than scattering that judgment across call sites.
- **Offer + `offerRef`** — normalizing every heterogeneous supplier response to one uniform row, and
  minting an opaque reference so nothing downstream depends on a supplier's own id shape.
- **The Gate** — routing every mutation through one write path, freezing an offer's economics into the
  committed item, and capping how far an item can advance by how actionable its source really is.
- **Projections + presets** — deriving audience-specific views by pure recomputation, and masking the
  expert's compensation from end-user surfaces as a property of the view, not a field someone
  remembers to blank out.
- **Frozen release** — treating a published deliverable as an immutable, versioned snapshot, so "what
  was published, and when" is always answerable and a revision is a new release rather than an edit.
- **Desk** — a live external page fed by a cheap hybrid poll, so a second party can watch a case being
  assembled in real time.

## What is deliberately absent

The parts of the real product that constitute its moat are **not** here and are not described in
detail: the supplier adapters and their credentials, the operating-core prompts, the curation and
ranking rules, and the supplier-integration protocols. A real business supplies those privately behind
the `OfferSource` contract. This repo is the generic architecture; the business is not.
