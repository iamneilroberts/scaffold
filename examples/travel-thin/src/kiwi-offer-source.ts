import type { Offer, OfferSource } from '@scaffold/core';
import { mintOfferRef, actionableFor } from '@scaffold/core';
import { TRAVEL_THIN_RUBRIC } from './rubric.js';
import type { KiwiRawItinerary, KiwiSearchFlightResult } from './kiwi-types.js';

function routeTitle(it: KiwiRawItinerary): string {
  if (it.outbound?.from && it.outbound?.to) return `${it.outbound.from} → ${it.outbound.to}`;
  return 'Flight';
}

function stops(it: KiwiRawItinerary): number {
  if (typeof it.outbound?.stops === 'number') return it.outbound.stops;
  const segs = it.outbound?.segments?.length ?? 0;
  return segs > 0 ? segs - 1 : 0;
}

function subtitle(it: KiwiRawItinerary): string {
  const s = stops(it);
  const stopLabel = s === 0 ? 'Nonstop' : s === 1 ? '1 stop' : `${s} stops`;
  const tripLabel = it.inbound ? 'round trip' : 'one way';
  return `${stopLabel} · ${tripLabel}`;
}

export const kiwiOfferSource: OfferSource<KiwiSearchFlightResult> = {
  source: 'kiwi',
  toOffers(raw: KiwiSearchFlightResult): Offer[] {
    const currency = raw.currency ?? 'USD';
    const actionable = actionableFor(TRAVEL_THIN_RUBRIC, 'kiwi');
    const offers: Offer[] = [];

    for (const it of raw.itineraries ?? []) {
      if (!it || typeof it.id !== 'string' || !it.outbound) continue;

      offers.push({
        offerRef: mintOfferRef(),
        product: { title: routeTitle(it), subtitle: subtitle(it) },
        source: 'kiwi',
        productType: 'flight',
        actionable,
        price: {
          total: typeof it.price === 'number' ? it.price : null,
          unit: 'trip',
          currency,
        },
        economics: {
          // kiwi is a referral/reference source — it never pays the expert compensation
          compensation: null,
          endUserPrice: typeof it.price === 'number' ? it.price : null,
        },
        attributes: {
          stops: stops(it),
          durationMinutes: it.totalDurationSeconds ? Math.round(it.totalDurationSeconds / 60) : null,
          roundTrip: !!it.inbound,
        },
        links: it.bookingUrl ? { action: it.bookingUrl } : undefined,
        quotedAt: new Date().toISOString(),
        section: 'flights',
        raw: it,
      });
    }
    return offers;
  },
};
