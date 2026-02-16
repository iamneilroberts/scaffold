import type { Spot } from './types.js';

export interface ParsedContext {
  categories: string[];
  cities: string[];
  tags: string[];
  timeHints: string[];
}

// ── keyword maps ──────────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<string, string> = {
  lunch: 'restaurant',
  eat: 'restaurant',
  food: 'restaurant',
  restaurant: 'restaurant',
  dining: 'restaurant',
  dinner: 'restaurant',
  hike: 'hike',
  hiking: 'hike',
  trail: 'hike',
  walk: 'hike',
  photo: 'photo-op',
  photography: 'photo-op',
  scenic: 'photo-op',
  shop: 'shopping',
  shopping: 'shopping',
  market: 'shopping',
  museum: 'museum',
  gallery: 'museum',
  art: 'museum',
  'hot spring': 'hot-spring',
  pool: 'hot-spring',
  swim: 'hot-spring',
  waterfall: 'waterfall',
  beach: 'beach',
};

const TAG_KEYWORDS: Record<string, string> = {
  rainy: 'indoor',
  indoor: 'indoor',
  romantic: 'romantic',
  family: 'family',
  kids: 'family',
  budget: 'budget',
  cheap: 'budget',
  free: 'budget',
  luxury: 'luxury',
  splurge: 'luxury',
  foodie: 'foodie',
};

const TIME_KEYWORDS: Record<string, string> = {
  lunch: 'lunch',
  midday: 'lunch',
  dinner: 'dinner',
  evening: 'dinner',
  morning: 'morning',
  breakfast: 'morning',
  early: 'morning',
  'golden hour': 'golden-hour',
  sunset: 'golden-hour',
  'rainy day': 'rainy',
  rain: 'rainy',
};

// ── known non-city words (lowercase) ──────────────────────────

const NON_CITY_WORDS = new Set([
  // category keywords
  ...Object.keys(CATEGORY_KEYWORDS),
  // tag keywords
  ...Object.keys(TAG_KEYWORDS),
  // time keywords
  ...Object.keys(TIME_KEYWORDS),
  // common filler words
  'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'and',
  'or', 'is', 'are', 'was', 'be', 'near', 'around', 'best', 'good',
  'great', 'top', 'my', 'i', 'we', 'our', 'day', 'night', 'time',
  'place', 'spot', 'spots', 'thing', 'things', 'do', 'see', 'visit',
  'find', 'get', 'go', 'try', 'want', 'need', 'like', 'love',
  'south', 'north', 'east', 'west', 'coast', 'side', 'area', 'region',
  'somewhere', 'anything', 'something', 'what', 'where', 'when', 'how',
]);

// ── helpers ───────────────────────────────────────────────────

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function matchMultiWord(
  text: string,
  map: Record<string, string>,
): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  // Check multi-word keys first, then single-word
  const sorted = Object.keys(map).sort((a, b) => b.length - a.length);
  for (const key of sorted) {
    if (lower.includes(key)) {
      found.push(map[key]!);
    }
  }
  return unique(found);
}

// ── public API ────────────────────────────────────────────────

export function parseRecommendContext(context: string): ParsedContext {
  if (!context.trim()) {
    return { categories: [], cities: [], tags: [], timeHints: [] };
  }

  const categories = matchMultiWord(context, CATEGORY_KEYWORDS);
  const tags = matchMultiWord(context, TAG_KEYWORDS);
  const timeHints = matchMultiWord(context, TIME_KEYWORDS);

  // Extract cities: words starting with uppercase that aren't known keywords
  const words = context.split(/\s+/);
  const cities: string[] = [];
  for (const word of words) {
    const clean = word.replace(/[^a-zA-ZÀ-ÿ]/g, '');
    if (!clean) continue;
    // Must start with uppercase
    if (clean[0] !== clean[0]?.toUpperCase() || clean[0] === clean[0]?.toLowerCase()) continue;
    // Must not be a known keyword
    if (NON_CITY_WORDS.has(clean.toLowerCase())) continue;
    cities.push(clean);
  }

  return {
    categories: unique(categories),
    cities: unique(cities),
    tags: unique(tags),
    timeHints: unique(timeHints),
  };
}

export function scoreSpot(spot: Spot, parsed: ParsedContext): number {
  let score = 0;

  // +3 for category match
  if (parsed.categories.includes(spot.category)) {
    score += 3;
  }

  // +3 for city match
  if (parsed.cities.some((c) => c.toLowerCase() === spot.city.toLowerCase())) {
    score += 3;
  }

  // +2 per matching tag
  if (spot.tags) {
    for (const tag of spot.tags) {
      if (parsed.tags.includes(tag)) {
        score += 2;
      }
    }
  }

  // +1 for time hint match
  if (spot.bestTime && parsed.timeHints.some((h) => spot.bestTime!.toLowerCase().includes(h.toLowerCase()))) {
    score += 1;
  }

  // +1 for having tips
  if (spot.tips) {
    score += 1;
  }

  // +1 for having description > 100 chars
  if (spot.description.length > 100) {
    score += 1;
  }

  return score;
}

export function filterSpots(spots: Spot[], parsed: ParsedContext): Spot[] {
  const hasCategories = parsed.categories.length > 0;
  const hasCities = parsed.cities.length > 0;
  const hasTags = parsed.tags.length > 0;
  const hasTimeHints = parsed.timeHints.length > 0;

  // No filters → return all spots (sorted by score)
  if (!hasCategories && !hasCities && !hasTags && !hasTimeHints) {
    return [...spots].sort((a, b) => scoreSpot(b, parsed) - scoreSpot(a, parsed));
  }

  // OR logic: include if ANY filter matches
  const filtered = spots.filter((spot) => {
    if (hasCategories && parsed.categories.includes(spot.category)) return true;
    if (hasCities && parsed.cities.some((c) => c.toLowerCase() === spot.city.toLowerCase())) return true;
    if (hasTags && spot.tags?.some((t) => parsed.tags.includes(t))) return true;
    if (hasTimeHints && spot.bestTime && parsed.timeHints.some((h) => spot.bestTime!.toLowerCase().includes(h.toLowerCase()))) return true;
    return false;
  });

  return filtered.sort((a, b) => scoreSpot(b, parsed) - scoreSpot(a, parsed));
}

export function fuzzySearch(spots: Spot[], query: string): Spot[] {
  const q = query.toLowerCase();
  if (!q.trim()) return [];

  const matched = spots.filter((spot) => {
    const fields = [
      spot.name,
      spot.description,
      spot.city,
      spot.category,
      (spot.tags ?? []).join(' '),
    ];
    return fields.some((f) => f.toLowerCase().includes(q));
  });

  // Sort: name match first, then city match, then others
  return matched.sort((a, b) => {
    const aName = a.name.toLowerCase().includes(q) ? 0 : 1;
    const bName = b.name.toLowerCase().includes(q) ? 0 : 1;
    if (aName !== bName) return aName - bName;

    const aCity = a.city.toLowerCase().includes(q) ? 0 : 1;
    const bCity = b.city.toLowerCase().includes(q) ? 0 : 1;
    return aCity - bCity;
  });
}
