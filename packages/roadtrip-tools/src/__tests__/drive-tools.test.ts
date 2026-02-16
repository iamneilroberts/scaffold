import { describe, it, expect } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import { makeTestCtx } from '../keys.js';
import { createDriveTools } from '../tools/drive-tools.js';

const tools = createDriveTools('trip');
const createDrive = tools.find((t) => t.name === 'trip-create_drive')!;
const getDrive = tools.find((t) => t.name === 'trip-get_drive')!;
const listDrives = tools.find((t) => t.name === 'trip-list_drives')!;

function makeDriveInput(overrides: Record<string, unknown> = {}) {
  return {
    dayNumber: 1,
    title: 'Golden Circle',
    origin: 'Reykjavik',
    destination: 'Selfoss',
    waypoints: [
      { name: 'Thingvellir', routeKm: 50, type: 'landmark' },
      { name: 'Geysir', routeKm: 100, type: 'landmark' },
      { name: 'Gullfoss', routeKm: 120, type: 'landmark' },
    ],
    totalKm: 230,
    estimatedDriveHours: 3.5,
    ...overrides,
  };
}

describe('create_drive + get_drive', () => {
  it('creates a drive and retrieves it by ID', async () => {
    const storage = new InMemoryAdapter();
    const ctx = makeTestCtx(storage);

    const createResult = await createDrive.handler(makeDriveInput(), ctx);
    expect(createResult.isError).toBeFalsy();

    const text = createResult.content[0]!.text;
    expect(text).toContain('Golden Circle');
    expect(text).toContain('230 km');

    // Extract ID from response
    const idMatch = text.match(/ID: ([a-z0-9]+)/);
    expect(idMatch).toBeTruthy();
    const driveId = idMatch![1]!;

    // Retrieve it
    const getResult = await getDrive.handler({ driveId }, ctx);
    expect(getResult.isError).toBeFalsy();

    const drive = JSON.parse(getResult.content[0]!.text);
    expect(drive.id).toBe(driveId);
    expect(drive.dayNumber).toBe(1);
    expect(drive.title).toBe('Golden Circle');
    expect(drive.origin).toBe('Reykjavik');
    expect(drive.destination).toBe('Selfoss');
    expect(drive.waypoints).toHaveLength(3);
    expect(drive.totalKm).toBe(230);
    expect(drive.estimatedDriveHours).toBe(3.5);
    expect(drive.createdAt).toBeTruthy();
    expect(drive.updatedAt).toBeTruthy();
  });
});

describe('list_drives', () => {
  it('lists drives sorted by dayNumber', async () => {
    const storage = new InMemoryAdapter();
    const ctx = makeTestCtx(storage);

    // Create drives out of order
    await createDrive.handler(
      makeDriveInput({ dayNumber: 3, title: 'East Fjords', origin: 'Hofn', destination: 'Egilsstadir', totalKm: 260 }),
      ctx,
    );
    await createDrive.handler(
      makeDriveInput({ dayNumber: 1, title: 'Golden Circle', origin: 'Reykjavik', destination: 'Selfoss', totalKm: 230 }),
      ctx,
    );
    await createDrive.handler(
      makeDriveInput({ dayNumber: 2, title: 'South Coast', origin: 'Selfoss', destination: 'Vik', totalKm: 180 }),
      ctx,
    );

    const result = await listDrives.handler({}, ctx);
    expect(result.isError).toBeFalsy();

    const text = result.content[0]!.text;
    const lines = text.split('\n');
    expect(lines).toHaveLength(3);

    // Verify sorted order
    expect(lines[0]).toContain('Day 1');
    expect(lines[0]).toContain('Golden Circle');
    expect(lines[1]).toContain('Day 2');
    expect(lines[1]).toContain('South Coast');
    expect(lines[2]).toContain('Day 3');
    expect(lines[2]).toContain('East Fjords');

    // Verify format includes arrow and km
    expect(lines[0]).toContain('Reykjavik');
    expect(lines[0]).toContain('Selfoss');
    expect(lines[0]).toContain('230 km');
  });

  it('returns empty message when no drives exist', async () => {
    const storage = new InMemoryAdapter();
    const ctx = makeTestCtx(storage);

    const result = await listDrives.handler({}, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toBe('No driving days found.');
  });
});

describe('quality gate', () => {
  it('warns when fewer than 2 waypoints', async () => {
    const storage = new InMemoryAdapter();
    const ctx = makeTestCtx(storage);

    const input = makeDriveInput({
      waypoints: [{ name: 'Thingvellir', routeKm: 50, type: 'landmark' }],
    });

    const result = await createDrive.handler(input, ctx);
    expect(result.isError).toBeFalsy();

    // Run the validate function
    const gate = await createDrive.validate!(input, result, ctx);
    expect(gate.passed).toBe(true); // warnings don't block
    expect(gate.checks).toHaveLength(1);
    expect(gate.checks[0]!.name).toBe('min_waypoints');
    expect(gate.checks[0]!.passed).toBe(false);
    expect(gate.checks[0]!.severity).toBe('warning');
    expect(gate.checks[0]!.message).toContain('1 waypoint');
  });
});

describe('get_drive error handling', () => {
  it('returns error for non-existent drive', async () => {
    const storage = new InMemoryAdapter();
    const ctx = makeTestCtx(storage);

    const result = await getDrive.handler({ driveId: 'nonexistent' }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('not found');
  });
});

describe('user isolation', () => {
  it('user1 drives are not visible to user2', async () => {
    const storage = new InMemoryAdapter();
    const ctx1 = makeTestCtx(storage, 'user1');
    const ctx2 = makeTestCtx(storage, 'user2');

    // user1 creates a drive
    await createDrive.handler(makeDriveInput(), ctx1);

    // user2 should see no drives
    const result = await listDrives.handler({}, ctx2);
    expect(result.content[0]!.text).toBe('No driving days found.');

    // user1 should see their drive
    const result1 = await listDrives.handler({}, ctx1);
    expect(result1.content[0]!.text).toContain('Golden Circle');
  });
});
