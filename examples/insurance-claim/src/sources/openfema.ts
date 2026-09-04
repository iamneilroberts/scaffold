import { mintOfferRef, actionableFor } from '@scaffold/core';
import type { Offer, OfferSource } from '@scaffold/core';
import { CLAIM_RUBRIC } from '../rubric.js';

export interface OpenFemaDeclaration {
  disasterNumber: number; state: string; declarationType: string; declarationDate: string;
  incidentType: string; designatedArea: string; incidentBeginDate: string; incidentEndDate?: string;
  ihProgramDeclared?: boolean; iaProgramDeclared?: boolean;
}
export interface OpenFemaResponse { DisasterDeclarationsSummaries: OpenFemaDeclaration[]; }

export async function fetchOpenFemaDeclarations(state: string, designatedArea: string): Promise<OpenFemaResponse> {
  const url = new URL('https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries');
  url.searchParams.set('$filter', `state eq '${state}' and designatedArea eq '${designatedArea}'`);
  url.searchParams.set('$format', 'json');
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`OpenFEMA request failed: ${res.status}`);
  return res.json();
}

export function toOpenFemaOffers(raw: OpenFemaResponse): Offer[] {
  const actionable = actionableFor(CLAIM_RUBRIC, 'openfema');
  return raw.DisasterDeclarationsSummaries.map((d) => ({
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

export const openFemaSource: OfferSource<OpenFemaResponse> = {
  source: 'openfema',
  toOffers: toOpenFemaOffers,
};
