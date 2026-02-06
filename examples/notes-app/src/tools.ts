import type { ScaffoldTool, ToolContext, ToolResult } from '@scaffold/core';

interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

function noteKey(userId: string, noteId: string): string {
  return `${userId}/notes/${noteId}`;
}

function notesPrefix(userId: string): string {
  return `${userId}/notes/`;
}

export const saveNoteTool: ScaffoldTool = {
  name: 'notes:save',
  description: 'Create or update a note. Provide an id, title, and content.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Note ID (lowercase, hyphens, e.g. "meeting-notes")' },
      title: { type: 'string', description: 'Note title' },
      content: { type: 'string', description: 'Note content (markdown supported)' },
    },
    required: ['id', 'title', 'content'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { id, title, content } = input as { id: string; title: string; content: string };
    const key = noteKey(ctx.userId, id);
    const existing = await ctx.storage.get<Note>(key);

    const note: Note = {
      id,
      title,
      content,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await ctx.storage.put(key, note);

    return {
      content: [{ type: 'text', text: `Saved note "${title}" (${id})` }],
    };
  },
};

export const listNotesTool: ScaffoldTool = {
  name: 'notes:list',
  description: 'List all notes for the current user.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  handler: async (_input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const prefix = notesPrefix(ctx.userId);
    const result = await ctx.storage.list(prefix);

    if (result.keys.length === 0) {
      return { content: [{ type: 'text', text: 'No notes found.' }] };
    }

    const notes: Note[] = [];
    for (const key of result.keys) {
      const note = await ctx.storage.get<Note>(key);
      if (note) notes.push(note);
    }

    const summary = notes
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(n => `- **${n.title}** (${n.id}) — updated ${n.updatedAt}`)
      .join('\n');

    return { content: [{ type: 'text', text: summary }] };
  },
};

export const readNoteTool: ScaffoldTool = {
  name: 'notes:read',
  description: 'Read a note by ID.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Note ID to read' },
    },
    required: ['id'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { id } = input as { id: string };
    const note = await ctx.storage.get<Note>(noteKey(ctx.userId, id));

    if (!note) {
      return { content: [{ type: 'text', text: `Note "${id}" not found.` }], isError: true };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(note, null, 2),
      }],
    };
  },
};

export const deleteNoteTool: ScaffoldTool = {
  name: 'notes:delete',
  description: 'Delete a note by ID.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Note ID to delete' },
    },
    required: ['id'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { id } = input as { id: string };
    const key = noteKey(ctx.userId, id);
    const existing = await ctx.storage.get<Note>(key);

    if (!existing) {
      return { content: [{ type: 'text', text: `Note "${id}" not found.` }], isError: true };
    }

    await ctx.storage.delete(key);
    return { content: [{ type: 'text', text: `Deleted note "${existing.title}" (${id})` }] };
  },
};

export const notesTools: ScaffoldTool[] = [
  saveNoteTool,
  listNotesTool,
  readNoteTool,
  deleteNoteTool,
];
