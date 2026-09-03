// Types for the Kiwi.com `search-flight` MCP tool at https://mcp.kiwi.com (public,
// no-auth). This is the tool's own structuredContent shape — not a scaffold-core type.

export interface KiwiRawSegment {
  from: string;
  to: string;
  fromCity?: string;
  toCity?: string;
  departureTime?: string;
  arrivalTime?: string;
  durationSeconds?: number;
  carrier?: string;
  flightNumber?: string;
  cabinClass?: string;
}

export interface KiwiRawLeg {
  from: string;
  to: string;
  departureTime?: string;
  arrivalTime?: string;
  durationSeconds?: number;
  stops?: number;
  route?: string[];
  cabinClass?: string;
  segments?: KiwiRawSegment[];
}

export interface KiwiRawItinerary {
  id: string;
  price: number;
  priceFormatted?: string;
  totalDurationSeconds?: number;
  bookingUrl?: string;
  outbound?: KiwiRawLeg;
  inbound?: KiwiRawLeg | null;
}

export interface KiwiSearchFlightResult {
  query?: string;
  currency?: string;
  passengers?: { adults?: number; children?: number; infants?: number };
  resultsCount?: number;
  itineraries?: KiwiRawItinerary[];
  searchTimeMs?: number;
}

export interface KiwiFlightSearchRequest {
  flyFrom: string;
  flyTo: string;
  departureDate: string; // YYYY-MM-DD
  returnDate?: string;   // YYYY-MM-DD
  adults?: number;
}
