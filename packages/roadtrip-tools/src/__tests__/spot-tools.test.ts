import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import type { ToolContext } from '@voygent/scaffold-core';
import { makeTestCtx } from '../keys.js';
import { createSpotTools } from '../tools/spot-tools.js';

const tools = createSpotTools('ice');
const addSpot = tools.find((t) => t.name === 'ice-add_spot')!;
const getSpot = tools.find((t) => t.name === 'ice-get_spot')!;
const listSpots = tools.find((t) => t.name === 'ice-list_spots')!;
const updateSpot = tools.find((t) => t.name === 'ice-update_spot')!;
const searchSpots = tools.find((t) => t.name === 'ice-search_spots')!;
const recommend = tools.find((t) => t.name === 'ice-recommend')!;

function extractId(text: string): string {
  const match = text.match(/ID:\s*([a-z0-9]+)/);
  return match?.[1] ?? '';
}

const LONG_DESC = 'A beautiful waterfall cascading over black basalt cliffs on the South Coast. One of the most photographed spots in Iceland.';

let storage: InMemoryAdapter;
let ctx: ToolContext;

beforeEach(() => {
  storage = new InMemoryAdapter();
  ctx = makeTestCtx(storage);
});

describe('add_spot + get_spot', () => {
  it('creates a spot and retrieves it', async () => {
    const result = await addSpot.handler(
      { name: 'Seljalandsfoss', city: 'Seljalandsfoss', region: 'South Coast', category: 'waterfall', description: LONG_DESC },
      ctx,
    );
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Seljalandsfoss');
    const id = extractId(text);

    const getResult = await getSpot.handler({ spotId: id }, ctx);
    const getBody = JSON.parse((getResult.content[0] as { text: string }).text);
    expect(getBody.name).toBe('Seljalandsfoss');
    expect(getBody.category).toBe('waterfall');
    expect(getBody.region).toBe('South Coast');
  });

  it('returns error for non-existent spot', async () => {
    const result = await getSpot.handler({ spotId: 'nope' }, ctx);
    expect(result.isError).toBe(true);
  });
});

describe('list_spots', () => {
  it('lists spots with no filters', async () => {
    await addSpot.handler({ name: 'Spot A', city: 'Vik', region: 'South', category: 'hike', description: LONG_DESC }, ctx);
    await addSpot.handler({ name: 'Spot B', city: 'Reykjavik', region: 'Capital', category: 'restaurant', description: LONG_DESC }, ctx);

    const result = await listSpots.handler({}, ctx);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('2 spot(s)');
    expect(text).toContain('Spot A');
    expect(text).toContain('Spot B');
  });

  it('filters by city', async () => {
    await addSpot.handler({ name: 'Vik Hike', city: 'Vik', region: 'South', category: 'hike', description: LONG_DESC }, ctx);
    await addSpot.handler({ name: 'Rey Cafe', city: 'Reykjavik', region: 'Capital', category: 'restaurant', description: LONG_DESC }, ctx);

    const result = await listSpots.handler({ city: 'Vik' }, ctx);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Vik Hike');
    expect(text).not.toContain('Rey Cafe');
  });

  it('filters by category', async () => {
    await addSpot.handler({ name: 'Trail X', city: 'Vik', region: 'South', category: 'hike', description: LONG_DESC }, ctx);
    await addSpot.handler({ name: 'Cafe Y', city: 'Vik', region: 'South', category: 'restaurant', description: LONG_DESC }, ctx);

    const result = await listSpots.handler({ category: 'hike' }, ctx);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Trail X');
    expect(text).not.toContain('Cafe Y');
  });

  it('filters by tags', async () => {
    await addSpot.handler({ name: 'Family Fun', city: 'Vik', region: 'South', category: 'hike', description: LONG_DESC, tags: ['family'] }, ctx);
    await addSpot.handler({ name: 'Date Night', city: 'Vik', region: 'South', category: 'restaurant', description: LONG_DESC, tags: ['romantic'] }, ctx);

    const result = await listSpots.handler({ tags: ['family'] }, ctx);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Family Fun');
    expect(text).not.toContain('Date Night');
  });

  it('returns empty message when no spots match', async () => {
    const result = await listSpots.handler({ city: 'Nowhere' }, ctx);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('No spots found');
  });
});

describe('update_spot', () => {
  it('updates a spot partially', async () => {
    const addResult = await addSpot.handler(
      { name: 'Old Name', city: 'Vik', region: 'South', category: 'hike', description: LONG_DESC },
      ctx,
    );
    const id = extractId((addResult.content[0] as { text: string }).text);

    await updateSpot.handler({ spotId: id, name: 'New Name', tips: 'Bring a jacket' }, ctx);

    const getResult = await getSpot.handler({ spotId: id }, ctx);
    const spot = JSON.parse((getResult.content[0] as { text: string }).text);
    expect(spot.name).toBe('New Name');
    expect(spot.tips).toBe('Bring a jacket');
    expect(spot.category).toBe('hike'); // unchanged
  });

  it('returns error for non-existent spot', async () => {
    const result = await updateSpot.handler({ spotId: 'nope', name: 'X' }, ctx);
    expect(result.isError).toBe(true);
  });
});

describe('search_spots', () => {
  beforeEach(async () => {
    await addSpot.handler({ name: 'Seljalandsfoss', city: 'Seljalandsfoss', region: 'South Coast', category: 'waterfall', description: LONG_DESC }, ctx);
    await addSpot.handler({ name: 'Baejarins Beztu', city: 'Reykjavik', region: 'Capital', category: 'restaurant', description: 'Famous hot dog stand in downtown Reykjavik, been serving since 1937.' }, ctx);
  });

  it('finds by name', async () => {
    const result = await searchSpots.handler({ query: 'Seljalandsfoss' }, ctx);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Seljalandsfoss');
  });

  it('finds by city', async () => {
    const result = await searchSpots.handler({ query: 'Reykjavik' }, ctx);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Baejarins');
  });

  it('returns empty for no match', async () => {
    const result = await searchSpots.handler({ query: 'Akureyri' }, ctx);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('No spots matching');
  });
});

describe('recommend', () => {
  beforeEach(async () => {
    await addSpot.handler({
      name: 'Cafe Loki', city: 'Reykjavik', region: 'Capital', category: 'restaurant',
      description: 'Traditional Icelandic food near Hallgrimskirkja. Try the rye bread ice cream and lamb soup.',
      bestTime: 'lunch', tips: 'Get there before noon to avoid the queue', tags: ['foodie'],
    }, ctx);
    await addSpot.handler({
      name: 'Reynisfjara', city: 'Vik', region: 'South Coast', category: 'beach',
      description: 'Dramatic black sand beach with basalt columns and roaring waves. One of the most dangerous beaches in Iceland.',
      tags: ['photo-op'], tips: 'Never turn your back on the waves',
    }, ctx);
    await addSpot.handler({
      name: 'Blue Lagoon', city: 'Grindavik', region: 'Reykjanes', category: 'hot-spring',
      description: 'Iconic geothermal spa with milky blue water surrounded by lava fields. Book well in advance.',
      tags: ['luxury', 'romantic'], bookingRequired: true,
    }, ctx);
  });

  it('recommends restaurants for "lunch near Reykjavik"', async () => {
    const result = await recommend.handler({ context: 'lunch near Reykjavik' }, ctx);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Cafe Loki');
  });

  it('recommends by category for "best beach"', async () => {
    const result = await recommend.handler({ context: 'best beach' }, ctx);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Reynisfjara');
  });

  it('returns empty guide message when no spots exist', async () => {
    const emptyCtx = makeTestCtx(new InMemoryAdapter());
    const result = await recommend.handler({ context: 'anything' }, emptyCtx);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('No spots in the guide');
  });
});

describe('quality gates', () => {
  it('warns for short description', async () => {
    const result = await addSpot.handler(
      { name: 'Quick Spot', city: 'Vik', region: 'South', category: 'hike', description: 'Short' },
      ctx,
    );
    const gate = await addSpot.validate!(
      { name: 'Quick Spot', city: 'Vik', region: 'South', category: 'hike', description: 'Short' },
      result, ctx,
    );
    expect(gate.passed).toBe(true); // warnings don't block
    const descCheck = gate.checks.find((c) => c.name === 'description_length');
    expect(descCheck?.passed).toBe(false);
  });

  it('warns for coords without routeKm', async () => {
    const input = {
      name: 'Geo Spot', city: 'Vik', region: 'South', category: 'hike',
      description: LONG_DESC, coordinates: { lat: 63.5, lng: -19.0 },
    };
    const result = await addSpot.handler(input, ctx);
    const gate = await addSpot.validate!(input, result, ctx);
    const coordCheck = gate.checks.find((c) => c.name === 'coords_without_routekm');
    expect(coordCheck?.passed).toBe(false);
  });
});

describe('user isolation', () => {
  it('isolates spots between users', async () => {
    const ctx2 = makeTestCtx(storage, 'user2');
    await addSpot.handler({ name: 'User1 Spot', city: 'Vik', region: 'South', category: 'hike', description: LONG_DESC }, ctx);
    await addSpot.handler({ name: 'User2 Spot', city: 'Vik', region: 'South', category: 'hike', description: LONG_DESC }, ctx2);

    const r1 = await listSpots.handler({}, ctx);
    const r2 = await listSpots.handler({}, ctx2);
    expect((r1.content[0] as { text: string }).text).toContain('User1 Spot');
    expect((r1.content[0] as { text: string }).text).not.toContain('User2 Spot');
    expect((r2.content[0] as { text: string }).text).toContain('User2 Spot');
    expect((r2.content[0] as { text: string }).text).not.toContain('User1 Spot');
  });
});
