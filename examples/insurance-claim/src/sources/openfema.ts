import { mintOfferRef, actionableFor } from '@scaffold/core';
import type { Offer, OfferSource } from '@scaffold/core';
import { CLAIM_RUBRIC } from '../rubric.js';

export interface OpenFemaDeclaration {
  disasterNumber: number; state: string; declarationType: string; declarationDate: string;
  incidentType: string; designatedArea: string; incidentBeginDate: string; incidentEndDate?: string;
  ihProgramDeclared?: boolean; iaProgramDeclared?: boolean;
}
export interface OpenFemaResponse { DisasterDeclarationsSummaries: OpenFemaDeclaration[]; }

// The claim context a declaration must actually match before it can be treated as the
// coverage basis — otherwise a same-county declaration from an unrelated year or peril
// would get presented as justification for a claim it has nothing to do with.
export interface OpenFemaClaimContext {
  lossDate: string;
  incidentType?: string;
}

// OData string literals are single-quoted; a literal single quote inside one is escaped by
// doubling it (' -> ''), per the OData spec. Without this, a value containing a quote (e.g.
// the real county "Prince George's") breaks the filter syntax, and a crafted value can inject
// OData and widen/alter the query.
function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

export function buildOpenFemaFilter(state: string, designatedArea: string): string {
  return `state eq '${escapeODataString(state)}' and designatedArea eq '${escapeODataString(designatedArea)}'`;
}

export async function fetchOpenFemaDeclarations(state: string, designatedArea: string): Promise<OpenFemaResponse> {
  const url = new URL('https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries');
  url.searchParams.set('$filter', buildOpenFemaFilter(state, designatedArea));
  url.searchParams.set('$format', 'json');
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`OpenFEMA request failed: ${res.status}`);
  return res.json();
}

function declarationCoversLoss(d: OpenFemaDeclaration, context: OpenFemaClaimContext): boolean {
  const loss = new Date(context.lossDate).getTime();
  // Fail closed: a missing/malformed loss date must never fall through to a NaN comparison
  // (NaN < x and NaN > x are both false, which would let every declaration match). Badge
  // nothing rather than badge an unrelated disaster as this claim's coverage basis.
  if (Number.isNaN(loss)) return false;
  const begin = new Date(d.incidentBeginDate).getTime();
  if (Number.isNaN(begin)) return false;
  const end = d.incidentEndDate ? new Date(d.incidentEndDate).getTime() : Date.now();
  if (Number.isNaN(end)) return false;
  if (loss < begin || loss > end) return false;
  if (context.incidentType && context.incidentType !== d.incidentType) return false;
  return true;
}

// Declarations whose incident window doesn't contain the claim's loss date (or whose peril
// doesn't match, when incidentType is given) are dropped entirely — they must never be
// presented as the coverage basis for this claim.
export function toOpenFemaOffers(raw: OpenFemaResponse, context: OpenFemaClaimContext): Offer[] {
  const actionable = actionableFor(CLAIM_RUBRIC, 'openfema');
  return raw.DisasterDeclarationsSummaries
    .filter((d) => declarationCoversLoss(d, context))
    .map((d) => ({
      offerRef: mintOfferRef(),
      product: { title: `FEMA Disaster DR-${d.disasterNumber} — ${d.incidentType}`, subtitle: d.designatedArea },
      source: 'openfema',
      productType: 'coverage-basis',
      actionable,
      price: { total: null, currency: 'USD' },
      economics: { compensation: null, endUserPrice: null },
      attributes: {
        disasterNumber: d.disasterNumber, declarationDate: d.declarationDate,
        incidentType: d.incidentType, designatedArea: d.designatedArea, state: d.state,
      },
      badges: ['covered-peril'],
      links: { verify: `https://www.fema.gov/disaster/${d.disasterNumber}` },
      quotedAt: new Date().toISOString(),
      section: 'coverage-basis',
      raw: d,
    }));
}

export const openFemaSource: OfferSource<{ declarations: OpenFemaResponse; context: OpenFemaClaimContext }> = {
  source: 'openfema',
  toOffers: (raw) => toOpenFemaOffers(raw.declarations, raw.context),
};
