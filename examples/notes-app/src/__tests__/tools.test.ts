import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@voygent/scaffold-core';
import type { ToolContext } from '@voygent/scaffold-core';
import { saveNoteTool, listNotesTool, readNoteTool, deleteNoteTool } from '../tools.js';

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

describe('notes tools', () => {
  let storage: InMemoryAdapter;
  let ctx: ToolContext;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    ctx = makeCtx(storage);
  });

  it('saves and reads a note', async () => {
    await saveNoteTool.handler({ id: 'test', title: 'Test', content: 'Hello' }, ctx);
    const result = await readNoteTool.handler({ id: 'test' }, ctx);
    const note = JSON.parse(result.content[0]!.text!);
    expect(note.title).toBe('Test');
    expect(note.content).toBe('Hello');
  });

  it('lists notes', async () => {
    await saveNoteTool.handler({ id: 'a', title: 'First', content: '1' }, ctx);
    await saveNoteTool.handler({ id: 'b', title: 'Second', content: '2' }, ctx);
    const result = await listNotesTool.handler({}, ctx);
    expect(result.content[0]!.text).toContain('First');
    expect(result.content[0]!.text).toContain('Second');
  });

  it('returns error for missing note', async () => {
    const result = await readNoteTool.handler({ id: 'nope' }, ctx);
    expect(result.isError).toBe(true);
  });

  it('deletes a note', async () => {
    await saveNoteTool.handler({ id: 'del', title: 'Delete Me', content: 'bye' }, ctx);
    await deleteNoteTool.handler({ id: 'del' }, ctx);
    const result = await readNoteTool.handler({ id: 'del' }, ctx);
    expect(result.isError).toBe(true);
  });

  it('isolates notes between users', async () => {
    const ctx2 = makeCtx(storage, 'user2');
    await saveNoteTool.handler({ id: 'shared-id', title: 'User1 Note', content: 'mine' }, ctx);
    await saveNoteTool.handler({ id: 'shared-id', title: 'User2 Note', content: 'theirs' }, ctx2);

    const r1 = await readNoteTool.handler({ id: 'shared-id' }, ctx);
    const r2 = await readNoteTool.handler({ id: 'shared-id' }, ctx2);
    expect(JSON.parse(r1.content[0]!.text!).title).toBe('User1 Note');
    expect(JSON.parse(r2.content[0]!.text!).title).toBe('User2 Note');
  });
});
