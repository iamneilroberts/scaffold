import { mintOfferRef, actionableFor } from '@scaffold/core';
import type { Offer, OfferSource } from '@scaffold/core';
import { CLAIM_RUBRIC } from '../rubric.js';

export const BLS_PPI_SERIES_ID = 'WPU0811'; // PPI Commodity: Lumber & wood products — Softwood lumber, 1982=100, NSA

export interface BlsPpiDataPoint {
  year: string; period: string; periodName: string; value: string;
  footnotes?: { code: string; text: string }[];
}
export interface BlsPpiSeriesResponse {
  status: string;
  Results: { series: { seriesID: string; data: BlsPpiDataPoint[] }[] };
}

export async function fetchBlsPpiSeries(
  seriesId: string = BLS_PPI_SERIES_ID,
  apiKey?: string,
): Promise<BlsPpiSeriesResponse> {
  const url = new URL(`https://api.bls.gov/publicAPI/v2/timeseries/data/${seriesId}`);
  if (apiKey) url.searchParams.set('registrationkey', apiKey);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`BLS PPI request failed: ${res.status}`);
  return res.json();
}

export function toBlsPpiOffers(raw: BlsPpiSeriesResponse): Offer[] {
  const series = raw.Results?.series?.[0];
  if (!series || series.data.length === 0) return [];
  const latest = series.data[0]; // BLS returns most-recent first
  const actionable = actionableFor(CLAIM_RUBRIC, 'bls-ppi');
  return [{
    offerRef: mintOfferRef(),
    product: {
      title: 'PPI — Softwood Lumber (materials cost trend)',
      subtitle: `${series.seriesID}, ${latest.periodName} ${latest.year}`,
    },
    source: 'bls-ppi',
    productType: 'claim-line',
    actionable,
    price: { total: null, unit: 'index (1982=100), not a $/unit price', currency: 'USD', incomplete: true },
    economics: { compensation: null, endUserPrice: null },
    attributes: { seriesId: series.seriesID, index: Number(latest.value), period: `${latest.year}-${latest.period}`, indexBase: '1982=100' },
    badges: ['materials-trend'],
    links: { verify: `https://beta.bls.gov/dataViewer/view/timeseries/${series.seriesID}` },
    quotedAt: new Date().toISOString(),
    section: 'materials-reference',
    raw: latest,
  }];
}

export const blsPpiSource: OfferSource<BlsPpiSeriesResponse> = {
  source: 'bls-ppi',
  toOffers: toBlsPpiOffers,
};
