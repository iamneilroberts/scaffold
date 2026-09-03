// A recorded sample of the Kiwi.com `search-flight` MCP tool's structuredContent
// response. Field names, itinerary count, prices, carriers, and route mirror a
// real live capture; only the date portions are shifted relative to Date.now()
// so the fixture never silently expires into a past-date input (see repo rule:
// fixture dates must be relative, never hardcoded literals).
import type { KiwiSearchFlightResult } from '../kiwi-types.js';

export function dayFromNow(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
}

export function buildKiwiSampleResult(): KiwiSearchFlightResult {
  const dep = dayFromNow(45);
  const ret = dayFromNow(52);
  return {
    query: 'PNS -> YUL',
    currency: 'USD',
    passengers: { adults: 1, children: 0, infants: 0 },
    resultsCount: 2,
    searchTimeMs: 812,
    itineraries: [
      {
        id: 'itin_kiwi_sample_1',
        price: 214.5,
        priceFormatted: '$214.50',
        totalDurationSeconds: 19800,
        bookingUrl: 'https://www.kiwi.com/deep_booking/itin_kiwi_sample_1',
        outbound: {
          from: 'PNS', to: 'YUL',
          departureTime: `${dep}T06:15:00`,
          arrivalTime: `${dep}T11:40:00`,
          durationSeconds: 19500,
          stops: 1,
          route: ['PNS', 'ATL', 'YUL'],
          cabinClass: 'Economy',
          segments: [
            { from: 'PNS', to: 'ATL', fromCity: 'Pensacola', toCity: 'Atlanta',
              departureTime: `${dep}T06:15:00`, arrivalTime: `${dep}T08:05:00`,
              durationSeconds: 6600, carrier: 'DL', flightNumber: 'DL1532', cabinClass: 'Economy' },
            { from: 'ATL', to: 'YUL', fromCity: 'Atlanta', toCity: 'Montreal',
              departureTime: `${dep}T09:20:00`, arrivalTime: `${dep}T11:40:00`,
              durationSeconds: 8400, carrier: 'DL', flightNumber: 'DL2211', cabinClass: 'Economy' },
          ],
        },
        inbound: {
          from: 'YUL', to: 'PNS',
          departureTime: `${ret}T14:05:00`,
          arrivalTime: `${ret}T19:50:00`,
          durationSeconds: 20700,
          stops: 1,
          route: ['YUL', 'ATL', 'PNS'],
          cabinClass: 'Economy',
          segments: [
            { from: 'YUL', to: 'ATL', fromCity: 'Montreal', toCity: 'Atlanta',
              departureTime: `${ret}T14:05:00`, arrivalTime: `${ret}T16:10:00`,
              durationSeconds: 7500, carrier: 'DL', flightNumber: 'DL2244', cabinClass: 'Economy' },
            { from: 'ATL', to: 'PNS', fromCity: 'Atlanta', toCity: 'Pensacola',
              departureTime: `${ret}T17:35:00`, arrivalTime: `${ret}T19:50:00`,
              durationSeconds: 8100, carrier: 'DL', flightNumber: 'DL1487', cabinClass: 'Economy' },
          ],
        },
      },
      {
        id: 'itin_kiwi_sample_2',
        price: 189.0,
        priceFormatted: '$189.00',
        totalDurationSeconds: 14100,
        bookingUrl: 'https://www.kiwi.com/deep_booking/itin_kiwi_sample_2',
        outbound: {
          from: 'PNS', to: 'YUL',
          departureTime: `${dep}T13:05:00`,
          arrivalTime: `${dep}T17:00:00`,
          durationSeconds: 14100,
          stops: 0,
          route: ['PNS', 'YUL'],
          cabinClass: 'Economy',
          segments: [
            { from: 'PNS', to: 'YUL', fromCity: 'Pensacola', toCity: 'Montreal',
              departureTime: `${dep}T13:05:00`, arrivalTime: `${dep}T17:00:00`,
              durationSeconds: 14100, carrier: 'F9', flightNumber: 'F9812', cabinClass: 'Economy' },
          ],
        },
        inbound: null,
      },
    ],
  };
}
