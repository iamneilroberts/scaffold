import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import type { ToolContext } from '@voygent/scaffold-core';
import {
  createTripTool,
  addStopTool,
  listTripsTool,
  getTripTool,
  deleteTripTool,
} from '../tools.js';

function makeCtx(storage: InMemoryAdapter, userId = 'user1'): ToolContext {
  return {
    authKey: 'test-key',
    userId,
    isAdmin: false,
    storage,
    env: {},
    debugMode: false,
    requestId: 'req-1',
  };
}

function extractId(text: string): string {
  const match = text.match(/\(([a-z0-9]+)\)/);
  return match?.[1] ?? '';
}

describe('travel-planner tools', () => {
  let storage: InMemoryAdapter;
  let ctx: ToolContext;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    ctx = makeCtx(storage);
  });

  it('creates a trip and retrieves it', async () => {
    const createResult = await createTripTool.handler(
      { name: 'Road Trip', description: 'Cross-country drive' },
      ctx,
    );
    const tripId = extractId(createResult.content[0]!.text!);
    expect(tripId).toBeTruthy();

    const getResult = await getTripTool.handler({ tripId }, ctx);
    const trip = JSON.parse(getResult.content[0]!.text!);
    expect(trip.name).toBe('Road Trip');
    expect(trip.stops).toEqual([]);
  });

  it('adds stops to a trip in order', async () => {
    const createResult = await createTripTool.handler(
      { name: 'Coastal', description: 'Beach tour' },
      ctx,
    );
    const tripId = extractId(createResult.content[0]!.text!);

    await addStopTool.handler({ tripId, name: 'San Diego' }, ctx);
    await addStopTool.handler({ tripId, name: 'Los Angeles' }, ctx);
    await addStopTool.handler({ tripId, name: 'San Francisco' }, ctx);

    const getResult = await getTripTool.handler({ tripId }, ctx);
    const trip = JSON.parse(getResult.content[0]!.text!);
    expect(trip.stops).toHaveLength(3);
    expect(trip.stops[0].name).toBe('San Diego');
    expect(trip.stops[0].order).toBe(1);
    expect(trip.stops[2].name).toBe('San Francisco');
    expect(trip.stops[2].order).toBe(3);
  });

  it('lists multiple trips', async () => {
    await createTripTool.handler({ name: 'Trip A', description: 'a' }, ctx);
    await createTripTool.handler({ name: 'Trip B', description: 'b' }, ctx);

    const result = await listTripsTool.handler({}, ctx);
    expect(result.content[0]!.text).toContain('Trip A');
    expect(result.content[0]!.text).toContain('Trip B');
  });

  it('deletes a trip and its stops', async () => {
    const createResult = await createTripTool.handler(
      { name: 'Delete Me', description: 'temp' },
      ctx,
    );
    const tripId = extractId(createResult.content[0]!.text!);
    await addStopTool.handler({ tripId, name: 'Stop 1' }, ctx);

    const deleteResult = await deleteTripTool.handler({ tripId }, ctx);
    expect(deleteResult.content[0]!.text).toContain('1 stop(s)');

    const getResult = await getTripTool.handler({ tripId }, ctx);
    expect(getResult.isError).toBe(true);
  });

  it('isolates trips between users', async () => {
    const ctx2 = makeCtx(storage, 'user2');
    await createTripTool.handler({ name: 'User1 Trip', description: 'mine' }, ctx);
    await createTripTool.handler({ name: 'User2 Trip', description: 'theirs' }, ctx2);

    const r1 = await listTripsTool.handler({}, ctx);
    const r2 = await listTripsTool.handler({}, ctx2);
    expect(r1.content[0]!.text).toContain('User1 Trip');
    expect(r1.content[0]!.text).not.toContain('User2 Trip');
    expect(r2.content[0]!.text).toContain('User2 Trip');
    expect(r2.content[0]!.text).not.toContain('User1 Trip');
  });
});
