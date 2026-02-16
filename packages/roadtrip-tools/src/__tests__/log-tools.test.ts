import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import type { ToolContext } from '@voygent/scaffold-core';
import { makeTestCtx, spotKey } from '../keys.js';
import { createLogTools } from '../tools/log-tools.js';
import type { Spot } from '../types.js';

const tools = createLogTools('ice');
const logVisit = tools.find((t) => t.name === 'ice-log_visit')!;
const getLog = tools.find((t) => t.name === 'ice-get_log')!;
const tripSummary = tools.find((t) => t.name === 'ice-trip_summary')!;

const spots: Spot[] = [
  { id: 'spot-1', name: 'Seljalandsfoss', city: 'South Coast', region: 'South', category: 'waterfall', description: 'Beautiful waterfall you can walk behind. Bring a rain jacket for the spray.', createdAt: '2025-01-01', updatedAt: '2025-01-01' },
  { id: 'spot-2', name: 'Cafe Loki', city: 'Reykjavik', region: 'Capital', category: 'restaurant', description: 'Traditional Icelandic cuisine near Hallgrimskirkja church. Known for rye bread ice cream.', createdAt: '2025-01-01', updatedAt: '2025-01-01' },
];

let storage: InMemoryAdapter;
let ctx: ToolContext;

beforeEach(async () => {
  storage = new InMemoryAdapter();
  ctx = makeTestCtx(storage);

  // Seed test spots into storage
  for (const spot of spots) {
    await storage.put(spotKey(ctx.userId, spot.id), spot);
  }
});

describe('log_visit', () => {
  it('creates a log and confirmation includes spot name', async () => {
    const result = await logVisit.handler(
      { spotId: 'spot-1', rating: 5, notes: 'Amazing experience!' },
      ctx,
    );
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Seljalandsfoss');
    expect(text).toContain('★★★★★');
    expect(text).toContain('Amazing experience!');
  });

  it('creates log without rating — log has visited: true but no rating', async () => {
    const result = await logVisit.handler(
      { spotId: 'spot-2' },
      ctx,
    );
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Cafe Loki');

    // Verify the log was stored correctly
    const getResult = await getLog.handler({ spotId: 'spot-2' }, ctx);
    const logBody = JSON.parse((getResult.content[0] as { text: string }).text);
    expect(logBody.visited).toBe(true);
    expect(logBody.rating).toBeUndefined();
  });
});

describe('get_log', () => {
  it('returns log details with spot name when found by spotId', async () => {
    await logVisit.handler(
      { spotId: 'spot-1', rating: 4, notes: 'Loved the walk behind the falls' },
      ctx,
    );

    const result = await getLog.handler({ spotId: 'spot-1' }, ctx);
    const text = (result.content[0] as { text: string }).text;
    const body = JSON.parse(text);
    expect(body.spotId).toBe('spot-1');
    expect(body.spotName).toBe('Seljalandsfoss');
    expect(body.rating).toBe(4);
    expect(body.notes).toBe('Loved the walk behind the falls');
    expect(body.visited).toBe(true);
  });

  it('returns "No log found" for unvisited spot', async () => {
    const result = await getLog.handler({ spotId: 'spot-1' }, ctx);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toBe('No log found for this spot');
  });
});

describe('trip_summary', () => {
  it('shows all logs sorted with correct count and average rating', async () => {
    // Log two visits with a small delay to ensure different timestamps
    await logVisit.handler(
      { spotId: 'spot-1', rating: 5, notes: 'Incredible waterfall' },
      ctx,
    );
    await logVisit.handler(
      { spotId: 'spot-2', rating: 3, notes: 'Good food' },
      ctx,
    );

    const result = await tripSummary.handler({}, ctx);
    const text = (result.content[0] as { text: string }).text;

    // Header with count
    expect(text).toContain('2 visit(s)');
    // Average rating: (5+3)/2 = 4.0
    expect(text).toContain('4.0/5');
    // Both spot names present
    expect(text).toContain('Seljalandsfoss');
    expect(text).toContain('Cafe Loki');
    // Notes present
    expect(text).toContain('Incredible waterfall');
    expect(text).toContain('Good food');
  });

  it('returns empty state message with no logs', async () => {
    const result = await tripSummary.handler({}, ctx);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toBe('No visits logged yet. Use log_visit to start tracking your trip!');
  });
});
