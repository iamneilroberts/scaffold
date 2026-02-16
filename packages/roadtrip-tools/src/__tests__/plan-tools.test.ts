import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import type { ToolContext } from '@voygent/scaffold-core';
import { makeTestCtx, spotKey } from '../keys.js';
import { createPlanTools } from '../tools/plan-tools.js';
import type { Spot } from '../types.js';

const tools = createPlanTools('ice');
const createPlan = tools.find((t) => t.name === 'ice-create_plan')!;
const getPlan = tools.find((t) => t.name === 'ice-get_plan')!;
const listPlans = tools.find((t) => t.name === 'ice-list_plans')!;
const updatePlan = tools.find((t) => t.name === 'ice-update_plan')!;

function extractId(text: string): string {
  const match = text.match(/ID:\s*([a-z0-9]+)/);
  return match?.[1] ?? '';
}

const testSpots: Spot[] = [
  { id: 'sp1', name: 'Cafe Loki', city: 'Reykjavik', region: 'Capital', category: 'restaurant', description: 'Traditional Icelandic food near Hallgrimskirkja. Great rye bread ice cream.', createdAt: '2025-01-01', updatedAt: '2025-01-01' },
  { id: 'sp2', name: 'Hallgrimskirkja', city: 'Reykjavik', region: 'Capital', category: 'landmark', description: 'Iconic church tower with panoramic views of Reykjavik. Visible from almost everywhere.', createdAt: '2025-01-01', updatedAt: '2025-01-01' },
  { id: 'sp3', name: 'Harpa', city: 'Reykjavik', region: 'Capital', category: 'landmark', description: 'Award-winning concert hall on the waterfront with a stunning glass facade.', createdAt: '2025-01-01', updatedAt: '2025-01-01' },
];

let storage: InMemoryAdapter;
let ctx: ToolContext;

beforeEach(async () => {
  storage = new InMemoryAdapter();
  ctx = makeTestCtx(storage);

  // Seed test spots into storage
  for (const spot of testSpots) {
    await storage.put(spotKey(ctx.userId, spot.id), spot);
  }
});

describe('create_plan + get_plan', () => {
  it('creates a plan and retrieves it with correct fields', async () => {
    const result = await createPlan.handler(
      { city: 'Reykjavik', region: 'Capital', title: 'Reykjavik Walking Tour', spotIds: ['sp1', 'sp2', 'sp3'], theme: 'culture', notes: 'Start early', estimatedHours: 6 },
      ctx,
    );
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Reykjavik Walking Tour');
    expect(text).toContain('3 spots');
    const id = extractId(text);
    expect(id).toBeTruthy();

    const getResult = await getPlan.handler({ planId: id }, ctx);
    const body = JSON.parse((getResult.content[0] as { text: string }).text);
    expect(body.title).toBe('Reykjavik Walking Tour');
    expect(body.city).toBe('Reykjavik');
    expect(body.region).toBe('Capital');
    expect(body.theme).toBe('culture');
    expect(body.notes).toBe('Start early');
    expect(body.estimatedHours).toBe(6);
    expect(body.spotIds).toEqual(['sp1', 'sp2', 'sp3']);
  });

  it('get_plan inlines full spot details', async () => {
    const result = await createPlan.handler(
      { city: 'Reykjavik', region: 'Capital', title: 'Spot Inline Test', spotIds: ['sp1', 'sp2', 'sp3'] },
      ctx,
    );
    const id = extractId((result.content[0] as { text: string }).text);

    const getResult = await getPlan.handler({ planId: id }, ctx);
    const body = JSON.parse((getResult.content[0] as { text: string }).text);

    expect(body.spots).toHaveLength(3);
    expect(body.spots[0].name).toBe('Cafe Loki');
    expect(body.spots[0].description).toContain('Traditional Icelandic food');
    expect(body.spots[1].name).toBe('Hallgrimskirkja');
    expect(body.spots[2].name).toBe('Harpa');
  });

  it('returns error for non-existent plan', async () => {
    const result = await getPlan.handler({ planId: 'nonexistent' }, ctx);
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('Plan not found');
  });
});

describe('list_plans', () => {
  it('lists all plans', async () => {
    await createPlan.handler(
      { city: 'Reykjavik', region: 'Capital', title: 'City Walk', spotIds: ['sp1', 'sp2', 'sp3'] },
      ctx,
    );
    await createPlan.handler(
      { city: 'Vik', region: 'South Coast', title: 'Beach Day', spotIds: ['sp1'] },
      ctx,
    );

    const result = await listPlans.handler({}, ctx);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('2 plan(s)');
    expect(text).toContain('City Walk');
    expect(text).toContain('Beach Day');
  });

  it('filters by city (case-insensitive)', async () => {
    await createPlan.handler(
      { city: 'Reykjavik', region: 'Capital', title: 'City Walk', spotIds: ['sp1', 'sp2', 'sp3'] },
      ctx,
    );
    await createPlan.handler(
      { city: 'Vik', region: 'South Coast', title: 'Beach Day', spotIds: ['sp1'] },
      ctx,
    );

    const result = await listPlans.handler({ city: 'reykjavik' }, ctx);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('City Walk');
    expect(text).not.toContain('Beach Day');
  });

  it('returns "No day plans found." when empty', async () => {
    const result = await listPlans.handler({}, ctx);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toBe('No day plans found.');
  });
});

describe('update_plan', () => {
  it('updates fields and preserves others', async () => {
    const result = await createPlan.handler(
      { city: 'Reykjavik', region: 'Capital', title: 'Old Title', spotIds: ['sp1', 'sp2', 'sp3'], theme: 'culture', estimatedHours: 4 },
      ctx,
    );
    const id = extractId((result.content[0] as { text: string }).text);

    await updatePlan.handler({ planId: id, title: 'New Title', notes: 'Updated notes' }, ctx);

    const getResult = await getPlan.handler({ planId: id }, ctx);
    const body = JSON.parse((getResult.content[0] as { text: string }).text);
    expect(body.title).toBe('New Title');
    expect(body.notes).toBe('Updated notes');
    // Preserved fields
    expect(body.city).toBe('Reykjavik');
    expect(body.region).toBe('Capital');
    expect(body.theme).toBe('culture');
    expect(body.estimatedHours).toBe(4);
    expect(body.spotIds).toEqual(['sp1', 'sp2', 'sp3']);
  });

  it('returns error for non-existent plan', async () => {
    const result = await updatePlan.handler({ planId: 'nonexistent', title: 'X' }, ctx);
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('Plan not found');
  });
});

describe('quality gates', () => {
  it('warns if fewer than 3 spotIds', async () => {
    const input = { city: 'Reykjavik', region: 'Capital', title: 'Short Plan', spotIds: ['sp1', 'sp2'] };
    const result = await createPlan.handler(input, ctx);
    const gate = await createPlan.validate!(input, result, ctx);

    expect(gate.passed).toBe(true); // warnings don't block
    const fewCheck = gate.checks.find((c) => c.name === 'too_few_spots');
    expect(fewCheck?.passed).toBe(false);
    expect(fewCheck?.message).toContain('2');
  });

  it('warns if more than 8 spotIds', async () => {
    const manyIds = ['sp1', 'sp2', 'sp3', 's4', 's5', 's6', 's7', 's8', 's9'];
    const input = { city: 'Reykjavik', region: 'Capital', title: 'Packed Day', spotIds: manyIds };
    const result = await createPlan.handler(input, ctx);
    const gate = await createPlan.validate!(input, result, ctx);

    expect(gate.passed).toBe(true); // warnings don't block
    const manyCheck = gate.checks.find((c) => c.name === 'too_many_spots');
    expect(manyCheck?.passed).toBe(false);
    expect(manyCheck?.message).toContain('9');
  });
});
